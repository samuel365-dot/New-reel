import { useState } from "react";
import { Cloud, ShieldCheck, ChevronDown, ChevronUp, Loader2, ExternalLink } from "lucide-react";
import { useOnline, setOnline } from "./settings.js";
import { clearOnlineCache } from "./net.js";
import { lbValidate, SOURCES } from "./providers.js";
import "./online.css";

export function Toggle({ on, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className={`on-switch${on ? " on" : ""}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

function FeatureRow({ title, sub, host, on, onChange, children }) {
  return (
    <div className="on-feature">
      <div className="on-feature-head">
        <div className="on-feature-txt">
          <b>{title}</b>
          <i>{sub}</i>
          {host && <em>{host}</em>}
        </div>
        <Toggle on={on} onChange={onChange} label={title} />
      </div>
      {on && children}
    </div>
  );
}

export function OnlineSettings({ pushToast }) {
  const o = useOnline();
  const [busy, setBusy] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const feat = (name) => (v) => setOnline({ features: { [name]: v } });
  const toast = (t) => pushToast?.(t);

  return (
    <div className="settings-section on-section">
      <div className="settings-label">Online features</div>
      <div className="settings-card">
        <div className="on-master">
          <span className="on-master-ico"><Cloud size={20} /></span>
          <div className="on-feature-txt">
            <b>Use the internet</b>
            <i>Off by default. Reel works fully offline and sends nothing until you switch this on.</i>
          </div>
          <Toggle on={o.enabled} label="Use the internet" onChange={(v) => setOnline({ enabled: v, consentAt: v ? Date.now() : null })} />
        </div>
      </div>

      {!o.enabled && (
        <p className="on-note"><ShieldCheck size={14} /> Nothing is requested, uploaded or tracked while this is off.</p>
      )}

      {o.enabled && (
        <>
          <p className="on-note"><ShieldCheck size={14} /> Secure (https) connections only. Requests are rate-limited and cached. No audio and no files are ever uploaded — only song titles and artist names are sent to look things up.</p>
          <div className="settings-card on-features">
            <FeatureRow title="Fix tags & covers" sub="Find correct title, artist, album and cover art for songs that lack them. Searches several databases." host="Deezer · iTunes · MusicBrainz · Cover Art Archive"
              on={o.features.tagsCovers} onChange={feat("tagsCovers")} />
            <FeatureRow title="Artist biographies & photos" sub="Show a short bio, a choice of artist photos and the discography on artist pages." host="Deezer · TheAudioDB · Wikipedia (text) · MusicBrainz"
              on={o.features.artistBios} onChange={feat("artistBios")}>
              <div className="on-sub-row"><span>Use artist photos automatically</span><Toggle on={o.features.artistPhotosAuto} label="Automatic artist photos" onChange={feat("artistPhotosAuto")} /></div>
            </FeatureRow>
            <FeatureRow title="Lyrics lookup" sub="Search for lyrics when a song has none. Results are saved with the song." host="LRCLIB"
              on={o.features.lyrics} onChange={feat("lyrics")}>
              <div className="on-sub-row"><span>Find them automatically</span><Toggle on={o.features.lyricsAuto} label="Automatic lyrics" onChange={feat("lyricsAuto")} /></div>
            </FeatureRow>
            <FeatureRow title="Scrobbling" sub="Send what you listen to, to your ListenBrainz profile. Unsent plays wait until you're online." host="ListenBrainz"
              on={o.features.scrobble} onChange={feat("scrobble")}>
              <div className="on-key">
                <input type="password" autoComplete="off" spellCheck={false} placeholder="ListenBrainz user token" value={o.keys.listenbrainz}
                  onChange={e => setOnline({ keys: { listenbrainz: e.target.value.trim() } })} />
                <button className="on-mini" disabled={!o.keys.listenbrainz || busy} onClick={async () => {
                  setBusy(true);
                  try { const u = await lbValidate(o.keys.listenbrainz); toast(u ? `Connected as ${u}` : "That token wasn't accepted"); } catch { toast("Couldn't reach ListenBrainz"); }
                  setBusy(false);
                }}>{busy ? <Loader2 size={14} className="on-spin" /> : "Check"}</button>
              </div>
              <a className="on-link" href="https://listenbrainz.org/settings/" target="_blank" rel="noopener noreferrer">Get your token <ExternalLink size={12} /></a>
            </FeatureRow>
            <FeatureRow title="Similar artists" sub="Suggest artists like the one you're viewing. Needs your own free API key." host="Last.fm"
              on={o.features.similar} onChange={feat("similar")}>
              <div className="on-key">
                <input type="password" autoComplete="off" spellCheck={false} placeholder="Last.fm API key" value={o.keys.lastfm}
                  onChange={e => setOnline({ keys: { lastfm: e.target.value.trim() } })} />
              </div>
              <a className="on-link" href="https://www.last.fm/api/account/create" target="_blank" rel="noopener noreferrer">Get a free key <ExternalLink size={12} /></a>
            </FeatureRow>
            <FeatureRow title="Explore" sub="Suggestions from the artists you listen to most: similar artists, albums you're missing and songs you may like. Only names, covers and short descriptions are shown — nothing is played or downloaded." host="MusicBrainz · Cover Art Archive · Wikipedia · Deezer"
              on={o.features.explore} onChange={feat("explore")} />
            <FeatureRow title="Playlists made for you" sub="Reads genre, year and related artists for the albums in your library and proposes playlists made only from your own songs." host="Deezer"
              on={o.features.suggest} onChange={feat("suggest")} />
            <FeatureRow title="Playlist links" sub="Read playlists from Deezer or ListenBrainz links and match them to your songs." host="Deezer · ListenBrainz"
              on={o.features.playlistImport} onChange={feat("playlistImport")} />
          </div>

          <div className="on-actions">
            <button className="on-pill" onClick={() => { clearOnlineCache().then(n => toast(n ? "Online cache cleared" : "Cache was already empty")); }}>Clear online cache</button>
            <button className="on-pill" onClick={() => setShowSources(s => !s)}>Sources & credits {showSources ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
          </div>
          {showSources && (
            <div className="settings-card on-sources">
              {SOURCES.map(s => (
                <div key={s.id} className="on-source">
                  <b>{s.name}</b><span>{s.use}</span><i>{s.license}</i>
                  <a className="on-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.url.replace("https://", "")} <ExternalLink size={11} /></a>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function PlaybackSettings() {
  const o = useOnline();
  const set = (patch) => setOnline({ playback: patch });
  return (
    <div className="settings-section on-section">
      <div className="settings-label">Playback</div>
      <div className="settings-card">
        <div className="settings-row">
          <div className="on-feature-txt"><b>Gapless playback</b><i>No silence between songs</i></div>
          <Toggle on={o.playback.gapless} label="Gapless playback" onChange={(v) => set({ gapless: v })} />
        </div>
        <div className="settings-row on-xf">
          <div className="on-feature-txt"><b>Crossfade</b><i>Blend the end of one song into the next</i></div>
          <div className="density-toggle">
            {[[0, "Off"], [3, "3s"], [6, "6s"], [10, "10s"]].map(([v, l]) => (
              <button key={v} className={`density-opt${o.playback.crossfade === v ? " selected" : ""}`} onClick={() => set({ crossfade: v })}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <p className="on-note">These work without internet. They apply to the phone player.</p>
    </div>
  );
}
