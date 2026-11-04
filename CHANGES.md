# What changed in this build (from the review document)

Removed: desktop/Electron (app, packaging, mini-player, tray, desktop layout), Season Mode, encrypted backup, the
@jofr media-session plugin and the Gradle hack that patched it.

Playback / data (P-01…P-27): one-song repeat-all, duplicate songs in the queue, shuffle sync, "Play next" on the current
song, restart after the queue ends, no stale-offset restarts, silent-restore fixes (no play counted at launch), removing
the playing song, crossfade preload, one "previous" rule, local-day stats, scrobble queue race + loops, no cached bad
responses, Jamendo filter, grouped artists, safe data loading (+ .bak / .bad copies), no full-library save while playing,
stable ids for new songs, missing-file flag, real "date added", "skip short clips" setting, narrowed FileProvider paths.

Notification player: native ReelPlaybackService (heart, previous, play/pause, next, close), one permission flow, no
per-second updates, instant seek/metadata, cover loaded afterwards.

UI: Playlists (Import left / New right, Made for you + detail view), Artists (3 per row, A–Z), Library health dashboard,
cover-coloured share cards, Explore (songs you don't own, poster cards, "playing now" banner), newest/oldest sort labels,
credit-aware ranked search with highlight, one title cleaner and a correct "Apply".

## Second round (after the first test on a phone)
- Playlist detail, Library top bar and Settings layouts fixed (long names wrap, sort control on one row, Accent/Density rows).
- Made for you: far more groups (genre × era, similar-artist circles, artist essentials, eras, full albums, long/short songs,
  moods, new songs, language), genre looked up for songs without an album via the artist, every album looked up (progress
  shown), covers = mosaic of the group's own covers (kept as a real cover when you add the playlist).
- Notification: Play/Pause from the notification now start/stop the audio directly (no waiting for a screen redraw) and
  wake the app's WebView and CPU first, so resuming after minutes of pause works with the screen off.
- Finished from the review: activity (history, counts, position) saved in its own small file and the library file only
  rewritten when it changes (P-13), lyric highlight reads the audio clock (P-20), genre chips in Explore (B7), "NEW" badge (B8).
