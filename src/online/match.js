import { needsCleaning } from "../titleClean.js";
/* Offline logic: fuzzy matching, duplicate / gap finder, recommendations. No network here. */

export function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[([][^)\]]*(feat|ft|official|audio|video|lyrics?|visuali[sz]er|remaster|live|mix|version|hd|hq|\d+\s*k)[^)\]]*[)\]]/g, " ")
    .replace(/\b(feat|ft|featuring)\.?\b.*$/g, " ")
    .replace(/\b(official|audio|video|lyrics?|visuali[sz]er|remastered?|hd|hq)\b/g, " ")
    .replace(/&/g, " and ")
    // Keep letters of non-Latin scripts (Japanese, Korean, Chinese, Arabic, Cyrillic, Greek, Hindi…) and their digits.
    // Latin text is unchanged: everything that is not a-z / 0-9 still becomes a space, exactly as before.
    .normalize("NFC")
    .replace(/[^a-z0-9\s]/gu, (ch) => ((/\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch)) || (/\p{Nd}/u.test(ch) && ch.charCodeAt(0) > 127)) ? ch : " ")
    .trim().replace(/\s+/g, " ");
}
// Japanese / Chinese have no spaces between words: compare 2-character groups instead of whole runs.
const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/u;
export const tokens = (s) => {
  const out = [];
  for (const w of norm(s).split(" ")) {
    if (!w) continue;
    if (CJK_RE.test(w) && [...w].length > 2) { const cs = [...w]; for (let i = 0; i < cs.length - 1; i++) out.push(cs[i] + cs[i + 1]); }
    else out.push(w);
  }
  return out;
};

export function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return 0;
  if (A.join(" ") === B.join(" ")) return 1;
  const sa = new Set(A), sb = new Set(B);
  let inter = 0; sa.forEach(t => { if (sb.has(t)) inter++; });
  const jacc = inter / (sa.size + sb.size - inter);
  const contain = inter / Math.min(sa.size, sb.size);
  return Math.max(jacc, contain * 0.88);
}

const isUnknown = (a) => !a || /^unknown( artist)?$/i.test(String(a).trim());

const baseNameOf = (p) => String(p || "").split(/[\\/:]/).pop().replace(/\.[A-Za-z0-9]{2,4}$/, "").replace(/_/g, " ");

/** wanted: [{artist,title}] → [{wanted, track|null, score}]
 *  A library song is accepted only if the words of the wanted title are all (≥ 80 %) found in its title, artist or file name. */
export function matchWanted(wanted, library) {
  const idx = library.map(t => ({ t, nt: norm(t.title), na: norm(t.artist) }));
  const covered = (w, t) => {
    const wt = tokens(w.title); if (!wt.length) return true;
    const bag = new Set([...tokens(t.title), ...tokens(t.artist), ...tokens(baseNameOf(t.filePath))]);
    return wt.filter(x => bag.has(x)).length / wt.length >= 0.8;
  };
  return wanted.map(w => {
    const wt = norm(w.title), wa = norm(w.artist);
    let best = null, bestScore = 0;
    for (const e of idx) {
      const ts = e.nt === wt ? 1 : similarity(e.nt, wt);
      if (ts < 0.6) continue;
      const as = !wa || isUnknown(e.t.artist) ? 0.6 : (e.na === wa ? 1 : similarity(e.na, wa));
      const score = ts * 0.68 + as * 0.32;
      if (score > bestScore) { bestScore = score; best = e.t; }
    }
    return { wanted: w, track: bestScore >= 0.72 && best && covered(w, best) ? best : null, score: bestScore };
  });
}

/** Groups of tracks that look like the same song (same artist+title, or an unknown-artist copy with a matching title and length). */
export function findDuplicates(library) {
  const groups = new Map();           // "artist|title" -> tracks
  const knownByTitle = new Map();     // title -> [{key, track}]
  const unknown = [];
  for (const t of library) {
    const nt = norm(t.title);
    if (!nt) continue;
    if (isUnknown(t.artist)) { unknown.push({ t, nt }); continue; }
    const key = `${norm(t.artist)}|${nt}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
    if (!knownByTitle.has(nt)) knownByTitle.set(nt, []);
    knownByTitle.get(nt).push({ key, t });
  }
  const unknownGroups = new Map();
  for (const { t, nt } of unknown) {
    const near = (knownByTitle.get(nt) || []).find(k => Math.abs((k.t.duration || 0) - (t.duration || 0)) <= 3);
    if (near) { groups.get(near.key).push(t); continue; }       // copy of a song that has a proper artist
    const key = `?|${nt}`;
    if (!unknownGroups.has(key)) unknownGroups.set(key, []);
    unknownGroups.get(key).push(t);
  }
  const out = [];
  groups.forEach((list, key) => { if (list.length > 1) out.push({ key, tracks: list }); });
  unknownGroups.forEach((list, key) => {
    const ok = list.filter((t, i) => list.some((o, j) => i !== j && Math.abs((o.duration || 0) - (t.duration || 0)) <= 3));
    if (ok.length > 1) out.push({ key, tracks: ok });
  });
  return out.sort((a, b) => b.tracks.length - a.tracks.length);
}

export function findGaps(library, lyricsMap = {}) {
  return {
    unknownArtist: library.filter(t => isUnknown(t.artist)),
    noAlbum: library.filter(t => !t.album || /^(local files|unknown( album)?)$/i.test(String(t.album).trim())),
    noCover: library.filter(t => !t.art),
    rawTitles: library.filter(needsCleaning),       // the same cleaner as "Clean up titles" and Fix tags
    noLyrics: library.filter(t => !(lyricsMap[t.id]?.lines?.length)),
  };
}

/** "Because you listen to…" suggestions built only from the user's own history. */
export function buildRecommendations({ library, playCounts = {}, playHistory = [], favorites }) {
  if (library.length < 8) return [];
  const byArtist = new Map();
  for (const t of library) {
    if (isUnknown(t.artist)) continue;
    const e = byArtist.get(t.artist) || { artist: t.artist, tracks: [], plays: 0 };
    e.tracks.push(t); e.plays += playCounts[t.id] || 0;
    byArtist.set(t.artist, e);
  }
  const top = [...byArtist.values()].filter(a => a.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 5);
  const lastPlayed = {};
  for (const h of playHistory) if (!lastPlayed[h.id] || h.ts > lastPlayed[h.id]) lastPlayed[h.id] = h.ts;
  const used = new Set(), out = [];
  const add = (track, reason) => { if (track && !used.has(track.id) && out.length < 8) { used.add(track.id); out.push({ track, reason }); } };

  for (const a of top) {
    const fresh = a.tracks.filter(t => !(playCounts[t.id] > 0)).slice(0, 2);
    fresh.forEach(t => add(t, `You play ${a.artist} a lot — not heard yet`));
  }
  const now = Date.now(), DAY = 864e5;
  library
    .filter(t => (playCounts[t.id] || 0) >= 3 && lastPlayed[t.id] && now - lastPlayed[t.id] > 30 * DAY)
    .sort((a, b) => (playCounts[b.id] || 0) - (playCounts[a.id] || 0)).slice(0, 3)
    .forEach(t => add(t, "A favourite you haven't played in a while"));
  if (favorites) {
    library.filter(t => favorites.has(t.id) && (!lastPlayed[t.id] || now - lastPlayed[t.id] > 14 * DAY)).slice(0, 2)
      .forEach(t => add(t, "Liked, but it's been a couple of weeks"));
  }
  library.slice(-12).reverse().filter(t => !(playCounts[t.id] > 0)).slice(0, 2).forEach(t => add(t, "New in your library"));
  return out;
}
