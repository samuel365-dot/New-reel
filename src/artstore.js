/* Cover images and artist photos live here (IndexedDB), NOT inside the main library save.
   Before: every save re-wrote every cover (megabytes) → the app froze for seconds at each save.
   Now:    the main save only carries a small marker; images are written once and read back at start-up.
   If IndexedDB is unavailable nothing changes — the images simply stay in the main save as before. */
const DB_NAME = "reel-art", STORE = "art";
let dbp = null;
const open = () => dbp || (dbp = new Promise((res, rej) => {
  try {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
    r.onblocked = () => { dbp = null; rej(new Error("blocked")); };
  } catch (e) { dbp = null; rej(e); }
}));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** key → image string that is CONFIRMED to be stored in IndexedDB ("t:<trackId>" or "a:<artistName>"). */
export const artSaved = new Map();
export const isHeavy = (a) => typeof a === "string" && a.length > 2000 && a !== "@idb";

export async function artGetAll() {
  const db = await open();
  return new Promise((res, rej) => {
    const out = new Map();
    const tx = db.transaction(STORE, "readonly");
    const cur = tx.objectStore(STORE).openCursor();
    cur.onsuccess = () => { const c = cur.result; if (c) { out.set(c.key, c.value); c.continue(); } else res(out); };
    cur.onerror = () => rej(cur.error);
    tx.onerror = () => rej(tx.error);
  });
}
export async function artPut(entries) {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    const st = tx.objectStore(STORE);
    entries.forEach(([k, v]) => st.put(v, k));
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error("aborted"));
  });
}
let running = false;
/** Writes the images that are not stored yet, in small groups (never one long freeze). */
export async function persistMissing(entries) {
  if (running || !entries.length) return;
  running = true;
  try {
    for (let i = 0; i < entries.length; i += 20) {
      const chunk = entries.slice(i, i + 20);
      await artPut(chunk);
      chunk.forEach(([k, v]) => artSaved.set(k, v));
      await sleep(40);
    }
  } catch { /* IndexedDB not available → images just stay in the main save */ }
  finally { running = false; }
}
