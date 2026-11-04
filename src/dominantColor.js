/* Dominant colours of a cover image — shared by the share cards and the generated playlist covers.
   Draws the image on a 32x32 canvas, ignores near-white / near-black / grey pixels, buckets the rest by hue and
   returns the most populated bucket (primary) and a clearly different second one (secondary). */
const cache = new Map();

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, l];
}

/** img: a loaded <img>/ImageBitmap. Returns { primary, secondary, isLight } (hsl() strings) or null when unreadable. */
export function dominantColors(img) {
  try {
    const c = document.createElement("canvas");
    c.width = 32; c.height = 32;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, 32, 32);
    const px = x.getImageData(0, 0, 32, 32).data;   // throws on a tainted canvas
    const buckets = Array.from({ length: 12 }, () => ({ n: 0, h: 0, s: 0, l: 0 }));
    let lum = 0, count = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 200) continue;
      const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      lum += l; count++;
      if (l > 0.92 || l < 0.08 || s < 0.22) continue;  // near-white, near-black, grey
      const b = buckets[Math.floor(h / 30) % 12];
      b.n += s * (1 - Math.abs(l - 0.5)); b.h += h; b.s += s; b.l += l; b.c = (b.c || 0) + 1;
    }
    const ranked = buckets.map((b, i) => ({ ...b, i })).filter((b) => b.c > 0).sort((a, b) => b.n - a.n);
    if (!ranked.length || !count) return null;
    const mk = (b) => ({ h: Math.round(b.h / b.c), s: Math.min(0.85, Math.max(0.45, b.s / b.c)), l: Math.min(0.6, Math.max(0.32, b.l / b.c)) });
    const p = mk(ranked[0]);
    const second = ranked.find((b) => { const d = Math.abs(b.i - ranked[0].i); return Math.min(d, 12 - d) >= 2; });
    const q = second ? mk(second) : { h: (p.h + 40) % 360, s: p.s, l: Math.max(0.28, p.l - 0.1) };
    const css = (o) => `hsl(${o.h} ${Math.round(o.s * 100)}% ${Math.round(o.l * 100)}%)`;
    return { primary: css(p), secondary: css(q), isLight: lum / count > 0.62 };
  } catch { return null; }
}

/** Cached by key (the track id). */
export function dominantColorsCached(key, img) {
  if (key && cache.has(key)) return cache.get(key);
  const r = dominantColors(img);
  if (key && r) cache.set(key, r);
  return r;
}
