/* Explore — suggestions from the user's own listening: similar artists, albums you're missing, songs you may like.
   Only names, covers and short descriptions are shown — nothing is played, streamed or added to the library. */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Loader2, ExternalLink, Compass, Disc3, Mic2, Music2, RefreshCw, Check } from "lucide-react";
import { useOnline } from "./settings.js";
import { topArtistsFrom, ownedArtistSet, missingAlbums, similarArtists, artistPicture, popularSongs, similarSongs, describe, listenLinks, songsFor } from "./explore-data.js";
import { norm } from "./match.js";
import { Sheet, NeedsFeature } from "./ui-tools.jsx";
import "./explore.css";

const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 360; };
const art = (url, seed) => ({ backgroundImage: `${url ? `url("${url}"), ` : ""}linear-gradient(135deg, hsl(${hue(seed)} 50% 36%), hsl(${(hue(seed) + 45) % 360} 55% 22%))` });
const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const why = (e) => String(e?.message || e || "").replace(/^Error:\s*/, "").slice(0, 90);

/* One lookup at a time for the whole page (MusicBrainz and Deezer both rate-limit; parallel blocks were being refused) */
let chain = Promise.resolve();
const enqueue = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };
const blockCache = new Map();    // this session only: coming back to Explore is instant

function useArtistPicture(name, enabled = true) {
  const [pic, setPic] = useState(null);
  useEffect(() => { let dead = false; if (enabled) artistPicture(name).then(p => { if (!dead) setPic(p); }); return () => { dead = true; }; }, [name, enabled]);
  return pic;
}

function Card({ item, onOpen, i }) {
  const pic = useArtistPicture(item.name, item.kind === "artist");
  const url = item.kind === "artist" ? pic : item.cover;
  const title = item.kind === "artist" ? item.name : item.title;
  const sub = item.sub || (item.kind === "album" ? [item.year, "Album"].filter(Boolean).join(" · ") : item.kind === "song" ? (item.album || "Song") : "Artist");
  return (
    <button className={`ex-card ${item.kind}`} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }} onClick={() => onOpen({ ...item, cover: url })}>
      <span className="ex-art" style={art(url, title)}>
        {!url && (item.kind === "artist" ? <b>{title.slice(0, 1).toUpperCase()}</b> : <Music2 size={22} />)}
        {item.kind === "song" && <span className="ex-poster-txt"><b>{title}</b><i>{item.artist}</i></span>}
      </span>
      {item.kind !== "song" && <><b>{title}</b><i>{sub}</i></>}
    </button>
  );
}
const Skeleton = () => <div className="ex-strip">{[0, 1, 2, 3].map(i => <div key={i} className="ex-card sk"><span className="ex-art" /><b /><i /></div>)}</div>;

// albums released in or after the newest year this artist has in the library
const newestMissing = (alb, artist) => {
  const have = artist.tracks.map(t => parseInt(t.year, 10)).filter(Boolean);
  const latest = have.length ? Math.max(...have) : null;
  return (alb?.missing || []).filter(a => a.year && (latest ? parseInt(a.year, 10) >= latest : parseInt(a.year, 10) >= new Date().getFullYear() - 1)).slice(0, 8);
};

function Strip({ title, sub, items, loading, empty, onOpen, variant, hideEmpty }) {
  if (hideEmpty && !loading && !items?.length) return null;
  return (
    <section className={`ex-sec${variant ? ` ex-sec-${variant}` : ""}`}>
      <div className="ex-sec-head"><h3>{title}</h3>{sub && <span>{sub}</span>}</div>
      {loading && !items?.length ? <Skeleton /> : items?.length ? <div className="ex-strip">{items.map((it, i) => <Card key={it.id || it.name} item={it} i={i} onOpen={onOpen} />)}</div> : <p className="ex-empty">{empty}</p>}
    </section>
  );
}

/* "Because you're listening to …": songs like the one playing now, none of them in the library. */
function NowBlock({ track, library, onOpen }) {
  const [songs, setSongs] = useState(() => blockCache.get(`now:${track.artist}`) || undefined);
  const pic = useArtistPicture(track.artist);
  useEffect(() => {
    const key = `now:${track.artist}`;
    if (blockCache.has(key)) { setSongs(blockCache.get(key)); return; }
    let dead = false; setSongs(undefined);
    enqueue(async () => {
      if (dead) return;
      let r = []; try { r = await similarSongs(track.artist, library, 12); } catch { /* shown as empty */ }
      blockCache.set(key, r); if (!dead) setSongs(r);
    });
    return () => { dead = true; };
  }, [track.artist]); // eslint-disable-line react-hooks/exhaustive-deps
  if (Array.isArray(songs) && !songs.length) return null;
  return (
    <section className="ex-now" style={{ "--h": hue(track.artist) }}>
      <div className="ex-now-head">
        <span className="ex-now-art" style={art(track.art, track.title)} />
        <div><small>Playing now</small><h2>More like “{track.title}”</h2><i>New songs, not in your library yet</i></div>
      </div>
      {songs === undefined ? <Skeleton /> : <div className="ex-strip">{songs.map((it, i) => <Card key={it.id} item={it} i={i} onOpen={onOpen} />)}</div>}
      <span className="ex-now-pic" style={art(pic, track.artist)} />
    </section>
  );
}

function Block({ artist, owned, library, lastfm, onOpen }) {
  const [tick, setTick] = useState(0);
  const [d, setD] = useState(() => blockCache.get(artist.name) || { stage: 0, err: {} });
  const pic = useArtistPicture(artist.name);
  useEffect(() => {
    if (blockCache.get(artist.name)?.stage === 3) return;
    let dead = false;
    const put = (patch) => setD(prev => { const n = { ...prev, ...patch }; blockCache.set(artist.name, n); return n; });
    enqueue(async () => {
      if (dead) return;
      let alb = { missing: [], total: 0, have: 0, artistId: null };
      try { alb = await missingAlbums(artist); } catch (e) { put({ err: { ...blockCache.get(artist.name)?.err, alb: why(e) } }); }
      if (dead) return; put({ stage: 1, alb });
      let sim = []; try { sim = await similarArtists(artist, alb.artistId, lastfm, owned); } catch (e) { put({ err: { ...blockCache.get(artist.name)?.err, sim: why(e) } }); }
      if (dead) return; put({ stage: 2, sim });
      let songs = []; try { songs = await similarSongs(artist.name, library); if (!songs.length) songs = await popularSongs(artist, owned); } catch (e) { put({ err: { ...blockCache.get(artist.name)?.err, songs: why(e) } }); }
      if (!dead) put({ stage: 3, songs });
    });
    return () => { dead = true; };
  }, [artist.name, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const { alb, err = {} } = d;
  const retry = () => { blockCache.delete(artist.name); setD({ stage: 0, err: {} }); setTick(t => t + 1); };
  const anyErr = err.alb || err.sim || err.songs;
  return (
    <div className="ex-block" key={artist.name}>
      <div className="ex-hero" style={{ "--h": hue(artist.name) }}>
        <span className="ex-hero-bg" style={art(pic, artist.name)} />
        <span className="ex-hero-ava" style={art(pic, artist.name)}>{!pic && artist.name.slice(0, 1).toUpperCase()}</span>
        <div className="ex-hero-txt">
          <small>Because you listen to</small>
          <h2>{artist.name}</h2>
          <i>{artist.plays ? `${artist.plays} play${artist.plays !== 1 ? "s" : ""} · ` : ""}{artist.tracks.length} song{artist.tracks.length !== 1 ? "s" : ""} in your library</i>
        </div>
        {d.stage === 3 && anyErr && <button className="ex-retry" onClick={retry} aria-label="Try again"><RefreshCw size={15} /></button>}
      </div>
      <Strip title={`New from ${artist.name}`} variant="albums" items={newestMissing(alb, artist)} loading={d.stage < 1} empty="" hideEmpty onOpen={onOpen} />
      <Strip title="Albums you're missing" sub={alb?.total ? `${alb.have} of ${alb.total} in your library` : null} items={alb?.missing?.slice(0, 12)} loading={d.stage < 1}
        empty={err.alb ? `Couldn't load the discography (${err.alb}). Tap ↻ to retry.` : alb?.total ? "You already have every album." : "This artist wasn't found in MusicBrainz."} onOpen={onOpen} />
      <Strip title="Similar artists" items={d.sim} loading={d.stage < 2} empty={err.sim ? `Couldn't load similar artists (${err.sim}).` : "No similar artists found."} onOpen={onOpen} />
      <Strip title="Songs you may like" sub="not in your library" variant="posters" items={d.songs} loading={d.stage < 3} empty={err.songs ? `Couldn't load songs (${err.songs}). Tap ↻ to retry.` : "No new songs found for this artist."} onOpen={onOpen} />
    </div>
  );
}

function SongList({ item, have }) {
  const [songs, setSongs] = useState(undefined);
  const [err, setErr] = useState("");
  useEffect(() => { let dead = false; setSongs(undefined); songsFor(item).then(r => { if (!dead) setSongs(r); }).catch(e => { if (!dead) { setErr(why(e)); setSongs([]); } }); return () => { dead = true; }; }, [item]);
  const label = item.kind === "album" ? "Tracks" : "Top songs";
  if (songs === undefined) return <div className="ex-songs"><h4>{label}</h4><p className="on-note center"><Loader2 size={14} className="on-spin" /> Loading songs…</p></div>;
  if (!songs.length) return <div className="ex-songs"><h4>{label}</h4><p className="ex-empty">{err ? `Couldn't load songs (${err}).` : "No songs found for this one."}</p></div>;
  return (
    <div className="ex-songs">
      <h4>{label}<span>{songs.length}</span></h4>
      {songs.map((t, i) => {
        const mine = have.has(norm(t.title));
        const inner = (<><em>{i + 1}</em><span className="ex-song-txt"><b>{t.title}</b>{item.kind === "artist" && t.album && <i>{t.album}</i>}</span>{mine && <u className="ex-song-own"><Check size={11} strokeWidth={3} /> In library</u>}<small>{t.duration ? fmtDur(t.duration) : ""}</small></>);
        return t.link ? <a key={t.id} className="ex-song" href={t.link} target="_blank" rel="noopener noreferrer">{inner}</a> : <div key={t.id} className="ex-song">{inner}</div>;
      })}
      <p className="ex-attr">Tap a song to listen on Deezer.</p>
    </div>
  );
}

function InfoSheet({ item, owned, have, onClose }) {
  const [info, setInfo] = useState(undefined);
  useEffect(() => { let dead = false; describe(item).then(r => { if (!dead) setInfo(r); }).catch(() => { if (!dead) setInfo(null); }); return () => { dead = true; }; }, [item]);
  const title = item.kind === "artist" ? item.name : item.title;
  const sub = item.kind === "artist" ? "Artist" : item.kind === "album" ? `${item.artist}${item.year ? ` · ${item.year}` : ""}` : `${item.artist}${item.album ? ` · ${item.album}` : ""}${item.duration ? ` · ${fmtDur(item.duration)}` : ""}`;
  const Ico = item.kind === "artist" ? Mic2 : item.kind === "album" ? Disc3 : Music2;
  // drawn on the app root, not inside the animated page, so it is a real bottom sheet over the whole screen
  const root = (typeof document !== "undefined" && document.querySelector(".reel-root")) || document.body;
  return createPortal(
    <Sheet title={title} sub={sub} onClose={onClose}>
      <div className="ex-info">
        <span className={`ex-info-art ${item.kind}`} style={art(item.cover, title)}>{!item.cover && <Ico size={34} />}</span>
        {(item.kind === "album" || item.kind === "artist") && <SongList item={item} have={have} />}
        {info === undefined && <p className="on-note center"><Loader2 size={14} className="on-spin" /> Loading description…</p>}
        {info && (<>
          <p className="ex-text">{info.extract}</p>
          <p className="ex-attr">{info.wiki ? "Text from Wikipedia, licensed CC BY-SA 4.0." : "Details from Deezer and MusicBrainz."}{info.url && <> <a className="on-link" href={info.url} target="_blank" rel="noopener noreferrer">Read more <ExternalLink size={12} /></a></>}</p>
        </>)}

        {item.kind === "album" && <p className="ex-tag">Not in your library yet</p>}
        {owned && <p className="ex-tag">{owned}</p>}
        <div className="ex-listen">
          <span>Listen on a licensed service</span>
          <div>{listenLinks(item).map(l => <a key={l.id} className={`ex-listen-btn ${l.id}`} href={l.url} target="_blank" rel="noopener noreferrer">{l.name}</a>)}</div>
        </div>
        <p className="ex-attr">Covers: Cover Art Archive · Data: MusicBrainz · Deezer</p>
      </div>
    </Sheet>,
    root
  );
}

export function ExplorePage({ onBack, library, playCounts, favorites, currentTrack, onOpenSettings }) {
  const o = useOnline();
  const on = o.enabled && o.features.explore;
  const [sel, setSel] = useState(null);
  const [info, setInfo] = useState(null);
  const artists = useMemo(() => topArtistsFrom({ library, playCounts, favorites }, 12), [library.length, playCounts, favorites]); // eslint-disable-line react-hooks/exhaustive-deps
  const owned = useMemo(() => ownedArtistSet(library), [library.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const haveTitles = useMemo(() => new Set(library.map(t => norm(t.title))), [library.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const head = <div className="m-head">{onBack && <button className="m-back" onClick={onBack} aria-label="Back"><ChevronLeft size={22} /></button>}<div><h1>Explore</h1><p>Made from what you listen to</p></div></div>;
  if (!on) return <>{head}<NeedsFeature name="explore" what="Explore" onOpenSettings={onOpenSettings} /></>;
  if (artists.length === 0) return <>{head}<div className="on-empty"><span className="on-empty-ico"><Compass size={22} /></span><b>Nothing to suggest yet</b><p>Add and play some songs. Explore uses the artists you listen to most to suggest similar artists, albums you're missing and songs you may like.</p></div></>;
  const current = artists.find(a => a.name === sel) || artists[0];
  const ownedLine = (name) => { const a = artists.find(x => x.name === name); return a ? `You have ${a.tracks.length} song${a.tracks.length !== 1 ? "s" : ""} by this artist` : null; };
  return (
    <div className="ex-page">
      {head}
      {currentTrack && !currentTrack.remote && currentTrack.artist && !/^unknown/i.test(currentTrack.artist) && <NowBlock track={currentTrack} library={library} onOpen={(it) => setInfo({ ...it, _own: null })} />}
      <div className="ex-pick" role="tablist" aria-label="Choose an artist">
        {artists.map(a => <Chip key={a.name} artist={a} on={a.name === current.name} onPick={() => setSel(a.name)} />)}
      </div>
      <Block key={current.name} artist={current} owned={owned} library={library} lastfm={o.keys.lastfm} onOpen={(it) => setInfo({ ...it, _own: it.kind === "artist" ? ownedLine(it.name) : null })} />
      <p className="on-credit">MusicBrainz · Cover Art Archive · Wikipedia (CC BY-SA 4.0) · pictures and popular songs from Deezer. Nothing is played or downloaded here.</p>
      {info && <InfoSheet item={info} owned={info._own} have={haveTitles} onClose={() => setInfo(null)} />}
    </div>
  );
}

function Chip({ artist, on, onPick }) {
  const pic = useArtistPicture(artist.name);
  return (
    <button role="tab" aria-selected={on} className={`ex-chip${on ? " on" : ""}`} onClick={onPick}>
      <span style={art(pic, artist.name)}>{!pic && artist.name.slice(0, 1).toUpperCase()}</span>
      <b>{artist.name}</b>
    </button>
  );
}
