/* Online + playback settings. EVERYTHING online is off until the user switches it on. */
import { useSyncExternalStore } from "react";

const KEY = "reel-online-v1";
// structuredClone is missing on older Android WebViews — never rely on it.
const clone = (o) => JSON.parse(JSON.stringify(o));
export const DEFAULTS = {
  enabled: false,           // master switch — nothing leaves the device while this is false
  consentAt: null,
  features: {
    tagsCovers: false,      // MusicBrainz + Cover Art Archive
    artistBios: false,      // Wikipedia text + artist photos
    artistPhotosAuto: true, // when artistBios is on: give artists without a photo their Deezer picture automatically
    lyrics: false,          // LRCLIB
    lyricsAuto: false,      // look up automatically when a song has no lyrics
    scrobble: false,        // ListenBrainz
    similar: false,         // Last.fm (read-only, needs the user's own API key)
    freeMusic: false,       // Explore: Audius, Internet Archive, Jamendo
    explore: false,         // Explore: suggestions from your own listening (MusicBrainz, Cover Art Archive, Wikipedia)
    playlistImport: false,  // Deezer / ListenBrainz links
    suggest: true,          // Playlists page: "Made for you" (groups YOUR songs by genre, era and related artists)
  },
  keys: { listenbrainz: "", lastfm: "", jamendo: "" },
  playback: { gapless: false, crossfade: 0 },   // offline features, kept here for convenience
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw) return { ...DEFAULTS, ...raw, features: { ...DEFAULTS.features, ...raw.features }, keys: { ...DEFAULTS.keys, ...raw.keys }, playback: { ...DEFAULTS.playback, ...raw.playback } };
  } catch { /* fall through */ }
  return clone(DEFAULTS);
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }

export const getOnline = () => state;
export function setOnline(patch) {
  state = {
    ...state, ...patch,
    features: { ...state.features, ...(patch.features || {}) },
    keys: { ...state.keys, ...(patch.keys || {}) },
    playback: { ...state.playback, ...(patch.playback || {}) },
  };
  save();
  listeners.forEach(l => l());
}
export function replaceOnline(next) { state = { ...clone(DEFAULTS), ...next, features: { ...DEFAULTS.features, ...next.features }, keys: { ...DEFAULTS.keys, ...next.keys }, playback: { ...DEFAULTS.playback, ...next.playback } }; save(); listeners.forEach(l => l()); }
export const featureOn = (name) => !!(state.enabled && state.features[name]);

const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
export const useOnline = () => useSyncExternalStore(subscribe, getOnline, getOnline);
