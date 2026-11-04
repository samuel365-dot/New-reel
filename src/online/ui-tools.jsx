import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Check, X, Loader2, Play, Search, Trash2, Wand2, Lock, Upload, Download, AlertTriangle, Music2, ChevronRight, ExternalLink, Sparkles, Cloud, Copy, Copy as CopyIcon, UserX, Disc3, ImageOff, TextCursorInput, FileX } from "lucide-react";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import { useOnline, featureOn, getOnline, setOnline } from "./settings.js";
import { findDuplicates, findGaps, matchWanted, norm, similarity } from "./match.js";
import {
  wikiArtist, mbDiscography, lastfmSimilar, audiusSearch, jamendoSearch, archiveSearch, archiveTracks,
  readPlaylistInput, playlistShareText,
} from "./providers.js";
import { cleanTrack, needsCleaning, splitCredits } from "../titleClean.js";
import { lookupSong, fetchCover, probeOnline, artistPhotoOptions, fetchArtistPhoto, deezerDiscography, artistsMissingPhotos, searchNameFor } from "./lookup.js";
import { lightArt } from "../lightart.js";
import "./online.css";

/* ---------- small shared bits ---------- */
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
export function Thumb({ track, size = 46 }) {
  const h = hash(track.id || track.title), style = track.art
    ? { backgroundImage: `url(${lightArt(track.art)})` }
    : { background: `linear-gradient(135deg, hsl(${h % 360} 55% 38%), hsl(${(h + 50) % 360} 60% 24%))` };
  return <span className="on-thumb" style={{ width: size, height: size, ...style }}>{!track.art && <Music2 size={size * 0.4} />}</span>;
}
export const Circle = ({ on }) => <span className={`sel-circle${on ? " on" : ""}`}>{on && <Check size={15} strokeWidth={3.2} />}</span>;
const fmtDur = (s) => { s = Math.round(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const unknownArtist = (a) => !a || /^unknown/i.test(a);

export function Sheet({ title, sub, onClose, children, footer }) {
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet on-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="on-sheet-head">
          <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
          <button className="on-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="on-sheet-body">{children}</div>
        {footer && <div className="on-sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function NeedsFeature({ name, what, onOpenSettings }) {
  return (
    <div className="on-empty">
      <span className="on-empty-ico"><Lock size={22} /></span>
      <b>{what} is switched off</b>
      <p>Online features are optional and stay off until you turn them on in Settings → Online features.</p>
      {onOpenSettings && <button className="on-cta" onClick={onOpenSettings}>Open settings</button>}
      <span className="on-hidden">{name}</span>
    </div>
  );
}

export async function shareText(title, text) {
  try {
    if (Capacitor.isNativePlatform()) { await Share.share({ title, text, dialogTitle: title }); return "shared"; }
    if (navigator.share) { await navigator.share({ title, text }); return "shared"; }
    await navigator.clipboard.writeText(text); return "copied";
  } catch (e) {
    if (e && /cancel|abort/i.test(String(e.name || e.message))) return "cancelled";
    try { await navigator.clipboard.writeText(text); return "copied"; } catch { return "failed"; }
  }
}
export { playlistShareText };

/* =====================================================================
   1. Fix tags & covers (MusicBrainz + Cover Art Archive) — review before anything changes
   ===================================================================== */
// Plain clean-up of a raw title (junk, credits, glued artist) — the same cleaner the whole app uses.
const lightClean = (t) => cleanTrack({ title: t, artist: "Unknown Artist" }).title;

const FixRow = memo(function FixRow({ it, busy, onToggle, onPick, onSearch, onSwap }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const alts = (it.alts || []).filter(a => !(norm(a.artist) === norm(it.after.artist) && norm(a.title) === norm(it.m?.title || it.after.title)));
  const canSwap = !unknownArtist(it.track.artist);
  return (
    <div className="on-fix-wrap">
      <button className="on-fix-row" onClick={() => onToggle(it.id)}>
        <Circle on={it.apply} />
        <Thumb track={{ ...it.track, art: it.cover || it.track.art }} size={52} />
        <span className="on-fix-txt">
          <b>{it.after.title}</b>
          <i>{it.after.artist}{it.after.album ? ` · ${it.after.album}` : ""}{it.after.year ? ` · ${it.after.year}` : ""}</i>
          {it.swapped && <em>title and artist were swapped</em>}
          {!it.swapped && (it.after.title !== it.track.title || it.after.artist !== it.track.artist) && <em>was: {it.track.title}{it.track.artist ? ` — ${it.track.artist}` : ""}</em>}
        </span>
        <span className={`on-conf ${it.confidence >= 85 ? "hi" : ""}`}>{it.confidence}%</span>
      </button>
      <button className="on-fix-more" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? "Hide" : "Not right?"}</button>
      {open && (
        <div className="on-fix-panel">
          {it.reasons?.length > 0 && <p className="on-fix-why">{it.reasons.join(" · ")}{it.sources?.length ? ` · ${it.sources.join(" + ")}` : ""}</p>}
          {alts.length > 0 && <div className="on-fix-alts">
            {alts.map((a, i) => (
              <button key={i} className="on-alt" disabled={busy} onClick={() => onPick(it.id, a)}>
                <span><b>{a.title}</b><i>{a.artist}{a.album ? ` · ${a.album}` : ""}</i></span><em>{a.confidence}%</em>
              </button>
            ))}
          </div>}
          <div className="on-search-row">
            <input className="on-input" value={text} onChange={e => setText(e.target.value)} placeholder="Search again: Artist - Title" />
            <button className="on-pill" disabled={busy || !text.trim()} onClick={() => onSearch(it.id, text)}>{busy ? <Loader2 size={15} className="on-spin" /> : <Search size={15} />}</button>
          </div>
          {canSwap && <button className="on-pill" disabled={busy} onClick={() => onSwap(it.id)}>Swap artist / title</button>}
        </div>
      )}
    </div>
  );
});

/** A song nothing was found for: its own search box. */
const MissRow = memo(function MissRow({ track, busy, onSearch }) {
  const [text, setText] = useState(() => lightClean(track.title));
  return (
    <div className="on-fix-wrap miss">
      <div className="on-fix-row"><Thumb track={track} size={46} /><span className="on-fix-txt"><b>{track.title}</b><i>{unknownArtist(track.artist) ? "Unknown artist" : track.artist}</i></span></div>
      <div className="on-fix-panel">
        <div className="on-search-row">
          <input className="on-input" value={text} onChange={e => setText(e.target.value)} placeholder="Type Artist - Title" />
          <button className="on-pill" disabled={busy || !text.trim()} onClick={() => onSearch(track, text)}>{busy ? <Loader2 size={15} className="on-spin" /> : <Search size={15} />}</button>
        </div>
      </div>
    </div>
  );
});

/** Suggested values for one song from a lookup result (kept in one place so every path builds them the same way). */
function afterFor(t, m) {
  // What "Apply" will write — and exactly what the card shows. The raw junk title ("… Official Video ft. X") is never kept.
  const cleaned = cleanTrack({ title: t.title, artist: t.artist });
  const keepArtist = !unknownArtist(cleaned.artist) && similarity(m.artist, cleaned.artist) >= 0.95;
  const sameTitle = String(m.title || "").trim().toLowerCase() === String(t.title || "").trim().toLowerCase();
  let title;
  if (sameTitle) title = t.title;
  else if (m.confidence >= 80) {
    title = m.version ? `${m.title} (${m.version})` : m.title;   // original found, version kept as a label
    // providers drop "(feat. X)" from their short titles: put the credits back
    const own = splitCredits(cleaned.title), prov = splitCredits(m.title);
    if (own.credits.length && !prov.credits.length) title = `${title} (feat. ${own.credits.join(", ")})`;
  } else title = cleaned.title;
  const placed = cleanTrack({ title, artist: keepArtist ? cleaned.artist : m.artist });   // credits go where the setting says
  return { title: placed.title, artist: placed.artist, album: m.album || t.album, year: m.year };
}

export function FixSheet({ library, setLibrary, ids, onClose, pushToast }) {
  const o = useOnline();
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [items, setItems] = useState([]);
  const [missed, setMissed] = useState([]);              // songs nothing was found for (they get a search box)
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const stop = useRef(false);
  const toggleItem = useCallback((id) => setItems(prev => prev.map(x => x.id === id ? { ...x, apply: !x.apply } : x)), []);
  const candidates = useMemo(() => {
    const noAlbum = (t) => !t.album || /^(local files|unknown( album)?)$/i.test(String(t.album).trim());
    const pool = ids ? library.filter(t => ids.includes(t.id) && !t.remote) : library.filter(t => !t.remote && (!t.art || unknownArtist(t.artist) || noAlbum(t) || needsCleaning(t)));
    return pool.slice(0, 300);
  }, [library, ids]);

  useEffect(() => () => { stop.current = true; }, []);
  if (!(o.enabled && o.features.tagsCovers)) return <Sheet title="Fix tags & covers" onClose={onClose}><NeedsFeature name="tagsCovers" what="Fix tags & covers" /></Sheet>;

  const itemFrom = (t, m, cover, applyDefault) => ({
    id: t.id, track: t, m, after: afterFor(t, m), cover, confidence: m.confidence, sources: m.sources, swapped: m.swapped,
    reasons: m.reasons, alts: m.alternatives, apply: applyDefault,
  });
  const changedBy = (t, m, cover) => { const a = afterFor(t, m); return m.swapped || a.title !== t.title || a.artist !== t.artist || (a.album && a.album !== t.album) || (!t.year && !!a.year) || !!cover; };

  const run = async () => {
    stop.current = false; setPhase("scanning"); setError(""); setItems([]); setMissed([]);
    setProgress({ done: 0, total: candidates.length });
    const coverCache = new Map(), found = [], notFound = [];
    try {
      if (!(await probeOnline())) throw new Error("Couldn't reach the music databases. Check your connection and try again.");
      for (let i = 0; i < candidates.length; i++) {
        if (stop.current) return;
        const t = candidates[i];
        let m = null;
        try { m = await lookupSong(t); } catch { /* this song only */ }
        if (m) {
          let cover = null;
          if (!t.art) {
            const ck = norm(m.artist) + "|" + norm(m.album || m.title);
            if (!coverCache.has(ck)) coverCache.set(ck, await fetchCover(m, 256).catch(() => null));
            cover = coverCache.get(ck);
          }
          if (changedBy(t, m, cover)) found.push(itemFrom(t, m, cover, m.confidence >= 75));
        } else notFound.push(t);
        setProgress({ done: i + 1, total: candidates.length });
        setItems([...found]);
      }
      setMissed(notFound);
      setPhase("review");
    } catch (e) { setError(e?.message || "Couldn't reach the music databases"); setPhase("idle"); }
  };

  // ----- the user steers a song: choose another candidate / search again / swap -----
  const withCover = async (t, m) => (t.art ? null : await fetchCover(m, 256).catch(() => null));
  const replaceItem = (t, m, cover, applyDefault) => setItems(prev => {
    const it = itemFrom(t, m, cover, applyDefault);
    return prev.some(x => x.id === t.id) ? prev.map(x => x.id === t.id ? it : x) : [...prev, it];
  });
  const pick = async (id, alt) => {
    const cur = items.find(x => x.id === id); if (!cur) return;
    setBusyId(id);
    const m = { title: alt.title, artist: alt.artist, album: alt.album, year: alt.year, confidence: alt.confidence, covers: alt.covers, coverIds: alt.coverIds, sources: [alt.src], reasons: ["chosen by you"], alternatives: cur.alts, version: cur.m?.version || null, swapped: false };
    const cover = await withCover(cur.track, m);
    replaceItem(cur.track, m, cover || cur.cover, true); setBusyId(null);
  };
  const searchAgain = async (idOrTrack, text) => {
    const t = typeof idOrTrack === "object" ? idOrTrack : items.find(x => x.id === idOrTrack)?.track; if (!t) return;
    setBusyId(t.id);
    try {
      const m = await lookupSong({ ...t, title: text, artist: "", filePath: undefined });
      if (!m) { pushToast?.("Nothing found for that text"); return; }
      const cover = await withCover(t, m);
      replaceItem(t, { ...m, reasons: ["searched by you", ...(m.reasons || [])] }, cover, m.confidence >= 60);
      setMissed(prev => prev.filter(x => x.id !== t.id));
    } catch { pushToast?.("Search failed — check your connection"); } finally { setBusyId(null); }
  };
  const swapFields = async (id) => {
    const cur = items.find(x => x.id === id); if (!cur) return;
    setBusyId(id);
    try {
      const m = await lookupSong({ ...cur.track, title: cur.track.artist, artist: cur.track.title, filePath: undefined });
      if (!m) { pushToast?.("No match with artist and title swapped"); return; }
      const cover = await withCover(cur.track, m);
      replaceItem(cur.track, { ...m, swapped: true, reasons: ["artist and title swapped by you", ...(m.reasons || [])] }, cover, true);
    } catch { pushToast?.("Search failed — check your connection"); } finally { setBusyId(null); }
  };

  const apply = () => {
    const chosen = new Map(items.filter(i => i.apply).map(i => [i.id, i]));
    setLibrary(prev => prev.map(t => {
      const it = chosen.get(t.id); if (!it) return t;
      return { ...t, title: it.after.title, artist: it.after.artist, album: it.after.album || t.album, year: it.after.year || t.year, art: it.cover || t.art };
    }));
    pushToast?.(`Updated ${chosen.size} song${chosen.size !== 1 ? "s" : ""}`);
    onClose();
  };
  const chosenCount = items.filter(i => i.apply).length;

  return (
    <Sheet title="Fix tags & covers" sub={phase === "review" ? `${items.length} suggestion${items.length !== 1 ? "s" : ""} — nothing changes until you apply` : undefined} onClose={onClose}
      footer={phase === "review" && items.length > 0 ? <button className="on-cta" onClick={apply} disabled={!chosenCount}>Apply {chosenCount} change{chosenCount !== 1 ? "s" : ""}</button> : null}>
      {phase === "idle" && (
        <div className="on-empty">
          <span className="on-empty-ico"><Wand2 size={22} /></span>
          <b>{candidates.length ? `${candidates.length} song${candidates.length !== 1 ? "s" : ""} could use a fix` : "Your library looks complete"}</b>
          <p>Reel searches Deezer, iTunes, MusicBrainz and the Cover Art Archive for each one, trying several spellings of messy names, then shows you what it found. You choose what to keep.</p>
          {error && <p className="on-error"><AlertTriangle size={14} /> {error}</p>}
          {candidates.length > 0 && <button className="on-cta" onClick={run}>Start lookup</button>}
        </div>
      )}
      {phase === "scanning" && (
        <div className="on-progress">
          <Loader2 size={20} className="on-spin" /> <b>Looking up songs…</b>
          <div className="on-bar"><div style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
          <span>{progress.done} of {progress.total} · {items.length} found</span>
          <button className="on-pill" onClick={() => { stop.current = true; setPhase(items.length ? "review" : "idle"); }}>{items.length ? "Stop and review" : "Cancel"}</button>
        </div>
      )}
      {phase === "review" && items.length === 0 && missed.length === 0 && <div className="on-empty"><b>No better matches found</b><p>None of the databases knew these songs well enough to suggest changes. Fixing the file name (artist - title) and trying again often helps.</p></div>}
      {phase === "review" && items.map(it => <FixRow key={it.id} it={it} busy={busyId === it.id} onToggle={toggleItem} onPick={pick} onSearch={searchAgain} onSwap={swapFields} />)}
      {phase === "review" && missed.length > 0 && (
        <>
          <p className="on-fix-section">Not found · {missed.length} — type the artist and title to search again</p>
          {missed.slice(0, 60).map(t => <MissRow key={t.id} track={t} busy={busyId === t.id} onSearch={searchAgain} />)}
        </>
      )}
      <p className="on-credit">Data: Deezer · iTunes · MusicBrainz (CC0) · Covers: Deezer, iTunes, Cover Art Archive</p>
    </Sheet>
  );
}

/* =====================================================================
   2. Library health: duplicates + missing info (works fully offline)
   ===================================================================== */
export function HealthPage({ onBack, library, lyricsMap, playCounts, onRemoveIds, onFix, onCleanTitles, onOpenSettings, pushToast }) {
  const o = useOnline();
  const dups = useMemo(() => findDuplicates(library), [library]);
  const gaps = useMemo(() => findGaps(library, lyricsMap), [library, lyricsMap]);
  const missing = useMemo(() => library.filter(t => t.missing), [library]);
  const [open, setOpen] = useState(null);                 // the card whose list is open
  const [removeSel, setRemoveSel] = useState(() => new Set());
  const canFix = o.enabled && o.features.tagsCovers;

  // preselect everything except the best copy of each duplicate group
  const seedDups = () => {
    const sel = new Set();
    dups.forEach(g => {
      const best = [...g.tracks].sort((a, b) => (b.art ? 1 : 0) - (a.art ? 1 : 0) || (playCounts?.[b.id] || 0) - (playCounts?.[a.id] || 0) || (b.duration || 0) - (a.duration || 0))[0];
      g.tracks.forEach(t => { if (t.id !== best.id) sel.add(t.id); });
    });
    setRemoveSel(sel);
  };

  const cards = [
    { k: "dups", label: "Duplicates", n: dups.length, Icon: CopyIcon, action: "Review" },
    { k: "unknownArtist", label: "No artist", n: gaps.unknownArtist.length, Icon: UserX, action: "Fix" },
    { k: "noAlbum", label: "No album", n: gaps.noAlbum.length, Icon: Disc3, action: "Fix" },
    { k: "noCover", label: "No cover", n: gaps.noCover.length, Icon: ImageOff, action: "Fix" },
    { k: "rawTitles", label: "Messy titles", n: gaps.rawTitles.length, Icon: TextCursorInput, action: "Clean" },
    ...(missing.length ? [{ k: "missing", label: "Missing files", n: missing.length, Icon: FileX, action: "Remove" }] : []),
  ];
  // the score: songs with no issue at all / all songs
  const bad = new Set();
  dups.forEach(g => g.tracks.slice(1).forEach(t => bad.add(t.id)));
  [gaps.unknownArtist, gaps.noAlbum, gaps.noCover, gaps.rawTitles, missing].forEach(l => l.forEach(t => bad.add(t.id)));
  const total = library.length || 1;
  const pct = library.length ? Math.round(((library.length - bad.size) / total) * 100) : 100;
  const R = 46, C = 2 * Math.PI * R;
  const listFor = (k) => (k === "dups" ? [] : k === "missing" ? missing : gaps[k] || []);
  const cur = open ? cards.find(c => c.k === open) : null;
  const list = cur ? listFor(cur.k) : [];

  const fixEverything = () => {
    // 1) titles first (works offline), 2) then tags and covers from the online lookup
    if (gaps.rawTitles.length) onCleanTitles();
    const ids = [...new Set([...gaps.unknownArtist, ...gaps.noAlbum, ...gaps.noCover].map(t => t.id))].slice(0, 300);
    if (ids.length) { if (canFix) onFix(ids); else onOpenSettings(); }
    else if (!gaps.rawTitles.length) pushToast?.("Nothing to fix");
  };

  return (
    <div className="hl-page">
      <div className="m-head">{onBack && <button className="m-back" onClick={onBack} aria-label="Back to More"><ChevronLeft size={22} /></button>}<div><h1>Library health</h1><p>{library.length} songs checked on this device</p></div></div>

      <div className="hl-score">
        <svg viewBox="0 0 110 110" className="hl-ring" aria-hidden="true">
          <circle cx="55" cy="55" r={R} className="hl-ring-bg" />
          <circle cx="55" cy="55" r={R} className="hl-ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform="rotate(-90 55 55)" />
        </svg>
        <div className="hl-score-txt"><b>{pct}%</b><span>clean</span></div>
        <p>{bad.size === 0 ? "Everything looks great." : `${bad.size} song${bad.size !== 1 ? "s" : ""} need attention`}</p>
      </div>

      <div className="hl-grid">
        {cards.map(({ k, label, n, Icon, action }) => (
          <div key={k} className={`hl-card${n === 0 ? " ok" : ""}`}>
            <span className="hl-ico">{n === 0 ? <Check size={17} /> : <Icon size={17} />}</span>
            <b className="hl-n">{n}</b>
            <span className="hl-label">{label}</span>
            {n === 0 ? <span className="hl-clear">All clear</span>
              : <button className="hl-act" onClick={() => { if (k === "dups") seedDups(); setOpen(k); }}>{action}</button>}
          </div>
        ))}
      </div>

      <button className="on-cta hl-all" disabled={bad.size === 0} onClick={fixEverything}><Sparkles size={16} /> Fix everything</button>
      {!canFix && bad.size > 0 && <p className="on-note center">Titles are cleaned on your phone. Tags and covers need the online lookup in Settings.</p>}

      {cur && (
        <Sheet title={cur.label} sub={`${list.length || dups.length} to look at`} onClose={() => setOpen(null)}
          footer={cur.k === "dups" ? (
            <button className="on-cta danger" disabled={!removeSel.size} onClick={() => { onRemoveIds([...removeSel]); pushToast?.(`Removed ${removeSel.size} from your library`); setRemoveSel(new Set()); setOpen(null); }}><Trash2 size={15} /> Remove {removeSel.size} selected</button>
          ) : cur.k === "missing" ? (
            <button className="on-cta danger" onClick={() => { onRemoveIds(missing.map(t => t.id)); pushToast?.("Removed songs that are no longer on your phone"); setOpen(null); }}><Trash2 size={15} /> Remove from library</button>
          ) : cur.k === "rawTitles" ? (
            <button className="on-cta" onClick={() => { onCleanTitles(); setOpen(null); }}><Sparkles size={15} /> Clean up titles</button>
          ) : canFix ? (
            <button className="on-cta" onClick={() => { onFix(list.slice(0, 300).map(t => t.id)); setOpen(null); }}><Wand2 size={15} /> Fix online ({Math.min(300, list.length)})</button>
          ) : (
            <button className="on-pill" onClick={() => { setOpen(null); onOpenSettings(); }}><Cloud size={14} /> Turn on online lookup to fix these</button>
          )}>
          {cur.k === "dups" ? (
            <>
              <p className="on-note">Only the entries in Reel are removed. Your audio files stay on the phone.</p>
              {dups.map(g => (
                <div key={g.key} className="on-card">
                  {g.tracks.map(t => (
                    <button key={t.id} className="on-dup-row" onClick={() => setRemoveSel(s => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}>
                      <Circle on={removeSel.has(t.id)} />
                      <Thumb track={t} size={44} />
                      <span className="on-fix-txt"><b>{t.title}</b><i>{t.artist} · {fmtDur(t.duration)}{t.art ? " · has cover" : ""}</i></span>
                    </button>
                  ))}
                </div>
              ))}
            </>
          ) : (
            <div className="on-card plain">
              {list.slice(0, 200).map(t => (
                <div key={t.id} className="on-dup-row static">
                  <Thumb track={t} size={44} />
                  <span className="on-fix-txt"><b>{t.title}</b><i>{t.artist}{t.album && !/local files/i.test(t.album) ? ` · ${t.album}` : ""}</i></span>
                </div>
              ))}
              {list.length > 200 && <p className="on-note">…and {list.length - 200} more</p>}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

/* =====================================================================
   7. Free music (Audius · Internet Archive · Jamendo) — streamed, never downloaded
   ===================================================================== */
export function DiscoverPage({ onBack, onPlayRemote, onOpenSettings }) {
  const o = useOnline();
  const [src, setSrc] = useState("audius");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(null);       // archive item expanded
  const [openTracks, setOpenTracks] = useState([]);

  if (!(o.enabled && o.features.freeMusic)) {
    return (<><div className="m-head">{onBack && <button className="m-back" onClick={onBack} aria-label="Back to More"><ChevronLeft size={22} /></button>}<div><h1>Free music</h1></div></div><NeedsFeature name="freeMusic" what="Free music" onOpenSettings={onOpenSettings} /></>);
  }
  const search = async (e) => {
    e?.preventDefault();
    const query = q.trim(); if (!query) return;
    setBusy(true); setErr(""); setResults(null); setOpen(null);
    try {
      if (src === "audius") setResults(await audiusSearch(query));
      else if (src === "jamendo") setResults(await jamendoSearch(o.keys.jamendo, query));
      else setResults(await archiveSearch(query));
    } catch (ex) { setErr(ex?.message || "Couldn't reach that service"); }
    setBusy(false);
  };
  const expand = async (item) => {
    if (open?.identifier === item.identifier) { setOpen(null); return; }
    setOpen(item); setOpenTracks([]); setBusy(true);
    try { setOpenTracks(await archiveTracks(item)); } catch (ex) { setErr(ex?.message || "Couldn't open that item"); }
    setBusy(false);
  };
  const tracks = src === "archive" ? openTracks : results || [];

  return (
    <>
      <div className="m-head">{onBack && <button className="m-back" onClick={onBack} aria-label="Back to More"><ChevronLeft size={22} /></button>}<div><h1>Free music</h1><p>Streamed from the internet · nothing is saved to your phone</p></div></div>
      <div className="m-seg">
        {[["audius", "Audius"], ["archive", "Archive"], ["jamendo", "Jamendo"]].map(([k, l]) => (
          <button key={k} className={src === k ? "on" : ""} onClick={() => { setSrc(k); setResults(null); setOpen(null); setErr(""); }}>{l}</button>
        ))}
      </div>
      <form className="on-search" onSubmit={search}>
        <Search size={17} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={src === "archive" ? "Search free & public-domain audio" : "Search artists or songs"} enterKeyHint="search" />
        <button type="submit" className="on-mini" disabled={busy || !q.trim()}>{busy ? <Loader2 size={14} className="on-spin" /> : "Go"}</button>
      </form>
      {err && <p className="on-error"><AlertTriangle size={14} /> {err}</p>}
      {src === "jamendo" && !o.keys.jamendo && <p className="on-note">Jamendo needs a free client ID — add it in Settings → Online features → Free music.</p>}

      {src === "archive" && results && (
        <div className="on-card plain">
          {results.length === 0 && <p className="on-note">No free-licensed audio matched that search.</p>}
          {results.map(item => (
            <div key={item.identifier}>
              <button className="on-dup-row" onClick={() => expand(item)}>
                <span className="on-thumb" style={{ width: 46, height: 46, backgroundImage: `url(https://archive.org/services/img/${encodeURIComponent(item.identifier)})` }} />
                <span className="on-fix-txt"><b>{item.title}</b><i>{item.creator}</i></span>
                <ChevronRight size={17} className={open?.identifier === item.identifier ? "on-rot" : ""} />
              </button>
              {open?.identifier === item.identifier && (
                <div className="on-sub-list">
                  {busy && <p className="on-note"><Loader2 size={13} className="on-spin" /> Loading tracks…</p>}
                  {openTracks.map((t, i) => (
                    <button key={t.id} className="on-dup-row sm" onClick={() => onPlayRemote(openTracks, i)}>
                      <Play size={14} /> <span className="on-fix-txt"><b>{t.title}</b><i>{fmtDur(t.duration)}</i></span>
                    </button>
                  ))}
                  {!busy && openTracks.length === 0 && <p className="on-note">No MP3 files in this item.</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {src !== "archive" && results && (
        <div className="on-card plain">
          {results.length === 0 && <p className="on-note">No results.</p>}
          {results.map((t, i) => (
            <button key={t.id} className="on-dup-row" onClick={() => onPlayRemote(results, i)}>
              <Thumb track={t} size={48} />
              <span className="on-fix-txt"><b>{t.title}</b><i>{t.artist}{t.duration ? ` · ${fmtDur(t.duration)}` : ""}</i></span>
              <span className="on-play"><Play size={15} fill="currentColor" /></span>
            </button>
          ))}
        </div>
      )}
      {!results && !busy && <p className="on-note center">Audius streams independent artists. The Internet Archive and Jamendo carry Creative-Commons and public-domain music. Licences are shown with each track.</p>}
      <p className="on-credit">Audius · Internet Archive · Jamendo — music remains property of its creators; licences vary per track.</p>
      <span className="on-hidden">{tracks.length}</span>
    </>
  );
}

/* =====================================================================
   8. Import a playlist (text list, Reel code, Deezer / ListenBrainz link) → match to local files
   ===================================================================== */
export function ImportSheet({ library, onCreate, onClose }) {
  const o = useOnline();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [rows, setRows] = useState(null);

  const read = async () => {
    setBusy(true); setErr(""); setRows(null);
    try {
      if (/https?:\/\//i.test(text) && !text.includes("\n") && !(o.enabled && o.features.playlistImport)) {
        throw new Error("Reading playlist links needs “Playlist links” switched on in Settings → Online features. You can also paste the list of songs.");
      }
      const list = await readPlaylistInput(text);
      const m = matchWanted(list.tracks, library).map(r => ({ ...r, use: !!r.track }));
      setName(list.name); setRows(m);
    } catch (e) { setErr(e?.message || "Couldn't read that"); }
    setBusy(false);
  };
  const matched = rows ? rows.filter(r => r.track) : [];
  const picked = rows ? rows.filter(r => r.use && r.track) : [];

  return (
    <Sheet title="Import a playlist" sub={rows ? `${matched.length} of ${rows.length} songs found in your library` : "Paste a song list, a Reel code, or a Deezer / ListenBrainz link"} onClose={onClose}
      footer={rows ? <button className="on-cta" disabled={!picked.length} onClick={() => { onCreate(name.trim() || "Imported playlist", picked.map(r => r.track.id)); onClose(); }}>Create playlist · {picked.length} song{picked.length !== 1 ? "s" : ""}</button> : <button className="on-cta" disabled={!text.trim() || busy} onClick={read}>{busy ? <Loader2 size={16} className="on-spin" /> : "Read & match"}</button>}>
      {!rows && (
        <>
          <textarea className="on-area" rows={8} value={text} onChange={e => setText(e.target.value)} spellCheck={false}
            placeholder={"Artist - Title\nThe Weeknd - Blinding Lights\n…or paste a link"} />
          {err && <p className="on-error"><AlertTriangle size={14} /> {err}</p>}
          <p className="on-note">Only the names are read and matched against songs already on your phone. Nothing is downloaded.</p>
        </>
      )}
      {rows && (
        <>
          <input className="on-input" value={name} onChange={e => setName(e.target.value)} placeholder="Playlist name" />
          {rows.map((r, i) => (
            <button key={i} className={`on-fix-row${r.track ? "" : " miss"}`} disabled={!r.track} onClick={() => setRows(rows.map((x, j) => j === i ? { ...x, use: !x.use } : x))}>
              {r.track ? <Circle on={r.use} /> : <span className="on-miss"><X size={14} /></span>}
              <span className="on-fix-txt">
                <b>{r.wanted.title}</b><i>{r.wanted.artist || "—"}</i>
                {r.track ? <em className="ok">✓ {r.track.title} — {r.track.artist}</em> : <em>Not in your library</em>}
              </span>
            </button>
          ))}
        </>
      )}
    </Sheet>
  );
}

/* =====================================================================
   3 + 9 + 5. Artist extras: bio, photo, discography matched to the library, similar artists
   ===================================================================== */
export function ArtistExtras({ artistName, hasPhoto, onUsePhoto, tracks, onOpenArtist, existingArtists }) {
  const o = useOnline();
  const [wiki, setWiki] = useState(null);
  const [disc, setDisc] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [state, setState] = useState("idle");
  const [more, setMore] = useState(false);
  const [photos, setPhotos] = useState([]);       // [{ source, data }] — Deezer / TheAudioDB, never Wikipedia
  const bios = o.enabled && o.features.artistBios, sim = o.enabled && o.features.similar && !!o.keys.lastfm;

  useEffect(() => {
    let dead = false;
    setWiki(null); setDisc(null); setSimilar([]); setMore(false); setPhotos([]);
    if (!artistName || unknownArtist(artistName) || !(bios || sim)) { setState("idle"); return; }
    setState("loading");
    (async () => {
      try {
        if (bios) {
          const nm = searchNameFor(artistName);
          const w = await wikiArtist(nm).catch(() => null); if (!dead) setWiki(w);
          let d = await mbDiscography(nm).catch(() => null);
          if (!d || !d.albums?.length) d = await deezerDiscography(nm).catch(() => null) || d;
          if (!dead) setDisc(d);
          const opts = await artistPhotoOptions(nm).catch(() => []);
          for (const o2 of opts) {
            try { const data = await fetchArtistPhoto(o2.url, 320); if (dead) return; setPhotos(p => [...p, { source: o2.source, data }]); } catch { /* skip this one */ }
          }
        }
        if (sim) { const s = await lastfmSimilar(o.keys.lastfm, artistName).catch(() => []); if (!dead) setSimilar(s); }
        if (!dead) setState("done");
      } catch { if (!dead) setState("error"); }
    })();
    return () => { dead = true; };
  }, [artistName, bios, sim, o.keys.lastfm]);

  if (!(bios || sim) || unknownArtist(artistName)) return null;
  const albumNames = (tracks || []).map(t => norm(t.album)).filter(Boolean);
  const inLib = (title) => albumNames.some(a => a === norm(title) || similarity(a, title) >= 0.85);
  const have = disc?.albums?.filter(a => inLib(a.title)).length || 0;

  return (
    <div className="on-artist">
      {state === "loading" && <p className="on-note"><Loader2 size={13} className="on-spin" /> Loading from the internet…</p>}
      {wiki && (
        <div className="on-card">
          <div className="on-card-title">About {artistName}</div>
          {wiki.description && <p className="on-desc">{wiki.description}</p>}
          <p className={`on-bio${more ? " open" : ""}`}>{wiki.extract}</p>
          <div className="on-bio-actions">
            <button className="on-link btn" onClick={() => setMore(m => !m)}>{more ? "Show less" : "Read more"}</button>
          </div>
          <a className="on-credit link" href={wiki.url} target="_blank" rel="noopener noreferrer">Wikipedia · CC BY-SA 4.0 <ExternalLink size={11} /></a>
        </div>
      )}
      {photos.length > 0 && (
        <div className="on-card">
          <div className="on-card-title">{hasPhoto ? "Change photo" : "Artist photo"}</div>
          <div className="on-tags">
            {photos.map(p => (
              <button key={p.source} className="on-photo-pick" onClick={() => onUsePhoto(p.data)} aria-label={`Use ${p.source} photo`}>
                <span style={{ backgroundImage: `url(${p.data})` }} /><i>{p.source}</i>
              </button>
            ))}
          </div>
          <p className="on-credit">Tap a photo to use it instead · Deezer / TheAudioDB</p>
        </div>
      )}
      {disc && disc.albums.length > 0 && (
        <div className="on-card">
          <div className="on-card-title">Albums <span>{have} of {disc.albums.length} in your library</span></div>
          <div className="on-disc">
            {disc.albums.slice(0, 30).map(a => (
              <div key={a.id} className={`on-disc-row${inLib(a.title) ? " have" : ""}`}>
                <span>{a.title}</span><i>{a.year || ""}</i>{inLib(a.title) && <Check size={14} />}
              </div>
            ))}
          </div>
          <p className="on-credit">Album list: {disc.source === "Deezer" ? "Deezer" : "MusicBrainz (CC0)"}</p>
        </div>
      )}
      {similar.length > 0 && (
        <div className="on-card">
          <div className="on-card-title">Similar artists</div>
          <div className="on-tags">
            {similar.map(n => {
              const mine = existingArtists?.has(n);
              return <button key={n} className={`on-tag${mine ? " mine" : ""}`} disabled={!mine} onClick={() => mine && onOpenArtist(n)}>{n}</button>;
            })}
          </div>
          <p className="on-credit">Powered by Last.fm{existingArtists ? " · highlighted ones are in your library" : ""}</p>
        </div>
      )}
      {state === "done" && !wiki && !disc && similar.length === 0 && <p className="on-note">Nothing found online for this artist.</p>}
    </div>
  );
}

/* =====================================================================
   6. Recommendations — built only from the user's own listening (offline)
   ===================================================================== */
export function RecommendationsCard({ recs, onPlay }) {
  // stays closed (or open) the way the user left it
  const [open, setOpen] = useState(() => { try { return localStorage.getItem("reel-picks-open") !== "0"; } catch { return true; } });
  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem("reel-picks-open", n ? "1" : "0"); } catch { /* ignore */ } return n; });
  if (!recs.length) return null;
  return (
    <div className="on-recs">
      <button className="on-recs-head" onClick={toggle}>
        <span><Sparkles size={16} /> Picked for you</span><ChevronRight size={16} className={open ? "on-rot" : ""} />
      </button>
      {open && recs.map(({ track, reason }) => (
        <button key={track.id} className="on-dup-row" onClick={() => onPlay(track, recs.map(r => r.track.id))}>
          <Thumb track={track} size={46} />
          <span className="on-fix-txt"><b>{track.title}</b><i>{reason}</i></span>
          <span className="on-play"><Play size={15} fill="currentColor" /></span>
        </button>
      ))}
    </div>
  );
}
export { featureOn, getOnline, setOnline, Copy };


/* =====================================================================
   Artist photos for the whole library (Deezer first, TheAudioDB as fallback) — review before applying
   ===================================================================== */
export function ArtistPhotosSheet({ library, artistPhotos, setArtistPhotos, onClose, pushToast }) {
  const o = useOnline();
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [items, setItems] = useState([]);              // [{ name, data, source, apply }]
  const [error, setError] = useState("");
  const stop = useRef(false);
  const todo = useMemo(() => artistsMissingPhotos(library, artistPhotos).slice(0, 120), [library, artistPhotos]);
  useEffect(() => () => { stop.current = true; }, []);
  if (!(o.enabled && o.features.artistBios)) return <Sheet title="Artist photos" onClose={onClose}><NeedsFeature name="artistBios" what="Artist photos" /></Sheet>;

  const run = async () => {
    stop.current = false; setPhase("scanning"); setError(""); setItems([]);
    setProgress({ done: 0, total: todo.length });
    const found = [];
    try {
      if (!(await probeOnline())) throw new Error("Couldn't reach the photo sources. Check your connection and try again.");
      for (let i = 0; i < todo.length; i++) {
        if (stop.current) return;
        const { name } = todo[i];
        try {
          const opts = await artistPhotoOptions(searchNameFor(name));
          for (const op of opts) {
            try { const data = await fetchArtistPhoto(op.url, 320); found.push({ name, data, source: op.source, apply: true }); break; } catch { /* next source */ }
          }
        } catch { /* this artist only */ }
        setProgress({ done: i + 1, total: todo.length });
        setItems([...found]);
      }
      setPhase("review");
    } catch (e) { setError(e?.message || "Couldn't reach the photo sources"); setPhase("idle"); }
  };
  const apply = () => {
    const chosen = items.filter(i => i.apply);
    setArtistPhotos(prev => { const n = { ...prev }; chosen.forEach(i => { if (!n[i.name]) n[i.name] = i.data; }); return n; });
    pushToast?.(`Added ${chosen.length} artist photo${chosen.length !== 1 ? "s" : ""}`);
    onClose();
  };
  const chosenCount = items.filter(i => i.apply).length;

  return (
    <Sheet title="Artist photos" sub={phase === "review" ? `${items.length} found — nothing changes until you apply` : undefined} onClose={onClose}
      footer={phase === "review" && items.length > 0 ? <button className="on-cta" onClick={apply} disabled={!chosenCount}>Add {chosenCount} photo{chosenCount !== 1 ? "s" : ""}</button> : null}>
      {phase === "idle" && (
        <div className="on-empty">
          <span className="on-empty-ico"><Wand2 size={22} /></span>
          <b>{todo.length ? `${todo.length} artist${todo.length !== 1 ? "s" : ""} without a photo` : "Every artist already has a photo"}</b>
          <p>Reel looks up a proper artist picture on Deezer (and TheAudioDB if Deezer has none). With automatic photos on in Settings this happens by itself; use this to review them. You can change any photo on its artist page.</p>
          {error && <p className="on-error"><AlertTriangle size={14} /> {error}</p>}
          {todo.length > 0 && <button className="on-cta" onClick={run}>Find photos</button>}
        </div>
      )}
      {phase === "scanning" && (
        <div className="on-progress">
          <Loader2 size={20} className="on-spin" /> <b>Finding photos…</b>
          <div className="on-bar"><div style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
          <span>{progress.done} of {progress.total} · {items.length} found</span>
          <button className="on-pill" onClick={() => { stop.current = true; setPhase(items.length ? "review" : "idle"); }}>{items.length ? "Stop and review" : "Cancel"}</button>
        </div>
      )}
      {phase === "review" && items.length === 0 && <div className="on-empty"><b>No photos found</b><p>These artists aren't on Deezer or TheAudioDB under that exact name.</p></div>}
      {phase === "review" && (
        <div className="on-photo-grid">
          {items.map((it, idx) => (
            <button key={it.name} className={`on-photo-cell${it.apply ? " on" : ""}`} onClick={() => setItems(items.map((x, i) => i === idx ? { ...x, apply: !x.apply } : x))}>
              <span className="on-photo-img" style={{ backgroundImage: `url(${it.data})` }}>{it.apply && <Check size={16} strokeWidth={3.2} />}</span>
              <b>{it.name}</b><i>{it.source}</i>
            </button>
          ))}
        </div>
      )}
      <p className="on-credit">Photos: Deezer · TheAudioDB — images belong to their owners</p>
    </Sheet>
  );
}
