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
