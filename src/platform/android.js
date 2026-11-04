// Android (Capacitor) implementation of the `window.reel` bridge.
//
//   store.load/save   -> JSON file in the app's private data dir (@capacitor/filesystem), with a rolling backup copy
//   pickFolder/scan   -> native MediaStore scan (android/.../ReelMediaPlugin.java)
//   mediaUrl          -> Capacitor's local file server (convertFileSrc)
//   media.*           -> the lock-screen / notification player (android/.../ReelPlaybackService.java)
//   lyrics.pickFile   -> a hidden <input type="file">
//   onFlushRequest    -> fired when the app goes to the background
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { App as CapApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Share } from "@capacitor/share";

const ReelMedia = registerPlugin("ReelMedia");
const STORE_FILE = "reel-library.json";
const BAK_FILE = "reel-library.bak.json";
const BAD_FILE = "reel-library.bad.json";

const DEFAULT_DATA = {
  tracks: [], playlists: [], favorites: [], playCounts: {}, recentlyPlayed: [], queue: [],
  lyrics: {}, artistPhotos: {}, registeredArtistNames: [], playHistory: [], moodReactions: [],
  lastWeeklyRecapWeek: null, unlockedMilestones: [],
  playerState: { currentTrackId: null, shuffle: false, repeatMode: "off", volume: 0.8, lastPositionSec: 0 },
  settings: {
    accentKey: "amber", density: "comfortable", design: "classic", trackView: "auto", npView: "vinyl",
    theme: "dark", seekBarStyle: "line",
    minSeconds: 15,
  },
  suggestions: [], dismissedSeeds: [], enrichment: {},
};

// Paths already in the library (with the file's modified time): sent to the native scanner so a rescan only
// does the (slow) cover-art work for songs that are new or changed.
let knownPaths = new Map();
function rememberKnown(tracks) { knownPaths = new Map((tracks || []).filter((t) => t.filePath).map((t) => [t.filePath, t.mod || 0])); }

// Cover art -> small base64 JPEG. The plugin loads artwork natively, where the
// WebView's local URLs (https://localhost/...) don't exist, so we hand it the bytes.
async function toThumbDataUrl(url, size = 256) {
  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  canvas.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function fileExists(path) {
  try { await Filesystem.stat({ path, directory: Directory.Data }); return true; } catch { return false; }
}
// The activity file is optional (older installs keep everything in the library file); a broken one is ignored.
async function readActivity() {
  try { return (await fileExists(ACTIVITY_FILE)) ? await readJson(ACTIVITY_FILE) : {}; } catch { return {}; }
}
async function readJson(path) {
  const res = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
  return JSON.parse(res.data);
}

// "No file yet" (first launch) is the only case that may start empty. A file that exists but cannot be read or
// parsed is never silently replaced: the broken copy is kept as reel-library.bad.json, the rolling backup is tried,
// and if nothing is usable the app is told (loadError) so it can warn instead of overwriting.
async function loadStore() {
  const hasMain = await fileExists(STORE_FILE);
  if (!hasMain) {
    if (await fileExists(BAK_FILE)) {
      try {
        const data = { ...DEFAULT_DATA, ...(await readJson(BAK_FILE)), recoveredFromBackup: true };
        rememberKnown(data.tracks);
        return data;
      } catch { /* fall through to a fresh start */ }
    }
    return { ...DEFAULT_DATA }; // first launch
  }
  try {
    const data = { ...DEFAULT_DATA, ...(await readJson(STORE_FILE)), ...(await readActivity()) };
    rememberKnown(data.tracks);
    return data;
  } catch (err) {
    try { await Filesystem.copy({ from: STORE_FILE, to: BAD_FILE, directory: Directory.Data, toDirectory: Directory.Data }); } catch { /* keep going */ }
    if (await fileExists(BAK_FILE)) {
      try {
        const data = { ...DEFAULT_DATA, ...(await readJson(BAK_FILE)), recoveredFromBackup: true };
        rememberKnown(data.tracks);
        return data;
      } catch { /* the backup is broken too */ }
    }
    return { ...DEFAULT_DATA, loadError: String((err && err.message) || err || "unreadable") };
  }
}

// Saves are chained so two overlapping writes can never interleave; a file is written to a temp name and renamed
// so a crash mid-write can't corrupt it.
//
// The data is split in two files: the library (big, changes rarely) and the activity (play history, counts, position:
// small relative to the library, changes all the time). The big file is only rewritten when it really changed.
const ACTIVITY_FILE = "reel-activity.json";
const ACTIVITY_KEYS = ["playHistory", "moodReactions", "playCounts", "recentlyPlayed", "playerState"];
let saveChain = Promise.resolve();
let lastBackupAt = 0;
let lastMainJson = null;

async function atomicWrite(path, json) {
  await Filesystem.writeFile({ path: path + ".tmp", directory: Directory.Data, encoding: Encoding.UTF8, data: json });
  try {
    await Filesystem.rename({ from: path + ".tmp", to: path, directory: Directory.Data, toDirectory: Directory.Data });
  } catch {
    // some Android versions refuse to rename over an existing file: write the real file directly instead
    await Filesystem.writeFile({ path, directory: Directory.Data, encoding: Encoding.UTF8, data: json });
  }
}

function saveStore(data) {
  rememberKnown(data.tracks);
  const main = { ...data }, act = {};
  for (const k of ACTIVITY_KEYS) { if (k in main) { act[k] = main[k]; delete main[k]; } }
  const mainJson = JSON.stringify(main), actJson = JSON.stringify(act);
  saveChain = saveChain
    .then(async () => {
      if (mainJson !== lastMainJson) {
        // one rolling backup copy of the last good library file (at most every 10 minutes, and once per launch)
        if (Date.now() - lastBackupAt > 10 * 60 * 1000 && (await fileExists(STORE_FILE))) {
          try {
            await Filesystem.copy({ from: STORE_FILE, to: BAK_FILE, directory: Directory.Data, toDirectory: Directory.Data });
            lastBackupAt = Date.now();
          } catch { /* a missing backup must never block saving */ }
        }
        await atomicWrite(STORE_FILE, mainJson);
        lastMainJson = mainJson;
      }
      await atomicWrite(ACTIVITY_FILE, actJson);
    })
    .catch((err) => console.error("Reel: failed to save data file", err));
  return saveChain;
}

function pickTextFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; input.remove(); resolve(v); } };
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return done(null);
      try { done({ filePath: file.name, content: await file.text() }); } catch { done(null); }
    });
    input.addEventListener("cancel", () => done(null));
    // Older WebViews don't fire "cancel": treat "window refocused, nothing chosen" as one.
    window.addEventListener("focus", () => setTimeout(() => { if (!input.files || input.files.length === 0) done(null); }, 800), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export function installAndroidPlatform() {
  const flushCallbacks = new Set();
  const flush = () => flushCallbacks.forEach((cb) => { try { cb(); } catch { /* best effort */ } });
  CapApp.addListener("pause", flush);
  CapApp.addListener("appStateChange", ({ isActive }) => { if (!isActive) flush(); });
  CapApp.addListener("backButton", () => window.dispatchEvent(new CustomEvent("reel:back")));

  // Normal window (system bars sit above/below the app, never over it). The status bar is painted in the app's
  // own background colour so there is no visible seam at the top.
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  StatusBar.setBackgroundColor({ color: "#0B0B0F" }).catch(() => {});
  document.documentElement.style.setProperty("--sat", "0px");
  document.documentElement.style.setProperty("--sab", "0px");
  // The splash screen stays up until the app says its data is loaded (see notifyUiReady).
  setTimeout(() => SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {}), 5000);

  const noop = () => {};
  window.reel = {
    platform: "android",
    setStatusBarLight: (light) => {
      StatusBar.setStyle({ style: light ? Style.Light : Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: light ? "#F5F5F7" : "#0B0B0F" }).catch(() => {});
    },

    // "Add music" on Android scans the device's music library instead of a folder.
    pickFolder: async () => {
      const res = await ReelMedia.ensurePermission();
      if (!res.granted) {
        alert("Reel needs permission to read your music.\n\nAllow \"Music and audio\" for Reel in Settings > Apps > Reel > Permissions, then try again.");
        return null;
      }
      return "this device";
    },
    // Returns the songs that are new or changed (tracks) and every song that exists on the phone now (existing).
    scanFolder: async (_folder, opts) => {
      const known = Array.from(knownPaths, ([p, m]) => ({ p, m }));
      const res = await ReelMedia.scanAudio({ known, minSeconds: (opts && opts.minSeconds) ?? 15 });
      return { tracks: res.tracks || [], existing: res.existing || [] };
    },
    mediaUrl: async (filePath) => Capacitor.convertFileSrc(filePath),
    onScanProgress: (cb) => {
      const handle = ReelMedia.addListener("scanProgress", cb);
      return () => { handle.then((h) => h.remove()).catch(noop); };
    },

    lyrics: {
      pickFile: () => pickTextFile(".lrc,.txt,text/plain"),
      // Android's scoped storage doesn't allow writing next to the music files;
      // Reel's own store always keeps the lyrics, so this is best-effort only.
      saveLrcFile: async () => ({ ok: false, reason: "not-supported-on-android" }),
    },

    store: { load: loadStore, save: saveStore },

    onFlushRequest: (cb) => { flushCallbacks.add(cb); return () => flushCallbacks.delete(cb); },
    flushComplete: noop,
    notifyUiReady: () => { SplashScreen.hide({ fadeOutDuration: 250 }).catch(noop); },

    // Lock-screen / notification player (native service). One call carries the whole state.
    media: {
      update: async ({ art, ...s }) => {
        try { await ReelMedia.mediaUpdate({ ...s, ...(art || {}) }); } catch (e) { console.warn("Reel: media update failed", e); }
      },
      hide: () => ReelMedia.mediaHide().catch(noop),
      onAction: (cb) => {
        const handle = ReelMedia.addListener("mediaAction", cb);
        return () => { handle.then((h) => h.remove()).catch(noop); };
      },
      // Cover -> what the native side can read: a file path (decoded natively) or a small base64 JPEG.
      prepareArt: async (artUrl) => {
        if (!artUrl) return null;
        try {
          const marker = "/_capacitor_file_";
          const i = artUrl.indexOf(marker);
          if (i >= 0) return { artPath: decodeURIComponent(artUrl.slice(i + marker.length).split("?")[0]) };
          return { artData: await toThumbDataUrl(artUrl, 384) };
        } catch { return null; }
      },
    },
    requestNotificationPermission: async () => { try { return await ReelMedia.ensureNotificationPermission(); } catch { return null; } },
    notificationStatus: async () => { try { return await ReelMedia.notificationStatus(); } catch { return null; } },
    openNotificationSettings: async () => { try { await ReelMedia.openNotificationSettings(); } catch { /* optional */ } },
    exitApp: () => CapApp.minimizeApp().catch(noop),
    // Hands a generated image (lyrics card, weekly card) to the system share sheet.
    saveImage: async (blob, filename) => {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const written = await Filesystem.writeFile({ path: filename, directory: Directory.Cache, data: String(dataUrl).split(",")[1] });
      await Share.share({ title: "Reel", files: [written.uri] });
    },
    saveText: async (text, filename) => {
      const written = await Filesystem.writeFile({ path: filename, directory: Directory.Cache, data: text, encoding: Encoding.UTF8 });
      await Share.share({ title: filename, files: [written.uri] });
    },
  };
}
