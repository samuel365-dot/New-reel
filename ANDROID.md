# Reel for Android

Reel is an Android music player, built as an APK. You do **not**
need Android Studio or the Android SDK on your computer: the APK is built for
free in GitHub's cloud from this project.

## Get the APK (about 10 minutes the first time)

1. Create a free account at github.com and make a **new repository** (private is fine).
2. Upload this project to it. Easiest: on the new repo's page click **uploading an existing file**,
   drag in the *contents* of this folder (everything except `node_modules`, which isn't included), and commit.
   Or with git: `git init && git add . && git commit -m "Reel" && git remote add origin <url> && git push -u origin main`.
3. Open the repo's **Actions** tab, choose **Build Android APK** in the left list, click **Run workflow**.
   (It also runs by itself on every push.) If GitHub asks you to enable workflows, click the green button.
4. Wait for the green check (about 6–10 minutes). Open the run and download **reel-apk** at the bottom
   (a zip containing `app-debug.apk`).
5. Copy `app-debug.apk` to your phone (USB, Drive, WhatsApp to yourself...), open it, and allow
   "Install unknown apps" for the app you opened it from.
6. Open Reel, tap **menu → Library → Scan music**, and allow "Music and audio". Your device's music appears.

If the run fails (red cross), open it, click the failed step, and send me the last ~40 lines of the log.

## What works on the phone

- Library (search that understands "ft."/"feat."/"with", newest-first sorting by the phone's real "date added"), favorites,
  playlists, artists (A–Z, three per row), queue, recent, lyrics (import `.lrc`/`.txt`, paste, tap-to-sync), stats,
  mood tags, Library health dashboard, settings, three designs (Classic, Bloom, Turntable), milestones.
- **Made for you**: with online features on, Reel reads genre, year and related artists for the albums in your library and
  proposes playlists made only from your own songs. Open one to look inside, then add it (or dismiss it).
- **Explore**: songs you do not own that sound like what you play (nothing is played or downloaded).
- Lock-screen / notification player: heart (add to favorites), previous, play/pause, next and a close (✕) button. It keeps
  working with the screen off, and headset buttons work too.
- Share cards (lyrics, track of the week) take their colours from the song's cover and go through Android's share sheet.
- Android's **back button** closes the top-most panel, then goes up a level, then minimizes the app.

Your data lives in the app's private storage (`reel-library.json`, with a rolling `reel-library.bak.json`); uninstalling the app removes it.

## Developing

- `npm run build` then `npx cap sync android` copies the web app into the Android project; the cloud build does this for you.
- App id `com.reel.player`, name "Reel". Native code: `android/app/src/main/java/com/reel/player/`
  (`ReelMediaPlugin.java` scanner, `ReelPlaybackService.java` notification player). Phone-side bridge: `src/platform/android.js`.
