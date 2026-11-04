/* "Made for you" playlists.
   1. ENRICH (online, cached): for every album in the library, Deezer gives genre, release year and the artist's related
      artists (MusicBrainz is not needed: Deezer answers for almost everything). Stored per album, refreshed after 90 days.
   2. GROUP (local): genre × decade, artist circles, moods, new songs, script/language. A group needs >= 8 songs.
   3. NAME + COVER: templates by group kind; a 2x2 mosaic of the group's own covers on its dominant colour.
   Suggestions only ever contain songs that are on the phone: the internet is used to understand them, never to stream. */
import { getJSON, enc } from "./net.js";
import { norm, similarity } from "./match.js";
import { dominantColors } from "../dominantColor.js";

export const MIN_GROUP = 6, MAX_ACTIVE = 14, REFRESH_DAYS = 90;
const unknown = (a) => !a || /^(unknown|local files)/i.test(String(a).trim());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The genre Deezer gave for this song's album (or its artist), "" when unknown. */
export const genreOfTrack = (t, enrichment) => (enrichment[unknown(t.album) ? `a|${norm(t.artist)}` : `${norm(t.artist)}|${norm(t.album)}`] || {}).genre || "";
export const albumKey = (t) => `${norm(t.artist)}|${norm(t.album)}`;
export const artistKey = (t) => `a|${norm(t.artist)}`;

/** Albums (and artist-only songs) that still need a lookup. */
export function pendingEnrichment(library, enrichment, now = Date.now()) {
  const stale = REFRESH_DAYS * 864e5, seen = new Set(), out = [];
  for (const t of library) {
    if (t.remote || unknown(t.artist)) continue;
    const key = unknown(t.album) ? artistKey(t) : albumKey(t);
    if (seen.has(key)) continue; seen.add(key);
    const e = enrichment[key];
    if (!e || now - (e.fetchedAt || 0) > stale) out.push({ key, artist: t.artist, album: unknown(t.album) ? "" : t.album });
  }
  return out;
}

const relatedCache = new Map();
async function related(artistId) {
  if (relatedCache.has(artistId)) return relatedCache.get(artistId);
  const d = await getJSON(`https://api.deezer.com/artist/${artistId}/related?limit=10`, { ttlMs: 30 * 864e5 });
  const names = (d?.data || []).map((a) => a.name).filter(Boolean);
  relatedCache.set(artistId, names);
  return names;
}

/** One lookup → { genre, year, related[], fetchedAt } or null when the service knows nothing (or is unreachable). */
export async function enrichOne({ artist, album }) {
  let albumData = null, artistId = null;
  if (album) {
    const r = await getJSON(`https://api.deezer.com/search/album?q=${enc(`${artist} ${album}`)}&limit=4`, { ttlMs: 30 * 864e5 });
    if (r?.error) throw new Error("Deezer: " + (r.error.message || "error"));
    const hit = (r?.data || []).find((a) => similarity(a.title, album) >= 0.75 && similarity(a.artist?.name || "", artist) >= 0.7);
    if (hit) {
      artistId = hit.artist?.id || null;
      const full = await getJSON(`https://api.deezer.com/album/${hit.id}`, { ttlMs: 30 * 864e5 });
      if (full && !full.error) albumData = full;
    }
  }
  if (!artistId) {
    const r = await getJSON(`https://api.deezer.com/search/artist?q=${enc(artist)}&limit=3`, { ttlMs: 30 * 864e5 });
    if (r?.error) throw new Error("Deezer: " + (r.error.message || "error"));
    artistId = (r?.data || []).find((a) => similarity(a.name, artist) >= 0.85)?.id || null;
  }
  if (!albumData && !artistId) return { genre: "", year: "", related: [], fetchedAt: Date.now() };   // known to be unknown: do not ask again for 90 days
  const rel = artistId ? await related(artistId).catch(() => []) : [];
  // No album (or the album was not found): take the genre and year from the artist's most popular song's album.
  if (!albumData && artistId) {
    try {
      const top = await getJSON(`https://api.deezer.com/artist/${artistId}/top?limit=1`, { ttlMs: 30 * 864e5 });
      const albumId = top?.data?.[0]?.album?.id;
      if (albumId) { const full = await getJSON(`https://api.deezer.com/album/${albumId}`, { ttlMs: 30 * 864e5 }); if (full && !full.error) albumData = full; }
    } catch { /* genre stays empty */ }
  }
  return {
    genre: albumData?.genres?.data?.[0]?.name || "",
    year: (albumData?.release_date || "").slice(0, 4),
    related: rel,
    fetchedAt: Date.now(),
  };
}

/** Runs the lookups one at a time (the services rate-limit); stops when `signal.stop` is set. */
export async function enrichLibrary(library, enrichment, { onEntry, onProgress, signal = {}, max = 400 } = {}) {
  const todo = pendingEnrichment(library, enrichment).slice(0, max);
  let done = 0;
  onProgress?.(0, todo.length);
  for (const item of todo) {
    if (signal.stop) break;
    try {
      const e = await enrichOne(item);
      onEntry?.(item.key, e); done++;
      onProgress?.(done, todo.length);
    } catch { break; /* offline or refused: try again at the next run */ }
    await sleep(260);
  }
  return done;
}

/* ------------------------------- grouping ------------------------------- */
const SCRIPTS = [
  ["Arabic", /[\u0600-\u06FF]/], ["Cyrillic", /[\u0400-\u04FF]/], ["Korean", /[\uAC00-\uD7AF]/],
  ["Japanese", /[\u3040-\u30FF]/], ["Chinese", /[\u4E00-\u9FFF]/], ["Hindi", /[\u0900-\u097F]/],
];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const decadeOf = (year) => { const y = parseInt(year, 10); return y >= 1950 && y <= 2099 ? Math.floor(y / 10) * 10 : null; };

/** Returns up to MAX_ACTIVE groups: { seedKey, kind, name, trackIds }. */
export function buildGroups({ library, enrichment, moods = [], lastVisit = 0, dismissed = [], takenNames = [] }) {
  const tracks = library.filter((t) => !t.remote && !t.missing);
  const info = (t) => enrichment[unknown(t.album) ? artistKey(t) : albumKey(t)] || {};
  const groups = [];
  const add = (seedKey, kind, name, ids) => { if (ids.length >= MIN_GROUP) groups.push({ seedKey, kind, name, trackIds: ids }); };

  // genre × decade, then genre alone
  const byGenre = new Map(), byGD = new Map();
  for (const t of tracks) {
    const e = info(t); if (!e.genre) continue;
    const g = e.genre.toLowerCase();
    (byGenre.get(g) || byGenre.set(g, []).get(g)).push(t.id);
    const d = decadeOf(e.year);
    if (d) { const k = `${g}|${d}`; (byGD.get(k) || byGD.set(k, []).get(k)).push(t.id); }
  }
  const usedInGD = new Set();
  for (const [k, ids] of byGD) { const [g, d] = k.split("|"); if (ids.length >= MIN_GROUP) { add(`gd:${k}`, "decade", `${d}s ${cap(g)}`, ids); ids.forEach((i) => usedInGD.add(i)); } }
  for (const [g, ids] of byGenre) add(`genre:${g}`, "genre", `${cap(g)} mix`, ids);

  // artist circles: an artist plus the artists Deezer says are related to them
  const byArtist = new Map();
  for (const t of tracks) { if (unknown(t.artist)) continue; const k = norm(t.artist); (byArtist.get(k) || byArtist.set(k, { name: t.artist, ids: [], rel: new Set() }).get(k)).ids.push(t.id); }
  for (const t of tracks) { const a = byArtist.get(norm(t.artist)); if (a) (info(t).related || []).forEach((r) => a.rel.add(norm(r))); }
  const heads = [...byArtist.values()].sort((a, b) => b.ids.length - a.ids.length).slice(0, 12);
  for (const head of heads) {
    const ids = new Set(head.ids);
    for (const [k, a] of byArtist) if (k !== norm(head.name) && (head.rel.has(k) || a.rel.has(norm(head.name)))) a.ids.forEach((i) => ids.add(i));
    if (ids.size > head.ids.length) add(`circle:${norm(head.name)}`, "circle", `If you like ${head.name}`, [...ids]);
  }

  // one artist's own songs ("Best of …") and eras, even when the genre is unknown
  for (const a of byArtist.values()) if (a.ids.length >= MIN_GROUP) add(`artist:${norm(a.name)}`, "artist", `${a.name} essentials`, a.ids);
  const byDecade = new Map();
  for (const t of tracks) { const d = decadeOf(info(t).year); if (d) (byDecade.get(d) || byDecade.set(d, []).get(d)).push(t.id); }
  for (const [d, ids] of byDecade) add(`decade:${d}`, "era", `Songs from the ${d}s`, ids);
  const byAlbum = new Map();
  for (const t of tracks) { if (unknown(t.album) || unknown(t.artist)) continue; const k = albumKey(t); (byAlbum.get(k) || byAlbum.set(k, { name: t.album, ids: [] }).get(k)).ids.push(t.id); }
  for (const [k, al] of byAlbum) add(`album:${k}`, "album", `${al.name} (full album)`, al.ids);
  const longOnes = tracks.filter((t) => (t.duration || 0) >= 330).map((t) => t.id);
  add("long", "length", "Long listens", longOnes);
  const shortOnes = tracks.filter((t) => (t.duration || 0) > 0 && t.duration <= 170).map((t) => t.id);
  add("short", "length", "Quick hits", shortOnes);

  // moods the user tagged by hand
  for (const m of moods) add(`mood:${m.key}`, "mood", `${m.label} vibes`, m.trackIds);

  // new this week
  if (lastVisit) add("fresh", "new", "Fresh finds", tracks.filter((t) => (t.dateAdded || 0) > lastVisit).map((t) => t.id));

  // script / language
  for (const [label, re] of SCRIPTS) add(`script:${label}`, "script", `${label} songs`, tracks.filter((t) => re.test(`${t.title}${t.artist}`)).map((t) => t.id));

  // drop dismissed seeds unless they grew by 50 %; keep names unique; biggest + most varied first
  const dis = new Map((dismissed || []).map((d) => [d.seed, d.size]));
  const taken = new Set(takenNames.map((n) => n.toLowerCase()));
  const out = [], kinds = new Map();
  groups.sort((a, b) => (kinds.get(a.kind) || 0) - (kinds.get(b.kind) || 0) || b.trackIds.length - a.trackIds.length);
  const pool = groups.filter((g) => { const was = dis.get(g.seedKey); return was == null || g.trackIds.length >= was * 1.5; });
  const jaccard = (a, b) => { const sb = new Set(b); let n = 0; for (const x of a) if (sb.has(x)) n++; return n / (a.length + b.length - n || 1); };
  while (out.length < MAX_ACTIVE && pool.length) {
    pool.sort((a, b) => (kinds.get(a.kind) || 0) - (kinds.get(b.kind) || 0) || b.trackIds.length - a.trackIds.length);
    const g = pool.shift();
    if (taken.has(g.name.toLowerCase())) continue;
    if (out.some(o => jaccard(o.trackIds, g.trackIds) > 0.8)) continue;   // nearly the same songs as one already proposed
    taken.add(g.name.toLowerCase()); kinds.set(g.kind, (kinds.get(g.kind) || 0) + 1); out.push(g);
  }
  return out;
}

/* -------------------------------- covers -------------------------------- */
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); setTimeout(() => res(null), 4000); i.src = src; });   // a stalled image never blocks adding a playlist

/** The (up to four) different cover images of a group, straight from the songs — shown as a mosaic with plain CSS,
    so it needs no canvas and never fails on a protected image. */
export function coverArts(tracks, max = 4) {
  const out = [], seen = new Set();
  for (const t of tracks) { if (t && t.art && !seen.has(t.art)) { seen.add(t.art); out.push(t.art); if (out.length >= max) break; } }
  return out;
}

/** 2x2 mosaic of up to four different covers on the group's dominant colour -> small JPEG data URL (or null).
    Used when a suggestion becomes a real playlist (its cover is stored with it). */
export async function mosaicCover(tracks, size = 320) {
  const arts = [], seen = new Set();
  for (const t of tracks) { if (t.art && !seen.has(t.art)) { seen.add(t.art); arts.push(t.art); if (arts.length >= 4) break; } }
  if (!arts.length) return null;
  const imgs = (await Promise.all(arts.map(loadImg))).filter(Boolean);
  if (!imgs.length) return null;
  const c = document.createElement("canvas"); c.width = c.height = size;
  const x = c.getContext("2d");
  const dom = dominantColors(imgs[0]);
  const g = x.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, dom ? dom.primary : "#3a3550"); g.addColorStop(1, dom ? dom.secondary : "#1c1a2a");
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const pad = 14, cell = (size - pad * 3) / 2;
  const cells = imgs.length >= 4 ? 4 : imgs.length >= 2 ? 2 : 1;
  const place = (img, cx, cy, w, h) => {
    const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
    x.save(); x.beginPath(); x.roundRect ? x.roundRect(cx, cy, w, h, 14) : x.rect(cx, cy, w, h); x.clip();
    x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, cx, cy, w, h); x.restore();
  };
  try {
    if (cells === 1) place(imgs[0], pad, pad, size - pad * 2, size - pad * 2);
    else if (cells === 2) { place(imgs[0], pad, pad, cell, size - pad * 2); place(imgs[1], pad * 2 + cell, pad, cell, size - pad * 2); }
    else imgs.slice(0, 4).forEach((im, i) => place(im, pad + (i % 2) * (cell + pad), pad + Math.floor(i / 2) * (cell + pad), cell, cell));
    return c.toDataURL("image/jpeg", 0.8);
  } catch { return null; }
}
