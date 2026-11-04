/* Automatic artist photos: when an artist has no photo yet, quietly fetch the Deezer picture
   (TheAudioDB if Deezer has none). Never overwrites a photo that exists, never asks twice. */
import { useEffect, useRef } from "react";
import { artistsMissingPhotos, artistPhotoOptions, fetchArtistPhoto, searchNameFor } from "./lookup.js";

const KEY = "reel-photo-auto-v1";                 // name → -1 (done, never again) | timestamp of a "not found" attempt
const RETRY_MS = 30 * 864e5;
const loadMarks = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
const saveMarks = (m) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* ignore */ } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function useAutoArtistPhotos({ library, artistPhotos, setArtistPhotos, enabled }) {
  const photos = useRef(artistPhotos);
  photos.current = artistPhotos;
  const busy = useRef(false);
  const libKey = library.length;

  useEffect(() => {
    if (!enabled || !libKey) return;
    let dead = false;
    const timer = setTimeout(async () => {
      if (busy.current || dead || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
      busy.current = true;
      const marks = loadMarks(), now = Date.now();
      const todo = artistsMissingPhotos(library, photos.current).filter(({ name }) => {
        const m = marks[name]; return !(m === -1 || (m && now - m < RETRY_MS));
      }).slice(0, 150);
      const batch = {}; let pending = 0, commits = 0, netFails = 0;
      const commit = () => {
        if (!pending) return;
        const add = { ...batch }; Object.keys(batch).forEach(k => delete batch[k]); pending = 0; commits++;
        setArtistPhotos(prev => {
          let out = prev, changed = false;
          for (const [k, v] of Object.entries(add)) if (!out[k]) { if (!changed) { out = { ...prev }; changed = true; } out[k] = v; }
          return changed ? out : prev;
        });
      };
      try {
        for (const { name } of todo) {
          if (dead) break;
          if (photos.current[name]) continue;
          try {
            const opts = await artistPhotoOptions(searchNameFor(name));
            let data = null;
            for (const op of opts.slice(0, 2)) { try { data = await fetchArtistPhoto(op.url, 320); break; } catch { /* next source */ } }
            if (data) { batch[name] = data; pending++; marks[name] = -1; } else marks[name] = Date.now();
            netFails = 0;
          } catch { if (++netFails >= 3) break; }
          saveMarks(marks);
          // first few appear quickly, then in bigger groups (every apply re-saves the library)
          if (pending >= (commits === 0 ? 4 : 20)) commit();
          await sleep(1200);
        }
      } finally { commit(); busy.current = false; }
    }, 5000);
    return () => { dead = true; clearTimeout(timer); };
  }, [enabled, libKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
