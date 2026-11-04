/* Long inline images ("data:image/jpeg;base64,…", ~15 KB each) in every list row make scrolling heavy.
   This turns them into short blob: addresses once (cached). If the page can't show blob images,
   it quietly keeps using the original data address. */
let blobOk = null;
const cache = new Map();
(function test() {
  try {
    const bin = atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
    const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const u = URL.createObjectURL(new Blob([arr], { type: "image/gif" }));
    const im = new Image();
    im.onload = () => { blobOk = true; URL.revokeObjectURL(u); };
    im.onerror = () => { blobOk = false; URL.revokeObjectURL(u); };
    im.src = u;
  } catch { blobOk = false; }
})();

export function lightArt(art) {
  if (blobOk !== true || typeof art !== "string" || art.length < 1500 || !art.startsWith("data:") || art.indexOf(";base64,") < 0) return art;
  let u = cache.get(art);
  if (u) return u;
  try {
    const bin = atob(art.slice(art.indexOf(",") + 1));
    const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    u = URL.createObjectURL(new Blob([arr], { type: art.slice(5, art.indexOf(";")) || "image/jpeg" }));
    if (cache.size > 5000) cache.clear();
    cache.set(art, u);
    return u;
  } catch { return art; }
}
