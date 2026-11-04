/* ============================================================
   Reel — wide-net lookup
   Finds a song's real title / artist / album / year / cover with several sources
   instead of one strict query:
     1. smart query variants (messy file names, "Artist - Title", numbers, brackets, feat.)
     2. Deezer search      (fast, big catalogue, good covers)      — only if needed:
     3. iTunes search      (covers up to 600px, release year)
     4. MusicBrainz        (best metadata, slowest)
   A source that is unreachable is skipped; the others carry on.
   Artist photos come from Deezer / TheAudioDB (never Wikipedia).
   ============================================================ */
import { getJSON, getImageDataUrl, enc } from "./net.js";
import { norm, similarity, tokens } from "./match.js";
import { mbLookupRecording, caaCover } from "./providers.js";

const isUnknown = (a) => !a || /^unknown( artist)?$/i.test(String(a).trim());

/* ---------------- cleaning + query variants ---------------- */
// Words that are not part of a song title (video / quality / language labels). One list, easy to extend.
export const JUNK_PHRASES = [
  "official\\s+(?:music\\s+|lyric\\s+|lyrics\\s+)?(?:video|audio|visuali[sz]er|clip|mv)", "clip\\s+officiel", "vid[eé]o\\s*clip", "vid[eé]oclip", "clip\\s+vid[eé]o",
  "lyric\\s+video", "music\\s+video", "full\\s+(?:song|version|video)", "best\\s+version", "new\\s+version",
  "official", "officiel", "oficial", "ufficiale", "animated", "visuali[sz]er", "vid[eé]o", "video", "audio", "lyrics?", "mv",
  "hd", "hq", "4k", "1080p", "720p", "topic", "vevo",
];
// Version labels: the original song is searched; the label is kept ("Title (Slowed)").
export const VERSION_PHRASES = [
  ["slowed\\s*(?:\\+|and|&|n)?\\s*reverb", "Slowed + Reverb"], ["super\\s+slowed", "Slowed"], ["slowed(?:\\s+down)?", "Slowed"],
  ["sped\\s*up|speed\\s*up", "Sped up"], ["nightcore", "Nightcore"], ["daycore", "Daycore"], ["reverb", "Reverb"],
  ["mashup", "Mashup"], ["bass\\s*boosted", "Bass boosted"], ["8d\\s*audio", "8D audio"],
];
const JUNK_TAIL = new RegExp(`(?:^|[\\s(\\[{|–—-])(?:${JUNK_PHRASES.join("|")})\\s*[)\\]}]?\\s*$`, "i");
const VERSION_TAILS = VERSION_PHRASES.map(([p, label]) => [new RegExp(`(?:^|[\\s(\\[{|–—-])(?:${p})\\s*[)\\]}]?\\s*$`, "i"), label]);
const VERSION_ANY = VERSION_PHRASES.map(([p, label]) => [new RegExp(`[(\\[{][^)\\]}]*\\b(?:${p})\\b[^)\\]}]*[)\\]}]`, "i"), label]);
const hasWord = (t) => /[\p{L}\p{N}]/u.test(t);

/** Downloaders write "__" where the real title ends: cut there BEFORE underscores become spaces. */
function prepText(s) {
  let t = String(s || "");
  const i = t.indexOf("__");
  if (i > 0 && hasWord(t.slice(0, i))) t = t.slice(0, i);
  return t.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}
/** Removes junk words and version labels from the END of a text, repeatedly (never the whole text). Returns { text, versions[] }. */
function stripTrailing(text) {
  let t = String(text || "").trim(); const versions = [];
  for (let n = 0; n < 8; n++) {
    let changed = false;
    const jm = t.match(JUNK_TAIL);
    if (jm) { const rest = t.slice(0, jm.index).replace(/[\s\-–—|,:]+$/, ""); if (hasWord(rest)) { t = rest; changed = true; } }
    if (!changed) for (const [re, label] of VERSION_TAILS) {
      const m = t.match(re); if (!m) continue;
      const rest = t.slice(0, m.index).replace(/[\s\-–—|,:]+$/, "");
      if (hasWord(rest)) { t = rest; if (!versions.includes(label)) versions.push(label); changed = true; break; }
    }
    if (!changed) break;
  }
  return { text: t, versions };
}
/** Version label found in brackets or at the end ("(Slowed)", "funk super slowed"), else null. */
export function detectVersion(raw) {
  const t = prepText(raw);
  for (const [re, label] of VERSION_ANY) if (re.test(t)) return label;
  const st = stripTrailing(t);
  return st.versions[0] || null;
}
// "Aren t" → "Aren't" (search text only; norm() treats both the same)
function repairContractions(t) {
  return t
    .replace(/\b(Aren|Isn|Wasn|Weren|Don|Doesn|Didn|Won|Wouldn|Couldn|Shouldn|Can|Haven|Hasn|Hadn|Ain) t\b/gi, "$1't")
    .replace(/\b(I) (m|ll|d|ve)\b/g, "$1'$2")
    .replace(/\b(It|That|He|She|There|What|Who|Let|Here|Where) s\b/gi, "$1's")
    .replace(/\b(You|We|They) (re|ll|d|ve)\b/gi, "$1'$2");
}
export function cleanTitleForSearch(s) {
  let t = String(s || "")
    .replace(/_/g, " ")
    .replace(/^\s*\d{1,3}\s*[-._)\]]\s+/, "")                 // "01 - ", "07. ", "3) "
    .replace(/^\s*\d{1,3}\s+(?=[A-Za-z])/, "")                // "01 Song name"
    .replace(/\(\s*\d{2,3}\s*k\s*\)/gi, " ")                   // (128k)
    .replace(/[([{][^)\]}]*[)\]}]/g, " ")                      // anything in brackets
    .replace(/\b(feat|ft|featuring)\b\.?.*$/i, " ")
    .replace(/\s+(official\s+)?(music\s+|lyric\s+|lyrics\s+)?(video|audio|visuali[sz]er)\s*$/i, " ")
    .replace(/\s*[-|–]\s*(topic|official|vevo)\s*$/i, " ")
    .replace(/\s*\b(hd|hq|4k|1080p|lyrics?)\b\s*$/i, " ")
    .replace(/\s+/g, " ").trim();
  t = stripTrailing(t).text;                                  // more junk words / version labels at the end
  return repairContractions(t).replace(/\s+/g, " ").trim();
}
const primaryArtist = (a) => String(a || "").split(/\s*(?:,|&|\band\b|\bx\b|\bfeat\.?\b|\bft\.?\b|\bwith\b|;|\/)\s*/i)[0].trim();

/* ---- what the tags / file name tell us ---- */
const GENERIC_ARTIST = new Set(["montagem", "dj", "mc", "funk", "phonk", "remix", "mix", "slowed", "mashup", "nightcore", "edit", "bootleg", "various", "soundtrack", "ost", "music", "audio", "video", "lyrics", "official", "song", "songs", "track", "artist"]);
const SERIES_TAIL = /\b(?:op|ed|ost|opening|ending|theme(?:\s+song)?|insert\s+song)\b\.?\s*\d{0,2}\s*$/i;
/** "Naruto Shippuden OP 4" → { series: "Naruto Shippuden" } (anime / game labels are not artist names). */
export function seriesOf(artist) {
  const a = String(artist || "").replace(/_/g, " ").trim();
  const m = a.match(SERIES_TAIL);
  if (!m) return null;
  const series = a.slice(0, m.index).replace(/[\s\-–—|,:]+$/, "").trim();
  return { series, label: m[0].trim() };
}
/** Cleaned file name from the path (without folders and extension), or "". */
export function fileBaseName(track) {
  let f = String(track?.filePath || "");
  if (!f) return "";
  try { f = decodeURIComponent(f); } catch { /* keep as is */ }
  f = f.split(/[\\/:]/).pop() || "";
  f = f.replace(/\.[A-Za-z0-9]{2,4}$/, "");
  return prepText(f);
}
/** Offline check: do the tags look like one phrase that was cut into artist + title? */
export function suspectTags(track) {
  const art = isUnknown(track.artist) ? "" : String(track.artist).trim();
  if (!art) return false;
  const aw = art.split(/\s+/).filter(Boolean);
  if (aw.length <= 2 && aw.some(w => GENERIC_ARTIST.has(norm(w)))) return true;
  if (seriesOf(art)) return true;
  const fb = fileBaseName(track);
  if (fb && !/[-–—|]/.test(fb) && norm(`${art} ${track.title}`) === norm(fb)) return true;
  return false;
}

/** Several plausible readings of one messy song → [{artist,title,extra?,hint?,shortened?}].
 *  The first (up to) 5 are the original readings, in the original order; everything new is appended after them (extra: true). */
export function queryVariants(t, opts = {}) {
  const out = [], seen = new Set();
  const add = (artist, title, extra = null) => {
    title = cleanTitleForSearch(title); artist = isUnknown(artist) ? "" : String(artist).replace(/_/g, " ").trim();
    if (!title) return;
    const k = norm(artist) + "|" + norm(title);
    if (!k.replace("|", "") || seen.has(k)) return; seen.add(k);
    out.push({ artist, title, ...(extra ? { extra: true, ...extra } : {}) });
  };
  let rawTitle = prepText(t.title).replace(/^\s*\d{1,3}\s*[-._)\]]\s+/, "").replace(/^\s*\d{1,3}\s+(?=[A-Za-z])/, "");
  rawTitle = stripTrailing(rawTitle).text;                       // junk words / version labels at the very end
  let art = isUnknown(t.artist) ? "" : t.artist;
  const ser = art ? seriesOf(art) : null;
  if (ser) art = "";                                               // "Naruto Shippuden OP 4" is not an artist
  if (opts.artistUnreliable) art = "";
  const spacedDash = /\s[-–—|]|[-–—|]\s/;                          // a dash with a space on at least one side is a real separator
  let parts = rawTitle.split(/\s*[-–—|]\s+|\s+[-–—|]\s*/);
  let tight = false;                                              // "tems-the key": hyphen without any space (could also be a real word like "Spider-Man")
  if (parts.length < 2 && (rawTitle.match(/[-–—]/g) || []).length === 1) {
    const p2 = rawTitle.split(/\s*[-–—]\s*/).filter(Boolean);
    if (p2.length === 2) { parts = p2; tight = true; }
  }
  const structured = parts.length >= 2 && !tight && spacedDash.test(rawTitle);
  if (opts.joinedFirst && (t.artist || t.title)) {                 // tags look like one phrase cut in two: try the joined text first
    const joined = `${isUnknown(t.artist) ? "" : t.artist} ${rawTitle}`.trim();
    add("", joined, null);
  }
  if (!art && structured) {                                        // "Artist - Title" or "Title - Artist": try both before the whole text
    const a = parts[0], b = parts.slice(1).join(" - ");
    add(a, b); add(b, a);
  }
  add(art, rawTitle);
  if (!art && tight) { add(parts[0], parts[1]); add(parts[1], parts[0]); }
  if (art && parts.length >= 2) {
    const a = parts[0];
    if (similarity(a, art) >= 0.7) add(art, parts.slice(1).join(" - "));                       // title field repeats the artist
    else if (similarity(parts[parts.length - 1], art) >= 0.7) add(art, parts.slice(0, -1).join(" - "));
  }
  if (art && primaryArtist(art) && norm(primaryArtist(art)) !== norm(art)) add(primaryArtist(art), rawTitle);
  if (art) add("", rawTitle);                                   // last resort: trust the title alone
  const base = out.slice(0, 5);
  out.length = 0; base.forEach(v => out.push(v));
  const nBase = out.length;

  /* ---- extra readings, appended after the original ones ---- */
  const keyOf = (v) => norm(v.artist) + "|" + norm(v.title);
  const seen2 = new Set(out.map(keyOf));
  const addX = (artist, title, extra) => {
    title = cleanTitleForSearch(title); artist = isUnknown(artist) ? "" : String(artist).replace(/_/g, " ").trim();
    if (!title) return;
    const k = norm(artist) + "|" + norm(title);
    if (!k.replace("|", "") || seen2.has(k)) return; seen2.add(k);
    out.push({ artist, title, extra: true, ...extra });
  };
  if (ser && ser.series) {                                         // anime / game label: search the title with the series name as a hint (suggestion only)
    const plain = parts.length >= 2 ? rawTitle : rawTitle;
    addX("", plain, { hint: ser.series, series: true });
  }
  // 1) shorter titles: the same artist with the title minus its last word (down to one word, at most 3)
  const core = art && parts.length >= 2 ? (similarity(parts[0], art) >= 0.7 ? parts.slice(1).join(" - ") : rawTitle) : rawTitle;
  const cw = cleanTitleForSearch(core).split(" ").filter(Boolean);
  const shortArtist = art || (structured ? parts[0] : "");
  const shortBase = art ? cw : (structured ? cleanTitleForSearch(parts.slice(1).join(" - ")).split(" ").filter(Boolean) : []);
  if (shortArtist && shortBase.length >= 2) {
    for (let n = shortBase.length - 1, k = 0; n >= 1 && k < 3; n--, k++) addX(shortArtist, shortBase.slice(0, n).join(" "), { shortened: true });
  }
  // 2) the file name (as "Artist - Title" and as plain joined text)
  const fb = opts.noFileName ? "" : fileBaseName(t);
  if (fb) {
    const fbt = stripTrailing(fb.replace(/^\s*\d{1,3}\s*[-._)\]]\s+/, "").replace(/^\s*\d{1,3}\s+(?=[A-Za-z])/, "")).text;
    const fp = fbt.split(/\s*[-–—|]\s+|\s+[-–—|]\s*/);
    if (fp.length >= 2) { addX(fp[0], fp.slice(1).join(" - "), { fromFile: true }); addX(fp.slice(1).join(" - "), fp[0], { fromFile: true }); }
    addX("", fbt, { fromFile: true });
  }
  // 3) no dash at all: the first one or two words may be the artist ("MONTAGEM funk super slowed")
  if (!art && !structured && !tight) {
    const w = cleanTitleForSearch(rawTitle).split(" ").filter(Boolean);
    if (w.length >= 3) { addX(w[0], w.slice(1).join(" "), { guess: true }); if (w.length >= 4) addX(w.slice(0, 2).join(" "), w.slice(2).join(" "), { guess: true }); }
  }
  return out.slice(0, nBase + 10);
}

/* ---------------- providers → common candidate shape ---------------- */
const stripSingle = (s) => String(s || "").replace(/\s+-\s+(single|ep)$/i, "").trim() || null;
const bigItunes = (u) => (u ? u.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/i, "/600x600bb.jpg") : null);

async function deezerSongs(artist, title, strict, hint = "") {
  const clean = (x) => x.replace(/"/g, " ");
  const q = strict ? (artist ? `artist:"${clean(artist)}" track:"${clean(title)}"` : `track:"${clean(title)}"`) : `${artist} ${title} ${hint}`.trim();
  const d = await getJSON(`https://api.deezer.com/search?q=${enc(q)}&limit=${artist ? 10 : 25}`, { ttlMs: 30 * 864e5, mem: true });
  return (d?.data || []).filter(r => r && r.title && r.artist?.name).map((r, rank) => ({
    rank, src: "Deezer", title: r.title_short || r.title, fullTitle: r.title, artist: r.artist.name, album: stripSingle(r.album?.title), year: null,
    duration: r.duration || 0, covers: [r.album?.cover_xl, r.album?.cover_big, r.album?.cover_medium].filter(Boolean),
    deezerAlbumId: r.album?.id || null, artistPicture: r.artist?.picture_xl || null,
  }));
}
async function itunesSongs(artist, title) {
  const term = `${artist} ${title}`.trim();
  const d = await getJSON(`https://itunes.apple.com/search?term=${enc(term)}&media=music&entity=song&limit=${artist ? 10 : 25}`, { ttlMs: 30 * 864e5, mem: true });
  return (d?.results || []).filter(r => r && r.trackName && r.artistName).map((r, rank) => ({
    rank, src: "iTunes", title: r.trackName, artist: r.artistName, album: stripSingle(r.collectionName), year: (r.releaseDate || "").slice(0, 4) || null,
    duration: r.trackTimeMillis ? r.trackTimeMillis / 1000 : 0, covers: [bigItunes(r.artworkUrl100)].filter(Boolean),
  }));
}
async function deezerYear(albumId) {
  try { const d = await getJSON(`https://api.deezer.com/album/${albumId}`, { ttlMs: 90 * 864e5, mem: true }); return (d?.release_date || "").slice(0, 4) || null; } catch { return null; }
}

/* ---------------- scoring ---------------- */
/** Strict comparison, used only to DOWNGRADE (never to throw away what the old rules accept).
 *  A tag that lists several artists contains the candidate ("Tems & Wizkid" ⊃ "Tems"); a longer candidate name that merely
 *  contains the tag ("Systems Of Tems" vs "Tems") is a different artist. */
function artistStrict(cArtist, qArtist) {
  const ta = tokens(cArtist), tq = tokens(qArtist);
  if (!ta.length || !tq.length) return 0;
  if (ta.join(" ") === tq.join(" ")) return 1;
  const sa = new Set(ta), sq = new Set(tq);
  if (ta.every(w => sq.has(w))) return 0.9;                                   // tag lists more artists: fine
  let inter = 0; sa.forEach(w => { if (sq.has(w)) inter++; });
  const jacc = inter / (sa.size + sq.size - inter);
  if (tq.every(w => sa.has(w)) && ta.length <= tq.length + 1) return Math.max(jacc, 0.9);   // candidate adds at most one word
  return jacc;
}
// exactly the formula of v12.8
function scoreCandidate(c, q, duration) {
  const ts = Math.max(similarity(c.title, q.title), c.fullTitle ? similarity(c.fullTitle, q.title) : 0);
  const unknown = !q.artist;
  let as = unknown ? 0.5 : similarity(c.artist, q.artist);
  if (!unknown) { const na = norm(c.artist), nq = norm(q.artist); if (na && nq && (na.includes(nq) || nq.includes(na))) as = Math.max(as, 0.9); }
  let s = ts * 0.62 + as * 0.3;
  let durOk = false, dur3 = false;
  if (duration && c.duration) {
    const d = Math.abs(c.duration - duration);
    if (d <= 4) { s += 0.1; durOk = true; } else if (d <= 8) s += 0.04; else if (d > 25) s -= 0.1;
    dur3 = d <= 3;
  }
  return { s, ts, as, durOk, dur3, unknown };
}
function accept(sc) {
  if (sc.ts < 0.6) return false;
  if (sc.unknown) return sc.ts >= 0.85 && sc.durOk;           // without an artist, only a title + length match is safe
  return sc.s >= 0.64 && sc.as >= 0.5;
}
function editOne(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
  let i = 0; while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}
const countIn = (words, set) => words.length ? words.filter(w => set.has(w)).length / words.length : 0;

/* ---------------- main entry ---------------- */
/**
 * track → null | { title, artist, album, year, confidence, covers[], coverIds{}, artistPicture, sources[],
 *                  swapped, version, reasons[], alternatives[] }
 */
export async function lookupSong(track) {
  // --- what the tags + file name tell us (offline) ---
  const flagged = suspectTags(track);
  const artistUnreliable = false;                                   // the artist tag is never thrown away: suspicious tags only get extra readings (joined text first)
  const ser = isUnknown(track.artist) ? null : seriesOf(track.artist);
  const variants = queryVariants(track, { joinedFirst: flagged, artistUnreliable });
  if (!variants.length) return null;
  const version = detectVersion(track.title) || null;
  const duration = track.duration || 0;
  const knownArtist = !isUnknown(track.artist) && !artistUnreliable && !ser;
  const wholeText = stripTrailing(prepText(track.title)).text;
  const whole = cleanTitleForSearch(wholeText);
  const fileText = fileBaseName(track);
  // every word that appears in the tags or the file name (any order): the proof a candidate has to match
  const origSet = new Set([...tokens(wholeText), ...tokens(fileText), ...(isUnknown(track.artist) ? [] : tokens(String(track.artist).replace(/_/g, " ")))]);
  const wholeTokens = tokens(whole);

  let pool = [];                                                // [{c, sc, q, swapped, reviewOnly?, unproven?}]
  const near = (w, set) => { if (set.has(w)) return true; if (w.length < 4) return false; for (const o of set) if (Math.abs(o.length - w.length) <= 1 && o.length >= 4 && editOne(o, w)) return true; return false; };
  const cover = (words) => words.length ? words.filter(w => near(w, origSet)).length / words.length : 0;
  // Is the candidate backed by the text we started from? (a missing proof never removes a candidate — it only stops it being pre-ticked)
  const proven = (c, sc) => {
    if (sc.ts >= 0.95 && (sc.unknown || sc.as >= 0.95)) return true;       // the reading itself came from the text
    const tc = cover(tokens(c.title)), ac = cover(tokens(c.artist));
    if (tc >= 0.8 && ac >= 0.8) return true;
    if (!knownArtist && tc >= 0.8 && (ac === 0 || ac >= 0.8)) return true;  // no artist in the tags: title proven; an artist name only half in the text is suspicious
    return false;
  };
  const push = (c, sc, q, swapped, flag = {}) => {
    const e = { c, sc, q, swapped, ...flag };
    if (!proven(c, sc)) e.unproven = true;
    // multi-artist tags are fine; a candidate name that merely contains the tag is not
    if (q.artist && sc.as >= 0.5 && artistStrict(c.artist, q.artist) < 0.5 && !(swapped)) e.unproven = true;
    pool.push(e);
  };

  const consider = (list, q) => {
    for (const c of list) {
      // ---- the original rules, exactly as in v12.8 ----
      let legacy = false;
      if (whole && norm(whole).split(" ").length >= 2) {
        const cs = Math.max(similarity(`${c.artist} ${c.title}`, whole), similarity(`${c.title} ${c.artist}`, whole));
        if (cs >= 0.92) {
          let durOk = false, s2 = 0.88;
          if (duration && c.duration) { const d = Math.abs(c.duration - duration); if (d <= 5) { durOk = true; s2 += 0.1; } else if (d > 25) s2 -= 0.12; }
          if (s2 >= 0.8) { push(c, { s: s2, ts: 1, as: 1, durOk, unknown: false }, { artist: c.artist, title: c.title }, false); legacy = true; }
        }
      }
      const sc = scoreCandidate(c, q, duration);
      if (accept(sc)) {
        // a very short title found inside a longer text ("Bird" in "Bird extra words"): pre-ticked only when the artist matches and the length is within 3 s
        const ctt = tokens(c.title), cutOff = sc.ts < 1 && ctt.length < tokens(q.title).length;
        const shortCut = cutOff && ctt.length <= 2 && ctt.join("").length <= 10 && !(sc.dur3 && sc.as >= 0.9);
        const flag = q.shortened || q.guess || q.series ? { reviewOnly: !sc.durOk || !!q.series, how: q.shortened ? "shorter title" : q.series ? "series hint" : "word guess" }
          : shortCut ? { reviewOnly: true, how: "short title, extra words ignored" } : {};
        push(c, sc, q, false, flag); continue;
      }
      // swapped fields: the "artist" is really the title and the "title" is really the artist
      if (q.artist && q.title) {
        const sw = { artist: q.title, title: cleanTitleForSearch(q.artist) };
        if (sw.title) {
          const s2 = scoreCandidate(c, sw, duration);
          if (accept(s2) && s2.ts >= 0.8 && s2.as >= 0.7 && s2.s >= 0.72) { push(c, s2, sw, true); continue; }
        }
      }
      if (legacy) continue;
      // ---- new, additive rules: only for candidates the original rules did not take ----
      if (wholeTokens.length >= 2) {      // free text: words of the title explained by "<artist> <title>" and the other way round
        const ct = [...tokens(c.artist), ...tokens(c.title)];
        const cset = new Set(ct), wset = new Set(wholeTokens);
        const textCov = wholeTokens.filter(w => cset.has(w)).length / wholeTokens.length;
        const candCov = ct.filter(w => wset.has(w)).length / ct.length;
        if (textCov >= 0.85 && candCov >= 0.85) {
          let durOk = false, s2 = 0.88;
          if (duration && c.duration) { const d = Math.abs(c.duration - duration); if (d <= 5) { durOk = true; s2 += 0.1; } else if (d > 25) s2 -= 0.12; }
          if (s2 >= 0.8) { push(c, { s: s2, ts: 1, as: 1, durOk, unknown: false }, { artist: c.artist, title: c.title }, false, { how: "free text" }); continue; }
        }
      }
      if (wholeTokens.length >= 3) {      // prefix: the candidate's title starts what follows the artist; extra words after it are ignored
        const at = tokens(c.artist), tt = tokens(c.title);
        if (tt.length >= 1 && at.length >= 1) {
          const rest = [...wholeTokens]; let ok = true;
          for (const w of at) { const i = rest.indexOf(w); if (i < 0) { ok = false; break; } rest.splice(i, 1); }
          if (ok && rest.length > tt.length && tt.every((w, i) => rest[i] === w)) {
            let durOk = false, d3 = false, s2 = 0.8 + 0.02 * Math.min(tt.length, 5);   // the longest exact beginning wins
            if (duration && c.duration) { const d = Math.abs(c.duration - duration); if (d <= 4) { durOk = true; s2 += 0.1; } if (d <= 3) d3 = true; if (d > 25) s2 -= 0.12; }
            const short = tt.length <= 2 && tt.join("").length <= 10;
            if (s2 >= 0.78) push(c, { s: s2, ts: 1, as: 1, durOk, unknown: false }, { artist: c.artist, title: c.title }, false, { reviewOnly: short ? !d3 : !durOk, how: "start of title" });
          }
        }
      }
    }
  };
  const keyOfC = (c) => norm(c.artist) + "|" + norm(c.title);
  const ranked = () => {
    if (!pool.length) return [];
    // two different sources agreeing on the same song is a strong signal
    const votes = new Map();
    for (const p of pool) { const k = keyOfC(p.c); votes.set(k, (votes.get(k) || new Set()).add(p.c.src)); }
    const scored = pool.map(p => ({ ...p, total: p.sc.s + (votes.get(keyOfC(p.c)).size > 1 ? 0.06 : 0) - (p.unproven ? 0.2 : 0) })).sort((a, b) => b.total - a.total);
    const seenK = new Set(), uniq = [];
    for (const p of scored) { const k = keyOfC(p.c); if (seenK.has(k)) continue; seenK.add(k); uniq.push(p); }
    return uniq;
  };
  const bestOf = () => ranked()[0] || null;
  const confident = () => { const b = bestOf(); return b && b.total >= 0.9 && b.sc.ts >= 0.9 && !b.reviewOnly && !b.unproven; };
  const tryProvider = async (fn, q) => { try { consider(await fn(), q); } catch { /* source unreachable → skip */ } };

  // 1) Deezer: the original readings (strict, then loose) exactly as before; the extra readings use one loose search each
  const baseV = variants.filter(v => !v.extra), extraV = variants.filter(v => v.extra);
  let calls = 0;
  for (const q of baseV) {
    if (calls >= 6 || confident()) break;
    calls++; await tryProvider(() => deezerSongs(q.artist, q.title, true), q); if (confident()) break;
    calls++; await tryProvider(() => deezerSongs(q.artist, q.title, false), q);
  }
  for (const q of extraV) {
    if (calls >= 8 || confident()) break;
    calls++; await tryProvider(() => deezerSongs(q.artist, q.title, false, q.hint || ""), q);
  }
  // 2) iTunes, only when Deezer was not sure
  let b = bestOf();
  if (!b || b.total < 0.82) {
    for (const q of [...baseV.slice(0, 3), ...extraV.slice(0, 2)]) { if (confident()) break; await tryProvider(() => itunesSongs(q.artist, q.title), q); }
  }
  // 3) MusicBrainz as the last resort (slow: one request per 1.1 s)
  b = bestOf();
  if (!b || b.total < 0.75) {
    for (const q of baseV.slice(0, 2)) {
      try {
        const m = await mbLookupRecording({ artist: q.artist, title: q.title, duration });
        if (m) {
          const c = { src: "MusicBrainz", title: m.title, artist: m.artist, album: m.album, year: m.year, duration: 0, covers: [], mb: { releaseId: m.releaseId, releaseGroupId: m.releaseGroupId } };
          const sc = scoreCandidate(c, q, 0); sc.s = Math.max(sc.s, m.confidence / 100);
          if (sc.ts >= 0.6) { const n0 = pool.length; push(c, sc, q, false); if (pool.length > n0) break; }
        }
      } catch { /* skip */ }
    }
  }
  const rk = ranked();
  b = rk[0] || null;
  if (!b) return null;

  const win = b.c;
  const swappedReal = !!b.swapped && !isUnknown(track.artist);   // with no artist in the tags, "Title - Artist" is just the other reading, not a swap
  // merge extra facts (year / covers / album) from other candidates that are clearly the same song
  const same = pool.filter(p => norm(p.c.artist) === norm(win.artist) && similarity(p.c.title, win.title) >= 0.9);
  const covers = []; const addCover = (u) => { if (u && !covers.includes(u)) covers.push(u); };
  [win, ...same.map(p => p.c)].forEach(c => (c.covers || []).forEach(addCover));
  let album = win.album || same.map(p => p.c.album).find(Boolean) || null;
  let year = win.year || same.map(p => p.c.year).find(Boolean) || null;
  if (!year) { const id = [win, ...same.map(p => p.c)].map(c => c.deezerAlbumId).find(Boolean); if (id) year = await deezerYear(id); }
  const mb = [win, ...same.map(p => p.c)].map(c => c.mb).find(Boolean) || null;
  // one cheap extra pass: MusicBrainz ids for the Cover Art Archive when no source gave a cover
  let coverIds = mb || {};
  if (!covers.length && !mb) {
    try {
      const m = await mbLookupRecording({ artist: win.artist, title: win.title, duration });
      if (m) { coverIds = { releaseId: m.releaseId, releaseGroupId: m.releaseGroupId }; album = album || m.album; year = year || m.year; }
    } catch { /* skip */ }
  }
  let confidence = Math.round(Math.min(1, b.total) * 100);
  const reasons = [];
  if (duration && win.duration && Math.abs(win.duration - duration) > 25) confidence = Math.min(confidence, 74);   // wrong length → review only
  if (!b.q.artist) {
    // found from the title alone: pre-ticked only when title is (almost) identical AND the length matches within 4 s
    const solid = b.sc.durOk && b.sc.ts >= 0.95 && norm(win.title).length >= 6;
    if (!solid) confidence = Math.min(confidence, 74);
    reasons.push("found from the title only");
  }
  if (b.reviewOnly) { confidence = Math.min(confidence, 74); }
  if (b.unproven) { confidence = Math.min(confidence, 74); reasons.push("not all words of the name were found in the file — check it"); }
  if (ser) { confidence = Math.min(confidence, 74); reasons.push(`"${ser.label}" is a series label, not an artist`); }
  // margin rule: a different song scoring almost the same → do not pre-tick, show both
  const second = rk.slice(1).find(p => !p.unproven && (similarity(p.c.artist, win.artist) < 0.8 || similarity(p.c.title, win.title) < 0.8));   // a really different song, not another edition of the same one
  // when the winner is also the provider's own top hit, a near tie is not a reason to doubt it
  const winnerIsTopHit = (win.rank ?? 99) <= (second?.c.rank ?? 99);
  if (second && b.total - second.total < 0.05 && !winnerIsTopHit) { confidence = Math.min(confidence, 74); reasons.push("another song fits almost as well"); }
  if (b.how) reasons.push(b.how === "free text" ? "matched on the words of the title" : b.how === "start of title" ? "matched the start of the title, extra words ignored" : b.how);
  if (swappedReal) reasons.push("title and artist were swapped");
  if (artistUnreliable) reasons.push(fileText ? "artist tag looked wrong, file name used too" : "artist tag looked wrong, ignored");
  if (version) reasons.push(`original found, version: ${version.toLowerCase()}`);
  const alternatives = rk.slice(0, 3).map(p => ({
    title: p.c.title, artist: p.c.artist, album: p.c.album || null, year: p.c.year || null, src: p.c.src,
    confidence: Math.round(Math.min(1, p.total) * 100), covers: p.c.covers || [], coverIds: p.c.mb || {},
  }));
  return {
    title: win.title, artist: win.artist, album, year, swapped: swappedReal, version,
    confidence, reasons, alternatives,
    covers, coverIds, artistPicture: win.artistPicture || same.map(p => p.c.artistPicture).find(Boolean) || null,
    sources: [...new Set([win, ...same.map(p => p.c)].map(c => c.src))],
  };
}

const searchArtistName = (a) => primaryArtist(String(a || "").replace(/_/g, " ")) || String(a || "");

/** Downloads the best available cover (provider art first, Cover Art Archive last). Returns a small data URL or null. */
export async function fetchCover(m, maxSide = 256) {
  for (const u of (m.covers || []).slice(0, 3)) { try { return await getImageDataUrl(u, maxSide); } catch { /* next */ } }
  if (m.coverIds && (m.coverIds.releaseId || m.coverIds.releaseGroupId)) { try { return await caaCover(m.coverIds); } catch { /* none */ } }
  return null;
}

/* ---------------- artist photos (Deezer, TheAudioDB) ---------------- */
async function deezerArtists(name) {
  const d = await getJSON(`https://api.deezer.com/search/artist?q=${enc(name)}&limit=6`, { ttlMs: 30 * 864e5 });
  const list = (d?.data || []).filter(a => a && a.name && similarity(a.name, name) >= 0.85 && a.picture_xl && !/\/artist\/\//.test(a.picture_xl));
  list.sort((x, y) => (norm(y.name) === norm(name) ? 1 : 0) - (norm(x.name) === norm(name) ? 1 : 0) || (y.nb_fan || 0) - (x.nb_fan || 0));
  return list;
}
const deezerArtist = async (name) => (await deezerArtists(name))[0] || null;
async function audioDbArtist(name) {
  const d = await getJSON(`https://www.theaudiodb.com/api/v1/json/2/search.php?s=${enc(name)}`, { ttlMs: 30 * 864e5 });
  const a = (d?.artists || []).find(x => x && similarity(x.strArtist, name) >= 0.85);
  return a ? { thumb: a.strArtistThumb || null, fanart: a.strArtistFanart || null } : null;
}

/** → [{ source, url }] photo choices (best first). Nothing from Wikipedia. */
export async function artistPhotoOptions(name) {
  const opts = [];
  await Promise.allSettled([
    (async () => { (await deezerArtists(name)).slice(0, 3).forEach((a, i) => opts.push({ source: i === 0 ? "Deezer" : "Deezer · other match", url: a.picture_xl, rank: i })); })(),
    (async () => { const a = await audioDbArtist(name); if (a?.thumb) opts.push({ source: "TheAudioDB", url: a.thumb, rank: 10 }); if (a?.fanart) opts.push({ source: "TheAudioDB · wide", url: a.fanart, rank: 11 }); })(),
  ]);
  return opts.sort((a, b) => a.rank - b.rank);
}
export async function fetchArtistPhoto(url, maxSide = 320) { return getImageDataUrl(url, maxSide); }

/* ---------------- discography (MusicBrainz first, Deezer as the fallback) ---------------- */
export async function deezerDiscography(name) {
  const a = await deezerArtist(name).catch(() => null) || null;
  let id = a?.id;
  if (!id) {
    const d = await getJSON(`https://api.deezer.com/search/artist?q=${enc(name)}&limit=3`, { ttlMs: 30 * 864e5 });
    id = (d?.data || []).find(x => x && similarity(x.name, name) >= 0.85)?.id;
  }
  if (!id) return null;
  const d = await getJSON(`https://api.deezer.com/artist/${id}/albums?limit=100`, { ttlMs: 30 * 864e5 });
  const seen = new Set();
  const albums = (d?.data || []).filter(x => x && x.title && (x.record_type === "album" || x.record_type === "ep"))
    .map(x => ({ id: "dz" + x.id, title: x.title, year: (x.release_date || "").slice(0, 4) }))
    .filter(x => { const k = norm(x.title.replace(/[([][^)\]]*[)\]]/g, " ")); if (!k || seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => (x.year || "9999").localeCompare(y.year || "9999"));
  return albums.length ? { artistId: String(id), albums, source: "Deezer" } : null;
}

/** Quick reachability check (true when at least one of the sources answers). */
export async function probeOnline() {
  const r = await Promise.allSettled([
    getJSON("https://api.deezer.com/search?q=daft%20punk&limit=1", { ttlMs: 864e5 }),
    getJSON("https://itunes.apple.com/search?term=daft%20punk&media=music&entity=song&limit=1", { ttlMs: 864e5 }),
  ]);
  return r.some(x => x.status === "fulfilled");
}

/** Artists (by full name) that have no photo yet, most songs first. */
export function artistsMissingPhotos(library, artistPhotos) {
  const m = new Map();
  for (const t of library) {
    if (t.remote || isUnknown(t.artist)) continue;
    m.set(t.artist, (m.get(t.artist) || 0) + 1);
  }
  return [...m.entries()].filter(([n]) => !artistPhotos?.[n]).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}
export const searchNameFor = (artistName) => primaryArtist(artistName) || artistName;
