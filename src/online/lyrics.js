import { lrclibFind } from "./providers.js";

function parseLrcLines(raw) {
  const out = [];
  for (const line of String(raw).split(/\r?\n/)) {
    const m = line.match(/^((?:\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\])+)\s*(.*)$/);
    if (!m) continue;
    const text = m[2].trim();
    for (const t of m[1].matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)) {
      const frac = t[3] ? parseInt(t[3].padEnd(3, "0").slice(0, 3), 10) / 1000 : 0;
      out.push({ time_sec: parseInt(t[1], 10) * 60 + parseInt(t[2], 10) + frac, text });
    }
  }
  return out.sort((a, b) => a.time_sec - b.time_sec);
}

/** Looks the song up online and returns an entry in the app's lyricsMap shape (or null). */
export async function findLyricsFor(track) {
  const res = await lrclibFind({ artist: track.artist, title: track.title, album: track.album, duration: track.duration });
  if (!res) return null;
  if (res.synced) {
    const lines = parseLrcLines(res.synced);
    if (lines.length) return { format: "lrc", source: "lrclib", lines, raw_lrc: res.synced };
  }
  if (res.plain) {
    const lines = res.plain.split(/\r?\n/).map(t => t.trim()).filter(Boolean).map(text => ({ time_sec: null, text }));
    if (lines.length) return { format: "plain", source: "lrclib", lines, raw_lrc: null };
  }
  return null;
}
