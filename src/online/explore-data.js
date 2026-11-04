/* Explore — suggestions built from the user's OWN listening. Nothing is played or downloaded: only names, covers and short texts are shown.
   Sources: your play history (local) · MusicBrainz (discographies) · Cover Art Archive (album covers) · Wikipedia (descriptions, CC BY-SA)
   Optional extras already used elsewhere in Reel: Last.fm (your own key) and ListenBrainz for "similar artists", Deezer for artist pictures / popular songs (metadata only). */
import { getJSON, enc } from "./net.js";
import { mbDiscography, lastfmSimilar, wikiArtist } from "./providers.js";
import { norm, similarity } from "./match.js";

const unknown = (a) => !a || /^unknown/i.test(String(a).trim());
export const coverUrl = (rgId) => (rgId ? `https://coverartarchive.org/release-group/${rgId}/front-250` : null);

/* ---------- 1. who the user listens to (all local) ---------- */
export function topArtistsFrom({ library, playCounts = {}, favorites }, limit = 8) {
  const by = new Map();
  for (const t of library) {
    if (unknown(t.artist)) continue;
    const e = by.get(t.artist) || { name: t.artist, plays: 0, tracks: [], favs: 0 };
    e.tracks.push(t); e.plays += playCounts[t.id] || 0; if (favorites?.has?.(t.id)) e.favs++;
    by.set(t.artist, e);
  }
  const score = (a) => a.plays * 3 + a.favs * 2 + Math.min(a.tracks.length, 10);
  return [...by.values()].sort((x, y) => score(y) - score(x)).slice(0, limit);
}
export const ownedArtistSet = (library) => new Set(library.map(t => norm(t.artist)).filter(Boolean));

/* ---------- 2. albums the user is missing: full discography (MusicBrainz) vs library ---------- */
export async function missingAlbums(artist) {
  const d = await mbDiscography(artist.name);
  if (!d?.albums?.length) return { artistId: d?.artistId || null, total: 0, have: 0, missing: [] };
  const owned = artist.tracks.map(t => norm(t.album)).filter(a => a && !/^(local files|unknown)/.test(a));
  const ownedTitles = new Set(artist.tracks.map(t => norm(t.title)));
  const isOwned = (title) => owned.some(a => a === norm(title) || similarity(a, title) >= 0.85) || ownedTitles.has(norm(title));
  const seen = new Set();
  const albums = d.albums.filter(a => { const k = norm(a.title); if (seen.has(k)) return false; seen.add(k); return true; });
  const missing = albums.filter(a => !isOwned(a.title)).map(a => ({ kind: "album", id: a.id, title: a.title, year: a.year, artist: artist.name, cover: coverUrl(a.id) }));
  missing.sort((x, y) => (y.year || "0").localeCompare(x.year || "0"));
  return { artistId: d.artistId, total: albums.length, have: albums.length - missing.length, missing };
}

/* ---------- 3. similar artists ---------- */
const mbJSON = (path, ttl = 30 * 864e5) => getJSON(`https://musicbrainz.org/ws/2/${path}${path.includes("?") ? "&" : "?"}fmt=json`, { ttlMs: ttl });
export async function similarArtists(artist, mbid, lastfmKey, ownedSet) {
  let names = [];
  if (lastfmKey) { try { names = await lastfmSimilar(lastfmKey, artist.name); } catch { /* next */ } }
  if (!names.length && mbid) {
    try {
      const d = await getJSON(`https://labs.api.listenbrainz.org/similar-artists/json?artist_mbids=${mbid}&algorithm=session_based_days_9000_session_300_contribution_5_threshold_15_limit_50_skip_30`, { ttlMs: 14 * 864e5 });
      const list = Array.isArray(d) ? d : (d?.data || d?.artists || []);
      names = list.map(x => x.name || x.artist_name).filter(Boolean);
    } catch { /* next */ }
  }
  if (!names.length && mbid) {                                // last resort: artists sharing the main MusicBrainz tag
    try {
      const a = await mbJSON(`artist/${mbid}?inc=tags`);
      const tag = (a?.tags || []).sort((x, y) => (y.count || 0) - (x.count || 0))[0]?.name;
      if (tag) { const s = await mbJSON(`artist/?query=${enc(`tag:"${tag}"`)}&limit=25`, 14 * 864e5); names = (s?.artists || []).map(x => x.name); }
    } catch { /* none */ }
  }
  const self = norm(artist.name), seen = new Set();
  return names.filter(n => { const k = norm(n); if (!k || k === self || ownedSet.has(k) || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12).map(n => ({ kind: "artist", name: n, because: artist.name }));
}

/* ---------- 4. pictures and popular songs (Deezer, metadata only) ---------- */
const dzFind = async (name) => {
  const d = await getJSON(`https://api.deezer.com/search/artist?q=${enc(name)}&limit=5`, { ttlMs: 30 * 864e5 });
  if (d?.error) throw new Error(`Deezer: ${d.error.message || d.error.type || "error"}`);
  return (d?.data || []).find(a => a?.name && similarity(a.name, name) >= 0.85) || null;
};
export async function artistPicture(name) { try { return (await dzFind(name))?.picture_medium || null; } catch { return null; } }
export async function popularSongs(artist, ownedSet) {
  {
    const a = await dzFind(artist.name); if (!a) return [];
    const d = await getJSON(`https://api.deezer.com/artist/${a.id}/top?limit=20`, { ttlMs: 7 * 864e5 });
    if (d?.error) throw new Error(`Deezer: ${d.error.message || d.error.type || "error"}`);
    const have = new Set(artist.tracks.map(t => norm(t.title)));
    return (d?.data || []).filter(t => t?.title && !have.has(norm(t.title))).slice(0, 8)
      .map(t => ({ kind: "song", id: `s${t.id}`, title: t.title, artist: artist.name, album: t.album?.title || "", albumId: t.album?.id || null, cover: t.album?.cover_medium || null, duration: t.duration || 0, link: t.link || null }));
  }
}

/* Songs that sound like an artist's music but are NOT in the library: Deezer's "artist radio" (metadata only,
   nothing is played). Songs the user already owns are removed, and each artist appears at most twice for variety. */
export async function similarSongs(artistName, library, limit = 14) {
  const a = await dzFind(artistName); if (!a) return [];
  const d = await getJSON(`https://api.deezer.com/artist/${a.id}/radio?limit=40`, { ttlMs: 3 * 864e5 });
  if (d?.error) throw new Error(`Deezer: ${d.error.message || d.error.type || "error"}`);
  const haveKey = new Set(library.map(t => `${norm(t.artist)}|${norm(t.title)}`));
  const haveTitle = new Set(library.map(t => norm(t.title)));
  const perArtist = new Map(), seen = new Set(), out = [];
  for (const t of d?.data || []) {
    const title = t?.title_short || t?.title;
    const who = t?.artist?.name || artistName;
    if (!title) continue;
    const k = `${norm(who)}|${norm(title)}`;
    if (haveKey.has(k) || haveTitle.has(norm(title)) || seen.has(k)) continue;
    const n = perArtist.get(norm(who)) || 0; if (n >= 2) continue;
    perArtist.set(norm(who), n + 1); seen.add(k);
    out.push({ kind: "song", id: `s${t.id}`, title, artist: who, album: t.album?.title || "", albumId: t.album?.id || null,
      cover: t.album?.cover_medium || t.album?.cover || null, duration: t.duration || 0, link: t.link || null, because: artistName });
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------- 5. short descriptions (Wikipedia, CC BY-SA 4.0) ---------- */
const wikiTry = async (titles, ok) => {
  for (const t of titles) {
    let d; try { d = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc(t.replace(/ /g, "_"))}?redirect=true`, { ttlMs: 30 * 864e5 }); } catch { continue; }
    if (d && d.type !== "disambiguation" && d.extract && ok(d)) return { title: d.title, extract: d.extract, url: d.content_urls?.desktop?.page || null };
  }
  return null;
};
export const brief = (t, max = 300) => {
  t = String(t || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max), i = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return i > 110 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, "") + "…";
};
/* the Deezer album that matches an item (metadata only) */
async function dzAlbum({ albumId, artist, title }) {
  let id = albumId;
  if (!id) {
    const r = await getJSON(`https://api.deezer.com/search/album?q=${enc(`${artist} ${title}`)}&limit=5`, { ttlMs: 30 * 864e5 });
    id = (r?.data || []).find(a => similarity(a.title, title) >= 0.8 && similarity(a.artist?.name || "", artist) >= 0.7)?.id;
  }
  if (!id) return null;
  const a = await getJSON(`https://api.deezer.com/album/${id}`, { ttlMs: 30 * 864e5 });
  return a && !a.error ? a : null;
}
async function albumFacts(q) {
  try {
    const a = await dzAlbum(q); if (!a) return null;
    return { title: a.title, year: (a.release_date || "").slice(0, 4), genres: (a.genres?.data || []).map(g => g.name).slice(0, 2), tracks: a.nb_tracks, label: a.label, type: a.record_type };
  } catch { return null; }
}
const mapTrack = (t, album, artist) => ({ id: `t${t.id}`, title: t.title_short || t.title, duration: t.duration || 0, link: t.link || null, album: album || t.album?.title || "", artist: t.artist?.name || artist });
/** The music itself: an album's tracklist, or an artist's most popular songs. Names only: playing happens on a licensed service. */
export async function songsFor(item) {
  if (item.kind === "album") {
    const a = await dzAlbum({ albumId: item.albumId, artist: item.artist, title: item.title });
    if (!a) return [];
    const d = await getJSON(`https://api.deezer.com/album/${a.id}/tracks?limit=100`, { ttlMs: 30 * 864e5 });
    return (d?.data || a.tracks?.data || []).map(t => mapTrack(t, a.title, item.artist));
  }
  if (item.kind === "artist") {
    const a = await dzFind(item.name); if (!a) return [];
    const d = await getJSON(`https://api.deezer.com/artist/${a.id}/top?limit=15`, { ttlMs: 7 * 864e5 });
    if (d?.error) throw new Error(`Deezer: ${d.error.message || d.error.type || "error"}`);
    return (d?.data || []).map(t => mapTrack(t, t.album?.title, item.name));
  }
  return [];
}
const article = (w) => (/^[aeiou]/i.test(w) ? "an" : "a");
/** Always returns a short description: Wikipedia when there is an article, otherwise built from the known facts. */
export async function describe(item) {
  const own = String(item.artist || item.name || "");
  if (item.kind === "artist") {
    const w = await wikiArtist(item.name).catch(() => null);
    if (w) return { extract: brief(w.extract, 340), url: w.url, wiki: true };
    return { extract: item.because ? `${item.name} is an artist whose music is close to ${item.because}, who you listen to.` : `${item.name} is one of the artists you listen to most.`, wiki: false };
  }
  const surname = norm(own).split(" ").pop();
  const mentions = (d) => norm(d.extract + " " + (d.description || "")).includes(surname);
  const w = item.kind === "album"
    ? await wikiTry([`${item.title} (${own} album)`, `${item.title} (album)`, item.title], d => /album|record|ep\b/i.test(`${d.description} ${d.extract.slice(0, 200)}`) && mentions(d))
    : await wikiTry([`${item.title} (${own} song)`, `${item.title} (song)`], d => /song|single/i.test(`${d.description} ${d.extract.slice(0, 200)}`) && mentions(d));
  if (w) return { extract: brief(w.extract, 340), url: w.url, wiki: true };

  // no article: say what we know, then a line about the artist
  const f = await albumFacts({ albumId: item.albumId, artist: own, title: item.kind === "album" ? item.title : (item.album || item.title) });
  const year = item.year || f?.year, genre = f?.genres?.length ? ` Genre: ${f.genres.join(", ")}.` : "";
  let text;
  if (item.kind === "album") {
    const type = (f?.type && f.type !== "album") ? f.type.toUpperCase() === "EP" ? "EP" : f.type : "album";
    text = `${item.title} is ${article(type)} ${type} by ${own}${year ? `, released in ${year}` : ""}${f?.tracks ? `, with ${f.tracks} track${f.tracks !== 1 ? "s" : ""}` : ""}.${genre}${f?.label ? ` Label: ${f.label}.` : ""}`;
  } else {
    const from = item.album && norm(item.album) !== norm(item.title) ? `, from ${item.album}` : "";
    text = `“${item.title}” is a song by ${own}${from}${year ? ` (${year})` : ""}.${item.duration ? ` It runs ${Math.floor(item.duration / 60)}:${String(Math.round(item.duration % 60)).padStart(2, "0")}.` : ""}${genre} It is one of ${own}'s most listened-to songs.`;
  }
  const a = await wikiArtist(own).catch(() => null);
  if (a) text += ` About ${own}: ${brief(a.extract, 190)}`;
  return { extract: text, url: a?.url || null, wiki: !!a };
}

/* ---------- 6. where to listen: licensed services, opened by search (we never play anything) ---------- */
export function listenLinks(item) {
  const q = enc(item.kind === "artist" ? item.name : `${item.artist} ${item.title}`);
  return [
    { id: "deezer", name: "Deezer", url: item.link || `https://www.deezer.com/search/${q}` },
    { id: "spotify", name: "Spotify", url: `https://open.spotify.com/search/${q}` },
    { id: "ytm", name: "YouTube Music", url: `https://music.youtube.com/search?q=${q}` },
  ];
}
