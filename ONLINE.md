# Reel — optional online features

Everything here is **off until the user switches it on** (Settings → Online features). With the master switch off, Reel makes no network requests.

| # | Feature | Source | Needs |
|---|---|---|---|
| 1 | Fix tags & covers (review before applying, up to 300 songs per run, messy names tried several ways) | Deezer · iTunes · MusicBrainz · Cover Art Archive | nothing |
| 2 | Library health: duplicates + missing info | local only (works offline) | nothing |
| 3 | Artist bio (Wikipedia text), artist photos (Deezer, TheAudioDB — pick one, or bulk-add from Settings) | Wikipedia · Deezer · TheAudioDB | nothing |
| 4 | Lyrics lookup, saved with the song | LRCLIB | nothing |
| 5 | Scrobbling (+ similar artists) | ListenBrainz (token) · Last.fm (own API key, read-only) | user's own token / key |
| 6 | Recommendations | local listening history only | nothing |
| 7 | Free music, streamed | Audius · Internet Archive · Jamendo | Jamendo client ID (free) |
| 8 | Playlist import | pasted list, Reel code, Deezer / ListenBrainz links | nothing |
| 9 | Album matches | MusicBrainz discography vs. library | nothing |
| 10 | Share playlist as text | titles + artists only | nothing |
| 12 | Playlists made for you (groups YOUR songs by genre, era, related artists; nothing is streamed) | Deezer | nothing |
| 14 | Gapless + crossfade (phone player) | offline | nothing |

Network rules (`src/online/net.js`): https only · one request queue per host with a minimum gap (MusicBrainz 1.1 s) · responses cached (7–30 days) · the phone uses the native HTTP client. Credits are listed in Settings → Online features → Sources & credits.
