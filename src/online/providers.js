/* Provider calls. Each one is only ever called after the user has switched the matching feature on. */
import { getJSON, postJSON, getImageDataUrl, enc } from "./net.js";
import { norm, similarity } from "./match.js";

export const SOURCES = [
  { id: "musicbrainz", name: "MusicBrainz", use: "Song details (title, artist, album, year)", license: "Data is CC0 (public domain)", url: "https://musicbrainz.org" },
  { id: "caa", name: "Cover Art Archive", use: "Album covers", license: "Images are provided by the Cover Art Archive; rights stay with their owners", url: "https://coverartarchive.org" },
  { id: "wikipedia", name: "Wikipedia", use: "Artist biographies (text only)", license: "Text is CC BY-SA 4.0", url: "https://wikipedia.org" },
  { id: "itunes", name: "iTunes Search", use: "Song details and album covers", license: "Artwork belongs to its owners; shown only to identify your own songs", url: "https://www.apple.com/itunes/" },
  { id: "theaudiodb", name: "TheAudioDB", use: "Artist photos (fallback)", license: "Community database; images belong to their owners", url: "https://www.theaudiodb.com" },
  { id: "lrclib", name: "LRCLIB", use: "Song lyrics", license: "Community-contributed lyrics, free to use", url: "https://lrclib.net" },
  { id: "listenbrainz", name: "ListenBrainz", use: "Listening history, playlist links", license: "Open data from the MetaBrainz Foundation", url: "https://listenbrainz.org" },
  { id: "lastfm", name: "Last.fm", use: "Similar artists", license: "Powered by Last.fm", url: "https://last.fm" },
  { id: "audius", name: "Audius", use: "Streaming of independent music", license: "Streamed from Audius; licences are set by each artist", url: "https://audius.co" },
  { id: "archive", name: "Internet Archive", use: "Free & public-domain audio", license: "Licences are shown on each item", url: "https://archive.org" },
  { id: "jamendo", name: "Jamendo", use: "Creative-Commons music", license: "Creative Commons — see each track's licence", url: "https://jamendo.com" },
  { id: "deezer", name: "Deezer", use: "Song details, covers, artist photos, albums, public playlist links", license: "Artwork belongs to its owners; shown only to identify your own songs", url: "https://deezer.com" },
];

/* ---------------- MusicBrainz + Cover Art Archive ---------------- */
const q = (s) => String(s || "").replace(/["\\]/g, " ").trim();

export async function mbLookupRecording({ artist, title, duration }) {
  const unknown = !artist || /^unknown/i.test(artist);
  const query = unknown ? `recording:"${q(title)}"` : `recording:"${q(title)}" AND artist:"${q(artist)}"`;
  const data = await getJSON(`https://musicbrainz.org/ws/2/recording/?query=${enc(query)}&fmt=json&limit=6`, { ttlMs: 30 * 864e5, mem: true });
  const recs = data?.recordings || [];
  let best = null, bestScore = 0;
  for (const r of recs) {
    const credit = (r["artist-credit"] || []).map(c => c.name).join("");
    const ts = similarity(r.title, title);
    const as = unknown ? 0.5 : similarity(credit, artist);
    let s = ts * 0.6 + as * 0.3 + (Math.min(100, r.score || 0) / 100) * 0.1;
    if (duration && r.length && Math.abs(r.length / 1000 - duration) <= 6) s += 0.08;
    if (ts >= 0.7 && s > bestScore) { bestScore = s; best = r; }
  }
  if (!best || bestScore < 0.68) return null;
  const releases = (best.releases || []).slice().sort((a, b) => {
    const rank = (r) => (r["release-group"]?.["primary-type"] === "Album" ? 0 : r["release-group"]?.["primary-type"] === "EP" ? 1 : 2) + (r["release-group"]?.["secondary-types"]?.length ? 3 : 0);
    return rank(a) - rank(b);
  });
  const rel = releases[0];
  const credit = best["artist-credit"] || [];
  return {
    recordingId: best.id,
    title: best.title,
    artist: credit.map(c => c.name + (c.joinphrase || "")).join("").trim() || artist,
    artistId: credit[0]?.artist?.id || null,
    album: rel?.title || null,
    releaseId: rel?.id || null,
    releaseGroupId: rel?.["release-group"]?.id || null,
    year: (rel?.date || best["first-release-date"] || "").slice(0, 4) || null,
    confidence: Math.round(bestScore * 100),
  };
}

export async function caaCover({ releaseId, releaseGroupId }) {
  const tries = [];
  if (releaseId) tries.push(`https://coverartarchive.org/release/${releaseId}/front-250`);
  if (releaseGroupId) tries.push(`https://coverartarchive.org/release-group/${releaseGroupId}/front-250`);
  for (const u of tries) { try { return await getImageDataUrl(u, 240); } catch { /* try next */ } }
  return null;
}

/* ---------------- Wikipedia ---------------- */
const MUSIC_WORDS = /(singer|rapper|band|musician|composer|producer|dj|songwriter|duo|group|vocalist|artist|guitarist|pianist|record)/i;
const wikiSummary = async (title) => {
  let d; try { d = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc(title.replace(/ /g, "_"))}?redirect=true`, { ttlMs: 30 * 864e5 }); } catch { return null; }
  if (!d || d.type === "disambiguation" || !d.extract) return null;
  if (!MUSIC_WORDS.test(`${d.description || ""} ${d.extract.slice(0, 400)}`)) return null;
  return { title: d.title, description: d.description || "", extract: d.extract, url: d.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${enc(title)}` };
};
/** Bio text only — photos come from lookup.js (Wikipedia photos are intentionally not used). */
export async function wikiArtist(name) {
  for (const v of [name, `${name} (musician)`, `${name} (singer)`, `${name} (band)`, `${name} (rapper)`]) {
    const r = await wikiSummary(v); if (r) return r;
  }
  // nothing under the usual titles → ask Wikipedia's own search
  try {
    const s = await getJSON(`https://en.wikipedia.org/w/rest.php/v1/search/title?q=${enc(name + " musician")}&limit=4`, { ttlMs: 30 * 864e5 });
    for (const p of (s?.pages || [])) {
      if (similarity(String(p.title).replace(/\s*\(.*\)$/, ""), name) < 0.8) continue;
      const r = await wikiSummary(p.title); if (r) return r;
    }
  } catch { /* none */ }
  return null;
}

export async function mbDiscography(name) {
  const s = await getJSON(`https://musicbrainz.org/ws/2/artist/?query=${enc(`artist:"${q(name)}"`)}&fmt=json&limit=3`, { ttlMs: 30 * 864e5 });
  const a = (s?.artists || []).find(x => (x.score || 0) >= 90 && similarity(x.name, name) >= 0.8);
  if (!a) return null;
  const d = await getJSON(`https://musicbrainz.org/ws/2/release-group?artist=${a.id}&type=album&fmt=json&limit=100`, { ttlMs: 30 * 864e5 });
  const albums = (d?.["release-groups"] || [])
    .filter(g => !(g["secondary-types"] || []).length)
    .map(g => ({ id: g.id, title: g.title, year: (g["first-release-date"] || "").slice(0, 4) }))
    .sort((x, y) => (x.year || "9999").localeCompare(y.year || "9999"));
  return { artistId: a.id, albums };
}

/* ---------------- Lyrics (LRCLIB) ---------------- */
export async function lrclibFind({ artist, title, album, duration }) {
  const unknown = !artist || /^unknown/i.test(artist);
  let hit = null;
  if (!unknown) {
    const u = `https://lrclib.net/api/get?artist_name=${enc(artist)}&track_name=${enc(title)}${album ? `&album_name=${enc(album)}` : ""}${duration ? `&duration=${Math.round(duration)}` : ""}`;
    try { hit = await getJSON(u, { ttlMs: 30 * 864e5 }); } catch { hit = null; }
  }
  if (!hit) {
    const u = `https://lrclib.net/api/search?track_name=${enc(title)}${unknown ? "" : `&artist_name=${enc(artist)}`}`;
    try {
      const list = await getJSON(u, { ttlMs: 30 * 864e5 });
      hit = (list || []).find(r => (r.syncedLyrics || r.plainLyrics) && similarity(r.trackName, title) >= 0.8 && (!duration || !r.duration || Math.abs(r.duration - duration) <= 8)) || null;
    } catch { hit = null; }
  }
  if (!hit || (!hit.syncedLyrics && !hit.plainLyrics)) return null;
  return { synced: hit.syncedLyrics || null, plain: hit.plainLyrics || null };
}

/* ---------------- Scrobbling (ListenBrainz) ---------------- */
const lbMeta = (t) => ({
  artist_name: t.artist, track_name: t.title, ...(t.album && !/^local files$/i.test(t.album) ? { release_name: t.album } : {}),
  additional_info: { media_player: "Reel", submission_client: "Reel", ...(t.duration ? { duration_ms: Math.round(t.duration * 1000) } : {}) },
});
export const lbPlayingNow = (token, t) => postJSON("https://api.listenbrainz.org/1/submit-listens", { listen_type: "playing_now", payload: [{ track_metadata: lbMeta(t) }] }, { Authorization: `Token ${token}` });
export const lbSubmit = (token, items) => postJSON("https://api.listenbrainz.org/1/submit-listens", { listen_type: items.length > 1 ? "import" : "single", payload: items.map(i => ({ listened_at: i.listenedAt, track_metadata: lbMeta(i.track) })) }, { Authorization: `Token ${token}` });
export async function lbValidate(token) {
  const d = await getJSON("https://api.listenbrainz.org/1/validate-token", { headers: { Authorization: `Token ${token}` }, noCache: true });
  return d?.valid ? d.user_name : null;
}

/* ---------------- Similar artists (Last.fm, read-only) ---------------- */
export async function lastfmSimilar(key, artist) {
  const d = await getJSON(`https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${enc(artist)}&api_key=${enc(key)}&format=json&limit=8&autocorrect=1`, { ttlMs: 14 * 864e5 });
  return (d?.similarartists?.artist || []).map(a => a.name).filter(Boolean);
}

/* ---------------- Free / independent music ---------------- */
let audiusHost = null;
async function audiusBase() {
  if (audiusHost) return audiusHost;
  const d = await getJSON("https://api.audius.co", { ttlMs: 864e5 });
  const hosts = (d?.data || []).filter(h => /^https:/.test(h));
  audiusHost = hosts[Math.floor(Math.random() * hosts.length)] || null;
  if (!audiusHost) throw new Error("Audius is not reachable right now");
  return audiusHost;
}
export async function audiusSearch(query) {
  const base = await audiusBase();
  const d = await getJSON(`${base}/v1/tracks/search?query=${enc(query)}&app_name=Reel&limit=25`, { ttlMs: 864e5 / 4 });
  return (d?.data || []).filter(t => t.is_streamable !== false).map(t => ({
    id: `remote:audius:${t.id}`, title: t.title, artist: t.user?.name || "Unknown", album: "Audius", duration: t.duration || 0,
    url: `${base}/v1/tracks/${t.id}/stream?app_name=Reel`, art: t.artwork?.["150x150"] || t.artwork?.["480x480"] || null,
    remote: true, source: "Audius", sourceUrl: t.permalink ? `https://audius.co${t.permalink}` : "https://audius.co", license: "Streamed from Audius",
  }));
}

export async function jamendoSearch(clientId, query) {
  if (!clientId) throw new Error("Add your free Jamendo client ID in Settings first");
  const d = await getJSON(`https://api.jamendo.com/v3.0/tracks/?client_id=${enc(clientId)}&format=json&limit=25&search=${enc(query)}&audioformat=mp32&imagesize=200&include=licenses`, { ttlMs: 864e5 / 4 });
  return (d?.results || []).filter(r => r.audio && r.audiodownload_allowed !== false).map(r => ({
    id: `remote:jamendo:${r.id}`, title: r.name, artist: r.artist_name, album: r.album_name || "Jamendo", duration: r.duration || 0,
    url: r.audio, art: r.image || null, remote: true, source: "Jamendo", sourceUrl: r.shareurl || "https://jamendo.com",
    license: r.license_ccurl ? `Creative Commons — ${r.license_ccurl}` : "Creative Commons (see Jamendo)",
  }));
}

export async function archiveSearch(query) {
  const qq = `(${query.replace(/[()"]/g, " ")}) AND mediatype:audio AND (licenseurl:*creativecommons* OR licenseurl:*publicdomain*)`;
  const d = await getJSON(`https://archive.org/advancedsearch.php?q=${enc(qq)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=20&output=json`, { ttlMs: 864e5 / 4 });
  return (d?.response?.docs || []).map(x => ({ identifier: x.identifier, title: x.title || x.identifier, creator: [].concat(x.creator || [])[0] || "Unknown", licenseurl: x.licenseurl || "" }));
}
export async function archiveTracks(item) {
  const d = await getJSON(`https://archive.org/metadata/${enc(item.identifier)}`, { ttlMs: 7 * 864e5 });
  const files = (d?.files || []).filter(f => /mp3$/i.test(f.name) && /mp3/i.test(f.format || "")).slice(0, 40);
  return files.map((f, i) => ({
    id: `remote:archive:${item.identifier}:${i}`, title: (f.title || f.name.replace(/\.mp3$/i, "")).replace(/_/g, " "), artist: f.creator || item.creator, album: item.title,
    duration: Math.round(parseFloat(f.length) || 0), url: `https://archive.org/download/${enc(item.identifier)}/${f.name.split("/").map(enc).join("/")}`,
    art: `https://archive.org/services/img/${enc(item.identifier)}`, remote: true, source: "Internet Archive", sourceUrl: `https://archive.org/details/${item.identifier}`, license: item.licenseurl || "See the Internet Archive page",
  }));
}

/* ---------------- Playlist links ---------------- */
export async function deezerPlaylist(id) {
  const meta = await getJSON(`https://api.deezer.com/playlist/${id}`, { ttlMs: 864e5 });
  if (!meta || meta.error) throw new Error("That playlist is private or can't be found");
  const tr = await getJSON(`https://api.deezer.com/playlist/${id}/tracks?limit=300`, { ttlMs: 864e5 });
  return { name: meta.title || "Imported playlist", tracks: (tr?.data || []).map(t => ({ artist: t.artist?.name || "", title: t.title || "" })) };
}
export async function lbPlaylist(mbid) {
  const d = await getJSON(`https://api.listenbrainz.org/1/playlist/${mbid}`, { ttlMs: 864e5 });
  const p = d?.playlist; if (!p) throw new Error("Playlist not found");
  return { name: p.title || "Imported playlist", tracks: (p.track || []).map(t => ({ artist: t.creator || "", title: t.title || "" })) };
}

/** Turns whatever the user pasted into a { name, tracks:[{artist,title}] } list. */
export async function readPlaylistInput(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Paste a link or a list of songs first");
  const code = raw.match(/reel:\/\/p\/([A-Za-z0-9_\-]+)/);
  if (code) { try { return decodeShare(code[1]); } catch { throw new Error("That Reel code looks damaged"); } }
  const url = raw.match(/https?:\/\/\S+/);
  if (url && !raw.includes("\n")) {
    const u = url[0];
    const dz = u.match(/deezer\.com\/(?:[a-z]{2}\/)?playlist\/(\d+)/i);
    if (dz) return deezerPlaylist(dz[1]);
    const lb = u.match(/listenbrainz\.org\/playlist\/([0-9a-f-]{36})/i);
    if (lb) return lbPlaylist(lb[1]);
    if (/spotify\.com|youtube\.com|youtu\.be|music\.apple\.com/i.test(u)) {
      const e = new Error("Spotify, YouTube and Apple Music links can't be read without signing in to those services. Copy the song list from the app and paste it here instead.");
      e.unsupported = true; throw e;
    }
    throw new Error("That link isn't supported. Deezer and ListenBrainz playlists work, or paste the song list.");
  }
  const tracks = raw.split(/\r?\n/).map(l => l.replace(/^\s*(\d+[.)]\s*|[-•*]\s*)/, "").trim()).filter(Boolean).map(parseLine).filter(t => t.title);
  if (!tracks.length) throw new Error("I couldn't find any songs in that text");
  return { name: "Imported playlist", tracks };
}
function parseLine(line) {
  let m = line.match(/^(.+?)\s+[-–—]\s+(.+)$/);        // "Artist - Title"
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  m = line.match(/^(.+?)\s+by\s+(.+)$/i);               // "Title by Artist"
  if (m) return { artist: m[2].trim(), title: m[1].trim() };
  return { artist: "", title: line };
}

/* ---------------- Share text / code ---------------- */
const b64u = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
export function encodeShare(name, tracks) { return b64u(JSON.stringify({ n: name, t: tracks.map(t => [t.artist, t.title]) })); }
export function decodeShare(code) { const o = JSON.parse(unb64u(code)); return { name: o.n || "Imported playlist", tracks: (o.t || []).map(([artist, title]) => ({ artist, title })) }; }
export function playlistShareText(name, tracks) {
  const lines = tracks.map((t, i) => `${i + 1}. ${t.artist && !/^unknown/i.test(t.artist) ? `${t.artist} - ` : ""}${t.title}`);
  return `${name} — ${tracks.length} songs\n\n${lines.join("\n")}\n\nShared from Reel (titles and artists only — no audio)\nreel://p/${encodeShare(name, tracks)}`;
}
export { norm };
