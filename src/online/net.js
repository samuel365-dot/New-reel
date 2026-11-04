/* ============================================================
   Reel — online helper layer
   • HTTPS only (anything else is refused before a request is made)
   • per-host rate limiting (one queue per host, minimum gap between calls)
   • response caching with a time-to-live, so the same question is never asked twice
   • on the phone requests go through the native HTTP client (no CORS problems, proper User-Agent)
   Nothing in here runs unless an online feature has been switched on by the user.
   ============================================================ */
import { Capacitor, CapacitorHttp } from "@capacitor/core";

const UA = "ReelPlayer/1.2 (local music player; https://github.com/reel-player)";
const MIN_GAP_MS = {
  "musicbrainz.org": 1100,        // MusicBrainz asks for at most 1 request per second
  "coverartarchive.org": 350,
  "en.wikipedia.org": 250,
  "lrclib.net": 450,
  "api.listenbrainz.org": 350,
  "ws.audioscrobbler.com": 350,
  "api.deezer.com": 160,
  "archive.org": 500,
  "api.jamendo.com": 400,
  "api.audius.co": 300,
  "itunes.apple.com": 3000,       // Apple allows roughly 20 requests a minute
  "www.theaudiodb.com": 800,
};
const DEFAULT_GAP = 500;
const CACHE_PREFIX = "reel-oc:";
const isNative = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };

export function assertHttps(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error("Invalid address"); }
  if (u.protocol !== "https:") throw new Error("Only secure (https) connections are allowed");
  return u;
}

/* ---------- rate limiting: a promise chain per host ---------- */
const hostChains = new Map();
function gapFor(host) {
  if (MIN_GAP_MS[host]) return MIN_GAP_MS[host];
  for (const k of Object.keys(MIN_GAP_MS)) if (host.endsWith("." + k)) return MIN_GAP_MS[k];
  return DEFAULT_GAP;
}
function schedule(host, task) {
  const prev = hostChains.get(host) || Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    const out = await task();
    await new Promise(r => setTimeout(r, gapFor(host)));
    return out;
  });
  hostChains.set(host, run.catch(() => {}));
  return run;
}

/* ---------- cache ----------
   Stored as  "<savedAt>:<ttl>:<json>"  so it can be checked/trimmed without parsing the JSON.
   • answers that only matter during one run (song searches) go to a small in-memory cache instead
   • the stored cache is capped (~1.2 MB); older entries are dropped in small steps, never in one long freeze */
const memCache = new Map();
const MEM_MAX = 500;
const memGet = (k) => memCache.get(k);
const memSet = (k, v) => { memCache.set(k, v); if (memCache.size > MEM_MAX) memCache.delete(memCache.keys().next().value); };

const CACHE_CAP = 1_200_000, CACHE_TARGET = 800_000, ENTRY_MAX = 60_000;
let cacheBytes = -1, trimQueued = false;
const parseHead = (raw) => {
  const a = raw.indexOf(":"); if (a < 1) return null;
  const b = raw.indexOf(":", a + 1); if (b < 0) return null;
  const t = +raw.slice(0, a), ttl = +raw.slice(a + 1, b);
  return t > 0 && ttl > 0 ? { t, ttl, b } : null;       // old-format entries ({"t":…) fail here and get dropped
};
function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return undefined;
    const h = parseHead(raw);
    if (!h || Date.now() - h.t > h.ttl) { localStorage.removeItem(CACHE_PREFIX + key); return undefined; }
    return JSON.parse(raw.slice(h.b + 1));
  } catch { return undefined; }
}
function cacheSet(key, v, ttl) {
  try {
    const s = `${Date.now()}:${ttl}:${JSON.stringify(v)}`;
    if (s.length > ENTRY_MAX) return;                   // never let one answer eat the storage quota
    localStorage.setItem(CACHE_PREFIX + key, s);
    if (cacheBytes >= 0) cacheBytes += s.length;
    if (cacheBytes > CACHE_CAP) queueTrim();
  } catch { queueTrim(); }
}
function queueTrim() {
  if (trimQueued) return; trimQueued = true;
  setTimeout(() => { trimCache().finally(() => { trimQueued = false; }); }, 1500);
}
/** Removes expired / old-format entries, then the oldest ones until the cache is small again. Works in small slices. */
export async function trimCache(target = CACHE_TARGET) {
  try {
    const rows = []; let total = 0; const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(CACHE_PREFIX)) continue;
      const raw = localStorage.getItem(k) || "", h = parseHead(raw);
      rows.push([k, h && now - h.t <= h.ttl ? h.t : 0, raw.length]);   // t = 0 → remove first
      if (h && now - h.t <= h.ttl) total += raw.length;
    }
    rows.sort((x, y) => x[1] - y[1]);
    const doomed = [];
    for (const r of rows) { if (r[1] === 0) doomed.push(r[0]); else if (total > target) { doomed.push(r[0]); total -= r[2]; } }
    for (let i = 0; i < doomed.length; i += 60) {
      doomed.slice(i, i + 60).forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
      await new Promise(r => setTimeout(r, 30));
    }
    cacheBytes = total;
    return doomed.length;
  } catch { return 0; }
}
export async function pruneCache(fraction = 1) { return fraction >= 1 ? trimCache(0) : trimCache(CACHE_TARGET / 2); }
export function clearOnlineCache() { return trimCache(0); }
// tidy up old / oversized cache a few seconds after start (only touches Reel's own cache keys)
if (typeof window !== "undefined") setTimeout(() => { trimCache(); }, 9000);

/* ---------- low-level request ---------- */
async function rawRequest(method, url, { headers = {}, body, responseType = "json", timeout = 14000 } = {}) {
  const u = assertHttps(url);
  const hdrs = { Accept: responseType === "json" ? "application/json" : "*/*", ...headers };
  if (isNative()) {
    hdrs["User-Agent"] = UA;
    const res = await CapacitorHttp.request({
      url, method, headers: hdrs, data: body, responseType: responseType === "json" ? "json" : "blob",
      connectTimeout: timeout, readTimeout: timeout + 3000,
    });
    return { status: res.status, data: res.data, headers: res.headers || {} };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { method, headers: hdrs, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    let data = null;
    if (responseType === "json") { try { data = await res.json(); } catch { data = null; } }
    else data = await res.blob();
    const h = {}; res.headers.forEach((v, k) => { h[k] = v; });
    return { status: res.status, data, headers: h };
  } finally { clearTimeout(timer); void u; }
}

async function requestWithRetry(method, url, opts) {
  const host = new URL(assertHttps(url)).host;
  return schedule(host, async () => {
    let res = await rawRequest(method, url, opts);
    if (res.status === 429 || res.status === 503) {          // asked to slow down — wait once, then retry
      await new Promise(r => setTimeout(r, 2200));
      res = await rawRequest(method, url, opts);
    }
    return res;
  });
}

/** GET JSON with caching. Returns null for 404. ttlMs defaults to 7 days. */
export async function getJSON(url, { ttlMs = 7 * 864e5, headers, allow404 = true, noCache = false, mem = false } = {}) {
  assertHttps(url);
  const key = "g:" + url;
  const get = () => (mem ? memGet(key) : cacheGet(key));
  const put = (v, ttl) => (mem ? memSet(key, v) : cacheSet(key, v, ttl));
  if (!noCache) { const hit = get(); if (hit !== undefined) return hit; }
  const res = await requestWithRetry("GET", url, { headers });
  if (res.status === 404 && allow404) { if (!noCache) put(null, Math.min(ttlMs, 2 * 864e5)); return null; }
  if (res.status >= 400) throw new Error(`Server answered ${res.status}`);
  // an answer that could not be parsed (null / empty) is never kept for days: that would hide a good answer for a week
  if (!noCache && res.data != null && res.data !== "") put(res.data, ttlMs);
  return res.data;
}

export async function postJSON(url, body, headers = {}) {
  assertHttps(url);
  const res = await requestWithRetry("POST", url, { headers: { "Content-Type": "application/json", ...headers }, body });
  if (res.status >= 400) { const e = new Error(`Server answered ${res.status}`); e.status = res.status; throw e; }
  return res.data;
}

/** Downloads an image and returns a small JPEG data URL (so covers keep working offline). */
export async function getImageDataUrl(url, maxSide = 240, quality = 0.72) {
  assertHttps(url);
  const res = await requestWithRetry("GET", url, { responseType: "blob", timeout: 18000 });
  if (res.status >= 400 || !res.data) throw new Error(`Image answered ${res.status}`);
  let dataUrl;
  if (typeof res.data === "string") {
    const type = (res.headers["Content-Type"] || res.headers["content-type"] || "image/jpeg").split(";")[0];
    dataUrl = `data:${type};base64,${res.data}`;
  } else {
    dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(res.data); });
  }
  return downscale(dataUrl, maxSide, quality);
}

function downscale(dataUrl, maxSide, quality = 0.72) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", quality));
      } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const enc = encodeURIComponent;
