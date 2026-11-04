/* One shared cleaner for song titles, credits and search keys.

   Used by: the import scan, "Clean up titles", Library health (what counts as a messy title), Fix tags (what
   "Apply" writes) and the library search. Keeping it in one place means all of them agree.            */
import { JUNK_PHRASES } from "./online/lookup.js";

// ---- junk ("Official Video", "Clip officiel", "(256k)" …) -------------------------------------------------------
// Strong phrases are removed wherever they sit; the weak single words (video, audio, hd, topic …) only at the end of
// the title or right before a credit / separator, so a real title like "Video Games" keeps its word.
const STRONG = JUNK_PHRASES.slice(0, 10).concat(["visuali[sz]er", "animated\\s+(?:video|clip)", "official\\s+(?:music\\s+)?(?:video|audio)\\s+(?:hd|4k)"]);
const WEAK = JUNK_PHRASES.slice(10).filter((p) => !STRONG.includes(p));
const B = "(?<![\\p{L}\\p{N}])", E = "(?![\\p{L}\\p{N}])";
const STRONG_RE = new RegExp(`${B}(?:${STRONG.join("|")})${E}`, "giu");
const WEAK_TAIL_RE = new RegExp(`(?:^|[\\s(\\[{|–—-])(?:${WEAK.join("|")})(?:\\s+(?:${WEAK.join("|")}))*\\s*[)\\]}]?\\s*$`, "iu");
const WEAK_BEFORE_CREDIT_RE = new RegExp(`${B}(?:official|officiel|oficial|video|audio|lyrics?|hd|hq)${E}(?=\\s*[(\\[]?\\s*(?:feat\\.?|featuring|ft\\.?)(?:[\\s.:]|$))`, "giu");
const BRACKET_JUNK_RE = new RegExp(`\\s*[(\\[{][^)\\]}]*${B}(?:${JUNK_PHRASES.join("|")})${E}[^)\\]}]*[)\\]}]`, "giu");
const BITRATE_RE = /\s*[(\[]\s*\d{2,3}\s*k(?:bps)?\s*[)\]]/gi;

export function stripJunk(input) {
  let s = String(input || "").replace(/_/g, " ");
  s = s.replace(BITRATE_RE, "");
  // a bracket that carries junk is dropped, unless it is a credit bracket "(feat. X)"
  s = s.replace(BRACKET_JUNK_RE, (m) => (/[(\[{]\s*(?:feat\.?|featuring|ft\.?)\b/i.test(m) ? m : ""));
  s = s.replace(STRONG_RE, " ");
  s = s.replace(WEAK_BEFORE_CREDIT_RE, " ");
  let prev;
  do { prev = s; s = s.replace(WEAK_TAIL_RE, ""); } while (s !== prev);
  s = s.replace(/\s*[(\[][^)\]]*$/, "");               // dangling "(" from truncated names
  return s.replace(/\s+/g, " ").replace(/\s+([)\]])/g, "$1").trim();
}

// ---- credits ------------------------------------------------------------------------------------------------
const CREDIT_START = /(?:^|[\s(\[])(?:feat\.?|featuring|ft\.?|f\/|w\/|prod\.?\s*by|prod\.)(?=[\s.:A-Za-z\u00C0-\u024F]|$)\s*[.:]?\s*/i;

/** "Feels ft. Pharrell Williams (Remix)" -> { core: "Feels (Remix)", credits: ["Pharrell Williams"] } */
export function splitCredits(title) {
  const t = String(title || "");
  const m = CREDIT_START.exec(t);
  if (!m) return { core: t.trim(), credits: [] };
  const opened = /[(\[]/.test(m[0]);
  const before = t.slice(0, m.index).replace(/[\s\-–—,(\[]+$/, "");
  let rest = t.slice(m.index + m[0].length);
  let tail = "";
  if (opened) {
    const close = rest.search(/[)\]]/);
    if (close >= 0) { tail = rest.slice(close + 1); rest = rest.slice(0, close); }
  } else {
    const cut = rest.search(/\s[-–—]\s|\s*[(\[]/);
    if (cut >= 0) { tail = rest.slice(cut); rest = rest.slice(0, cut); }
  }
  const credits = rest.split(/\s*(?:,|&|\+|\band\b|\s+x\s+|\bwith\b)\s*/i).map((c) => c.replace(/^[\s.:]+|[\s.:]+$/g, "")).filter(Boolean);
  const core = `${before} ${tail.trim()}`.replace(/\s+/g, " ").replace(/^[-–\s]+|[-–\s]+$/g, "").trim();
  return { core: core || before || t.trim(), credits };
}

export const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
const UNKNOWN = "Unknown Artist";

// One setting decides where featured artists go: "title" -> "Song (feat. X)" (default) or "artist" -> "Main, X".
let FEAT_IN = "title";
export function setFeatIn(v) { FEAT_IN = v === "artist" ? "artist" : "title"; }

/** The cleaned { title, artist } for a track. */
export function cleanTrack(t, opts = {}) {
  const featIn = (opts.featIn || FEAT_IN) === "artist" ? "artist" : "title";
  let artist = String(t.artist || "").trim() || UNKNOWN;
  let title = stripJunk(t.title);
  title = title.replace(/^\d{1,3}\s*[._)-]\s*(?=\S)/, "");                  // leading track number
  // "Artist- Song" / "Artist – Song": the left part becomes the artist when the tag is empty or the same name
  const sp = /^(\S.*?)\s*[-–—]\s+(\S.*)$/.exec(title);
  if (sp) {
    const left = sp[1].trim(), right = sp[2].trim();
    if (artist === UNKNOWN) { artist = left; title = right; }
    else if (fold(left) === fold(artist) || fold(artist).startsWith(fold(left) + " ") || fold(left).startsWith(fold(artist) + " ")) title = right;
  }
  // a credit that ended up in the artist field ("Kato feat. Jon" + title "Turn Lights Off Jon Hamm")
  if (/\bfeat\.?\b/i.test(artist)) {
    const last = artist.trim().split(/\s+/).pop();
    const m = title.match(new RegExp("^(.*\\S)\\s+" + last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+(\\w+)$"));
    if (m) { artist = artist + " " + m[2]; title = m[1]; }
  }
  const { core, credits } = splitCredits(title);
  title = core;
  if (credits.length) {
    const fresh = credits.filter((c) => !fold(artist).includes(fold(c)));
    if (featIn === "artist") { if (fresh.length) artist = `${artist}, ${fresh.join(", ")}`; }
    else title = `${title} (feat. ${credits.join(", ")})`;
  }
  title = title.replace(/^[-–\s]+|[-–\s]+$/g, "").replace(/\s+/g, " ").trim();
  return { title: title || String(t.title || "").trim(), artist };
}

/** A title/artist that still carries junk, a glued artist, a track number or a loose credit. */
export function needsCleaning(t) {
  const c = cleanTrack(t);
  return fold(c.title) !== fold(String(t.title || "").trim()) || (c.artist !== (t.artist || UNKNOWN) && fold(c.artist) !== fold(t.artist || UNKNOWN));
}

// ---- search ------------------------------------------------------------------------------------------------
const CONNECTORS = /(?<![\p{L}\p{N}])(?:feat|featuring|ft|f|w|with|prod|by|vs|x|and)(?![\p{L}\p{N}])/giu;
const normaliseWords = (s) => fold(stripJunk(s)).replace(/[&+/\\|(){}\[\],.:;!?"'’_-]+/g, " ").replace(CONNECTORS, " ").replace(/\s+/g, " ").trim();

const keyCache = new WeakMap();
/** What a song is searched by: title (junk and connectors out), credited artists, album and file name. */
export function searchKey(t) {
  let k = keyCache.get(t);
  if (k && k.sig === `${t.title}|${t.artist}|${t.album}`) return k;
  const file = String(t.filePath || "").split("/").pop().replace(/\.[a-z0-9]{2,4}$/i, "");
  k = {
    sig: `${t.title}|${t.artist}|${t.album}`,
    title: normaliseWords(t.title),
    artist: normaliseWords(t.artist),
    album: normaliseWords(t.album),
    file: normaliseWords(file),
    raw: fold(`${t.title} ${t.artist} ${t.album || ""}`),
  };
  keyCache.set(t, k);
  return k;
}
/** The query with the same clean-up. The junk word typed on its own ("official") stays literal. */
export function queryKey(q) {
  const lit = fold(q);
  const norm = normaliseWords(q);
  return { lit, norm: norm || "", literal: !norm && !!lit };
}

function oneEdit(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0; while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

/** 0 = no match. Higher = better: exact title > title prefix > title words > artist > album > file name > typo. */
export function matchScore(t, query) {
  const q = queryKey(query);
  if (!q.lit) return 1;
  const k = searchKey(t);
  if (q.literal) return k.raw.includes(q.lit) ? 50 : 0;
  const words = q.norm.split(" ").filter(Boolean);
  if (k.title === q.norm) return 100;
  if (k.title.startsWith(q.norm)) return 90;
  if (words.every((w) => k.title.includes(w))) return 75;
  const all = `${k.title} ${k.artist} ${k.album}`;
  if (words.every((w) => k.artist.includes(w))) return 60;
  if (words.every((w) => all.includes(w))) return 50;
  if (words.every((w) => k.album.includes(w))) return 40;
  if (words.every((w) => `${all} ${k.file}`.includes(w))) return 30;
  const toks = `${all} ${k.file}`.split(" ");
  if (words.every((w) => all.includes(w) || (w.length >= 5 && toks.some((x) => x.length >= 4 && oneEdit(x, w))))) return 10;
  return 0;
}
export const matchesTrack = (t, query) => matchScore(t, query) > 0;
export const matchesText = (text, query) => {
  const hay = normaliseWords(text), q = queryKey(query);
  if (!q.lit) return true;
  const words = (q.norm || q.lit).split(" ").filter(Boolean);
  const toks = hay.split(" ");
  return words.every((w) => hay.includes(w) || (w.length >= 5 && toks.some((x) => x.length >= 4 && oneEdit(x, w))));
};

/** Highlight pieces for a title: [{ text, hit }]. Matches the typed words, accents ignored. */
export function highlightParts(text, query) {
  const s = String(text || "");
  const q = queryKey(query);
  const words = (q.literal ? q.lit : q.norm).split(" ").filter((w) => w.length > 0);
  if (!words.length) return [{ text: s, hit: false }];
  const f = s.normalize("NFD");
  // map folded indices back to the original string (NFD may add combining marks)
  const map = []; let folded = "";
  for (let i = 0; i < s.length; i++) {
    const piece = s[i].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    for (let j = 0; j < piece.length; j++) { folded += piece[j]; map.push(i); }
  }
  void f;
  const hits = new Array(s.length).fill(false);
  for (const w of words) {
    let from = 0, at;
    while ((at = folded.indexOf(w, from)) >= 0) { for (let j = at; j < at + w.length; j++) hits[map[j]] = true; from = at + w.length; }
  }
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === hits[i]) last.text += s[i]; else out.push({ text: s[i], hit: hits[i] });
  }
  return out;
}
