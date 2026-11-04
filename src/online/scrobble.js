import { useEffect, useRef } from "react";
import { featureOn, getOnline } from "./settings.js";
import { lbPlayingNow, lbSubmit } from "./providers.js";

const QKEY = "reel-scrobble-q";
const loadQ = () => { try { return JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch { return []; } };
const saveQ = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q.slice(-500))); } catch { /* ignore */ } };
let flushing = false;

async function flush() {
  if (flushing || !featureOn("scrobble")) return;
  const token = getOnline().keys.listenbrainz;
  if (!token) return;
  flushing = true;
  try {
    let q = loadQ();
    while (q.length) {
      const batch = q.slice(0, 20);
      // scrobbles queued while the network call was running must survive: re-read the queue after every await
      try { await lbSubmit(token, batch); } catch (e) { if (e.status === 400 || e.status === 401) { q = loadQ().slice(batch.length); saveQ(q); } break; }
      q = loadQ().slice(batch.length); saveQ(q);
    }
  } finally { flushing = false; }
}

/** Sends "now playing" and a scrobble once half the song (max 4 min) has really been listened to. Failed sends are kept and retried. */
export function useScrobbler({ track, isPlaying, plays = 0 }) {
  const state = useRef({ id: null, startedAt: 0, listened: 0, sent: false });
  useEffect(() => {
    if (!track) return;
    if (state.current.id !== track.id) {
      state.current = { id: track.id, startedAt: Math.floor(Date.now() / 1000), listened: 0, sent: false };
    }
    if (isPlaying && featureOn("scrobble")) {
      const token = getOnline().keys.listenbrainz;
      if (token && track.artist && !/^unknown/i.test(track.artist)) lbPlayingNow(token, track).catch(() => {});
    }
  }, [track?.id, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // every new play of the same song (repeat-one loop, one-song queue on repeat) is a new scrobble
  const lastPlays = useRef(plays);
  useEffect(() => {
    if (lastPlays.current === plays) return;
    lastPlays.current = plays;
    if (track && state.current.id === track.id) state.current = { id: track.id, startedAt: Math.floor(Date.now() / 1000), listened: 0, sent: false };
  }, [plays]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isPlaying || !track) return;
    const id = setInterval(() => {
      const s = state.current;
      if (s.id !== track.id || s.sent || !featureOn("scrobble")) return;
      s.listened += 1;
      const dur = track.duration || 0;
      const need = dur > 0 ? Math.min(dur / 2, 240) : 90;
      if ((dur === 0 || dur > 30) && s.listened >= need) {
        s.sent = true;
        if (!track.artist || /^unknown/i.test(track.artist)) return;   // nothing useful to submit
        const q = loadQ(); q.push({ track: { title: track.title, artist: track.artist, album: track.album, duration: track.duration }, listenedAt: s.startedAt });
        saveQ(q); flush();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [track?.id, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(flush, 60000);
    window.addEventListener("online", flush);
    flush();
    return () => { clearInterval(id); window.removeEventListener("online", flush); };
  }, []);
}
