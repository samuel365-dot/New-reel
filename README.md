# Reel — local-first music player for Android

Reel plays the music that is on your phone. Nothing is uploaded; the optional online
features (all off until you turn them on) only look things up (covers, genres, similar artists).

## Build the APK (no Android Studio needed)

Push the project to GitHub and run the **Build Android APK** workflow
(`.github/workflows/android-apk.yml`). It runs `npm ci`, builds the web app, runs
`npx cap sync android` and `./gradlew assembleDebug`, then uploads `app-debug.apk`.

Local development in a browser (UI only — the Android bridge needs a phone):

```bash
npm install
npm run dev          # Vite dev server
npm run build        # production build to dist/
npx cap sync android # copy dist/ into the Android project
```

## How it is put together

- `src/App.jsx` — the whole app (phone layout only).
- `src/platform/android.js` — the `window.reel` bridge: data file (+ rolling backup), music scan, lock-screen player.
- `android/app/src/main/java/com/reel/player/`
  - `ReelMediaPlugin.java` — MediaStore scan, notification permission, insets.
  - `ReelPlaybackService.java` — the foreground service and the media notification
    (heart, previous, play/pause, next, close).
- `src/titleClean.js` — the one title/credit cleaner (scan, "Clean up titles", Library health, Fix tags, search).
- `src/online/` — optional online features: lookups, Fix tags, Explore, scrobbling, and `suggest.js` (Made for you).
- `src/dominantColor.js` — cover colours for share cards and generated playlist covers.

## Where your data lives

`reel-library.json` in the app's private storage, plus `reel-library.bak.json` (rolling copy of the last good
file). If the data file cannot be read, Reel keeps it as `reel-library.bad.json`, tells you, and does not save
over it until you decide.
