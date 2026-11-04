import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Loader2, Search, Plus, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume2, Volume1, VolumeX, Heart, ListMusic, Disc3, Settings, Music2, X,
  ChevronDown, Trash2, Library, ImageIcon, Radio,
  FolderOpen, Check, Clock, Pencil, Camera, CheckSquare, ListPlus, ListEnd, Flame, Sun, ArrowUp, ArrowDown,
  Mic2, Upload, FileText, Hand, Users, User, Trophy, Timer, Tags, BarChart3,
  Zap, Wind, Leaf, CloudRain, Target, GripVertical, Award, Lock,
  TrendingUp, TrendingDown, Minus, Sparkles, Headphones, Star, Medal, Gem, Crown, Rocket, Download, LayoutGrid, List, Share2, Copy, MoreHorizontal, ChevronLeft, ChevronRight, Wand2
} from "lucide-react";
import { OnlineSettings, PlaybackSettings } from "./online/ui-settings.jsx";
import { FixSheet, ArtistPhotosSheet, HealthPage, ImportSheet, ArtistExtras, RecommendationsCard, shareText, playlistShareText } from "./online/ui-tools.jsx";
import { ExplorePage } from "./online/explore.jsx";
import { dominantColorsCached } from "./dominantColor.js";
import { enrichLibrary, buildGroups, mosaicCover, pendingEnrichment, MIN_GROUP } from "./online/suggest.js";
import { useOnline, featureOn, getOnline } from "./online/settings.js";
import { buildRecommendations } from "./online/match.js";
import { findLyricsFor } from "./online/lyrics.js";
import { useScrobbler } from "./online/scrobble.js";
import { useAutoArtistPhotos } from "./online/autophoto.js";
import { artSaved, isHeavy, artGetAll, persistMissing } from "./artstore.js";
import { lightArt } from "./lightart.js";
import { cleanTrack, needsCleaning, matchesTrack, matchesText, matchScore, highlightParts, setFeatIn, fold } from "./titleClean.js";
import "./polish.css";

/* ============================================================
   DESIGN TOKENS — ported directly from the Reel design system
   ============================================================ */
const ACCENTS = {
  amber:  { name: "Amber",  hex: "#E8A33D" },
  cyan:   { name: "Cyan",   hex: "#3DC3E8" },
  purple: { name: "Purple", hex: "#A876E8" },
  green:  { name: "Green",  hex: "#5CD98A" },
  red:    { name: "Red",    hex: "#E8615D" },
  // Milestone rewards — each is locked until that listening-time tier is
  // reached (see MILESTONE_META, which points back at these keys). The five
  // colors above stay free so nobody loses a color they already picked.
  moonlight: { name: "Moonlight", hex: "#A9B8CC", unlockHours: 1 },
  ember:     { name: "Ember",     hex: "#F97C2B", unlockHours: 5 },
  sunbeam:   { name: "Sunbeam",   hex: "#F0D03A", unlockHours: 10 },
  lime:      { name: "Lime",      hex: "#A4DE45", unlockHours: 25 },
  lagoon:    { name: "Lagoon",    hex: "#2FD4BC", unlockHours: 50 },
  sapphire:  { name: "Sapphire",  hex: "#4F8CFF", unlockHours: 100 },
  fuchsia:   { name: "Fuchsia",   hex: "#F063C8", unlockHours: 250 },
  rose:      { name: "Rose",      hex: "#F46A94", unlockHours: 500 },
  indigo:    { name: "Indigo",    hex: "#7B6BFF", unlockHours: 1000 },
};
const FREE_ACCENT_KEYS = Object.keys(ACCENTS).filter(k => !ACCENTS[k].unlockHours);
const REWARD_ACCENT_KEYS = Object.keys(ACCENTS).filter(k => ACCENTS[k].unlockHours);

function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

/* Chrome's default UA stylesheet puts an 8px margin on <body>, which on top
   of .reel-root's height:100vh pushes total document height past the
   viewport by 16px — just enough to trigger a native outer scrollbar on the
   whole window (visible as a stray scrollbar past the app's own rounded
   edge, since it belongs to the document, not .reel-root). Zeroing it out
   removes that scrollbar entirely rather than just re-skinning it. */
html, body {
  margin: 0; padding: 0; height: 100%; overflow: hidden;
  scrollbar-width: thin; scrollbar-color: #26262C transparent;
}
body::-webkit-scrollbar { width: 9px; height: 9px; }
body::-webkit-scrollbar-track { background: transparent; }
body::-webkit-scrollbar-thumb { background: #26262C; border-radius: 5px; }
#root { height: 100%; }

:root {
  --bg: #0D0D10;
  --surface: #17171B;
  --surface-2: #1E1E23;
  --line: #26262C;
  --text: #EDEDED;
  --text-dim: #8A8A93;
  --text-faint: #55555D;
  --accent: #E8A33D;
  --accent-dim: rgba(232,163,61,0.18);
  --accent-glow: rgba(232,163,61,0.35);
  --ease: cubic-bezier(.4,0,.2,1);
}

.reel-root * { box-sizing: border-box; }
.reel-root {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg);
  color: var(--text);
  width: 100%;
  height: 100vh;
  min-height: 640px;
  display: flex;
  overflow: hidden;
  position: relative;
  border-radius: 10px;
  border: 1px solid var(--line);
}
.reel-root .mono { font-family: 'JetBrains Mono', monospace; }

/* Every scrollable pane in the app used the OS's native scrollbar, which on
   Windows renders as a wide, flat white track+thumb that clashes hard with
   the dark UI. Styling it here (both the modern scrollbar-* properties and
   the WebKit/Chromium pseudo-elements the WebView renders) replaces it
   everywhere at once with a slim, theme-colored one. */
.reel-root * {
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
.reel-root *::-webkit-scrollbar { width: 9px; height: 9px; }
.reel-root *::-webkit-scrollbar-track { background: transparent; }
.reel-root *::-webkit-scrollbar-thumb { background: var(--line); border-radius: 5px; border: 2px solid transparent; background-clip: padding-box; }
.reel-root *::-webkit-scrollbar-thumb:hover { background: var(--text-faint); background-clip: padding-box; }
.reel-root *::-webkit-scrollbar-corner { background: transparent; }

@media (prefers-reduced-motion: reduce) {
  .reel-root * { transition: none !important; animation: none !important; }
}

/* ---------- Sidebar ---------- */
.sidebar {
  width: 210px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  padding: 18px 12px;
}
.brand {
  display: flex; align-items: center; gap: 9px;
  padding: 4px 8px 22px 8px;
}
.brand-mark {
  width: 22px; height: 22px; border-radius: 5px;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center;
  color: #0D0D10;
  transition: background .25s var(--ease);
}
.brand-name { font-weight: 700; font-size: 15px; letter-spacing: 0.2px; }

.nav-group { display: flex; flex-direction: column; gap: 2px; position: relative; }
.nav-indicator {
  position: absolute; left: 0; width: 3px; height: 22px; border-radius: 2px;
  background: var(--accent); transition: transform .25s var(--ease); pointer-events: none;
}
.nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 7px; height: 34px; box-sizing: border-box;
  font-size: 13.5px; font-weight: 500; color: var(--text-dim);
  cursor: pointer; user-select: none; border: none; background: transparent;
  transition: background .15s var(--ease), color .15s var(--ease), transform .1s var(--ease);
  width: 100%; text-align: left;
}
.nav-item:hover { background: var(--surface-2); color: var(--text); transform: translateX(2px); }
.nav-item:active { transform: scale(0.98); }
.nav-item.active { background: var(--accent-dim); color: var(--accent); }
.nav-item:focus-visible { outline: 1.5px solid var(--accent); outline-offset: 1px; }
.nav-count { margin-left: auto; font-size: 11px; color: var(--text-faint); }

.sidebar-divider { height: 1px; background: var(--line); margin: 14px 4px; }

.playlist-mini { display: flex; flex-direction: column; gap: 1px; overflow-y: auto; flex: 1; }
.playlist-mini::-webkit-scrollbar { width: 4px; }
.playlist-mini::-webkit-scrollbar-thumb { background: var(--line); border-radius: 4px; }

.sidebar-footer { margin-top: auto; padding-top: 10px; }

/* ---------- Main column ---------- */
.main-col { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.topbar {
  min-height: 58px; flex-shrink: 0;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 10px 20px; border-bottom: 1px solid var(--line);
}
.page-title { font-size: 15px; font-weight: 700; margin-right: 6px; white-space: nowrap; }
.search-box {
  display: flex; align-items: center; gap: 8px;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 7px; padding: 7px 10px; flex: 1; max-width: 300px; min-width: 140px;
  color: var(--text-dim);
  transition: border-color .18s var(--ease);
}
.search-box:focus-within { border-color: var(--accent); }
.search-box input {
  background: transparent; border: none; outline: none; color: var(--text);
  font-size: 13px; width: 100%;
}
.sort-select {
  background: var(--surface); border: 1px solid var(--line); border-radius: 7px;
  padding: 7px 8px; color: var(--text-dim); font-size: 12.5px; outline: none; cursor: pointer;
}
.sort-select:focus { border-color: var(--accent); }
.btn {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 12px; border-radius: 7px; font-size: 13px; font-weight: 600;
  border: 1px solid var(--line); background: var(--surface); color: var(--text);
  cursor: pointer; transition: background .15s var(--ease), border-color .15s var(--ease), transform .1s var(--ease), filter .1s var(--ease);
  white-space: nowrap;
}
.btn:hover { background: var(--surface-2); }
.btn:active:not(:disabled) { transform: scale(0.96); filter: brightness(0.94); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn:focus-visible { outline: 1.5px solid var(--accent); outline-offset: 1px; }
.btn-accent {
  background: var(--accent); border-color: var(--accent); color: #0D0D10;
}
.btn-accent:hover { filter: brightness(1.08); }
.btn-danger { color: #E8615D; border-color: rgba(232,97,93,0.35); }
.btn-danger:hover { background: rgba(232,97,93,0.12); }
.btn-icon {
  width: 32px; height: 32px; padding: 0; justify-content: center;
  color: var(--text-dim); background: transparent; border: none;
}
.btn-icon:hover { color: var(--text); background: var(--surface-2); }
.btn-sm { padding: 5px 9px; font-size: 12px; }

.page-body { flex: 1; overflow-y: auto; padding: 6px 20px 20px; position: relative; }
.page-body::-webkit-scrollbar { width: 8px; }
.page-body::-webkit-scrollbar-thumb { background: var(--surface-2); border-radius: 8px; }
.page-fade { animation: pageFadeIn .22s var(--ease); }
@keyframes pageFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

/* ---------- Selection bar ---------- */
.selection-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  background: var(--accent-dim); border: 1px solid var(--accent-glow); border-radius: 9px;
  padding: 8px 12px; margin: 10px 0 14px; position: sticky; top: 0; z-index: 5;
  animation: barIn .18s var(--ease);
}
@keyframes barIn { from { opacity: 0; transform: translateY(-4px);} to { opacity: 1; transform: translateY(0);} }
.selection-bar .count { font-size: 12.5px; font-weight: 700; color: var(--accent); margin-right: 4px; }
.selection-bar .spacer { flex: 1; }

.popover-wrap { position: relative; }
.popover {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 40;
  background: var(--surface-2); border: 1px solid var(--line); border-radius: 9px;
  padding: 8px; min-width: 210px; box-shadow: 0 12px 30px rgba(0,0,0,0.4);
  animation: barIn .15s var(--ease);
}
.popover-item {
  display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px;
  font-size: 12.5px; color: var(--text); cursor: pointer; border: none; background: transparent; width: 100%; text-align: left;
}
.popover-item:hover { background: var(--surface); }
.popover-divider { height: 1px; background: var(--line); margin: 6px 2px; }
.popover input {
  background: var(--surface); border: 1px solid var(--line); border-radius: 6px;
  padding: 6px 8px; color: var(--text); font-size: 12.5px; width: 100%; outline: none;
}
.popover input:focus { border-color: var(--accent); }

/* ---------- Track table ---------- */
.track-table { width: 100%; border-collapse: collapse; }
.track-table thead th {
  text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.6px;
  color: var(--text-faint); font-weight: 600; padding: 10px 8px; border-bottom: 1px solid var(--line);
  position: sticky; top: 0; background: var(--bg); z-index: 1;
}
.track-row { cursor: pointer; }
.track-row td {
  padding: 8px; border-bottom: 1px solid rgba(38,38,44,0.5);
  font-size: 13px; color: var(--text-dim);
  transition: background .18s var(--ease), color .18s var(--ease);
  position: relative;
}
.track-row td:first-child::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px;
  background: var(--accent); transform: scaleY(0); transition: transform .15s var(--ease);
}
.track-row:hover td:first-child::before, .track-row.playing td:first-child::before { transform: scaleY(1); }
.track-row:hover td { background: var(--surface); }
.track-row.playing td { background: var(--accent-dim); color: var(--accent); overflow: hidden; }
.track-row.playing td::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(100deg, transparent 40%, var(--accent-glow) 50%, transparent 60%);
  background-size: 250% 100%; opacity: 0.55;
  animation: rowSweep 3.5s ease-in-out infinite;
}
@keyframes rowSweep { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
.track-row.selected td { background: rgba(232,163,61,0.08); }
@keyframes rowStaggerIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.row-stagger-in { animation: rowStaggerIn .3s var(--ease) backwards; }
.track-title-cell { display: flex; align-items: center; gap: 10px; }
.track-thumb {
  width: 32px; height: 32px; border-radius: 5px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.85);
  position: relative; overflow: hidden;
}
.thumb-breathing { animation: thumbBreathe 2.4s ease-in-out infinite; }
@keyframes thumbBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
.track-thumb .playing-bars { display: flex; gap: 2px; align-items: flex-end; height: 12px; }
.bar { width: 2.5px; height: 12px; background: #0D0D10; border-radius: 1px; transform-origin: bottom; will-change: transform; animation: barbounce 0.9s ease-in-out infinite; }
@keyframes barbounce { 0%,100%{transform:scaleY(.25);} 50%{transform:scaleY(1);} }
.track-title-text { display: flex; flex-direction: column; min-width: 0; }
.track-title-text .t { color: var(--text); font-weight: 500; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
.track-title-text .a { font-size: 11.5px; color: var(--text-faint); }
.track-title-text .a.clickable { cursor: pointer; width: fit-content; }
.track-title-text .a.clickable:hover { color: var(--accent); text-decoration: underline; }
.row-actions { display: flex; gap: 4px; opacity: 0; transition: opacity .15s var(--ease); }
.track-row:hover .row-actions { opacity: 1; }
.icon-btn {
  width: 26px; height: 26px; border: none; background: transparent; color: var(--text-faint);
  border-radius: 5px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
  transition: background .15s var(--ease), color .15s var(--ease), transform .1s var(--ease);
}
.icon-btn:hover { color: var(--text); background: var(--surface-2); }
.icon-btn:active { transform: scale(0.88); }
.icon-btn.favorited { color: var(--accent); }
.icon-btn.active { color: var(--accent); background: var(--accent-dim); position: relative; }
.sleep-timer-badge {
  position: absolute; bottom: -3px; right: -5px; background: var(--accent); color: #0D0D10;
  font-size: 9px; font-weight: 800; line-height: 1; padding: 2px 3px; border-radius: 5px; border: 1.5px solid var(--bg);
}
.heart-pop { animation: heartPop .5s var(--ease); position: relative; }
.heart-pop::after {
  content: ''; position: absolute; inset: -5px; border-radius: 50%;
  border: 2px solid var(--accent); pointer-events: none;
  animation: heartRing .5s var(--ease) forwards;
}
@keyframes heartPop { 0% { transform: scale(1); } 35% { transform: scale(1.4); } 60% { transform: scale(0.9); } 100% { transform: scale(1); } }
@keyframes heartRing { 0% { transform: scale(0.5); opacity: 0.85; } 100% { transform: scale(1.9); opacity: 0; } }
.check-cell { width: 30px; }
.rename-input {
  background: var(--surface-2); border: 1px solid var(--accent); border-radius: 5px;
  padding: 3px 6px; color: var(--text); font-size: 13px; width: 100%; outline: none;
}

.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 90px 20px; color: var(--text-faint); text-align: center; gap: 14px;
}
.empty-state h3 { color: var(--text-dim); font-size: 15px; font-weight: 600; margin: 0; }
.empty-state p { font-size: 12.5px; margin: 0; max-width: 320px; line-height: 1.6; }

/* ---------- Playlists ---------- */
.playlist-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(150px,1fr)); gap: 16px; padding-top: 8px;
}
.playlist-card {
  background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px;
  cursor: pointer; transition: transform .18s var(--ease), border-color .18s var(--ease);
}
.playlist-card:hover { transform: translateY(-2px); border-color: var(--text-faint); }
.playlist-cover {
  width: 100%; aspect-ratio: 1; border-radius: 7px; margin-bottom: 10px;
  display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.75);
  background-size: cover; background-position: center;
}
.playlist-card .name { font-size: 13px; font-weight: 600; color: var(--text); }
.playlist-card .count { font-size: 11px; color: var(--text-faint); margin-top: 2px; }
.new-playlist-card {
  border: 1.5px dashed var(--line); background: transparent;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; color: var(--text-faint); min-height: 168px; width: 100%;
  font-family: inherit; text-align: center; cursor: pointer;
  transition: border-color .18s var(--ease), color .18s var(--ease), background .18s var(--ease), transform .1s var(--ease);
}
.new-playlist-card:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); transform: translateY(-2px); }
.new-playlist-card:active { transform: translateY(0) scale(0.98); }
.new-playlist-icon {
  width: 40px; height: 40px; border-radius: 50%; border: 1.5px dashed currentColor;
  display: flex; align-items: center; justify-content: center;
}
.new-playlist-card .name { color: inherit; }

.playlist-hero {
  position: relative; border-radius: 14px; overflow: hidden; margin-bottom: 22px;
  border: 1px solid var(--line);
}
.playlist-hero-backdrop {
  position: absolute; inset: 0; background-size: cover; background-position: center;
  filter: blur(40px) saturate(1.4) brightness(0.5); transform: scale(1.2);
}
.playlist-hero-content {
  position: relative; display: flex; align-items: flex-end; gap: 20px;
  padding: 26px; background: linear-gradient(180deg, rgba(13,13,16,0.15), rgba(13,13,16,0.75) 70%);
}
.playlist-hero-cover {
  width: 148px; height: 148px; border-radius: 10px; flex-shrink: 0; position: relative;
  display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.75);
  background-size: cover; background-position: center; overflow: hidden;
  box-shadow: 0 16px 40px rgba(0,0,0,0.45);
}
.cover-upload-btn {
  position: absolute; inset: 0; background: rgba(0,0,0,0.45); opacity: 0; transition: opacity .15s var(--ease);
  display: flex; align-items: center; justify-content: center; color: #fff; cursor: pointer; border: none;
}
.playlist-hero-cover:hover .cover-upload-btn { opacity: 1; }
.playlist-hero-info { flex: 1; min-width: 0; }
.playlist-hero-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: rgba(237,237,237,0.65); font-weight: 700; }
.playlist-hero .playlist-hero-title {
  font-size: 34px; font-weight: 800; margin: 4px 0 6px; line-height: 1.1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
  color: #EDEDED; /* always sits on a dark image scrim regardless of app theme */
}
.playlist-hero-title-input {
  font-size: 30px; font-weight: 800; padding: 2px 8px; margin: 4px 0 6px; width: 80%;
}
.playlist-hero-meta { font-size: 12.5px; color: rgba(237,237,237,0.7); margin-bottom: 16px; }
.playlist-hero-actions { display: flex; align-items: center; gap: 12px; }
.playlist-hero-play {
  width: 46px; height: 46px; border-radius: 50%; background: var(--accent); color: #0D0D10;
  display: flex; align-items: center; justify-content: center; border: none; cursor: pointer;
  transition: transform .15s var(--ease), filter .15s var(--ease); flex-shrink: 0;
}
.playlist-hero-play:hover:not(:disabled) { transform: scale(1.06); filter: brightness(1.08); }
.playlist-hero-play:active:not(:disabled) { transform: scale(0.94); }
.playlist-hero-play:disabled { opacity: 0.4; cursor: not-allowed; }
.playlist-hero-shuffle {
  width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.14); color: var(--text);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: background .15s var(--ease), transform .1s var(--ease); flex-shrink: 0;
}
.playlist-hero-shuffle:hover:not(:disabled) { background: rgba(255,255,255,0.16); }
.playlist-hero-shuffle:active:not(:disabled) { transform: scale(0.9); }
.playlist-hero-shuffle:disabled { opacity: 0.4; cursor: not-allowed; }
.playlist-hero-secondary { display: flex; gap: 2px; margin-left: 6px; }
.playlist-hero-secondary .icon-btn { color: rgba(237,237,237,0.75); }
.playlist-hero-secondary .icon-btn:hover { color: var(--text); background: rgba(255,255,255,0.1); }

.favorites-hero {
  display: flex; align-items: flex-end; gap: 20px; padding: 26px; border-radius: 14px; margin-bottom: 22px;
  background: linear-gradient(135deg, rgba(232,97,93,0.22), rgba(232,97,93,0.05) 60%), var(--surface);
  border: 1px solid var(--line);
}
.favorites-hero-icon {
  width: 148px; height: 148px; border-radius: 10px; flex-shrink: 0;
  background: linear-gradient(135deg, #E8615D, #B8433F);
  display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.92);
  box-shadow: 0 16px 40px rgba(232,97,93,0.28);
}
.favorites-hero-play {
  width: 46px; height: 46px; border-radius: 50%; background: #E8615D; color: #fff;
  display: flex; align-items: center; justify-content: center; border: none; cursor: pointer;
  transition: transform .15s var(--ease), filter .15s var(--ease); flex-shrink: 0;
}
.favorites-hero-play:hover:not(:disabled) { transform: scale(1.06); filter: brightness(1.08); }
.favorites-hero-play:active:not(:disabled) { transform: scale(0.94); }
.favorites-hero-play:disabled { opacity: 0.4; cursor: not-allowed; }
.favorites-hero .playlist-hero-eyebrow { color: var(--text-faint); }
.favorites-hero .playlist-hero-title { color: var(--text); }
.favorites-hero .playlist-hero-meta { color: var(--text-dim); }

/* ---------- Library / Queue hero headers (matches Favorites' treatment) ---------- */
.library-hero, .queue-hero {
  display: flex; align-items: flex-end; gap: 20px; padding: 26px; border-radius: 14px; margin-bottom: 22px;
  background: linear-gradient(135deg, var(--accent-dim), rgba(255,255,255,0.02) 60%), var(--surface);
  border: 1px solid var(--line);
}
.library-hero-icon, .queue-hero-icon {
  width: 148px; height: 148px; border-radius: 10px; flex-shrink: 0; position: relative;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 45%, #0D0D10));
  display: flex; align-items: center; justify-content: center; color: rgba(13,13,16,0.85);
  box-shadow: 0 16px 40px var(--accent-dim);
}
.library-hero .playlist-hero-eyebrow, .queue-hero .playlist-hero-eyebrow { color: var(--text-faint); }
.library-hero .playlist-hero-title, .queue-hero .playlist-hero-title { color: var(--text); }
.library-hero .playlist-hero-meta, .queue-hero .playlist-hero-meta { color: var(--text-dim); }

/* ---------- Mood radio ---------- */
.queue-hero-icon.radio-pulse::before, .queue-hero-icon.radio-pulse::after {
  content: ""; position: absolute; inset: 0; border-radius: 10px; border: 2px solid var(--accent);
  animation: radioRing 1.1s ease-out;
  opacity: 0;
}
.queue-hero-icon.radio-pulse::after { animation-delay: .18s; }
@keyframes radioRing {
  0% { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(1.35); opacity: 0; }
}
.queue-hero-icon.radio-pulse svg { animation: radioIconPulse 1.1s ease; }
@keyframes radioIconPulse { 0%, 100% { transform: scale(1); } 40% { transform: scale(1.18); } }
.mood-radio-btn.pulsing { animation: radioBtnPulse 1.1s ease; }
@keyframes radioBtnPulse {
  0%, 100% { background: var(--surface); border-color: var(--line); color: var(--text-dim); }
  40% { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
}
.queue-row.row-stagger-in { animation: queueRowFadeIn .35s var(--ease) backwards; }
@keyframes queueRowFadeIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }

/* ---------- Artists ---------- */
.artist-card .playlist-cover.artist-avatar,
.artist-avatar {
  border-radius: 50%; overflow: hidden;
}
.artist-card .name { text-align: center; }
.artist-card { text-align: center; }
.artist-card .count { text-align: center; }
.top-artists-list { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 28px; }
.top-artist-circle {
  display: flex; flex-direction: column; align-items: center; gap: 8px; width: 96px;
  cursor: pointer; text-align: center;
}
.top-artist-circle-avatar-wrap { position: relative; }
.top-artist-circle .avatar {
  width: 76px; height: 76px; border-radius: 50%; background-size: cover; background-position: center;
  display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.75);
  border: 2px solid transparent; transition: border-color .18s var(--ease), transform .18s var(--ease);
}
.top-artist-circle:hover .avatar { border-color: var(--accent); transform: translateY(-2px); }
.top-artist-circle .rank {
  position: absolute; top: -4px; left: -4px; width: 22px; height: 22px; border-radius: 50%;
  background: var(--accent); color: #0D0D10; font-size: 11px; font-weight: 800;
  display: flex; align-items: center; justify-content: center; border: 2px solid var(--bg);
}
.top-artist-circle .name {
  font-size: 12.5px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 100%;
}
.top-artist-circle .plays {
  font-size: 10.5px; color: var(--text-faint); font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 3px;
}
.artists-section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.artists-section-header h4 { font-size: 13.5px; font-weight: 700; margin: 0; }

/* ---------- Stats page ---------- */
.stats-range-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
.stats-totw-btn { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; border-color: var(--accent); color: var(--accent); }
.stats-totw-btn:hover { background: var(--accent-dim); color: var(--accent); }
.stats-tab {
  padding: 7px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface);
  color: var(--text-dim); font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: background .15s var(--ease), color .15s var(--ease), border-color .15s var(--ease);
}
.stats-tab:hover { color: var(--text); }
.stats-tab.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
.stats-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
@media (max-width: 900px) { .stats-cards { grid-template-columns: repeat(2, 1fr); } }
.stats-card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.stats-card-label { font-size: 11.5px; color: var(--text-faint); font-weight: 600; margin-bottom: 6px; }
.stats-card-value { font-size: 22px; font-weight: 800; color: var(--text); font-family: 'JetBrains Mono', monospace; }
.stats-daily-chart {
  display: flex; align-items: flex-end; gap: 6px; height: 110px; margin-bottom: 28px;
  background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px 10px;
}
.stats-daily-bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 6px; }
.stats-daily-bar { width: 100%; max-width: 20px; background: var(--accent); border-radius: 3px 3px 0 0; transition: height .3s var(--ease); min-height: 3px; }
.stats-daily-label { font-size: 10px; color: var(--text-faint); font-weight: 600; }
.stats-top-list { display: flex; flex-direction: column; gap: 3px; margin-bottom: 28px; }
.stats-top-row {
  display: flex; align-items: center; gap: 12px; padding: 7px 10px; border-radius: 8px; cursor: pointer;
  transition: background .15s var(--ease);
}
.stats-top-row:hover { background: var(--surface); }
.stats-top-row .rank {
  width: 20px; flex-shrink: 0; font-size: 13px; font-weight: 800; font-family: 'JetBrains Mono', monospace;
  color: var(--text-faint); text-align: center;
}
.stats-top-row .plays { flex-shrink: 0; font-size: 11.5px; color: var(--text-dim); font-weight: 600; display: flex; align-items: center; gap: 4px; }
.compare-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
.compare-card {
  display: flex; flex-direction: column; gap: 10px;
  background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; margin-bottom: 28px;
}
.compare-line { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; color: var(--text); line-height: 1.4; }
.compare-icon { flex-shrink: 0; margin-top: 1px; }
.compare-icon.up { color: var(--accent); }
.compare-icon.down { color: var(--text-dim); }
.compare-icon.flat { color: var(--text-faint); }

/* Stats page layout — wraps each section in a distinct card so the page
   reads as a dashboard of panels instead of one long unbroken list, and
   pairs related panels side by side on wide windows. */
.stats-section { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px 20px; margin-bottom: 20px; }
.stats-section .artists-section-header { margin-bottom: 14px; }
.stats-section .stats-daily-chart, .stats-section .milestones-grid, .stats-section .stats-top-list, .stats-section .top-artists-list, .stats-section .compare-card { margin-bottom: 0; }
.stats-grid-2 { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; align-items: start; }
@media (max-width: 880px) { .stats-grid-2 { grid-template-columns: 1fr; } }

.milestones-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 12px; }
.milestone-badge {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
  padding: 14px 8px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface-2);
  color: var(--text-faint); transition: transform .15s var(--ease);
}
.milestone-badge .milestone-icon-ring {
  width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: var(--surface); color: var(--text-faint); border: 1px solid var(--line);
}
.milestone-badge .h { font-size: 12px; font-weight: 800; font-family: 'JetBrains Mono', monospace; }
.milestone-badge .milestone-reward { display: inline-flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 600; color: var(--text-faint); }
.milestone-badge .milestone-reward i { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.milestone-badge .n { font-size: 9.5px; font-weight: 600; text-align: center; line-height: 1.2; color: var(--text-faint); }
.milestone-badge.achieved { border-color: transparent; transform: translateY(-1px); }
.milestone-badge.achieved:hover { transform: translateY(-3px); }
.milestone-badge.achieved .h { color: var(--text); }
.milestone-badge.achieved .n { color: var(--text-dim); }

/* ---------- Milestone celebration modal ---------- */
.milestone-scrim { background: rgba(0,0,0,0.7); backdrop-filter: blur(2px); }
.milestone-modal-card {
  position: relative; width: 300px; max-width: 88vw; display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 40px 26px 30px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line);
  box-shadow: 0 30px 80px rgba(0,0,0,0.6); overflow: hidden;
  animation: recapIn .5s cubic-bezier(.2,1.2,.4,1) backwards;
}
.milestone-modal-close {
  position: absolute; top: -14px; right: -14px; background: var(--surface); border: 1px solid var(--line);
  border-radius: 50%; z-index: 3;
}
.milestone-modal-icon-ring {
  width: 84px; height: 84px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  margin-bottom: 6px; position: relative; z-index: 2;
  animation: milestonePop .6s cubic-bezier(.2,1.4,.4,1) .1s backwards;
}
@keyframes milestonePop { 0% { transform: scale(0.3); opacity: 0; } 70% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
.milestone-modal-eyebrow { position: relative; z-index: 2; font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); }
.milestone-modal-name { position: relative; z-index: 2; font-size: 19px; font-weight: 800; text-align: center; }
.milestone-modal-sub { position: relative; z-index: 2; font-size: 12.5px; color: var(--text-dim); text-align: center; }
.milestone-reward-box {
  position: relative; z-index: 2; display: flex; align-items: center; gap: 12px; width: 100%;
  margin-top: 10px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--line); text-align: left;
}
.milestone-reward-swatch { width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; }
.milestone-reward-eyebrow { font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); }
.milestone-reward-name { font-size: 13px; font-weight: 700; color: var(--text); margin-top: 1px; }
.milestone-modal-actions { position: relative; z-index: 2; display: flex; gap: 10px; margin-top: 12px; }
.milestone-confetti-piece {
  position: absolute; top: 46%; left: 50%; width: 7px; height: 7px; border-radius: 2px;
  opacity: 0; animation: milestoneConfetti 1.1s ease-out forwards;
}
@keyframes milestoneConfetti {
  0% { opacity: 1; transform: translate(-50%, -50%) rotate(0deg); }
  100% { opacity: 0; transform: translate(var(--tx), var(--ty)) rotate(var(--tr)); }
}

.artist-hero-avatar { border-radius: 50%; }
.album-section { margin: 26px 0 8px; }
.album-section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.album-section-cover {
  width: 34px; height: 34px; border-radius: 5px; background-size: cover; background-position: center;
  display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.7); flex-shrink: 0;
}
.album-section-header h4 { font-size: 13.5px; font-weight: 700; margin: 0; }
.album-section-header .count { font-size: 11.5px; color: var(--text-faint); }

/* ---------- Queue list ---------- */
.queue-list { display: flex; flex-direction: column; gap: 4px; }
.queue-row {
  display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 8px;
  background: var(--surface); border: 1px solid transparent;
  transition: border-color .15s var(--ease), background .15s var(--ease);
}
.queue-row:hover { border-color: var(--line); }
.queue-row.playing { background: var(--accent-dim); border-color: var(--accent-dim); color: var(--accent); }
.queue-row.selected { background: rgba(232,163,61,0.08); }
.queue-row.dragging { opacity: 0.4; }
.queue-row.drag-over { border-top: 2px solid var(--accent); }
.drag-handle { color: var(--text-faint); cursor: grab; display: flex; align-items: center; flex-shrink: 0; }
.drag-handle:active { cursor: grabbing; }
.track-row.dragging td { opacity: 0.4; }
.track-row.drag-over td { box-shadow: inset 0 2px 0 var(--accent); }
.queue-pos { width: 22px; font-size: 11px; color: var(--text-faint); text-align: center; display: flex; align-items: center; justify-content: center; }
.queue-time { font-size: 11.5px; color: var(--text-faint); font-variant-numeric: tabular-nums; }
.queue-actions { display: flex; gap: 2px; margin-left: 4px; }
.playlist-hero-shuffle.on { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

/* ---------- Recent page ---------- */
.recent-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
@media (max-width: 900px) { .recent-grid { grid-template-columns: 1fr; } }
.recent-box { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
.recent-box-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.recent-box-header h4 { font-size: 13.5px; font-weight: 700; margin: 0; flex: 1; }
.recent-row { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-radius: 6px; cursor: pointer; }
.recent-row:hover { background: var(--surface-2); }
.recent-rank { width: 18px; font-size: 11px; color: var(--text-faint); text-align: center; flex-shrink: 0; }
.recent-count { font-size: 11.5px; color: var(--text-faint); flex-shrink: 0; display: flex; align-items: center; gap: 4px; }

/* ---------- Player bar ---------- */
.library-notice-bar {
  display: flex; align-items: center; gap: 10px;
  background: var(--accent-dim); border-bottom: 1px solid var(--accent-glow);
  color: var(--accent); font-size: 12.5px; padding: 9px 20px; flex-shrink: 0; line-height: 1.5;
}
.library-notice-bar span { flex: 1; }

.playback-error-bar {
  display: flex; align-items: center; gap: 10px;
  background: rgba(232,97,93,0.12); border-top: 1px solid rgba(232,97,93,0.35);
  color: #E8615D; font-size: 12px; padding: 8px 16px; flex-shrink: 0;
}
.playback-error-bar span { flex: 1; }

.player-bar {
  height: 84px; flex-shrink: 0; border-top: 1px solid var(--line); background: var(--surface);
  display: flex; align-items: center; padding: 0 16px; gap: 16px;
}
.pb-track { display: flex; align-items: center; gap: 11px; width: 220px; flex-shrink: 0; cursor: pointer; }
.pb-art {
  width: 46px; height: 46px; border-radius: 6px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.8);
}
.pb-meta { min-width: 0; }
.pb-meta .t { font-size: 12.5px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pb-meta .a { font-size: 11px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pb-center { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
.pb-controls { display: flex; align-items: center; gap: 14px; }
.pb-play {
  width: 30px; height: 30px; border-radius: 50%; background: var(--accent); color: #0D0D10;
  display: flex; align-items: center; justify-content: center; border: none; cursor: pointer;
  transition: transform .15s var(--ease), filter .15s var(--ease);
}
.pb-play:hover { transform: scale(1.06); filter: brightness(1.08); }
.pb-play:active { transform: scale(0.92); }
.pb-ctrl { background: none; border: none; color: var(--text-dim); cursor: pointer; display: flex; align-items: center; transition: color .15s var(--ease), transform .1s var(--ease); }
.pb-ctrl:hover { color: var(--text); }
.pb-ctrl:active { transform: scale(0.85); }
.pb-ctrl.on { color: var(--accent); }
.pb-seek-row { display: flex; align-items: center; gap: 9px; width: 100%; max-width: 560px; }
.pb-time { font-size: 10.5px; color: var(--text-faint); width: 34px; text-align: center; flex-shrink: 0; }
.waveform-wrap { flex: 1; height: 28px; cursor: pointer; position: relative; }
.linear-seek-wrap { flex: 1; height: 28px; cursor: pointer; display: flex; align-items: center; }
.linear-seek-track { position: relative; width: 100%; height: 4px; background: var(--line); border-radius: 2px; }
.linear-seek-fill { position: absolute; top: 0; left: 0; height: 100%; border-radius: 2px; }
.linear-seek-thumb {
  position: absolute; top: 50%; width: 10px; height: 10px; border-radius: 50%;
  transform: translate(-50%, -50%); box-shadow: 0 0 0 3px var(--accent-dim);
}

.pb-right { width: 220px; flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: 14px; }
.volume-row { display: flex; align-items: center; gap: 7px; width: 100px; }
.volume-row input[type=range] { width: 80px; }
.volume-row.pulsing svg { animation: volumeIconPulse .3s var(--ease); }
@keyframes volumeIconPulse { 0% { transform: scale(1); } 40% { transform: scale(1.22); } 100% { transform: scale(1); } }

/* ---------- Volume HUD (transient overlay on change) ---------- */
.volume-hud {
  position: absolute; top: 22px; left: 50%; z-index: 45;
  transform: translateX(-50%) translateY(-10px); opacity: 0; pointer-events: none;
  display: flex; align-items: center; gap: 10px; padding: 10px 16px;
  background: rgba(23,23,27,0.92); border: 1px solid var(--line); border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0,0,0,0.45); backdrop-filter: blur(6px);
  transition: opacity .18s var(--ease), transform .18s var(--ease);
}
.volume-hud.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.volume-hud-track { width: 100px; height: 5px; border-radius: 3px; background: var(--line); overflow: hidden; }
.volume-hud-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width .12s var(--ease); }
.volume-hud-pct { font-size: 11.5px; font-weight: 600; color: var(--text-dim); width: 34px; text-align: right; font-variant-numeric: tabular-nums; }

input[type=range] {
  -webkit-appearance: none; appearance: none; height: 3px; background: var(--line); border-radius: 2px; outline: none;
}
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); cursor: pointer;
  box-shadow: 0 0 0 3px var(--accent-dim);
}

/* ---------- Now Playing overlay ---------- */
.now-playing {
  position: absolute; inset: 0; background: var(--bg); z-index: 20;
  display: flex; flex-direction: column;
  animation: npIn .32s var(--ease);
}
@keyframes npIn { from { opacity: 0; transform: translateY(8px);} to { opacity: 1; transform: translateY(0);} }
.np-top { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; flex-shrink: 0; }
.np-style-tabs { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 3px; }
.np-tab { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; border: none; background: transparent; color: var(--text-dim); font-size: 12px; font-weight: 600; cursor: pointer; transition: all .18s var(--ease); }
.np-tab.active { background: var(--accent-dim); color: var(--accent); }
.np-body { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; z-index: 1; overflow: hidden; }
.np-footer { position: relative; z-index: 1; padding: 20px 40px 30px; display: flex; flex-direction: column; align-items: center; gap: 16px; flex-shrink: 0; }
.np-meta { text-align: center; }
.np-meta .t { font-size: 20px; font-weight: 700; }
.np-meta .a { font-size: 13px; color: var(--text-dim); margin-top: 3px; }
.np-controls-row { width: 100%; display: flex; align-items: center; justify-content: center; }
.np-controls-spacer { flex: 1; }
.np-volume { flex: 1; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.np-volume input[type=range] { width: 100px; }
.np-volume.pulsing svg { animation: volumeIconPulse .3s var(--ease); }

/* Ambient glow behind the whole Now Playing overlay, colored from the
   current track's own art (or its placeholder-cover hue when there's no
   embedded art) — see npGlowColors(). Sits at z-index 0 under np-top/
   np-body/np-footer, which are explicitly lifted to z-index 1 since an
   absolutely-positioned sibling would otherwise paint above them. Remounted
   (via a track-id key) on every track change so it re-triggers the fade-in
   instead of visibly popping to a new color. */
.np-glow {
  position: absolute; inset: -10%; z-index: 0;
  filter: blur(90px); opacity: 0; pointer-events: none;
  animation: npGlowIn 1.1s ease forwards;
  transition: background 1.1s ease;
}
@keyframes npGlowIn { from { opacity: 0; } to { opacity: 1; } }

/* Now Playing mood-reaction row — tapping one updates the track's mood tag
   (see reactMood) and pops a little floating icon for feedback. */
.np-reaction-row { display: flex; gap: 8px; justify-content: center; }
.np-reaction-btn {
  position: relative; width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--line); background: var(--surface); color: var(--text-dim);
  cursor: pointer; transition: all .15s var(--ease);
}
.np-reaction-btn:hover { border-color: var(--text-faint); color: var(--text); transform: scale(1.08); }
.np-reaction-btn:active { transform: scale(0.92); }
.np-reaction-pop {
  position: absolute; top: 6px; left: 50%; pointer-events: none;
  animation: npReactionPop .85s ease-out forwards;
}
@keyframes npReactionPop {
  0% { opacity: 1; transform: translate(-50%, 0) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -30px) scale(1.5); }
}

/* Vinyl view */
.vinyl-stage { display: flex; align-items: center; justify-content: center; gap: 60px; }
.vinyl-ring-wrap { position: relative; width: 300px; height: 300px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.vinyl-progress-ring { position: absolute; inset: -20px; width: calc(100% + 40px); height: calc(100% + 40px); transform: rotate(-90deg); pointer-events: none; }
.vinyl-progress-track { fill: none; stroke: var(--line); stroke-width: 3; }
.vinyl-progress-fill { fill: none; stroke: var(--accent); stroke-width: 3; stroke-linecap: round; }
.vinyl-disc {
  width: 300px; height: 300px; border-radius: 50%;
  background: repeating-radial-gradient(circle, #111 0px, #111 2px, #0a0a0a 3px, #111 4px);
  border: 1px solid #2a2a2e;
  display: flex; align-items: center; justify-content: center;
  animation: spin 12s linear infinite;
  animation-play-state: paused;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.vinyl-disc.spinning { animation-play-state: running; }
@keyframes spin { to { transform: rotate(360deg); } }
.vinyl-label {
  width: 108px; height: 108px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.85);
  border: 3px solid #0D0D10; background-size: cover; background-position: center;
}
.tonearm { width: 8px; height: 160px; position: relative; }
.tonearm-body {
  width: 5px; height: 140px; background: linear-gradient(#3a3a40, #26262c); border-radius: 3px;
  position: absolute; top: 0; left: 0; transform-origin: top center;
  transform: rotate(12deg); transition: transform .5s var(--ease);
}
.tonearm-body.down { transform: rotate(34deg); }
.tonearm-head { width: 16px; height: 10px; background: #4a4a52; border-radius: 2px; position: absolute; bottom: -4px; left: -6px; }

/* Cover view */
.cover-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; perspective: 1200px; }
.cover-bg { position: absolute; inset: -40px; filter: blur(60px) saturate(1.3) brightness(0.55); transform: scale(1.1); background-size: cover; background-position: center; }
.cover-art-flip { position: relative; z-index: 1; transform-style: preserve-3d; animation: coverFlipIn .6s cubic-bezier(.2,.8,.3,1) backwards; }
@keyframes coverFlipIn {
  0% { transform: rotateY(90deg) scale(0.85); opacity: 0; }
  55% { transform: rotateY(-10deg) scale(1.02); opacity: 1; }
  100% { transform: rotateY(0deg) scale(1); opacity: 1; }
}
.cover-art-big {
  width: 300px; height: 300px; border-radius: 14px; position: relative;
  box-shadow: 0 30px 80px rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.85);
  background-size: cover; background-position: center;
  transition: transform .4s var(--ease);
}
.cover-art-big.breathing { animation: coverBreathe 3.2s ease-in-out infinite; }
@keyframes coverBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.025); } }

/* Spectrum view */
.spectrum-stage { width: 100%; max-width: 720px; height: 320px; padding: 0 40px; }

/* ---------- Lyrics ---------- */
.lyrics-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; color: var(--text-faint); text-align: center; padding: 40px 20px; height: 100%;
}
.lyrics-empty h3 { color: var(--text-dim); font-size: 15px; font-weight: 600; margin: 0; }
.lyrics-empty p { font-size: 12.5px; margin: 0; max-width: 320px; line-height: 1.6; }
.lyrics-empty-actions { display: flex; gap: 8px; margin-top: 4px; }

.lyrics-plain { width: 100%; max-width: 520px; height: 100%; overflow-y: auto; padding: 0 24px; }
.lyrics-plain-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
  position: sticky; top: 0; background: var(--bg); padding: 10px 0; z-index: 1;
}
.lyrics-plain-lines p { font-size: 15px; color: var(--text-dim); line-height: 2; margin: 0; }

.lyrics-badge {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
  padding: 3px 8px; border-radius: 20px; flex-shrink: 0;
}
.lyrics-badge.synced { background: rgba(92,217,138,0.16); color: #5CD98A; }
.lyrics-badge.unsynced { background: var(--surface-2); color: var(--text-faint); }

.lyrics-synced { width: 100%; max-width: 560px; height: 100%; overflow-y: auto; position: relative; }
.lyrics-export-btn { position: absolute; top: 10px; left: 10px; z-index: 2; }
.lyrics-share-btn { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 2; }
.lyrics-edit-btn { position: absolute; top: 10px; right: 10px; z-index: 2; }

/* ---------- Lyrics share card ---------- */
.modal-search { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; padding: 9px 12px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--line); color: var(--text-dim); }
.modal-search input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: var(--text); font-size: 13.5px; font-family: inherit; }
.share-modal { position: relative; display: flex; gap: 22px; align-items: stretch; max-height: 90vh; animation: recapIn .5s cubic-bezier(.2,1.2,.4,1) backwards; }
.share-pick { width: 360px; flex: none; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 18px 14px 14px; min-height: 0; }
.share-pick-head { padding: 0 6px 12px; }
.share-title { font-size: 17px; font-weight: 800; }
.share-sub { font-size: 12px; color: var(--text-dim); margin-top: 3px; }
.share-sub b { color: var(--accent); }
.share-lines { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; min-height: 0; max-height: 64vh; }
.share-line { display: flex; gap: 12px; align-items: flex-start; text-align: left; padding: 9px 10px; border-radius: 12px; border: 1px solid transparent; background: transparent; color: var(--text-dim); font-size: 14px; font-weight: 600; line-height: 1.35; cursor: pointer; transition: background .15s var(--ease), border-color .15s var(--ease), color .15s var(--ease), transform .1s var(--ease); }
.share-line:hover { background: var(--surface-2); color: var(--text); }
.share-line:active { transform: scale(0.99); }
.share-line.selected { background: var(--accent-dim); border-color: var(--accent); color: var(--text); }
.share-line.playing:not(.selected) { color: var(--text); }
.share-check { flex: none; width: 18px; height: 18px; margin-top: 1px; border-radius: 6px; border: 1.5px solid var(--text-faint); display: flex; align-items: center; justify-content: center; transition: background .15s var(--ease), border-color .15s var(--ease); }
.share-line.selected .share-check { background: var(--accent); border-color: var(--accent); color: #0D0D10; }
.share-preview { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.share-canvas { height: min(64vh, 620px); aspect-ratio: 1080 / 1350; width: auto; border-radius: 18px; box-shadow: 0 30px 70px rgba(0,0,0,.55); }
.share-empty { height: min(64vh, 620px); aspect-ratio: 1080 / 1350; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; border: 1.5px dashed var(--line); border-radius: 18px; color: var(--text-faint); font-size: 13px; text-align: center; padding: 0 30px; }
@media (max-width: 900px) { .share-modal { flex-direction: column; overflow-y: auto; } .share-pick { width: auto; } .share-lines { max-height: 22vh; } }

/* ---------- Repeat-one: loop counter, ring, bursts ---------- */
.pb-ctrl.repeat-btn { position: relative; width: 30px; height: 30px; justify-content: center; border-radius: 50%; padding: 0; }
.repeat-ring { position: absolute; inset: 0; border-radius: 50%; opacity: 0; transition: opacity .2s var(--ease); background: conic-gradient(var(--accent) var(--p, 0deg), color-mix(in srgb, var(--text) 14%, transparent) 0); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px)); mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px)); }
.repeat-btn.one .repeat-ring { opacity: 1; }
.repeat-icon { display: flex; position: relative; }
.repeat-icon.spin { animation: repeatSpin .65s cubic-bezier(.3,1.4,.5,1); }
@keyframes repeatSpin { 0% { transform: rotate(0) scale(1); } 45% { transform: rotate(200deg) scale(1.4); } 100% { transform: rotate(360deg) scale(1); } }
.repeat-badge { position: absolute; right: -9px; top: -8px; min-width: 20px; height: 17px; padding: 0 5px; border-radius: 999px; background: var(--accent); color: #0D0D10; font-size: 10px; font-weight: 800; line-height: 17px; text-align: center; box-shadow: 0 0 0 2px var(--bg); animation: repeatBadgePop .55s cubic-bezier(.2,1.7,.4,1); pointer-events: none; }
@keyframes repeatBadgePop { 0% { transform: scale(0); } 60% { transform: scale(1.5); } 100% { transform: scale(1); } }
.repeat-plus { position: absolute; left: 50%; top: -6px; font-size: 13px; font-weight: 800; color: var(--accent); pointer-events: none; animation: repeatPlus .95s ease-out forwards; }
@keyframes repeatPlus { 0% { opacity: 0; transform: translate(-50%, 0) scale(.6); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -30px) scale(1.15); } }
.loop-burst { position: absolute; left: 50%; top: 50%; width: 360px; height: 360px; margin: -180px 0 0 -180px; border-radius: 50%; border: 3px solid var(--accent); pointer-events: none; z-index: 3; animation: loopBurst 1.1s ease-out forwards; }
@keyframes loopBurst { 0% { transform: scale(.65); opacity: .85; } 100% { transform: scale(1.7); opacity: 0; } }
.loop-pill { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--accent); background: var(--accent-dim); color: var(--accent); font-size: 12px; font-weight: 700; cursor: pointer; animation: loopPillPop .5s cubic-bezier(.2,1.6,.4,1); transition: background .15s var(--ease); }
.loop-pill:hover { background: var(--accent); color: #0D0D10; }
@keyframes loopPillPop { 0% { transform: scale(.7); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .repeat-icon.spin, .repeat-badge, .repeat-plus, .loop-burst, .loop-pill { animation: none; } }

/* ---------- App toast stack (loop-streak, etc.) ---------- */
.app-toast-stack { position: fixed; right: 20px; bottom: 104px; z-index: 55; display: flex; flex-direction: column-reverse; gap: 8px; pointer-events: none; }
.app-toast {
  pointer-events: auto; display: flex; align-items: center; gap: 9px; max-width: 320px;
  background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px;
  font-size: 12.5px; color: var(--text); box-shadow: 0 12px 30px rgba(0,0,0,0.4);
  animation: appToastIn .3s var(--ease);
}
.app-toast .btn-icon { flex-shrink: 0; width: 20px; height: 20px; }
@keyframes appToastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* ---------- Idle ambient screensaver ---------- */
.idle-ambient {
  position: fixed; inset: 0; z-index: 45; background: var(--bg);
  display: flex; align-items: flex-end; justify-content: center; padding-bottom: 60px;
  cursor: pointer; opacity: 0; animation: idleAmbientFadeIn 2.5s ease forwards;
}
@keyframes idleAmbientFadeIn { from { opacity: 0; } to { opacity: 1; } }
.idle-ambient-glow {
  position: absolute; inset: -15%; filter: blur(120px); opacity: 0.6; pointer-events: none;
  animation: idleAmbientDrift 18s ease-in-out infinite alternate;
}
@keyframes idleAmbientDrift {
  0% { transform: translate(-3%, -2%) scale(1); }
  100% { transform: translate(3%, 2%) scale(1.08); }
}
.idle-ambient-meta {
  position: relative; z-index: 1; display: flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 600; color: var(--text-faint); letter-spacing: .02em;
}

.lyrics-list { display: flex; flex-direction: column; gap: 20px; padding: 45% 24px; }
.lyrics-line {
  font-size: 17px; font-weight: 600; color: var(--text-faint); line-height: 1.4; margin: 0;
  cursor: pointer; transition: color .4s cubic-bezier(.22,1,.36,1), transform .4s cubic-bezier(.22,1,.36,1), filter .4s var(--ease);
  text-align: center; transform: scale(0.94) translateY(2px); filter: blur(0.2px);
}
.lyrics-line:hover { color: var(--text-dim); }
.lyrics-line.past { color: var(--text-dim); transform: scale(0.94) translateY(-2px); }
.lyrics-line.active {
  transform: scale(1.06) translateY(0); filter: blur(0);
  background: linear-gradient(90deg, var(--accent) 0%, var(--text) 50%, var(--accent) 100%);
  background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: lyricsSweep 2.5s linear infinite;
}
@keyframes lyricsSweep { 0% { background-position: 200% center; } 100% { background-position: 0% center; } }

.lyrics-paste-textarea {
  width: 100%; min-height: 220px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px;
  padding: 10px 12px; color: var(--text); font-size: 13px; font-family: inherit; resize: vertical; outline: none;
  line-height: 1.6;
}
.lyrics-paste-textarea:focus { border-color: var(--accent); }

/* ---------- Edit lyrics modal ---------- */
.edit-lyrics-row { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border-radius: 7px; }
.edit-lyrics-row:hover { background: var(--surface-2); }
.edit-lyrics-time {
  font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--text-faint);
  width: 44px; flex-shrink: 0; text-align: center;
}
.edit-lyrics-input {
  flex: 1; min-width: 0; background: transparent; border: 1px solid transparent; border-radius: 6px;
  padding: 5px 7px; color: var(--text); font-size: 13px; font-family: inherit; outline: none;
}
.edit-lyrics-input:hover { border-color: var(--line); }
.edit-lyrics-input:focus { border-color: var(--accent); background: var(--surface-2); }
.edit-lyrics-row-actions { display: flex; gap: 2px; flex-shrink: 0; }
.edit-lyrics-add-row {
  display: flex; align-items: center; gap: 6px; padding: 8px 6px; margin-top: 4px;
  color: var(--text-faint); cursor: pointer; font-size: 12.5px; font-weight: 600; border-radius: 7px;
}
.edit-lyrics-add-row:hover { color: var(--accent); background: var(--accent-dim); }

.tap-sync-overlay {
  position: absolute; inset: 0; background: rgba(13,13,16,0.97); z-index: 10;
  display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px;
  animation: barIn .2s var(--ease);
}
.tap-sync-header { text-align: center; margin-bottom: 20px; max-width: 420px; }
.tap-sync-header h3 { font-size: 17px; margin: 0 0 6px; }
.tap-sync-header p { font-size: 12.5px; color: var(--text-dim); margin: 0; line-height: 1.6; }
.tap-sync-lines { max-width: 480px; max-height: 240px; overflow-y: auto; width: 100%; margin-bottom: 24px; }
.tap-sync-line {
  font-size: 13.5px; color: var(--text-faint); padding: 6px 12px; border-radius: 6px;
  display: flex; align-items: center; gap: 8px; transition: color .15s var(--ease), background .15s var(--ease);
}
.tap-sync-line.current { color: var(--accent); background: var(--accent-dim); font-weight: 600; }
.tap-sync-line.done { color: var(--text-dim); }
.tap-sync-check { color: #5CD98A; flex-shrink: 0; }
.tap-sync-controls { display: flex; align-items: center; gap: 16px; }
.tap-sync-button {
  width: 60px; height: 60px; border-radius: 50%; background: var(--accent); color: #0D0D10;
  display: flex; align-items: center; justify-content: center; border: none; cursor: pointer;
  transition: transform .12s var(--ease);
}
.tap-sync-button:hover { transform: scale(1.06); }
.tap-sync-button:active { transform: scale(0.9); }

.lyrics-page-list { display: flex; flex-direction: column; gap: 2px; }
.lyrics-page-row {
  display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 8px; cursor: pointer;
  transition: background .15s var(--ease);
}
.lyrics-page-row:hover { background: var(--surface); }

.np-seek { width: 100%; max-width: 620px; }

/* ---------- Settings panel ---------- */
.settings-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 300px; background: var(--surface);
  border-left: 1px solid var(--line); z-index: 30; display: flex; flex-direction: column;
  animation: slideIn .25s var(--ease); box-shadow: -20px 0 40px rgba(0,0,0,0.3);
}
@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
.settings-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 18px 10px; }
.settings-header h3 { font-size: 14px; font-weight: 700; margin: 0; }
.settings-body { padding: 6px 18px 18px; overflow-y: auto; flex: 1; }
.settings-section { margin-bottom: 22px; }
.settings-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-faint); font-weight: 600; margin-bottom: 10px; }
.settings-hint { font-size: 11px; color: var(--text-faint); margin: 8px 0 0; line-height: 1.5; }
.settings-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; }
.settings-toggle-row + .settings-toggle-row { border-top: 1px solid var(--line); }
.settings-toggle-title { font-size: 13px; font-weight: 600; color: var(--text); }
.settings-toggle-desc { font-size: 11.5px; color: var(--text-faint); margin-top: 2px; }

/* ---------- Mood chips ---------- */
.mood-chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.mood-chip {
  display: flex; align-items: center; gap: 5px; padding: 6px 10px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--text-dim);
  font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s var(--ease);
}
.mood-chip:hover { border-color: var(--text-faint); color: var(--text); }
.mood-chip.selected { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
.mood-badge {
  display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; font-weight: 700;
  padding: 2px 7px; border-radius: 999px; flex-shrink: 0;
}
.accent-row { display: flex; flex-wrap: wrap; gap: 10px; }
.accent-swatch {
  width: 34px; height: 34px; border-radius: 50%; cursor: pointer; border: 2px solid transparent;
  display: flex; align-items: center; justify-content: center; transition: transform .15s var(--ease), border-color .15s var(--ease);
}
.accent-swatch:hover { transform: scale(1.08); }
.accent-swatch:active { transform: scale(0.92); }
.accent-swatch.selected { border-color: var(--text); animation: swatchPop .25s var(--ease); }
.accent-swatch.locked { cursor: not-allowed; border-style: dashed; }
.accent-swatch.locked:hover { transform: none; }
.settings-sublabel { display: flex; align-items: baseline; justify-content: space-between; margin: 14px 0 10px; font-size: 11px; font-weight: 600; color: var(--text-faint); text-transform: uppercase; letter-spacing: .5px; }
.settings-sublabel span { text-transform: none; letter-spacing: 0; font-weight: 500; }
@keyframes swatchPop { 0% { transform: scale(0.85); } 60% { transform: scale(1.12); } 100% { transform: scale(1); } }
.density-toggle { display: flex; gap: 6px; }
.density-opt {
  flex: 1; padding: 8px; border-radius: 7px; border: 1px solid var(--line); background: var(--surface-2);
  color: var(--text-dim); font-size: 12px; font-weight: 600; cursor: pointer; text-align: center;
  transition: background .15s var(--ease), color .15s var(--ease), border-color .15s var(--ease), transform .1s var(--ease);
}
.density-opt:hover { color: var(--text); }
.density-opt:active { transform: scale(0.96); }
.density-opt.selected { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }

/* ---------- Modal ---------- */
.modal-scrim {
  position: absolute; inset: 0; background: rgba(0,0,0,0.55); z-index: 50;
  display: flex; align-items: center; justify-content: center; animation: barIn .15s var(--ease);
}
.modal-box {
  width: 420px; max-width: 90%; max-height: 70vh; background: var(--surface); border: 1px solid var(--line);
  border-radius: 12px; display: flex; flex-direction: column; box-shadow: 0 30px 80px rgba(0,0,0,0.5);
}
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid var(--line); }
.modal-header h3 { font-size: 14px; font-weight: 700; margin: 0; }
.modal-list { overflow-y: auto; padding: 8px; flex: 1; }
.modal-row { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 7px; cursor: pointer; }
.modal-row:hover { background: var(--surface-2); }
.modal-footer { padding: 12px 18px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 8px; }

/* ---------- Weekly recap share card ---------- */
.recap-scrim { background: rgba(0,0,0,0.7); backdrop-filter: blur(2px); }
.recap-modal {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 16px;
  animation: recapIn .5s cubic-bezier(.2,1.2,.4,1) backwards;
}
@keyframes recapIn {
  0% { opacity: 0; transform: scale(0.85) translateY(18px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
.recap-switch {
  display: flex; gap: 4px; padding: 4px; border-radius: 999px;
  background: rgba(255,255,255,0.06); border: 1px solid var(--line);
}
.recap-switch button {
  padding: 7px 18px; border-radius: 999px; border: none; background: transparent;
  color: var(--text-dim); font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: background .18s var(--ease), color .18s var(--ease);
}
.recap-switch button:hover:not(:disabled):not(.active) { color: var(--text); }
.recap-switch button.active { background: var(--accent); color: #0D0D10; }
.recap-switch button:disabled { opacity: 0.35; cursor: not-allowed; }
.recap-canvas {
  height: min(64vh, 560px); width: auto; aspect-ratio: 4 / 5; max-width: 86vw; border-radius: 22px; display: block;
  box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.10);
  animation: recapGlow 2.6s ease-in-out infinite;
}
.recap-empty {
  height: min(64vh, 560px); aspect-ratio: 4 / 5; max-width: 86vw; border-radius: 22px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  background: var(--surface); border: 1px dashed var(--line); color: var(--text-faint); font-size: 13px;
}
.recap-empty p { margin: 0; }
@keyframes recapGlow {
  0%, 100% { box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.10), 0 0 0 transparent; }
  50% { box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.10), 0 0 60px var(--accent-dim); }
}
.recap-close {
  position: absolute; top: -14px; right: -14px; background: var(--surface); border: 1px solid var(--line);
  border-radius: 50%; z-index: 2;
}
.recap-actions { display: flex; gap: 10px; }

/* ---------- Mood buddy (Queue page) ---------- */
.mood-buddy-wrap {
  position: relative; width: 168px; height: 153px; flex-shrink: 0; margin-left: auto; align-self: center;
  user-select: none; animation: buddyPop .6s cubic-bezier(.2,1.4,.4,1) backwards;
}
@keyframes buddyPop {
  0% { opacity: 0; transform: scale(.5) rotate(-8deg); }
  100% { opacity: 1; transform: scale(1) rotate(0); }
}
.buddy { width: 100%; height: 100%; overflow: visible; cursor: pointer; shape-rendering: geometricPrecision; }
.buddy .buddy-body { will-change: transform; }
.buddy-bubble {
  position: absolute; top: -12px; left: -48px; z-index: 2; max-width: 150px; padding: 6px 10px; white-space: nowrap;
  border-radius: 14px 14px 14px 4px; background: var(--surface-2); border: 1px solid var(--line);
  font-size: 11.5px; font-weight: 700; line-height: 1.3; color: var(--text);
  box-shadow: 0 8px 20px rgba(0,0,0,0.3); animation: bubbleIn .45s .2s cubic-bezier(.2,1.4,.4,1) backwards;
}
.buddy-bubble::after {
  content: ""; position: absolute; right: 16px; bottom: -6px; width: 10px; height: 10px; background: var(--surface-2);
  border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); transform: rotate(45deg); border-radius: 0 0 3px 0;
}
@keyframes bubbleIn { 0% { opacity: 0; transform: translateY(6px) scale(.85); } 100% { opacity: 1; transform: translateY(0) scale(1); } }

.buddy-body, .buddy-fx, .buddy-blink, .buddy-heart-eye, .buddy-sing, .buddy-leaf, .buddy-tear, .buddy-shadow, .buddy-glow, .buddy-brows {
  transform-box: fill-box; transform-origin: 50% 100%;
}
.buddy-fx, .buddy-blink, .buddy-heart-eye, .buddy-shadow, .buddy-glow { transform-origin: 50% 50%; }
.buddy-sing { transform-origin: 50% 0%; }
.buddy-leaf { animation: buddyLeaf 3s ease-in-out infinite; }

/* soft mood-colored glow behind the buddy */
.buddy-glow { opacity: .55; }
.buddy.playing .buddy-glow { animation: buddyGlow 2.6s ease-in-out infinite; }
@keyframes buddyGlow { 0%, 100% { opacity: .45; transform: scale(.94); } 50% { opacity: .95; transform: scale(1.06); } }

/* body motion — one personality per mood while playing, a calm breathe when paused */
.buddy.paused .buddy-body { animation: buddyBreathe 3.8s ease-in-out infinite; }
.buddy-energy.playing .buddy-body   { animation: buddyJump .56s cubic-bezier(.3,0,.4,1) infinite; }
.buddy-energy.playing .buddy-shadow { animation: buddyShadowJump .56s cubic-bezier(.3,0,.4,1) infinite; }
.buddy-happy.playing .buddy-body    { animation: buddyBounce .9s ease-in-out infinite; }
.buddy-happy.playing .buddy-shadow  { animation: buddyShadowJump .9s ease-in-out infinite; }
.buddy-romantic.playing .buddy-body { animation: buddyPulse 1.3s ease-in-out infinite; }
.buddy-romantic.playing .buddy-shadow { animation: buddyShadowBeat 1.3s ease-in-out infinite; }
.buddy-focus.playing .buddy-body    { animation: buddyNod 1.7s ease-in-out infinite; }
.buddy-chill.playing .buddy-body    { animation: buddySway 3.6s ease-in-out infinite; }
.buddy-peace.playing .buddy-body    { animation: buddyBreathe 4.2s ease-in-out infinite; }
.buddy-sad.playing .buddy-body      { animation: buddyDroop 3.2s ease-in-out infinite; }
.buddy-none.playing .buddy-body     { animation: buddyBob 1.5s ease-in-out infinite; }
.buddy-sleep .buddy-body            { animation: buddyBreathe 4.6s ease-in-out infinite; }
.buddy.boop .buddy-body { animation: buddyBoop .65s cubic-bezier(.3,1.6,.5,1) !important; }

@keyframes buddyJump {
  0%   { transform: translateY(0) scale(1.08, .9); }
  20%  { transform: translateY(-6px) scale(.95, 1.08); }
  50%  { transform: translateY(-26px) scale(.97, 1.04); }
  80%  { transform: translateY(-6px) scale(1, 1); }
  100% { transform: translateY(0) scale(1.08, .9); }
}
@keyframes buddyShadowJump { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(.72); opacity: .55; } }
@keyframes buddyShadowBeat { 0%, 28%, 70%, 100% { transform: scale(1); } 14% { transform: scale(1.1); } 42% { transform: scale(1.06); } }
@keyframes buddyBounce {
  0%, 100% { transform: translateY(0) scale(1.04, .96); }
  45% { transform: translateY(-14px) rotate(-3deg) scale(.98, 1.03); }
  72% { transform: translateY(-6px) rotate(3deg) scale(1, 1); }
}
@keyframes buddyPulse {
  0%, 100% { transform: scale(1); }
  14% { transform: scale(1.07); }
  28% { transform: scale(1); }
  42% { transform: scale(1.05); }
  70% { transform: scale(1); }
}
@keyframes buddyNod { 0%, 100% { transform: translateY(0) rotate(0); } 30% { transform: translateY(3px) rotate(2deg); } 62% { transform: translateY(0) rotate(-1deg); } }
@keyframes buddySway { 0%, 100% { transform: rotate(-5deg) translateX(-4px); } 50% { transform: rotate(5deg) translateX(4px); } }
@keyframes buddyBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.045, 1.03); } }
@keyframes buddyDroop { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(4px) scale(1.02, .97); } }
@keyframes buddyBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes buddyBoop {
  0% { transform: scale(1); }
  30% { transform: scale(1.18, .84); }
  62% { transform: translateY(-30px) scale(.94, 1.1); }
  100% { transform: scale(1); }
}

/* face */
.buddy-blink { animation: buddyBlink 4.8s infinite; }
@keyframes buddyBlink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.08); } }
.buddy-pupil { transform: translate(var(--lx, 0px), var(--ly, 0px)); transition: transform .14s ease-out; }
.buddy.playing .buddy-sing { animation: buddySing .5s ease-in-out infinite alternate; }
@keyframes buddySing { from { transform: scaleY(.72); } to { transform: scaleY(1); } }
.buddy-heart-eye { animation: buddyHeartEye 1s ease-in-out infinite; }
@keyframes buddyHeartEye { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.14); } }
.buddy-energy.playing .buddy-brows { animation: buddyBrows .56s ease-in-out infinite; }
@keyframes buddyBrows { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.buddy-cheeks { animation: buddyCheeks 2.4s ease-in-out infinite; }
@keyframes buddyCheeks { 0%, 100% { opacity: .75; } 50% { opacity: 1; } }
@keyframes buddyLeaf { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(7deg); } }
.buddy-tear { animation: buddyTear 2.4s ease-in infinite; opacity: 0; }
@keyframes buddyTear { 0% { transform: translateY(-4px); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(36px); opacity: 0; } }

/* props around the buddy — only while playing (the sleepy buddy keeps its zzz) */
.buddy.paused:not(.buddy-sleep) .buddy-fx { opacity: 0; animation: none; }
.fx-float { animation: buddyFloat 2.8s ease-out infinite; opacity: 0; }
@keyframes buddyFloat {
  0% { opacity: 0; transform: translate(0, 10px) scale(.6) rotate(-6deg); }
  20% { opacity: 1; }
  60% { opacity: 1; transform: translate(calc(var(--dx, 0px) * .7), -24px) scale(1) rotate(5deg); }
  100% { opacity: 0; transform: translate(var(--dx, 0px), -44px) scale(1.15) rotate(-4deg); }
}
.fx-twinkle { animation: buddyTwinkle 1.6s ease-in-out infinite; }
@keyframes buddyTwinkle { 0%, 100% { opacity: .2; transform: scale(.5) rotate(0); } 50% { opacity: 1; transform: scale(1.15) rotate(25deg); } }
.fx-flash { animation: buddyFlash .9s steps(1, end) infinite; }
@keyframes buddyFlash { 0%, 100% { opacity: .15; transform: scale(.9); } 10%, 30% { opacity: 1; transform: scale(1.15) rotate(-6deg); } 50% { opacity: .5; } 70% { opacity: 1; transform: scale(1.05) rotate(6deg); } }
.fx-think { animation: buddyThink 1.8s ease-in-out infinite; }
@keyframes buddyThink { 0%, 100% { opacity: .25; transform: scale(.8); } 50% { opacity: .95; transform: scale(1.08); } }
.fx-halo { animation: buddyHalo 2.8s ease-out infinite; }
@keyframes buddyHalo { 0% { opacity: .5; transform: scale(.92); } 100% { opacity: 0; transform: scale(1.4); } }
.fx-ring { animation: buddyRing .56s ease-out infinite; }
@keyframes buddyRing { 0% { opacity: .65; transform: scale(.55); } 100% { opacity: 0; transform: scale(1.5); } }

@media (max-width: 760px) { .mood-buddy-wrap { display: none; } }
@media (prefers-reduced-motion: reduce) { .buddy *, .mood-buddy-wrap, .buddy-bubble { animation: none !important; } }
`;

/* ============================================================
   Helpers
   ============================================================ */
// Position of the playing song in the queue. The same song can be queued twice, so the remembered
// position (hint) wins when it still points at that song; indexOf is only the fallback.
function queueIndexOf(queue, id, hint) {
  if (typeof hint === "number" && hint >= 0 && queue[hint] === id) return hint;
  return queue.indexOf(id);
}

// A stable id for a song that survives a reinstall or a rescan: derived from the file path and size.
function stableTrackId(path, size) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  const s = `${path}|${size || 0}`;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return "f" + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// What the sort arrow means, in words.
function sortDirLabel(key, dir) {
  if (key === "dateAdded") return dir === "desc" ? "Newest first" : "Oldest first";
  if (key === "duration") return dir === "desc" ? "Longest" : "Shortest";
  return dir === "asc" ? "A → Z" : "Z → A";
}

// Day buckets use the phone's local date (toISOString is UTC and puts evening plays on the wrong day).
function localDayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Artists are grouped by a normalised key (case, accents, a leading "the", and "feat. X" tails ignored), so
// "Beatles", "the beatles" and "Beatles ft. X" are one artist.
function artistGroupKey(name) {
  let s = fold(name).replace(/\s*[([]?\s*(?:feat\.?|featuring|ft\.?)\s.*$/i, "");
  s = s.replace(/^the\s+/, "").replace(/\s+/g, " ").trim();
  return s || fold(name);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------- Lyrics: .lrc parsing / serializing ----------------
   Verified independently against a battery of cases (metadata tags mixed
   in, multi-timestamp chorus lines, high-precision fractional seconds,
   round-trip through linesToLRC, malformed input) before being wired in. */
function parseLRC(raw) {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const result = [];
  const tsRe = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const line of lines) {
    const matches = [...line.matchAll(tsRe)];
    if (matches.length === 0) continue; // metadata tag ([ar:...], [ti:...]) or blank line
    const text = line.replace(tsRe, "").trim();
    for (const m of matches) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const frac = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) / 1000 : 0;
      result.push({ time_sec: min * 60 + sec + frac, text });
    }
  }
  result.sort((a, b) => a.time_sec - b.time_sec);
  return result;
}

function linesToLRC(lines) {
  return lines.map(({ time_sec, text }) => {
    const m = Math.floor(time_sec / 60);
    const s = Math.floor(time_sec % 60);
    const cs = Math.round((time_sec - Math.floor(time_sec)) * 100);
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    const cc = String(cs).padStart(2, "0");
    return `[${mm}:${ss}.${cc}]${text}`;
  }).join("\n");
}

const VINYL_RING_RADIUS = 152;
const VINYL_RING_CIRCUMFERENCE = 2 * Math.PI * VINYL_RING_RADIUS;

// Preset mood/energy tags a track can be manually assigned (single tag per
// track, kept as a small fixed set rather than free-form so "build me a
// chill playlist" stays a one-click filter instead of a typo-prone search).
const MOOD_PRESETS = [
  { key: "energy", label: "Energy", icon: Zap, color: "#F5A524" },
  { key: "chill", label: "Chill", icon: Wind, color: "#3DD9C4" },
  { key: "peace", label: "Peace", icon: Leaf, color: "#5CD98A" },
  { key: "sad", label: "Sad", icon: CloudRain, color: "#6C8EF5" },
  { key: "happy", label: "Happy", icon: Sun, color: "#F5D93D" },
  { key: "focus", label: "Focus", icon: Target, color: "#9B7CF5" },
  { key: "romantic", label: "Romantic", icon: Heart, color: "#F5619D" },
];

// Listening-time milestones — each tier gets its own icon, color and name
// (instead of a single generic badge repeated with a different number) so
// unlocking one actually feels like a distinct achievement. Shown on the
// Stats page and announced via a notification + celebration modal the
// moment each is first crossed.
const MILESTONE_META = [
  { hours: 1, name: "First Spin", icon: Headphones, reward: "moonlight" },
  { hours: 5, name: "Warming Up", icon: Flame, reward: "ember" },
  { hours: 10, name: "In The Groove", icon: Disc3, reward: "sunbeam" },
  { hours: 25, name: "Dedicated Listener", icon: Star, reward: "lime" },
  { hours: 50, name: "Certified Fan", icon: Medal, reward: "lagoon" },
  { hours: 100, name: "Superfan", icon: Trophy, reward: "sapphire" },
  { hours: 250, name: "Audiophile", icon: Gem, reward: "fuchsia" },
  { hours: 500, name: "Legend", icon: Crown, reward: "rose" },
  { hours: 1000, name: "Living In The Speakers", icon: Rocket, reward: "indigo" },
// Each tier's badge color IS its reward accent, so what you see on the badge
// is exactly the color you unlock.
].map(m => ({ ...m, color: ACCENTS[m.reward].hex, rewardName: ACCENTS[m.reward].name }));
const LISTENING_MILESTONES_HOURS = MILESTONE_META.map(m => m.hours);

// Rough 0–1 energy score per mood preset, used only to turn mood tags into
// a single comparable number for the Stats "taste check" period comparison
// (e.g. "38% more energetic this month") — not shown anywhere on its own.
const MOOD_ENERGY = {
  energy: 1.0, happy: 0.75, romantic: 0.55, focus: 0.45, chill: 0.3, peace: 0.2, sad: 0.1,
};

// Presets for the Stats "taste check" period-comparison picker.
const COMPARE_RANGES = {
  week: { label: "week", days: 7 },
  month: { label: "month", days: 30 },
  quarter: { label: "90 days", days: 90 },
};

// How long playback has to sit paused/stopped before the idle ambient
// screensaver fades in (see the idleAmbientActive effect).
const IDLE_AMBIENT_DELAY_MS = 3 * 60 * 1000;

// Flavor text for the loop-streak toast — picked at random so replaying a
// favorite track doesn't show the exact same line every single time.
const LOOP_STREAK_LINES = [
  "must be a good one",
  "you're really feeling this one",
  "on repeat for a reason",
  "no notes, just vibes",
  "this one's not leaving rotation",
];


function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Long-form duration for the Stats page ("2h 14m" / "38m") — fmtTime's
// mm:ss is meant for a single track, not a cumulative listening total.
function fmtDuration(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(totalSec)}s`;
}

// ISO 8601 week key ("2026-W38") for the given date — used so the weekly
// recap notification fires at most once per calendar week rather than on
// every app open.
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// Midnight (local time), Monday, of the week containing `date` — the
// weekly recap is anchored to this instant: the recap that appears once a
// new week begins covers the 7 days immediately before it.
function mostRecentMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

// deterministic cover gradient per track — stands in for embedded album art,
// which real Reel extracts via music-metadata during the library scan
// Draws a cover for songs that have no embedded art, so the notification / lock-screen card gets
// a picture — and a colour — that is different for every song (Android tints the card from it).
function notifCoverDataUrl(seed) {
  try {
    const S = 512, c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d");
    const h1 = hashStr(seed) % 360, h2 = (h1 + 55 + (hashStr(seed + "x") % 40)) % 360;
    const grad = g.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, `hsl(${h1} 70% 46%)`); grad.addColorStop(1, `hsl(${h2} 72% 26%)`);
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    const glow = g.createRadialGradient(S * .3, S * .25, 10, S * .3, S * .25, S * .7);
    glow.addColorStop(0, "rgba(255,255,255,.28)"); glow.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = glow; g.fillRect(0, 0, S, S);
    const hs = [.28, .5, .72, .46, .3];
    g.fillStyle = "rgba(255,255,255,.92)";
    hs.forEach((k, i) => {
      const bw = 42, gap = 30, total = hs.length * bw + (hs.length - 1) * gap, x = (S - total) / 2 + i * (bw + gap), bh = S * k, y = (S - bh) / 2;
      g.beginPath(); g.roundRect(x, y, bw, bh, 21); g.fill();
    });
    return c.toDataURL("image/jpeg", 0.88);
  } catch { return null; }
}

function coverGradient(seed) {
  const h1 = hashStr(seed) % 360;
  const h2 = (h1 + 55 + (hashStr(seed + "x") % 40)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 55% 30%), hsl(${h2} 60% 18%))`;
}

// Fallback pair of glow colors for the Now Playing ambient background, using
// the exact same hue formula as coverGradient so a track with no embedded
// art gets a glow that matches its own placeholder cover instead of a
// random, unrelated color.
function hueGlowColors(seed) {
  const h1 = hashStr(seed) % 360;
  const h2 = (h1 + 55 + (hashStr(seed + "x") % 40)) % 360;
  return [`hsla(${h1}, 70%, 48%, 0.55)`, `hsla(${h2}, 70%, 42%, 0.5)`];
}

// ---------- Track-of-the-week card ----------

// Library titles are often raw filenames ("Tems_-_Forever__Visualizer_(256k)")
// — unreadable on a share card, and with no spaces there's nothing to wrap on,
// which is what made long titles run off the edge. Underscores become spaces,
// bitrate / "official video" style tags are dropped, and a leading "Artist - "
// is removed when it only repeats the artist line.
// Title/credit cleaning lives in titleClean.js (one cleaner for the scan, "Clean up", Library health, Fix tags, search).
const prettyTitle = (title, artist) => cleanTrack({ title, artist }).title;
const looksRaw = needsCleaning;
const cleanTrackMeta = (t) => cleanTrack(t);

function SelCircle({ on }) {
  return <span className={`sel-circle${on ? " on" : ""}`}>{on && <Check size={15} strokeWidth={3.2} />}</span>;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const WEEK_MS = 7 * 86400000;

// Ranked [{id, count, secs}] for plays inside [startTs, endTs). Ties on play
// count are broken by time actually listened, so the order is stable.
function rankWindow(playHistory, byId, startTs, endTs) {
  const plays = new Map(), secs = new Map();
  for (const h of playHistory) {
    if (h.ts < startTs || h.ts >= endTs || !byId.has(h.id)) continue;
    plays.set(h.id, (plays.get(h.id) || 0) + 1);
    secs.set(h.id, (secs.get(h.id) || 0) + (h.listenedSec || 0));
  }
  return Array.from(plays.entries())
    .map(([id, count]) => ({ id, count, secs: secs.get(id) || 0 }))
    .sort((a, b) => b.count - a.count || b.secs - a.secs);
}

// range "last"    = the calendar week (Mon 00:00 → Mon 00:00) that just ended
// range "current" = this week so far, since Monday 00:00
// Both reset on Monday because they're anchored to mostRecentMonday().
function buildRecapCard(playHistory, library, range) {
  const byId = new Map(library.map(t => [t.id, t]));
  const thisMonday = mostRecentMonday(new Date()).getTime();
  const startTs = range === "last" ? thisMonday - WEEK_MS : thisMonday;
  const endTs = range === "last" ? thisMonday : Date.now() + 1;
  const ranked = rankWindow(playHistory, byId, startTs, endTs);
  if (ranked.length === 0) return null;
  const top = ranked[0];

  // Same track winning several weeks running is perfectly normal (it IS
  // whatever you played most), so rather than hide it, say so on the card.
  let streak = 1;
  for (let k = 1; k <= 52; k++) {
    const ws = startTs - k * WEEK_MS;
    const r = rankWindow(playHistory, byId, ws, ws + WEEK_MS);
    if (r.length && r[0].id === top.id) streak++;
    else break;
  }

  const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const weekLabel = range === "last"
    ? `${fmt(new Date(startTs))} – ${fmt(new Date(endTs - 86400000))}`
    : `${fmt(new Date(startTs))} – today`;
  return {
    range,
    track: byId.get(top.id),
    count: top.count,
    minutes: Math.round(top.secs / 60),
    weekLabel,
    streak,
    runnersUp: ranked.slice(1, 3).map(r => ({ track: byId.get(r.id), count: r.count })),
  };
}

// Selectable app designs (see src/designs.css). "classic" is the original look.
const MORE_PAGES = ["more", "queue", "recent", "lyrics", "stats", "discover", "health"];
const DESIGNS = [
  { key: "classic", name: "Classic", sub: "The original Reel: sidebar, dark panels, bottom player bar" },
  { key: "bloom", name: "Bloom", sub: "Glass panels, color glow, floating player pill" },
  { key: "turntable", name: "Turntable", sub: "Top navigation, listening-room Now Playing with Up next and lyrics" },
];

// Small seeded PRNG (mulberry32) — hashStr() on sequential strings clusters, so
// anything that needs several well-spread "random" values per track uses this.
function seededRand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

// Greedy word wrap that also breaks words longer than a whole line, and
// ellipsizes the last line when the text doesn't fit in maxLines.
function wrapText(ctx, text, maxW, maxLines) {
  const pieces = [];
  for (const w of text.split(" ")) {
    if (ctx.measureText(w).width <= maxW) { pieces.push(w); continue; }
    let chunk = "";
    for (const ch of w) {
      if (ctx.measureText(chunk + ch).width > maxW && chunk) { pieces.push(chunk); chunk = ch; }
      else chunk += ch;
    }
    if (chunk) pieces.push(chunk);
  }
  const lines = [];
  let cur = "";
  for (const w of pieces) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fitText(ctx, kept[maxLines - 1] + " …", maxW);
    return kept;
  }
  return lines;
}

function drawSpaced(ctx, text, cx, y, spacing) {
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + spacing;
  total -= spacing;
  let x = cx - total / 2;
  for (const ch of text) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + spacing; }
  ctx.textAlign = prev;
}

// Draws the share card entirely on canvas (no DOM-to-image library, and what's
// previewed is pixel-identical to what's exported). 1080×1350 — a 4:5
// portrait that works as a story/feed post as-is. The centerpiece is a vinyl
// record whose label carries the play count; colors come from the track's
// mood tag, or from its own hue when it has none.
/* ---------- cover art for the share images (canvas) ---------- */
const _coverImgs = new Map();   // src → { img, ready, failed, waiters[] }
/** The cover as an Image once it is loaded (null while loading / on failure). `onReady` is called when it arrives so the card can be redrawn. */
function coverImageFor(src, onReady) {
  if (!src || typeof src !== "string") return null;
  let e = _coverImgs.get(src);
  if (!e) {
    e = { img: new Image(), ready: false, failed: false, waiters: [] };
    if (!src.startsWith("data:")) e.img.crossOrigin = "anonymous";    // a tainted canvas could not be saved
    e.img.onload = () => { e.ready = true; e.waiters.splice(0).forEach(f => { try { f(); } catch { /* ignore */ } }); };
    e.img.onerror = () => { e.failed = true; e.waiters.length = 0; };
    e.img.src = src;
    _coverImgs.set(src, e);
    if (_coverImgs.size > 12) _coverImgs.delete(_coverImgs.keys().next().value);
  }
  if (e.ready) return e.img;
  if (!e.failed && onReady) e.waiters.push(onReady);
  return null;
}
/** Colours of the song's own cover { primary, secondary, isLight } (null while it loads or when it cannot be read). */
function coverDominant(track, onReady) {
  const img = track.art ? coverImageFor(track.art, onReady) : null;
  return img ? dominantColorsCached(`${track.id}|${String(track.art).length}`, img) : null;
}
const HSL_RE = /hsl\((\d+) (\d+)% (\d+)%\)/;
const hslAlpha = (c, a) => { const m = HSL_RE.exec(c); return m ? `hsla(${m[1]}, ${m[2]}%, ${m[3]}%, ${a})` : c; };
const hslShade = (c, l) => { const m = HSL_RE.exec(c); return m ? `hsl(${m[1]} ${m[2]}% ${l}%)` : c; };
/** draws `img` cropped to fill the square (x, y, size); radius > 0 → rounded corners, radius === "circle" → round */
function drawCoverFill(ctx, img, x, y, size, radius) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const k = Math.min(iw, ih);
  ctx.save();
  ctx.beginPath();
  if (radius === "circle") ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); else ctx.roundRect(x, y, size, size, radius);
  ctx.clip();
  ctx.drawImage(img, (iw - k) / 2, (ih - k) / 2, k, k, x, y, size, size);
  ctx.restore();
}

function drawRecapCard(canvas, card, onCoverReady) {
  const { track, count, minutes, weekLabel, streak, runnersUp = [], range } = card;
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const FONT = 'Inter, "Segoe UI", -apple-system, system-ui, sans-serif';

  const moodDef = track.mood ? MOOD_PRESETS.find(m => m.key === track.mood) : null;
  const seed = track.artist + track.title;
  const h1 = hashStr(seed) % 360;
  const h2 = (h1 + 55 + (hashStr(seed + "x") % 40)) % 360;
  // the colours follow the cover; the mood / hash colours are only the fallback (no cover, or it cannot be read)
  const dom = coverDominant(track, onCoverReady);
  const toneA = (a) => dom ? hslAlpha(dom.primary, a) : moodDef ? hexToRgba(moodDef.color, a) : `hsla(${h1}, 72%, 52%, ${a})`;
  const toneB = (a) => dom ? hslAlpha(dom.secondary, a) : `hsla(${h2}, 72%, 48%, ${a})`;
  const accentSolid = dom ? hslShade(dom.primary, 60) : moodDef ? moodDef.color : `hsl(${h1} 72% 58%)`;
  const title = prettyTitle(track.title, track.artist);

  // ----- background: dark base with three soft color blooms -----
  ctx.fillStyle = "#0B0B0F";
  ctx.fillRect(0, 0, W, H);
  const bloom = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  bloom(W * 0.16, H * 0.10, 840, toneA(0.55));
  bloom(W * 0.95, H * 0.44, 760, toneB(0.40));
  bloom(W * 0.34, H * 1.02, 720, toneA(0.36));
  const vig = ctx.createLinearGradient(0, 0, 0, H);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // ----- header: brand mark + week pill -----
  ctx.fillStyle = "#E8A33D";
  ctx.beginPath(); ctx.roundRect(72, 72, 64, 64, 16); ctx.fill();
  ctx.fillStyle = "#0D0D10";
  const bars = [18, 30, 38, 26, 16];
  let bx = 104 - (bars.length * 6 + (bars.length - 1) * 6) / 2;
  for (const bh of bars) { ctx.beginPath(); ctx.roundRect(bx, 104 - bh / 2, 6, bh, 3); ctx.fill(); bx += 12; }
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.font = `700 34px ${FONT}`;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("Reel", 154, 106);

  ctx.font = `600 26px ${FONT}`;
  const pillW = ctx.measureText(weekLabel).width + 56;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath(); ctx.roundRect(W - 72 - pillW, 76, pillW, 56, 28); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.20)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textAlign = "center";
  ctx.fillText(weekLabel, W - 72 - pillW / 2, 105);

  // ----- eyebrow -----
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = `700 24px ${FONT}`;
  drawSpaced(ctx, range === "current" ? "TRACK OF THE WEEK · SO FAR" : "TRACK OF THE WEEK", W / 2, 214, 6);

  // ----- vinyl record -----
  const cx = W / 2, cy = 530, R = 250;
  const sparkle = (x, y, s, a) => {
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a; ctx.fillStyle = "#fff";
    ctx.beginPath();
    const k = s * 0.22;
    ctx.moveTo(0, -s); ctx.quadraticCurveTo(k, -k, s, 0); ctx.quadraticCurveTo(k, k, 0, s);
    ctx.quadraticCurveTo(-k, k, -s, 0); ctx.quadraticCurveTo(-k, -k, 0, -s);
    ctx.fill(); ctx.restore();
  };
  // glitter in the empty side margins beside the record (seeded per track)
  const rnd = seededRand(hashStr(seed));
  const placed = [];
  for (let i = 0; i < 14 && placed.length < 9; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const sx = cx + side * (R + 46 + rnd() * 150);
    const sy = 290 + rnd() * 470;
    const sz = 9 + rnd() * 16, al = 0.3 + rnd() * 0.5;
    if (placed.some(q => Math.hypot(q.x - sx, q.y - sy) < 80)) continue; // keep them from piling up
    placed.push({ x: sx, y: sy });
    sparkle(sx, sy, sz, al);
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 70; ctx.shadowOffsetY = 34;
  ctx.fillStyle = "#0A0A0C";
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R - 2, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let r = 118; r < R - 8; r += 8) {
    ctx.strokeStyle = r % 16 === 6 ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.035)";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }
  if (ctx.createConicGradient) {
    const cg = ctx.createConicGradient(-Math.PI / 4, cx, cy);
    cg.addColorStop(0, "rgba(255,255,255,0)");
    cg.addColorStop(0.08, "rgba(255,255,255,0.13)");
    cg.addColorStop(0.16, "rgba(255,255,255,0)");
    cg.addColorStop(0.5, "rgba(255,255,255,0)");
    cg.addColorStop(0.58, "rgba(255,255,255,0.10)");
    cg.addColorStop(0.66, "rgba(255,255,255,0)");
    cg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(cx, cy, R - 4, 0, Math.PI * 2); ctx.fill();
  }

  // label with the play count — the song's cover when it has one
  const coverImg = coverImageFor(track.art, onCoverReady);
  const LR = coverImg ? 150 : 112;
  if (coverImg) {
    drawCoverFill(ctx, coverImg, cx - LR, cy - LR, LR * 2, "circle");
    ctx.fillStyle = "rgba(0,0,0,0.36)"; // keeps the white count readable on any cover
    ctx.beginPath(); ctx.arc(cx, cy, LR, 0, Math.PI * 2); ctx.fill();
  } else {
    const lg = ctx.createLinearGradient(cx - LR, cy - LR, cx + LR, cy + LR);
    lg.addColorStop(0, accentSolid);
    lg.addColorStop(1, `hsl(${h2} 70% 42%)`);
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(cx, cy, LR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.30)"; // keeps white text readable on light accents
    ctx.beginPath(); ctx.arc(cx, cy, LR, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, LR - 10, 0, Math.PI * 2); ctx.stroke();
  const digits = String(count).length;
  const fs = digits >= 3 ? 76 : digits === 2 ? 96 : 112;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `800 ${fs}px ${FONT}`;
  ctx.fillText(String(count), cx, cy - 10);
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = `700 17px ${FONT}`;
  ctx.textBaseline = "middle";
  drawSpaced(ctx, count === 1 ? "PLAY" : "PLAYS", cx, cy + 62, 4);
  ctx.textBaseline = "alphabetic";

  // streak ribbon straddling the bottom edge of the record
  if (streak >= 2) {
    const label = `${ordinal(streak)} WEEK IN A ROW`;
    ctx.font = `800 24px ${FONT}`;
    const flameW = 34; // room for the flame icon (drawn as a path — emoji fonts aren't guaranteed on every machine)
    const rw = ctx.measureText(label).width + 56 + flameW;
    const ry = cy + R - 28;
    const rg = ctx.createLinearGradient(cx - rw / 2, 0, cx + rw / 2, 0);
    rg.addColorStop(0, "#FFD36B"); rg.addColorStop(1, "#FF8A4C");
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.roundRect(cx - rw / 2, ry, rw, 56, 28); ctx.fill();
    ctx.restore();
    const flame = (fx, fy, sz, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(fx, fy - sz);
      ctx.bezierCurveTo(fx + sz * 0.25, fy - sz * 0.55, fx + sz * 0.78, fy - sz * 0.3, fx + sz * 0.62, fy + sz * 0.25);
      ctx.bezierCurveTo(fx + sz * 0.5, fy + sz * 0.8, fx - sz * 0.5, fy + sz * 0.8, fx - sz * 0.62, fy + sz * 0.25);
      ctx.bezierCurveTo(fx - sz * 0.74, fy - sz * 0.08, fx - sz * 0.32, fy - sz * 0.38, fx, fy - sz);
      ctx.fill();
    };
    const textStart = cx - rw / 2 + 28 + flameW;
    flame(cx - rw / 2 + 28 + flameW / 2 - 4, ry + 31, 17, "#2A1606");
    flame(cx - rw / 2 + 28 + flameW / 2 - 4, ry + 36, 8, "#FFB84D");
    ctx.fillStyle = "#2A1606"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(label, textStart, ry + 29);
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  }

  // ----- title / artist / chips, vertically centered in their band -----
  ctx.textAlign = "center";
  ctx.font = `800 66px ${FONT}`;
  const titleLines = wrapText(ctx, title, 900, 2);
  const titleH = titleLines.length * 78;
  const chips = [];
  if (moodDef) chips.push({ label: moodDef.label, dot: moodDef.color });
  if (minutes > 0) chips.push({ label: `${fmtDuration(minutes * 60)} listened` });
  const chipsH = chips.length ? 56 : 0;
  const blockH = titleH + 14 + 44 + (chipsH ? 26 + chipsH : 0);
  const bandTop = 856, bandH = 290;
  let y = bandTop + Math.max(0, (bandH - blockH) / 2);

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 66px ${FONT}`;
  titleLines.forEach((line, i) => ctx.fillText(line, W / 2, y + 56 + i * 78));
  y += titleH + 14;

  ctx.font = `500 36px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.74)";
  ctx.fillText(fitText(ctx, track.artist, 900), W / 2, y + 34);
  y += 44 + 26;

  if (chips.length) {
    ctx.font = `700 24px ${FONT}`;
    const widths = chips.map(c => ctx.measureText(c.label).width + 48 + (c.dot ? 30 : 0));
    const total = widths.reduce((a, b) => a + b, 0) + (chips.length - 1) * 18;
    let x = W / 2 - total / 2;
    chips.forEach((c, i) => {
      ctx.fillStyle = "rgba(255,255,255,0.13)";
      ctx.beginPath(); ctx.roundRect(x, y, widths[i], 56, 28); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 2; ctx.stroke();
      let tx = x + 24;
      if (c.dot) {
        ctx.fillStyle = c.dot;
        ctx.beginPath(); ctx.arc(tx + 9, y + 28, 9, 0, Math.PI * 2); ctx.fill();
        tx += 30;
      }
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(c.label, tx, y + 29);
      x += widths[i] + 18;
    });
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  }

  // ----- runners-up -----
  if (runnersUp.length > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `700 20px ${FONT}`;
    drawSpaced(ctx, "ALSO ON REPEAT", W / 2, 1186, 5);
    runnersUp.forEach((r, i) => {
      const ry = 1232 + i * 56;
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.beginPath(); ctx.arc(130, ry, 21, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = `700 22px ${FONT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(i + 2), 130, ry + 1);
      ctx.font = `600 28px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(fitText(ctx, prettyTitle(r.track.title, r.track.artist), W - 172 - 200), 172, ry + 1);
      ctx.textAlign = "right";
      ctx.font = `700 28px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.fillText(`${r.count}×`, W - 130, ry + 1);
    });
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "center";
  }
  if (runnersUp.length < 2) {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `600 22px ${FONT}`;
    ctx.textAlign = "center";
    drawSpaced(ctx, "REEL · YOUR WEEK IN MUSIC", W / 2, H - 64, 4);
  }
}

// Saves a file the user asked for. Android's WebView ignores <a download>, so the file goes to the
// system share sheet (save to Photos / Drive / send to a friend, which is what you want for a card).
async function downloadBlob(blob, filename) {
  try {
    if (blob.type.startsWith("image/")) await window.reel.saveImage(blob, filename);
    else await window.reel.saveText(await blob.text(), filename);
  } catch (err) {
    if (!/cancel/i.test(String(err?.message || err))) console.error("Reel: share failed", err);
  }
}

const MAX_SHARE_LINES = 6;

// Lyrics share card — same visual language as the Track-of-the-week card
// (dark bloom base, vinyl motif, spaced uppercase labels), drawn on canvas so
// the preview is pixel-identical to the saved PNG. 1080×1350. Three looks:
// "bloom" (dark), "aurora" (full-bleed color), "paper" (light).
function drawLyricsCard(canvas, { track, lines, style, onCoverReady }) {
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const FONT = 'Inter, "Segoe UI", -apple-system, system-ui, sans-serif';
  const moodDef = track.mood ? MOOD_PRESETS.find(m => m.key === track.mood) : null;
  const seed = track.artist + track.title;
  const h1 = hashStr(seed) % 360;
  const h2 = (h1 + 55 + (hashStr(seed + "x") % 40)) % 360;
  // the colours follow the cover; the mood / hash colours are only the fallback (no cover, or it cannot be read)
  const dom = coverDominant(track, onCoverReady);
  const toneA = (a) => dom ? hslAlpha(dom.primary, a) : moodDef ? hexToRgba(moodDef.color, a) : `hsla(${h1}, 72%, 52%, ${a})`;
  const toneB = (a) => dom ? hslAlpha(dom.secondary, a) : `hsla(${h2}, 72%, 48%, ${a})`;
  const accentSolid = dom ? hslShade(dom.primary, 60) : moodDef ? moodDef.color : `hsl(${h1} 72% 58%)`;
  const title = prettyTitle(track.title, track.artist);
  const paper = style === "paper", aurora = style === "aurora";
  const ink = paper ? "#1B1712" : "#FFFFFF";
  const inkDim = paper ? "rgba(27,23,18,0.62)" : "rgba(255,255,255,0.76)";
  const baseBg = paper ? "#F4EDE0" : "#0B0B0F";

  const bloom = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  ctx.fillStyle = baseBg; ctx.fillRect(0, 0, W, H);
  if (paper) {
    bloom(W * 0.10, H * 0.05, 840, toneA(0.32));
    bloom(W * 0.98, H * 0.50, 740, toneB(0.24));
    bloom(W * 0.30, H * 1.02, 720, toneA(0.22));
  } else if (aurora) {
    const g = ctx.createLinearGradient(0, 0, W * 0.6, H);
    g.addColorStop(0, dom ? hslShade(dom.primary, 42) : moodDef ? moodDef.color : `hsl(${h1} 78% 46%)`);
    g.addColorStop(1, dom ? hslShade(dom.secondary, 20) : `hsl(${h2} 74% 24%)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    bloom(W * 0.88, H * 0.10, 780, "rgba(255,255,255,0.24)");
    bloom(W * 0.08, H * 0.96, 780, toneB(0.55));
  } else {
    bloom(W * 0.16, H * 0.10, 840, toneA(0.55));
    bloom(W * 0.95, H * 0.44, 760, toneB(0.40));
    bloom(W * 0.34, H * 1.02, 720, toneA(0.36));
    const vig = ctx.createLinearGradient(0, 0, 0, H);
    vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  }

  // header: brand mark + LYRICS pill
  ctx.fillStyle = "#E8A33D";
  ctx.beginPath(); ctx.roundRect(72, 72, 64, 64, 16); ctx.fill();
  ctx.fillStyle = "#0D0D10";
  const bars = [18, 30, 38, 26, 16];
  let bx = 104 - (bars.length * 6 + (bars.length - 1) * 6) / 2;
  for (const bh of bars) { ctx.beginPath(); ctx.roundRect(bx, 104 - bh / 2, 6, bh, 3); ctx.fill(); bx += 12; }
  ctx.fillStyle = ink;
  ctx.font = `700 34px ${FONT}`;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("Reel", 154, 106);
  ctx.fillStyle = paper ? "rgba(27,23,18,0.07)" : "rgba(255,255,255,0.13)";
  ctx.beginPath(); ctx.roundRect(W - 72 - 190, 76, 190, 56, 28); ctx.fill();
  ctx.strokeStyle = paper ? "rgba(27,23,18,0.18)" : "rgba(255,255,255,0.22)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = ink; ctx.font = `700 22px ${FONT}`; ctx.textBaseline = "alphabetic";
  drawSpaced(ctx, "LYRICS", W - 72 - 95, 112, 6);

  // opening quote mark
  ctx.textAlign = "left";
  ctx.fillStyle = aurora ? "rgba(255,255,255,0.85)" : accentSolid;
  ctx.font = `900 260px Georgia, "Times New Roman", serif`;
  ctx.fillText("\u201C", 78, 410);

  // lyric lines — biggest size that fits the text region
  const maxW = W - 176, top = 440, bottom = 1040, regionH = bottom - top;
  const consecutive = (a, b) => b.i === a.i + 1;
  const layout = (fs) => {
    ctx.font = `800 ${fs}px ${FONT}`;
    const rows = []; let h = 0;
    lines.forEach((l, idx) => {
      if (idx > 0) { const gap = consecutive(lines[idx - 1], l) ? fs * 0.14 : fs * 0.55; rows.push({ gap }); h += gap; }
      for (const t of wrapText(ctx, l.text, maxW, 6)) { rows.push({ t }); h += fs * 1.2; }
    });
    return { rows, h };
  };
  let fs = 88, L = layout(fs);
  while (L.h > regionH && fs > 34) { fs -= 2; L = layout(fs); }
  ctx.font = `800 ${fs}px ${FONT}`;
  ctx.fillStyle = ink;
  let y = top + Math.max(0, (regionH - L.h) / 2);
  for (const r of L.rows) {
    if (r.gap) { y += r.gap; continue; }
    ctx.fillText(r.t, 88, y + fs * 0.92);
    y += fs * 1.2;
  }

  // sparkles
  const sparkle = (x, yy, s, a) => {
    ctx.save(); ctx.translate(x, yy); ctx.globalAlpha = a; ctx.fillStyle = paper ? accentSolid : "#fff";
    ctx.beginPath();
    const k = s * 0.22;
    ctx.moveTo(0, -s); ctx.quadraticCurveTo(k, -k, s, 0); ctx.quadraticCurveTo(k, k, 0, s);
    ctx.quadraticCurveTo(-k, k, -s, 0); ctx.quadraticCurveTo(-k, -k, 0, -s);
    ctx.fill(); ctx.restore();
  };
  sparkle(W - 130, 330, 26, 0.85); sparkle(W - 78, 410, 14, 0.6); sparkle(W - 170, 1060, 18, 0.55);

  // footer: divider, mini vinyl, title + artist
  const fy = 1130;
  ctx.fillStyle = paper ? "rgba(27,23,18,0.16)" : "rgba(255,255,255,0.20)";
  ctx.fillRect(88, fy - 30, W - 176, 2);
  const vx = 88 + 66, vy = fy + 84, vr = 66;
  const coverImg = coverImageFor(track.art, onCoverReady);
  if (coverImg) {
    // the song's own cover (same footprint as the little vinyl)
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.38)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#0B0B0E"; ctx.beginPath(); ctx.roundRect(vx - vr, vy - vr, vr * 2, vr * 2, 20); ctx.fill(); ctx.restore();
    drawCoverFill(ctx, coverImg, vx - vr, vy - vr, vr * 2, 20);
    ctx.strokeStyle = paper ? "rgba(27,23,18,0.14)" : "rgba(255,255,255,0.18)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(vx - vr, vy - vr, vr * 2, vr * 2, 20); ctx.stroke();
  } else {
    ctx.fillStyle = "#0B0B0E"; ctx.beginPath(); ctx.arc(vx, vy, vr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
    for (let r = 24; r < vr; r += 6) { ctx.beginPath(); ctx.arc(vx, vy, r, 0, Math.PI * 2); ctx.stroke(); }
    const lg = ctx.createLinearGradient(vx - 26, vy - 26, vx + 26, vy + 26);
    lg.addColorStop(0, accentSolid); lg.addColorStop(1, toneB(1));
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(vx, vy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = baseBg; ctx.beginPath(); ctx.arc(vx, vy, 5, 0, Math.PI * 2); ctx.fill();
  }
  const tx = 88 + vr * 2 + 36;
  ctx.textAlign = "left";
  ctx.fillStyle = ink; ctx.font = `700 42px ${FONT}`;
  ctx.fillText(fitText(ctx, title, W - 88 - tx), tx, vy - 6);
  ctx.fillStyle = inkDim; ctx.font = `500 30px ${FONT}`;
  ctx.fillText(fitText(ctx, track.artist, W - 88 - tx), tx, vy + 36);
}

function proceduralPeaks(seed, n = 180) {
  const peaks = [];
  let s = hashStr(seed) || 1;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff); };
  let base = 0.35;
  for (let i = 0; i < n; i++) {
    base += (rand() - 0.5) * 0.15;
    base = Math.max(0.08, Math.min(0.95, base));
    peaks.push(base);
  }
  return peaks;
}

function readImageAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   MediaElementEngine — streaming playback.

   Plays through a normal <audio> element (what Android keeps alive in the
   background and wires to the lock-screen controls) instead of decoding whole
   songs into memory. Interface: play / pause / resume / seek / rewind /
   getPosition / getDuration / onTrackEnd / onTick.
   ============================================================ */
class MediaElementEngine {
  constructor() {
    this.pausedOffset = 0;
    this.isPlaying = false;
    this.onTrackEnd = null;
    this._gen = 0;
    this._trackId = null;
    this._duration = 0;
    this._expectPause = 0;
    this._starting = false;
    this._vol = 1;
    this.onTick = null;          // (positionSec) — fired by the media element's own clock, also with the screen off
    this.onExternalPause = null; // fired when something OTHER than Reel pauses playback (video, call, focus loss)
    this.onExternalPlay = null;
    // ---- gapless / crossfade (both off by default; the player behaves exactly as before when they are) ----
    this.gapless = false;
    this.crossfade = 0;            // seconds; 0 = off
    this.nextProvider = null;      // () => the track that will play next, or null
    this.onAutoAdvance = null;     // (nextTrackId) => void — called when a crossfade moves on to the next song
    this._standbyId = null;        // id of the song pre-loaded into the spare element
    this._fadeOut = null;
    this._xfFading = false;
    this.audio = this._makeEl();   // the element that is "the player"
    this.standby = this._makeEl(); // the spare element used to pre-load the next song
    this._timer = setInterval(() => { try { this._tick(); } catch { /* never let a fade crash playback */ } }, 150);
  }

  // Every listener only reacts when it belongs to the element that is currently the player.
  _makeEl() {
    const a = new Audio();
    a.preload = "auto";
    a.addEventListener("pause", () => {
      if (a !== this.audio) return;
      if (this._expectPause > 0) { this._expectPause--; return; }
      if (!this._trackId || !this.isPlaying || a.ended) return;
      this._gen++;
      this.pausedOffset = a.currentTime;
      this.isPlaying = false;
      this.onExternalPause?.();
    });
    a.addEventListener("play", () => {
      if (a !== this.audio) return;
      if (this._starting || this.isPlaying || !this._trackId) return;
      this.isPlaying = true;
      this.onExternalPlay?.();
    });
    a.addEventListener("timeupdate", () => {
      if (a !== this.audio || !this.isPlaying) return;
      this.onTick?.(a.currentTime);
    });
    a.addEventListener("ended", () => {
      if (a !== this.audio || !this._trackId) return;
      this.isPlaying = false;
      this.onTrackEnd?.();
    });
    return a;
  }

  setVolume(v) {
    this._vol = Math.min(1, Math.max(0, v));
    if (!this._xfFading) this.audio.volume = this._vol;
  }

  _loaded() {
    const a = this.audio;
    if (a.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let timer = null, retried = false;
      const ok = () => { cleanup(); resolve(); };
      const bad = () => { cleanup(); reject(new Error(a.error?.message || "Could not load audio")); };
      const cleanup = () => { clearTimeout(timer); a.removeEventListener("loadedmetadata", ok); a.removeEventListener("error", bad); };
      // After a long pause Android can release the media without any event. Don't wait forever:
      // reload once, then give up with a clear message (instead of a frozen player).
      const arm = () => {
        timer = setTimeout(() => {
          if (!retried) { retried = true; try { a.load(); } catch { /* ignore */ } arm(); }
          else { cleanup(); reject(new Error("The song took too long to load — press play again")); }
        }, retried ? 8000 : 4000);
      };
      a.addEventListener("loadedmetadata", ok);
      a.addEventListener("error", bad);
      arm();
    });
  }

  /** Load the next song into the spare element so the switch is instant (gapless) or can be blended (crossfade). */
  preload(track) {
    if (this._xfFading) return; // the spare element is the one fading out right now
    if (!(this.gapless || this.crossfade > 0) || !track || !track.url) return;
    if (track.id === this._trackId || this._standbyId === track.id) return;
    try {
      this.standby.src = track.url;
      this.standby.load();
      this._standbyId = track.id;
    } catch { this._standbyId = null; }
  }

  _stopFade() {
    if (this._fadeOut) { try { this._fadeOut.pause(); } catch { /* ignore */ } this._fadeOut.volume = this._vol; this._fadeOut = null; }
    this._xfFading = false;
    this.audio.volume = this._vol;
  }

  _startCrossfade(next) {
    const old = this.audio, nu = this.standby;
    nu.volume = 0;
    try { nu.currentTime = 0; } catch { /* not seekable yet — starts from 0 anyway */ }
    const p = nu.play(); if (p && p.catch) p.catch(() => {});
    this.audio = nu; this.standby = old; this._standbyId = null;
    this._fadeOut = old;
    this._trackId = next.id;
    this._duration = Number.isFinite(nu.duration) ? nu.duration : 0;
    this.pausedOffset = 0;
    this.isPlaying = true;
    this._gen++;
    this._xfFading = true;
    this._xfStart = performance.now();
    this._xfDur = Math.max(1, this.crossfade);
    this.onAutoAdvance?.(next.id);
  }

  _tick() {
    if (this._xfFading) {
      const t = Math.min(1, (performance.now() - this._xfStart) / (this._xfDur * 1000));
      this.audio.volume = this._vol * Math.sin(t * Math.PI / 2);          // equal-power blend
      if (this._fadeOut) this._fadeOut.volume = this._vol * Math.cos(t * Math.PI / 2);
      if (t >= 1) this._stopFade();
      return;
    }
    if (!(this.crossfade > 0) || !this.isPlaying || !this._trackId) return;
    const a = this.audio, dur = this._duration || a.duration;
    if (!dur || !Number.isFinite(dur) || dur < this.crossfade * 2 + 2) return;
    const remaining = dur - a.currentTime;
    if (remaining > this.crossfade || remaining < 0.25) return;
    const next = this.nextProvider?.();
    if (!next || next.id === this._trackId) return;
    if (this._standbyId !== next.id) { this.preload(next); return; }
    if (this.standby.error || this.standby.readyState < 3) return;        // not buffered yet → the normal (gapless) end handles it
    this._startCrossfade(next);
  }

  async play(track, offset = 0) {
    const gen = ++this._gen;
    this._starting = true;
    try {
      if (this._trackId !== track.id) {
        this._stopFade();
        if ((this.gapless || this.crossfade > 0) && this._standbyId === track.id && !this.standby.error && this.standby.readyState >= 1) {
          // the song is already loaded in the spare element: swap instead of loading — no gap
          const old = this.audio;
          this.audio = this.standby; this.standby = old; this._standbyId = null;
          try { old.pause(); } catch { /* ignore */ }
          this.audio.volume = this._vol;
        } else {
          this.audio.src = track.url;
        }
        this._trackId = track.id;
        this._duration = 0;
      }
      const a = this.audio;
      // the element failed or lost its source while paused (long pause / app in the background): point it at the file again
      if (a.error || (a.readyState === 0 && a.networkState === 3)) { a.src = track.url; }
      await this._loaded();
      if (gen !== this._gen) return null; // a newer play()/pause()/seek() superseded this call
      const dur = Number.isFinite(a.duration) ? a.duration : 0;
      this._duration = dur;
      a.currentTime = Math.min(Math.max(0, offset), dur || offset);
      await Promise.race([a.play(), new Promise((_, rej) => setTimeout(() => rej(new Error("Couldn't start playback — press play again")), 20000))]);
      if (gen !== this._gen) return null;
      this.isPlaying = true;
      return dur;
    } finally {
      this._starting = false;
    }
  }

  pause() {
    this._gen++;
    this._stopFade();
    this.pausedOffset = this.getPosition();
    if (!this.audio.paused) this._expectPause++;
    this.audio.pause();
    this.isPlaying = false;
  }

  resume(track) { return this.play(track, this.pausedOffset); }

  /** Back to the start of the current song without playing (end of the queue). */
  rewind() {
    this.pausedOffset = 0;
    try { this.audio.currentTime = 0; } catch { /* not loaded */ }
  }

  dispose() {
    clearInterval(this._timer);
    try { this.audio.pause(); this.standby.pause(); } catch { /* ignore */ }
  }

  async seek(track, offsetSec) {
    this._gen++;
    this.pausedOffset = offsetSec;
    if (this._trackId === track.id && this.audio.readyState >= 1) this.audio.currentTime = offsetSec;
    if (this.isPlaying) return this._duration; // playback just continues from the new position
    return undefined;
  }

  getPosition() {
    return this.isPlaying ? this.audio.currentTime : this.pausedOffset;
  }

  getDuration() { return this._duration; }
}

/* ============================================================
   Sub-components
   ============================================================ */
/* ---------- phone: swipe a bottom sheet down to close it ---------- */
const _swipeState = new WeakMap();
function sheetSwipe(onClose) {
  return {
    onClick: (e) => e.stopPropagation(),
    onTouchStart: (e) => {
      const el = e.currentTarget;
      // don't hijack the gesture when the user is scrolling a list that is not at its top
      for (let n = e.target; n && n !== el; n = n.parentElement) if (n.scrollTop > 0) { _swipeState.delete(el); return; }
      if (el.scrollTop > 0) { _swipeState.delete(el); return; }
      _swipeState.set(el, { y0: e.touches[0].clientY, t0: Date.now(), dy: 0 });
      el.style.transition = "none";
    },
    onTouchMove: (e) => {
      const el = e.currentTarget, st = _swipeState.get(el); if (!st) return;
      const dy = e.touches[0].clientY - st.y0; st.dy = dy;
      el.style.transform = dy > 0 ? `translateY(${dy}px)` : "";
    },
    onTouchEnd: (e) => {
      const el = e.currentTarget, st = _swipeState.get(el); if (!st) return;
      _swipeState.delete(el);
      const speed = st.dy / Math.max(1, Date.now() - st.t0);
      el.style.transition = "transform .2s ease";
      if (st.dy > 90 || (st.dy > 36 && speed > 0.5)) { el.style.transform = "translateY(100%)"; setTimeout(onClose, 170); }
      else { el.style.transform = ""; }
    },
    onTouchCancel: (e) => { const el = e.currentTarget; _swipeState.delete(el); el.style.transition = "transform .2s ease"; el.style.transform = ""; },
  };
}

/* ---------- phone, Player view: the line being sung, under the cover (synced lyrics only) ---------- */
function LiveLyricLine({ lines, index }) {
  const ref = useRef({ cur: index, prev: -1 });
  if (ref.current.cur !== index) ref.current = { cur: index, prev: ref.current.cur };
  const { cur, prev } = ref.current;
  const text = (i) => (i >= 0 && lines[i] ? String(lines[i].text || "").trim() : "");
  const a = text(cur), b = text(prev);
  return (
    <div className="live-ly" aria-live="polite">
      {b && <div key={`o${prev}`} className="live-ly-in live-ly-out"><span>{b}</span></div>}
      {a && <div key={`i${cur}`} className="live-ly-in live-ly-enter"><span>{a}</span></div>}
    </div>
  );
}

/* Phone lists build 40 rows first and add more just before the user reaches them, so a big library opens instantly
   (before, every row — and every cover — was built at once, which took seconds). */
function MobileRows({ tracks, row }) {
  const [n, setN] = useState(40);
  const endRef = useRef(null);
  const shown = Math.min(n, tracks.length);
  useEffect(() => {
    if (shown >= tracks.length || !endRef.current || typeof IntersectionObserver === "undefined") { if (shown < tracks.length && typeof IntersectionObserver === "undefined") setN(tracks.length); return; }
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) setN(c => c + 60); }, { rootMargin: "700px 0px" });
    io.observe(endRef.current);
    return () => io.disconnect();
  }, [shown, tracks.length]);
  return <>{tracks.slice(0, shown).map(row)}{shown < tracks.length && <div ref={endRef} style={{ height: 1 }} />}</>;
}

const TrackThumb = React.memo(function TrackThumb({ track, isPlaying, size = 32 }) {
  const art = lightArt(track.art);
  const bg = art ? `url(${art}) center/cover` : coverGradient(track.id);
  return (
    <div className={`track-thumb${isPlaying ? " thumb-breathing" : ""}`} style={{ width: size, height: size, background: bg }}>
      {isPlaying ? (
        <div className="playing-bars">
          <span className="bar" style={{ animationDelay: "0s" }} />
          <span className="bar" style={{ animationDelay: "0.15s" }} />
          <span className="bar" style={{ animationDelay: "0.3s" }} />
        </div>
      ) : (
        <Music2 size={size * 0.42} strokeWidth={1.8} />
      )}
    </div>
  );
});

function Waveform({ peaks, progress, onSeek, accent }) {
  const ref = useRef(null);
  const draw = useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const n = peaks.length;
    const gap = 2;
    const barW = Math.max(1.5, w / n - gap);
    const progressX = progress * w;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w;
      const barH = Math.max(2, peaks[i] * h);
      const y = (h - barH) / 2;
      ctx.fillStyle = x < progressX ? accent : "rgba(138,138,147,0.35)";
      ctx.fillRect(x, y, barW, barH);
    }
  }, [peaks, progress, accent]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div className="waveform-wrap" onClick={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      onSeek((e.clientX - rect.left) / rect.width);
    }}>
      <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

function LinearSeekBar({ progress, onSeek, accent }) {
  return (
    <div
      className="linear-seek-wrap"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientX - rect.left) / rect.width);
      }}
    >
      <div className="linear-seek-track">
        <div className="linear-seek-fill" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%`, background: accent }} />
        <div className="linear-seek-thumb" style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%`, background: accent }} />
      </div>
    </div>
  );
}

// Picks waveform bars or a plain line per the user's Settings > Seek bar style choice.
function SeekBar({ style, peaks, progress, onSeek, accent }) {
  return style === "line"
    ? <LinearSeekBar progress={progress} onSeek={onSeek} accent={accent} />
    : <Waveform peaks={peaks} progress={progress} onSeek={onSeek} accent={accent} />;
}

function SpectrumCanvas({ isPlaying, accent }) {
  const ref = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const bufferLength = 64;
    const data = new Uint8Array(bufferLength);

    function frame() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (isPlaying) {
        // Audio plays through a plain <audio> element (no analyser data) — animate instead.
        const t = performance.now() / 1000;
        for (let k = 0; k < bufferLength; k++) {
          const v = 70 + 120 * Math.sin(t * 3.1 + k * 0.33) * Math.cos(t * 1.3 + k * 0.09) * (1 - (k / bufferLength) * 0.55) + 40 * Math.sin(t * 7 + k);
          data[k] = Math.max(0, Math.min(255, v));
        }
      } else {
        data.fill(0);
      }
      const bars = 56;
      const step = Math.floor(bufferLength / bars);
      const barW = (w / bars) * 0.6;
      const gap = (w / bars) * 0.4;
      for (let i = 0; i < bars; i++) {
        let v = data[i * step] || 0;
        if (!isPlaying) v = 6 + Math.sin(i * 0.4) * 4;
        const barH = Math.max(3, (v / 255) * h);
        const x = i * (barW + gap);
        const y = h - barH;
        const grad = ctx.createLinearGradient(0, y, 0, h);
        grad.addColorStop(0, accent);
        grad.addColorStop(1, hexToRgba(accent, 0.25));
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barW, barH);
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    frame();
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [isPlaying, accent]);

  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

/* Progress ring around the vinyl disc. Reads position/duration straight off
   the audio engine on its own rAF loop and writes strokeDashoffset directly
   to the DOM, instead of depending on App's `position` state + a full
   reconciliation pass. That's what was causing the ring to visibly stall
   during playback and only "catch up" when playback stopped: App is a very
   large component, and a state update that fires every animation frame was
   competing with everything else App re-renders on each tick (waveform,
   spectrum canvas, track list, etc.), so the ring's style update could sit
   queued behind other work rather than applying every frame like the plain
   linear seek bar (which isn't gated on a full re-render either). Driving it
   independently guarantees it always reflects live playback immediately. */
function VinylProgressRing({ engineRef, isPlaying, fallbackProgress }) {
  const circleRef = useRef(null);

  useEffect(() => {
    let raf;
    const tick = () => {
      const engine = engineRef.current;
      const circle = circleRef.current;
      if (circle) {
        let progress = fallbackProgress;
        if (engine) {
          const dur = engine.getDuration();
          if (dur) progress = Math.min(1, Math.max(0, engine.getPosition() / dur));
        }
        circle.style.strokeDashoffset = VINYL_RING_CIRCUMFERENCE * (1 - progress);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // fallbackProgress covers the paused/stopped case (derived from App's
    // position state); engineRef is a stable ref so this never has to
    // re-subscribe mid-playback the way an isPlaying-gated effect would.
  }, [engineRef, fallbackProgress]);

  return (
    <svg className="vinyl-progress-ring" viewBox="0 0 320 320">
      <circle cx="160" cy="160" r={VINYL_RING_RADIUS} className="vinyl-progress-track" />
      <circle
        ref={circleRef}
        cx="160" cy="160" r={VINYL_RING_RADIUS}
        className="vinyl-progress-fill"
        style={{ strokeDasharray: VINYL_RING_CIRCUMFERENCE, strokeDashoffset: VINYL_RING_CIRCUMFERENCE * (1 - fallbackProgress) }}
      />
    </svg>
  );
}

/* ============================================================
   Main App
   ============================================================ */
const BUDDY_LINES = {
  energy: "Let's gooo!",
  happy: "Good vibes only!",
  romantic: "Feeling the love~",
  focus: "Locked in.",
  chill: "Easy does it~",
  peace: "Breathe in… and out…",
  sad: "It's okay to feel this.",
  none: "Tag a mood for me!",
  sleep: "Play something…",
  paused: "Waiting for the beat…",
};

function mixHex(hex, withHex, t) {
  const a = hex.replace("#", ""), b = withHex.replace("#", "");
  const ch = (i) => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t);
  return `rgb(${ch(0)},${ch(2)},${ch(4)})`;
}

const BUDDY_HEART = "M12 21 C5 15 2 11 2 7.5 C2 4.5 4.4 2.5 7 2.5 C9 2.5 10.8 3.6 12 5.4 C13.2 3.6 15 2.5 17 2.5 C19.6 2.5 22 4.5 22 7.5 C22 11 19 15 12 21 Z";
const BUDDY_BOLT = "M13 2 L4 14 H11 L10 22 L20 9 H13 Z";
const BUDDY_SPARK = "M12 2 C12 8 16 12 22 12 C16 12 12 16 12 22 C12 16 8 12 2 12 C8 12 12 8 12 2 Z";


export default function App() {
  // libraryAll = every track the player can play, including songs only being streamed from Explore (transient).
  // library    = what the user actually added. Only the user can add a song to it.
  const [libraryAll, setLibrary] = useState([]);
  const library = useMemo(() => libraryAll.filter(t => !t.transient), [libraryAll]);
  const [favorites, setFavorites] = useState(() => new Set());
  const [playlists, setPlaylists] = useState([]); // { id, name, trackIds: [], coverImage: dataURL|null }
  const [openPlaylistId, setOpenPlaylistId] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);

  const [page, setPage] = useState("library"); // library | favorites | playlists | queue | recent | artists
  const [query, setQuery] = useState("");
  const [minSeconds, setMinSeconds] = useState(15);   // skip clips shorter than this when scanning
  const [featIn, setFeatInState] = useState("title");   // featured artists go in the title or in the artist field
  const [density, setDensity] = useState("comfortable");
  const [design, setDesign] = useState("classic"); // classic | bloom | turntable
  const [trackView, setTrackView] = useState("auto"); // auto (design default) | list | grid
  const [sort, setSort] = useState({ key: "dateAdded", dir: "desc" });

  // Artists: derived from library.artist (name-keyed, no separate artist ids
  // in this store's schema) plus an optional user-supplied photo per name.
  const [openArtistName, setOpenArtistName] = useState(null);
  const [artistPhotos, setArtistPhotos] = useState({}); // artistName -> dataURL
  // Names explicitly created via "+ New Artist", so an artist can exist (and
  // show up in the Artists page) before any track is actually assigned to
  // it — the derived group-by-track-artist below wouldn't produce an entry
  // for a brand new, still-empty artist on its own.
  const [registeredArtistNames, setRegisteredArtistNames] = useState([]);
  const [createArtistOpen, setCreateArtistOpen] = useState(false);
  const [newArtistName, setNewArtistName] = useState("");
  const [renamingArtist, setRenamingArtist] = useState(false);
  const [artistNameEdit, setArtistNameEdit] = useState("");
  const [addSongsToArtistOpen, setAddSongsToArtistOpen] = useState(false);
  const [assignArtistMenuOpen, setAssignArtistMenuOpen] = useState(false);
  const [selectionNewArtistName, setSelectionNewArtistName] = useState("");
  const [deleteArtistConfirm, setDeleteArtistConfirm] = useState(null); // artist name pending delete confirmation
  // Drag-and-drop reordering state, shared by the Queue and playlist-detail
  // track tables — a single active drag at a time, so one pair of refs
  // covers both instead of duplicating per-list state.
  const [dragFromIndex, setDragFromIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const artistPhotoInputRef = useRef(null);

  const [queue, setQueue] = useState([]);
  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const online = useOnline(); // must stay above every effect/memo that reads it (used in dependency arrays)
  const [shuffle, setShuffle] = useState(false);
  const queuePosRef = useRef(-1); // where the playing song sits in the queue (the same song can appear twice)
  const preShuffleQueueRef = useRef(null); // backs up the pre-shuffle order so turning shuffle off can restore it
  const [repeatMode, setRepeatMode] = useState("off");
  const [volume, setVolume] = useState(0.8);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const [playCounts, setPlayCounts] = useState({});
  const [playHistory, setPlayHistory] = useState([]); // [{id, ts}] — see Stats page
  const [moodReactions, setMoodReactions] = useState([]); // [{id, mood, ts}] — in-player mood taps, see Stats "taste check"
  const [reactionPops, setReactionPops] = useState([]); // transient floating pop animations for mood-tap feedback
  const [artGlowCache, setArtGlowCache] = useState({}); // trackId -> [color1, color2] sampled from that track's own art
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [lyricsMap, setLyricsMap] = useState({}); // trackId -> { format: 'lrc'|'plain', source, lines: [{time_sec,text}], raw_lrc }

  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [pasteLyricsOpen, setPasteLyricsOpen] = useState(false);
  const [pasteLyricsText, setPasteLyricsText] = useState("");
  const [editLyricsOpen, setEditLyricsOpen] = useState(false);
  const [editLyricsDraft, setEditLyricsDraft] = useState([]); // [{ text, time_sec }]
  const [tapSyncActive, setTapSyncActive] = useState(false);
  const [tapSyncTimes, setTapSyncTimes] = useState([]); // time_sec collected so far, one per tapped line
  const [shareOpen, setShareOpen] = useState(false); // lyrics share-card picker
  const [shareSel, setShareSel] = useState([]); // selected lyric line indices (sorted)
  const [shareStyle, setShareStyle] = useState("bloom"); // bloom | aurora | paper
  const [repeatLoops, setRepeatLoops] = useState(0); // completed repeat-one loops of the current track
  const [appToasts, setAppToasts] = useState([]); // [{id, text}] floating toast stack (loop-streak, etc.)
  const loopStreakRef = useRef({ id: null, count: 0 }); // consecutive same-track completions, this sitting only — never persisted

  // Real listened-time tracking for playHistory entries — see flushListenedSeconds.
  // "Listening time" everywhere in Stats should mean actual seconds spent
  // playing something, not the nominal duration of whatever was started
  // (starting a track and skipping off it seconds later isn't 4 minutes of
  // listening just because the file happens to be 4 minutes long).
  const listenedSecRef = useRef(0); // accumulated seconds for the currently-open playHistory entry
  const lastEnginePosRef = useRef(null); // engine position at the previous clock tick, while playing
  const openEntryTsRef = useRef(null); // ts of the playHistory entry currently accumulating time
  function flushListenedSeconds() {
    if (openEntryTsRef.current == null) return;
    const ts = openEntryTsRef.current;
    const sec = Math.round(listenedSecRef.current);
    setPlayHistory(prev => prev.map(h => h.ts === ts ? { ...h, listenedSec: sec } : h));
  }
  // Registers the start of a play: closes the previous play-history entry,
  // bumps the play count and opens a fresh entry. Runs when a different track
  // starts AND on every repeat-one loop, so each loop counts as a real play
  // (Stats, Recent, Track of the Week and milestones all read from these).
  function recordPlayStart(id) {
    flushListenedSeconds();
    listenedSecRef.current = 0;
    lastEnginePosRef.current = null;
    setPlayCounts(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    setRecentlyPlayed(prev => [id, ...prev.filter(x => x !== id)].slice(0, 50));
    const newTs = Date.now();
    openEntryTsRef.current = newTs;
    setPlayHistory(prev => [...prev, { id, ts: newTs, listenedSec: 0 }].slice(-20000));
  }
  const [idleAmbientActive, setIdleAmbientActive] = useState(false); // slow-drifting screensaver after a while with nothing playing
  const idleAmbientTimerRef = useRef(null);
  const lyricsFileInputRef = useRef(null);
  const lyricsActiveLineRef = useRef(null);
  const [npView, setNpView] = useState("vinyl");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accentKey, setAccentKey] = useState("amber");
  const [theme, setTheme] = useState("dark"); // dark | light
  const [seekBarStyle, setSeekBarStyle] = useState("waveform"); // waveform | line
  const [lastWeeklyRecapWeek, setLastWeeklyRecapWeek] = useState(null); // "2026-W38" style key, so the recap fires at most once per week
  const [unlockedMilestones, setUnlockedMilestones] = useState([]); // hour thresholds already crossed + notified
  // "Made for you": playlists proposed from the user's own songs (see online/suggest.js)
  const [suggestions, setSuggestions] = useState([]);       // { id, name, kind, seedKey, trackIds, cover }
  const [dismissedSeeds, setDismissedSeeds] = useState([]); // { seed, size } — not proposed again unless it grows by 50 %
  const [enrichment, setEnrichment] = useState({});         // album/artist -> { genre, year, related[], fetchedAt }
  const [suggestMeta, setSuggestMeta] = useState({ builtAt: 0, libCount: 0, enrCount: 0 });
  const [lastVisitAt, setLastVisitAt] = useState(0);
  const prevVisitRef = useRef(0);
  const [openSuggestionId, setOpenSuggestionId] = useState(null);
  const [enriching, setEnriching] = useState(false);

  // selection
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [trackSheet, setTrackSheet] = useState(null); // { track, context } — phone long-press menu
  const lpTimerRef = useRef(null);
  const lpFiredRef = useRef(false);
  const [sheetPlaylistsOpen, setSheetPlaylistsOpen] = useState(false);
  const [selCtx, setSelCtx] = useState("library");
  const [selSheet, setSelSheet] = useState(null); // "playlist" | "artist" | "more"
  const [npMenuOpen, setNpMenuOpen] = useState(false);
  const visibleSelRef = useRef([]);
  const [addToPlaylistMenuOpen, setAddToPlaylistMenuOpen] = useState(false);
  const [selectionNewPlaylistName, setSelectionNewPlaylistName] = useState("");

  // edit track (title/artist/album)
  const [editingTrack, setEditingTrack] = useState(null); // track object or null
  const [editForm, setEditForm] = useState({ title: "", artist: "", album: "", mood: "" });
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({ artist: "", album: "", mood: "" }); // mood: "" = no change, "__clear__" = clear, else a MOOD_PRESETS key
  const [renamingPlaylist, setRenamingPlaylist] = useState(false);
  const [playlistNameEdit, setPlaylistNameEdit] = useState("");

  // add-songs modal (playlist detail)
  const [addSongsOpen, setAddSongsOpen] = useState(false);
  const [addSongsQuery, setAddSongsQuery] = useState(""); // search box in the two "add songs" lists
  const [addSongsSelected, setAddSongsSelected] = useState(() => new Set());

  const engineRef = useRef(null);
  const coverInputRef = useRef(null);
  const skipEnginePlayRef = useRef(false);


  const accent = (ACCENTS[accentKey] || ACCENTS.amber).hex;

  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.textContent = GLOBAL_CSS;
    document.head.appendChild(styleEl);
    return () => document.head.removeChild(styleEl);
  }, []);

  const THEME_PALETTES = {
    dark: {
      bg: "#0D0D10", surface: "#17171B", surface2: "#1E1E23", line: "#26262C",
      text: "#EDEDED", textDim: "#8A8A93", textFaint: "#55555D",
    },
    light: {
      bg: "#F6F6F7", surface: "#FFFFFF", surface2: "#EFEFF1", line: "#E1E1E5",
      text: "#17171B", textDim: "#5B5B63", textFaint: "#9A9AA1",
    },
  };
  const palette = THEME_PALETTES[theme];

  const rootStyle = {
    "--accent": accent,
    "--accent-dim": hexToRgba(accent, 0.18),
    "--accent-glow": hexToRgba(accent, 0.35),
    "--bg": palette.bg,
    "--surface": palette.surface,
    "--surface-2": palette.surface2,
    "--line": palette.line,
    "--text": palette.text,
    "--text-dim": palette.textDim,
    "--text-faint": palette.textFaint,
  };

  // --- playback engine: one <audio>-based engine, no Web Audio graph ---
  useEffect(() => {
    const engine = new MediaElementEngine();
    engineRef.current = engine;
    engine.onTrackEnd = () => handleTrackEndRef.current?.();
    // Another app took the audio (video, call…): reflect it in the UI so the notification's Play works again.
    engine.onExternalPause = () => setIsPlaying(false);
    engine.onExternalPlay = () => setIsPlaying(true);
    engine.onTick = (pos) => tickRef.current?.(pos);
    return () => { engine.dispose(); if (engineRef.current === engine) engineRef.current = null; };
  }, []);

  useEffect(() => {
    engineRef.current?.setVolume?.(volume);
  }, [volume]);

  // reset selection when navigating
  useEffect(() => { setSelectedIds(new Set()); setAddToPlaylistMenuOpen(false); setAssignArtistMenuOpen(false); }, [page, openPlaylistId]);
  // Leaving the Playlists page (or opening a real playlist) closes any open
  // smart-playlist/mood detail view, so coming back always lands on the index.
  useEffect(() => {
    if (page !== "playlists" || openPlaylistId) { setOpenSmartKey(null); setOpenMoodKey(null); setOpenSuggestionId(null); }
  }, [page, openPlaylistId]);

  const currentTrack = useMemo(
    () => libraryAll.find(t => t.id === currentTrackId) || null,
    [libraryAll, currentTrackId]
  );

  /* ---------------- Lyrics ---------------- */
  const currentLyrics = currentTrack ? lyricsMap[currentTrack.id] || null : null;
  const lyricsIsSynced = !!(
    currentLyrics && currentLyrics.format === "lrc" && currentLyrics.lines?.length > 0 &&
    currentLyrics.lines.every(l => typeof l.time_sec === "number")
  );

  const activeLyricsLineIndex = useMemo(() => {
    if (!lyricsIsSynced) return -1;
    let idx = -1;
    for (let i = 0; i < currentLyrics.lines.length; i++) {
      if (currentLyrics.lines[i].time_sec <= position) idx = i;
      else break;
    }
    return idx;
  }, [lyricsIsSynced, currentLyrics, position]);

  // Tracks after the current one in the live queue order — feeds the "Up next"
  // panel in the Bloom / Turntable Now Playing layouts.
  const upNextTracks = useMemo(() => {
    const i = queueIndexOf(queue, currentTrackId, queuePosRef.current);
    if (i < 0) return [];
    const byId = new Map(libraryAll.map(t => [t.id, t]));
    return queue.slice(i + 1, i + 7).map(id => byId.get(id)).filter(Boolean);
  }, [queue, currentTrackId, libraryAll]);

  // A different track means different lyrics: close the share picker, and
  // restart the repeat-one loop counter.
  useEffect(() => { setShareOpen(false); setRepeatLoops(0); }, [currentTrackId]);
  useEffect(() => { if (repeatMode !== "one") setRepeatLoops(0); }, [repeatMode]);

  // Idle ambient screensaver — fades in a slow-drifting version of the last
  // track's glow once nothing is playing AND the user hasn't touched the
  // mouse/keyboard for a while, instead of the app just sitting static.
  // Any real interaction resets the countdown (throttled so a stream of
  // mousemove events doesn't clear/reset a timer dozens of times a second),
  // so it never fires while someone is actively using the app — only when
  // it's genuinely been left alone.
  const lastIdleActivityRef = useRef(0);

  function armIdleAmbientTimer() {
    if (idleAmbientTimerRef.current) clearTimeout(idleAmbientTimerRef.current);
    idleAmbientTimerRef.current = setTimeout(() => setIdleAmbientActive(true), IDLE_AMBIENT_DELAY_MS);
  }

  function dismissIdleAmbient() {
    setIdleAmbientActive(false);
    if (idleAmbientTimerRef.current) clearTimeout(idleAmbientTimerRef.current);
    if (!snapRef.current.isPlaying) armIdleAmbientTimer();
  }

  useEffect(() => {
    if (idleAmbientTimerRef.current) clearTimeout(idleAmbientTimerRef.current);
    if (isPlaying) {
      setIdleAmbientActive(false);
      return;
    }
    armIdleAmbientTimer();
    const onActivity = () => {
      const now = Date.now();
      if (now - lastIdleActivityRef.current < 1500) return; // throttle
      lastIdleActivityRef.current = now;
      setIdleAmbientActive(false);
      armIdleAmbientTimer();
    };
    const events = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"];
    events.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));
    return () => {
      events.forEach(ev => window.removeEventListener(ev, onActivity));
      if (idleAmbientTimerRef.current) clearTimeout(idleAmbientTimerRef.current);
    };
  }, [isPlaying]);

  // Also treat opening Now Playing as an interaction — otherwise closing it
  // again moments later could instantly show the screensaver instead of
  // waiting out the delay again.
  useEffect(() => {
    if (nowPlayingOpen) dismissIdleAmbient();
  }, [nowPlayingOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // The phone app has no spectrum view; a saved "spectrum" choice falls back to the vinyl.
  useEffect(() => { if (npView === "spectrum") setNpView("cover"); }, [npView]);
  const npDefaultedRef = useRef(false);
  useEffect(() => { if (!npDefaultedRef.current) { npDefaultedRef.current = true; setNpView(v => v === "vinyl" ? "cover" : v); } }, []);

  // Auto-scroll so the active line stays centered — only fires on an actual
  // line transition (activeLyricsLineIndex is memoized), not every frame.
  // This used to call the native scrollIntoView({behavior:"smooth"}), but
  // native smooth-scroll timing/easing isn't controllable and reads as an
  // abrupt jump rather than the eased glide a lyrics view like Spotify's
  // has. Driving scrollTop with a manual eased tween gives the same "slide
  // up to the next line" motion with a duration/easing we actually control.
  useEffect(() => {
    if (activeLyricsLineIndex < 0 || !lyricsActiveLineRef.current) return;
    const line = lyricsActiveLineRef.current;
    const container = line.closest(".lyrics-synced");
    if (!container) return;
    // slide the whole list with a GPU transform (CSS handles the easing) —
    // driving scrollTop every frame is choppy in Android's WebView.
    const list = line.parentElement;
    // keep the current line in the upper third (no empty band above the lyrics)
    const topAnchor = line.offsetTop - container.clientHeight * 0.3;
    if (list) list.style.transform = `translate3d(0, ${-Math.max(0, topAnchor)}px, 0)`;
  }, [activeLyricsLineIndex, npView, nowPlayingOpen]);

  const handleImportLyrics = useCallback(async () => {
    if (!currentTrack) return;
    const result = await window.reel.lyrics.pickFile();
    if (!result) return;
    const timedLines = parseLRC(result.content);
    if (timedLines.length > 0) {
      setLyricsMap(prev => ({ ...prev, [currentTrack.id]: { format: "lrc", source: "imported", lines: timedLines, raw_lrc: result.content } }));
    } else {
      const plainLines = result.content.split(/\r?\n/).map(t => t.trim()).filter(Boolean).map(text => ({ time_sec: null, text }));
      setLyricsMap(prev => ({ ...prev, [currentTrack.id]: { format: "plain", source: "imported", lines: plainLines, raw_lrc: null } }));
    }
  }, [currentTrack]);

  const handleImportLyricsFile = useCallback((file) => {
    if (!currentTrack || !file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      const timedLines = parseLRC(content);
      if (timedLines.length > 0) {
        setLyricsMap(prev => ({ ...prev, [currentTrack.id]: { format: "lrc", source: "imported", lines: timedLines, raw_lrc: content } }));
      } else {
        const plainLines = content.split(/\r?\n/).map(t => t.trim()).filter(Boolean).map(text => ({ time_sec: null, text }));
        setLyricsMap(prev => ({ ...prev, [currentTrack.id]: { format: "plain", source: "imported", lines: plainLines, raw_lrc: null } }));
      }
    };
    reader.readAsText(file);
  }, [currentTrack]);

  const savePastedLyrics = useCallback(() => {
    if (!currentTrack || !pasteLyricsText.trim()) return;
    // People often paste directly from lyric sites/exports that already
    // include [mm:ss.xx] tags, expecting it to "just work" — treating that
    // verbatim as plain text bakes the raw brackets into every line instead
    // of using them as the sync data they actually are.
    const looksLikeLRC = /\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/.test(pasteLyricsText);
    const timedLines = looksLikeLRC ? parseLRC(pasteLyricsText) : [];
    if (timedLines.length > 0) {
      setLyricsMap(prev => ({ ...prev, [currentTrack.id]: { format: "lrc", source: "manual", lines: timedLines, raw_lrc: pasteLyricsText } }));
    } else {
      const plainLines = pasteLyricsText.split(/\r?\n/).map(t => t.trim()).filter(Boolean).map(text => ({ time_sec: null, text }));
      setLyricsMap(prev => ({ ...prev, [currentTrack.id]: { format: "plain", source: "manual", lines: plainLines, raw_lrc: null } }));
    }
    setPasteLyricsOpen(false);
    setPasteLyricsText("");
  }, [currentTrack, pasteLyricsText]);

  // Lyrics line editor — lets mistakes from tap-to-sync (or a bad paste) get
  // fixed without redoing the whole thing: edit text, delete a line, re-tap
  // just one line's timestamp, add a line, or clear everything and start over.
  const openEditLyrics = useCallback(() => {
    if (!currentLyrics) return;
    setEditLyricsDraft(currentLyrics.lines.map(l => ({ ...l })));
    setEditLyricsOpen(true);
  }, [currentLyrics]);

  const updateDraftLineText = (i, text) => {
    setEditLyricsDraft(prev => prev.map((l, idx) => idx === i ? { ...l, text } : l));
  };
  const deleteDraftLine = (i) => {
    setEditLyricsDraft(prev => prev.filter((_, idx) => idx !== i));
  };
  const retapDraftLine = (i) => {
    setEditLyricsDraft(prev => prev.map((l, idx) => idx === i ? { ...l, time_sec: position } : l));
  };
  const addDraftLine = () => {
    setEditLyricsDraft(prev => [
      ...prev,
      { text: "", time_sec: prev.length > 0 && typeof prev[prev.length - 1].time_sec === "number" ? position : null },
    ]);
  };
  const saveEditLyrics = () => {
    if (!currentTrack) return;
    const cleaned = editLyricsDraft.map(l => ({ ...l, text: l.text.trim() })).filter(l => l.text);
    if (cleaned.length === 0) { deleteLyrics(); return; }
    const allTimed = cleaned.every(l => typeof l.time_sec === "number");
    const lines = allTimed ? [...cleaned].sort((a, b) => a.time_sec - b.time_sec) : cleaned.map(l => ({ text: l.text, time_sec: null }));
    setLyricsMap(prev => ({
      ...prev,
      [currentTrack.id]: { format: allTimed ? "lrc" : "plain", source: "manual", lines, raw_lrc: allTimed ? linesToLRC(lines) : null },
    }));
    setEditLyricsOpen(false);
  };
  const deleteLyrics = () => {
    if (!currentTrack) return;
    setLyricsMap(prev => { const n = { ...prev }; delete n[currentTrack.id]; return n; });
    setEditLyricsOpen(false);
  };

  // Export lyrics as a standalone file — synced lyrics go out as .lrc
  // (readable by other players), unsynced as plain .txt. Separate from the
  // best-effort auto-write next to the track file after tap-sync (which is
  // silent and only fires once, right after syncing): this is an explicit,
  // user-triggered save-anywhere so edits made afterward, or lyrics that
  // predate that auto-write, can still be exported on demand.
  const exportLyrics = () => {
    if (!currentTrack || !currentLyrics) return;
    const synced = lyricsIsSynced;
    const content = synced
      ? (currentLyrics.raw_lrc || linesToLRC(currentLyrics.lines))
      : currentLyrics.lines.map(l => l.text).join("\n");
    const ext = synced ? "lrc" : "txt";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const safeName = `${currentTrack.artist} - ${currentTrack.title}`.replace(/[^\w\- ]+/g, "").trim().slice(0, 80) || "lyrics";
    downloadBlob(blob, `${safeName}.${ext}`);
  };


  // startTapToSync below) — its own dependency array only references stable
  // setState functions, so it's safe this early, and anything declared later
  // that lists it as a useCallback/useMemo dependency needs it to already be
  // initialized: a dependency array is evaluated immediately at render time,
  // not deferred like the callback body itself, so referencing a `const`
  // that's declared further down the component throws "Cannot access
  // before initialization" the instant React evaluates that hook call.
  const playTrackId = useCallback((id, ctxQueue, atIndex) => {
    if (ctxQueue) {
      const live = snapRef.current.queue;
      if (ctxQueue === live) {
        // tapping a row of the live queue: keep its order (already shuffled when shuffle is on)
        queuePosRef.current = typeof atIndex === "number" ? atIndex : queueIndexOf(live, id, queuePosRef.current);
      } else if (snapRef.current.shuffle && ctxQueue.length > 1) {
        // a new list while shuffle is on: shuffle it too (chosen song first) and remember the plain order for shuffle-off
        preShuffleQueueRef.current = ctxQueue;
        setQueue([id, ...shuffleArray(ctxQueue.filter(x => x !== id))]);
        queuePosRef.current = 0;
      } else {
        setQueue(ctxQueue);
        queuePosRef.current = typeof atIndex === "number" ? atIndex : ctxQueue.indexOf(id);
      }
    } else {
      queuePosRef.current = queueIndexOf(snapRef.current.queue, id, typeof atIndex === "number" ? atIndex : queuePosRef.current);
    }
    setCurrentTrackId(id);
    setIsPlaying(true);
  }, []);

  const startTapToSync = useCallback((trackId) => {
    const track = libraryAll.find(t => t.id === trackId);
    if (!track || !lyricsMap[trackId]?.lines?.length) return;
    if (currentTrackId !== trackId) playTrackId(trackId, [trackId]);
    setNpView("lyrics");
    setNowPlayingOpen(true);
    setTapSyncTimes([]);
    setTapSyncActive(true);
  }, [libraryAll, lyricsMap, currentTrackId, playTrackId]);

  const cancelTapSync = useCallback(() => {
    setTapSyncActive(false);
    setTapSyncTimes([]);
  }, []);

  const tapNextLine = useCallback(() => {
    setTapSyncTimes(prev => [...prev, engineRef.current ? engineRef.current.getPosition() : snapRef.current.position]);
  }, []);

  // finalize once every line has been tapped
  useEffect(() => {
    if (!tapSyncActive || !currentTrack || !currentLyrics) return;
    if (tapSyncTimes.length > 0 && tapSyncTimes.length === currentLyrics.lines.length) {
      const newLines = currentLyrics.lines.map((l, i) => ({ time_sec: tapSyncTimes[i], text: l.text }));
      const raw = linesToLRC(newLines);
      setLyricsMap(prev => ({ ...prev, [currentTrack.id]: { format: "lrc", source: "manual_synced", lines: newLines, raw_lrc: raw } }));
      setTapSyncActive(false);
      setTapSyncTimes([]);
    }
  }, [tapSyncTimes, tapSyncActive, currentTrack, currentLyrics]);

  // spacebar/enter taps a line while the sync tool is active
  useEffect(() => {
    if (!tapSyncActive) return;
    const handler = (e) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        tapNextLine();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tapSyncActive, tapNextLine]);

  // ---- Scan the phone's music library ----
  // Native MediaStore scan (ReelMediaPlugin.java): new and changed songs come back with tags, cover art, real
  // "date added", size and modified time; the list of every song that exists on the phone lets us flag the ones
  // that were deleted from it.
  const [scanning, setScanning] = useState(false);
  const [libraryNotice, setLibraryNotice] = useState(null);
  const scanDeviceMusic = useCallback(async () => {
    const folder = await window.reel.pickFolder();
    if (!folder) return;
    setScanning(true);
    setLibraryNotice(null);
    const stopProgress = window.reel.onScanProgress?.((p) => {
      if (p?.total) setLibraryNotice(`Scanning your music… ${p.scanned} / ${p.total}`);
    });
    try {
      const res = await window.reel.scanFolder(folder, { minSeconds: snapRef.current.minSeconds });
      const scanned = res.tracks || [], existing = res.existing || [];
      const lib = snapRef.current.library;
      const byPath = new Map(lib.map(t => [t.filePath, t]));
      const usedIds = new Set(snapRef.current.libraryAll.map(t => t.id));

      // songs whose file changed on the phone: refresh duration / cover (and tags the user never edited)
      const refreshed = new Map();
      for (const s of scanned.filter(x => byPath.has(x.filePath))) {
        const old = byPath.get(s.filePath);
        const art = s.artPath ? await window.reel.mediaUrl(s.artPath) : null;
        const patch = { mod: s.modified, duration: s.duration || old.duration, trackNo: s.trackNo, ...(art ? { art } : {}) };
        const untouched = old.src && cleanTrackMeta({ title: old.src.t, artist: old.src.a }).title === old.title && cleanTrackMeta({ title: old.src.t, artist: old.src.a }).artist === old.artist && (old.src.b || "") === (old.album || "");
        if (untouched) {
          const c = cleanTrackMeta({ title: s.title, artist: s.artist });
          Object.assign(patch, { title: c.title, artist: c.artist, album: s.album, src: { t: s.title, a: s.artist, b: s.album } });
        }
        refreshed.set(old.id, patch);
      }

      // brand-new songs
      const fresh = scanned.filter(s => !byPath.has(s.filePath));
      const base = Date.now();
      const newTracks = await Promise.all(fresh.map(async (s, i) => {
        let id = stableTrackId(s.filePath, s.size);
        while (usedIds.has(id)) id += "x";
        usedIds.add(id);
        return {
          id,
          ...cleanTrackMeta({ title: s.title, artist: s.artist }),
          album: s.album,
          duration: s.duration || 0,
          trackNo: s.trackNo,
          filePath: s.filePath,
          url: await window.reel.mediaUrl(s.filePath),
          art: s.artPath ? await window.reel.mediaUrl(s.artPath) : null,
          dateAdded: s.dateAdded || (base + i),
          mod: s.modified,
          dateFixed: !!s.dateAdded,
          src: { t: s.title, a: s.artist, b: s.album },
        };
      }));

      // the phone's real "date added" for songs imported by older builds (one time), and missing-file flags
      const exMap = new Map(existing.map(e => [e.p, e]));
      let missingNow = 0;
      setLibrary(prev => {
        const next = prev.map(t => {
          let x = t;
          const r = refreshed.get(t.id);
          if (r) x = { ...x, ...r };
          const e = t.filePath ? exMap.get(t.filePath) : null;
          if (e) {
            if (!x.dateFixed && e.a) x = { ...x, dateAdded: e.a, dateFixed: true };
            if (!x.mod && e.m) x = { ...x, mod: e.m };
            if (x.missing) x = { ...x, missing: false };
          } else if (existing.length > 0 && t.filePath && !t.remote && !x.missing) {
            x = { ...x, missing: true };
          }
          if (x.missing) missingNow++;
          return x;
        });
        return [...next, ...newTracks];
      });

      const parts = [];
      if (newTracks.length) parts.push(`Added ${newTracks.length} new song${newTracks.length !== 1 ? "s" : ""}`);
      if (refreshed.size) parts.push(`updated ${refreshed.size}`);
      setLibraryNotice(parts.length ? parts.join(", ") + "." : "No new songs found — your library is up to date.");
      setTimeout(() => {
        const gone = snapRef.current.library.filter(t => t.missing).length;
        if (gone) setLibraryNotice(n => `${n || ""} ${gone} song${gone !== 1 ? "s are" : " is"} no longer on your phone (see Library health).`.trim());
      }, 600);
      void missingNow;
    } catch (err) {
      console.error("Reel: scan failed", err);
      setLibraryNotice(`Couldn't scan your music — ${err?.message || "unknown error"}`);
    } finally {
      if (typeof stopProgress === "function") stopProgress();
      setScanning(false);
    }
  }, []);

  const handleAddMusic = () => { scanDeviceMusic(); };

  // play-history tracking — fires whenever the active track actually changes
  useEffect(() => {
    if (!currentTrackId) return;
    // The silent restore of the last song at launch is not a play (it is counted when the user presses play).
    if (skipEnginePlayRef.current) return;
    // Close the entry that was accumulating time for whatever was playing
    // before, and open a fresh one for this track (timestamped log that powers
    // the Stats page, Track of the Week and milestones).
    recordPlayStart(currentTrackId);
  }, [currentTrackId]);

  // Tapping a mood emoji on the Now Playing screen both logs a timestamped
  // reaction (feeds the Stats "taste check" comparison) and updates the
  // track's actual mood tag, so it immediately shows up in mood radio, the
  // mood chip groups on the Library page, and everywhere else that reads
  // track.mood — reactions aren't a separate, disconnected system.
  const reactMood = useCallback((moodKey) => {
    const t = snapRef.current.currentTrackId
      ? snapRef.current.libraryAll.find(x => x.id === snapRef.current.currentTrackId)
      : null;
    if (!t) return;
    setMoodReactions(prev => [...prev, { id: t.id, mood: moodKey, ts: Date.now() }].slice(-20000));
    setLibrary(prev => prev.map(x => x.id === t.id ? { ...x, mood: moodKey } : x));
    const popId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setReactionPops(prev => [...prev, { popId, mood: moodKey }]);
    setTimeout(() => setReactionPops(prev => prev.filter(p => p.popId !== popId)), 850);
  }, []);

  // Samples the current track's own artwork for a base + highlight color,
  // for the Now Playing ambient glow. Falls back to the same hue formula as
  // coverGradient (see hueGlowColors) when there's no embedded art, or if
  // the sample fails — e.g. a canvas tainted by the custom media protocol
  // not sending CORS-friendly headers for that file.
  useEffect(() => {
    if (!currentTrack || !currentTrack.art || artGlowCache[currentTrack.id]) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const size = 24;
        const c = document.createElement("canvas");
        c.width = size; c.height = size;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0, n = 0, rB = 0, gB = 0, bB = 0, nB = 0;
        for (let i = 0; i < data.length; i += 4) {
          const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
          if (lum > 110) { rB += data[i]; gB += data[i + 1]; bB += data[i + 2]; nB++; }
        }
        const base = `rgba(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)}, 0.55)`;
        const hi = nB > 0 ? `rgba(${Math.round(rB / nB)}, ${Math.round(gB / nB)}, ${Math.round(bB / nB)}, 0.5)` : base;
        setArtGlowCache(prev => ({ ...prev, [currentTrack.id]: [base, hi] }));
      } catch (err) {
        // tainted canvas — the hue fallback in npGlowColors() covers this
      }
    };
    img.onerror = () => {};
    img.src = currentTrack.art;
    return () => { cancelled = true; };
  }, [currentTrack, artGlowCache]);

  function npGlowColors(track) {
    if (!track) return ["transparent", "transparent"];
    return artGlowCache[track.id] || hueGlowColors(track.id);
  }

  // ---- single ref mirroring the latest state needed inside stable callbacks
  // (engine event handlers, save snapshots) so they never close over stale values ----
  const snapRef = useRef({});
  useEffect(() => {
    snapRef.current = {
      library, libraryAll, playlists, favorites, playCounts, recentlyPlayed, queue,
      currentTrackId, shuffle, repeatMode, volume, position, duration, isPlaying, nowPlayingOpen, page,
      accentKey, density, design, trackView, sort, npView, theme, seekBarStyle, lyricsMap, artistPhotos,
      registeredArtistNames, sleepAtTrackEnd, playHistory, moodReactions,
      lastWeeklyRecapWeek, unlockedMilestones, minSeconds, featIn,
      suggestions, dismissedSeeds, enrichment, suggestMeta, lastVisitAt,
    };
  });

  const doAdvance = useCallback((dir) => {
    const { queue, currentTrackId, shuffle, repeatMode, libraryAll } = snapRef.current;
    if (!currentTrackId || queue.length === 0) return;
    const idx = queueIndexOf(queue, currentTrackId, queuePosRef.current);
    let nextIdx = idx + dir;
    if (nextIdx < 0) nextIdx = repeatMode === "all" ? queue.length - 1 : 0;
    if (nextIdx >= queue.length) {
      if (repeatMode !== "all") {
        // one full pass done — stop, and park the song at its start so Play starts it again (not from the old offset)
        setIsPlaying(false);
        engineRef.current?.rewind?.();
        setPosition(0);
        return;
      }
      if (shuffle && queue.length > 1) {
        // fresh shuffle for the new lap, not the same order repeating
        const reshuffled = shuffleArray(queue);
        setQueue(reshuffled);
        queuePosRef.current = 0;
        setCurrentTrackId(reshuffled[0]);
        setIsPlaying(true);
        return;
      }
      nextIdx = 0;
    }
    const nextId = queue[nextIdx];
    queuePosRef.current = nextIdx;
    if (nextId === currentTrackId) {
      // Same song again (a one-song queue on repeat-all, or the same song twice in a row): React sees no change
      // in currentTrackId, so restart it explicitly instead of waiting for an effect that never runs.
      const tr = libraryAll.find(t => t.id === nextId);
      const eng = engineRef.current;
      setIsPlaying(true);
      if (tr && eng) {
        eng.play(tr, 0).then((dur) => {
          if (dur === null) return;
          setDuration(dur); setPosition(0); setPlaybackError(null);
          recordPlayStart(nextId);
        }).catch((err) => {
          console.error("Reel: restart failed", err);
          setPlaybackError(`Couldn't replay "${tr.title}" — ${err?.message || "unknown error"}`);
          setIsPlaying(false);
        });
      }
      return;
    }
    setCurrentTrackId(nextId);
    setIsPlaying(true);
  }, []);

  // One rule for "previous" everywhere (buttons and notification): past 3 seconds it restarts the song.
  const goPrev = useCallback(() => {
    const eng = engineRef.current;
    const pos = eng ? eng.getPosition() : snapRef.current.position;
    if (pos > 3) seekToSec(0);
    else doAdvance(-1);
  }, [doAdvance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shuffle reorders the queue itself (not just how doAdvance picks a track)
  // so the Queue page always shows the actual upcoming play order instead of
  // a static list that stops matching reality the moment shuffle is on.
  // The whole list gets scattered (a,b,c,d,e,f,g -> g,c,e,a,f,b,d), not just
  // whatever comes after the current track — a partial shuffle still reads
  // as "in order" once you're a few tracks in, which is the bug this fixes.
  // The currently-playing track is pinned to the front of the new order so
  // toggling shuffle doesn't yank playback to a different song.
  useEffect(() => {
    if (shuffle) {
      const { queue, currentTrackId } = snapRef.current;
      preShuffleQueueRef.current = queue;
      if (currentTrackId && queue.includes(currentTrackId)) {
        const rest = shuffleArray(queue.filter(id => id !== currentTrackId));
        setQueue([currentTrackId, ...rest]);
        queuePosRef.current = 0;
      } else {
        setQueue(shuffleArray(queue));
      }
    } else if (preShuffleQueueRef.current) {
      const original = preShuffleQueueRef.current;
      const currentIds = new Set(snapRef.current.queue);
      const restored = original.filter(id => currentIds.has(id)); // original order, minus anything removed meanwhile
      const added = snapRef.current.queue.filter(id => !original.includes(id)); // anything queued while shuffled
      const merged = [...restored, ...added];
      setQueue(merged);
      queuePosRef.current = merged.indexOf(snapRef.current.currentTrackId);
      preShuffleQueueRef.current = null;
    }
  }, [shuffle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Floating in-app toast — lighter-weight than the milestone modal, since
  // this fires far more often and shouldn't demand a click to dismiss.
  function pushToast(text) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setAppToasts(prev => [...prev, { id, text }]);
    setTimeout(() => setAppToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }

  // stable ref to the latest version of this so PlaybackEngine (created once)
  // always calls current logic, not a stale closure from mount time
  const handleTrackEndRef = useRef(null);

  handleTrackEndRef.current = () => {
    const { repeatMode, currentTrackId, library, libraryAll, sleepAtTrackEnd } = snapRef.current;
    if (sleepAtTrackEnd) {
      setIsPlaying(false);
      setSleepAtTrackEnd(false);
      setSleepTimerEndedNotice(true);
      return;
    }

    // Loop-streak toast — counts natural completions of the *same* track
    // back-to-back (this is the one place that catches repeat-one restarts,
    // since those don't change currentTrackId and so wouldn't be seen by a
    // [currentTrackId] effect). Resets the moment a different track finishes.
    if (currentTrackId) {
      const streak = loopStreakRef.current;
      loopStreakRef.current = streak.id === currentTrackId
        ? { id: currentTrackId, count: streak.count + 1 }
        : { id: currentTrackId, count: 1 };
      const count = loopStreakRef.current.count;
      if (count >= 5 && count % 5 === 0) {
        const track = libraryAll.find(t => t.id === currentTrackId);
        if (track) {
          const line = LOOP_STREAK_LINES[Math.floor(Math.random() * LOOP_STREAK_LINES.length)];
          pushToast(`You've looped "${track.title}" ${count}x — ${line}.`);
        }
      }
    }

    if (repeatMode === "one") {
      const track = libraryAll.find(t => t.id === currentTrackId);
      if (track) {
        engineRef.current.play(track, 0).then((dur) => {
          if (dur === null) return; // superseded by a newer call — don't act on it
          setDuration(dur); setPosition(0); setPlaybackError(null);
          // every repeat-one loop is a real play: count it and animate the loop counter
          recordPlayStart(currentTrackId);
          setRepeatLoops(n => n + 1);
        }).catch((err) => {
          console.error("Reel: repeat-one restart failed", err);
          setPlaybackError(`Couldn't replay "${track.title}" — ${err?.message || "unknown error"}`);
          setIsPlaying(false);
        });
      }
      return;
    }
    doAdvance(1);
  };

  // ---- single playback controller: one effect owns every transition
  // (new track, play/pause toggle, resume-after-restore) so there's never
  // a race between two effects both calling the engine at once. ----
  const engineTrackIdRef = useRef(null); // which track the engine currently has loaded
  const [playbackError, setPlaybackError] = useState(null);

  // The effect reads the song from a ref and depends on the id only: a library update (duration probe, cover,
  // rename, mood) changes the track object but must never restart or re-resume the song that is playing.
  const currentTrackRef = useRef(null);
  currentTrackRef.current = currentTrack;
  const hasCurrentTrack = !!currentTrack;
  const restoredUnplayedRef = useRef(null); // id restored silently on launch and not played yet

  useEffect(() => {
    const engine = engineRef.current;
    const track = currentTrackRef.current;
    if (!engine || !track) { skipEnginePlayRef.current = false; return; }

    if (skipEnginePlayRef.current) {
      // used only for the "restored on launch but not auto-playing" case
      skipEnginePlayRef.current = false;
      engineTrackIdRef.current = track.id;
      return;
    }

    let cancelled = false;
    const isNewTrack = engineTrackIdRef.current !== track.id;

    (async () => {
      try {
        if (isNewTrack) {
          engineTrackIdRef.current = track.id;
          restoredUnplayedRef.current = null;
          if (!isPlaying) { engine.pausedOffset = 0; setPosition(0); return; }
          const dur = await engine.play(track, 0);
          if (cancelled || dur === null) return; // null = this call was superseded by a newer one; don't act on it
          setDuration(dur);
          setPosition(0);
          setPlaybackError(null);
          if (Math.abs((track.duration || 0) - dur) > 0.5) {
            setLibrary(prev => prev.map(t => t.id === track.id ? { ...t, duration: dur } : t));
          }
        } else if (isPlaying) {
          if (restoredUnplayedRef.current === track.id) {
            // first real play of the song that was restored silently at launch
            restoredUnplayedRef.current = null;
            recordPlayStart(track.id);
          }
          if (!engine.isPlaying) {
            const dur = await engine.resume(track);
            if (cancelled || dur === null) return;
            setDuration(dur);
            setPlaybackError(null);
          }
        } else if (engine.isPlaying) {
          engine.pause();
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Reel: playback failed for", track.title, err);
        setPlaybackError(`Couldn't play "${track.title}" — ${err?.message || "unknown error"}`);
        setIsPlaying(false);
      }
    })();

    return () => { cancelled = true; };
  }, [currentTrackId, isPlaying, hasCurrentTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- gapless & crossfade (phone player; both off until switched on in Settings → Playback) ----
  const peekNextTrack = useCallback(() => {
    const { queue, currentTrackId, repeatMode, library, libraryAll, sleepAtTrackEnd, shuffle } = snapRef.current;
    if (sleepAtTrackEnd || repeatMode === "one" || !currentTrackId) return null;
    const idx = queueIndexOf(queue, currentTrackId, queuePosRef.current);
    if (idx < 0) return null;
    let n = idx + 1;
    if (n >= queue.length) { if (repeatMode !== "all" || shuffle) return null; n = 0; }
    const nextId = queue[n];
    if (!nextId || nextId === currentTrackId) return null;
    return libraryAll.find(t => t.id === nextId) || null;
  }, []);
  const autoAdvanceRef = useRef(null);
  autoAdvanceRef.current = (nextId) => {
    const tr = snapRef.current.libraryAll.find(t => t.id === nextId);
    if (!tr) return;
    engineTrackIdRef.current = nextId;       // the engine is already playing it — the play effect must not restart it
    queuePosRef.current = queueIndexOf(snapRef.current.queue, nextId, queuePosRef.current + 1);
    setCurrentTrackId(nextId);
    setIsPlaying(true);
    setPosition(0);
    setDuration(engineRef.current?.getDuration() || tr.duration || 0);
    setPlaybackError(null);
  };
  useEffect(() => {
    const e = engineRef.current;
    if (!e || !e.preload) return;
    e.gapless = !!online.playback.gapless;
    e.crossfade = online.playback.crossfade || 0;
    e.nextProvider = peekNextTrack;
    e.onAutoAdvance = (nextId) => autoAdvanceRef.current?.(nextId);
  }, [online.playback.gapless, online.playback.crossfade, peekNextTrack, currentTrackId]);
  useEffect(() => {
    const e = engineRef.current;
    if (!e || !e.preload || !(online.playback.gapless || online.playback.crossfade)) return;
    if (!isPlaying || !duration || duration - position > 25) return;
    const n = peekNextTrack();
    if (n) e.preload(n);
  }, [Math.floor(position), isPlaying, duration, online.playback.gapless, online.playback.crossfade]); // eslint-disable-line react-hooks/exhaustive-deps

  // Position and real listening time come from the audio element's own clock (timeupdate), which keeps
  // firing with the screen off — a requestAnimationFrame loop is paused by Android in the background.
  // Listening time = how far the song really advanced between two ticks (only small steps: a seek is not listening).
  const tickRef = useRef(null);
  const lastUiRef = useRef(0);
  const playerBarRef = useRef(null);
  tickRef.current = (pos) => {
    // the mini player's red bar follows the audio clock directly (no React render per tick)
    const dur = engineRef.current?.getDuration?.() || 0;
    if (playerBarRef.current && dur > 0) playerBarRef.current.style.setProperty("--pbp", `${Math.min(100, (pos / dur) * 100)}%`);
    const last = lastEnginePosRef.current;
    if (last != null) { const d = pos - last; if (d > 0 && d < 3) listenedSecRef.current += d; }
    lastEnginePosRef.current = pos;
    // Every position change re-renders the whole App, so the UI copy is refreshed ~5x/s while something fast is
    // on screen (Now Playing, lyrics) and once a second otherwise.
    const sn = snapRef.current;
    const gap = (!sn.nowPlayingOpen && sn.page !== "lyrics") ? 1000 : 200;
    const now = performance.now();
    if (now - lastUiRef.current >= gap) {
      lastUiRef.current = now;
      setPosition(pos);
      const d = engineRef.current?.getDuration?.();
      if (d) setDuration(d);
    }
  };
  // Pausing closes the open play-history entry (listening time is written to state only here, at a track
  // change and when the app goes to the background — never on a timer, so playing does not rewrite the library).
  useEffect(() => {
    if (!isPlaying) { lastEnginePosRef.current = null; flushListenedSeconds(); }
  }, [isPlaying]);

  const advance = doAdvance;

  const goToArtist = (name) => { setOpenArtistName(name); setPage("artists"); };
  const artistScrollRef = useRef(0), prevArtistRef = useRef(null);
  const rememberArtistScroll = () => { const el = document.querySelector(".page-body"); artistScrollRef.current = el ? el.scrollTop : 0; };
  const openArtistFromList = (name) => { rememberArtistScroll(); setOpenArtistName(name); };
  // when a profile closes, scroll the list back to where it was (the list is rebuilt, so the browser would jump to the top)
  useEffect(() => {
    const was = prevArtistRef.current; prevArtistRef.current = openArtistName;
    if (!was && openArtistName) { const el = document.querySelector(".page-body"); if (el) el.scrollTop = 0; return; }   // a profile opens at its top
    if (!was || openArtistName) return;
    const y = artistScrollRef.current; if (!y) return;
    const restore = () => { const el = document.querySelector(".page-body"); if (el) el.scrollTop = y; };
    restore(); requestAnimationFrame(restore); setTimeout(restore, 120);
  }, [openArtistName]);

  const togglePlay = () => {
    if (!currentTrackId && library.length > 0) {
      playTrackId(library[0].id, library.map(t => t.id));
      return;
    }
    setIsPlaying(p => !p);
  };

  const activePeaks = useMemo(() => proceduralPeaks(currentTrackId || "empty"), [currentTrackId]);

  const pushMediaRef = useRef(null);
  const seekToSec = useCallback((sec) => {
    const { currentTrackId: cid, libraryAll: all } = snapRef.current;
    const track = all.find(t => t.id === cid);
    const eng = engineRef.current;
    if (!track || !eng) return;
    const off = Math.max(0, sec);
    lastEnginePosRef.current = null;
    eng.seek(track, off).then((dur) => {
      if (dur === null) return; // superseded by a newer seek/play call — don't act on it
      setPosition(off);
      setPlaybackError(null);
      pushMediaRef.current?.(); // the notification's bar jumps right away
    }).catch((err) => {
      console.error("Reel: seek failed", err);
      setPlaybackError(`Couldn't seek "${track.title}" — ${err?.message || "unknown error"}`);
    });
  }, []);
  const seekTo = (frac) => seekToSec(frac * (duration || 0));

  /* ---------------- Persistence ----------------
     One JSON file in the app's private storage (see platform/android.js), with a
     rolling backup copy. A file that exists but cannot be read is never overwritten. */
  const [storeLoaded, setStoreLoaded] = useState(false);
  // If the data file exists but could not be read, nothing is auto-saved until the user decides (P-12).
  const saveBlockedRef = useRef(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await window.reel.store.load();
      if (cancelled) return;
      if (data.loadError) { saveBlockedRef.current = true; setLoadError(data.loadError); }
      if (data.recoveredFromBackup) setTimeout(() => pushToast("Your library file was damaged — restored from the automatic backup copy"), 800);
      let loadedTracks = data.tracks || [], loadedPhotos = data.artistPhotos || {};
      try {
        if (loadedTracks.some(t => t.artInIdb) || Object.values(loadedPhotos).includes("@idb")) {
          const m = await artGetAll();
          if (cancelled) return;
          loadedTracks = loadedTracks.map(t => {
            if (!t.artInIdb) return t;
            const a = m.get("t:" + t.id);
            if (!a) return t;
            artSaved.set("t:" + t.id, a);
            const { artInIdb, ...rest } = t; // eslint-disable-line no-unused-vars
            return { ...rest, art: a };
          });
          const np = {};
          for (const [n, v] of Object.entries(loadedPhotos)) {
            if (v === "@idb") { const a = m.get("a:" + n); if (a) { artSaved.set("a:" + n, a); np[n] = a; } }
            else np[n] = v;
          }
          loadedPhotos = np;
        }
      } catch { /* images stay as markers; nothing is lost, they are still in storage */ }
      { const keepIds = new Set([...(data.favorites || []), ...(data.playlists || []).flatMap(p => p.trackIds || [])]);
        setLibrary(loadedTracks.map(t => t.remote && !t.transient && !keepIds.has(t.id) ? { ...t, transient: true } : t)); }
      setPlaylists(data.playlists || []);
      setFavorites(new Set(data.favorites || []));
      setPlayCounts(data.playCounts || {});
      setRecentlyPlayed(data.recentlyPlayed || []);
      setQueue(data.queue || []);
      setLyricsMap(data.lyrics || {});
      setArtistPhotos(loadedPhotos);
      setRegisteredArtistNames(data.registeredArtistNames || []);
      setPlayHistory(data.playHistory || []);
      setMoodReactions(data.moodReactions || []);
      setLastWeeklyRecapWeek(data.lastWeeklyRecapWeek || null);
      setUnlockedMilestones(data.unlockedMilestones || []);
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      setDismissedSeeds(Array.isArray(data.dismissedSeeds) ? data.dismissedSeeds : []);
      setEnrichment(data.enrichment && typeof data.enrichment === "object" ? data.enrichment : {});
      setSuggestMeta(data.suggestMeta || { builtAt: 0, libCount: 0, enrCount: 0 });
      prevVisitRef.current = data.lastVisitAt || 0;       // "Fresh finds" = songs added since the previous visit
      setLastVisitAt(Date.now());
      const ps = data.playerState || {};
      setShuffle(!!ps.shuffle);
      setRepeatMode(ps.repeatMode || "off");
      setVolume(typeof ps.volume === "number" ? ps.volume : 0.8);
      if (ps.currentTrackId && loadedTracks.some(t => t.id === ps.currentTrackId)) {
        skipEnginePlayRef.current = true; // restore silently, don't auto-play
        restoredUnplayedRef.current = ps.currentTrackId;
        setCurrentTrackId(ps.currentTrackId);
        queuePosRef.current = (data.queue || []).indexOf(ps.currentTrackId);
        let startPos = ps.lastPositionSec || 0;
        try { const r = JSON.parse(localStorage.getItem("reel-pos") || "null"); if (r && r.id === ps.currentTrackId && typeof r.pos === "number" && r.pos >= 0) startPos = r.pos; } catch { /* ignore */ }
        setPosition(startPos);
        if (engineRef.current) engineRef.current.pausedOffset = startPos;
      }
      const st = data.settings || {};
      setAccentKey(st.accentKey || "amber");
      setDensity(st.density || "comfortable");
      setDesign(st.design === "bloom" || st.design === "turntable" ? st.design : "classic");
      setTrackView(st.trackView === "list" || st.trackView === "grid" ? st.trackView : "auto");
      if (st.librarySort && typeof st.librarySort.key === "string") setSort({ key: st.librarySort.key, dir: st.librarySort.dir === "asc" ? "asc" : "desc" });
      setNpView(st.npView || "vinyl");
      setTheme(st.theme || "dark");
      setSeekBarStyle(st.seekBarStyle || "waveform");
      setMinSeconds([0, 15, 30, 60].includes(st.minSeconds) ? st.minSeconds : 15);
      setFeatInState(st.featIn === "artist" ? "artist" : "title");
      setStoreLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const [volumeHudShow, setVolumeHudShow] = useState(false);
  const volumeHudTimeoutRef = useRef(null);
  const volumeMountedRef = useRef(false);
  // Shows a brief on-screen HUD whenever volume changes — but not for the
  // initial default value or for the one-time restore of a persisted volume
  // level on load, only for changes the user actually makes afterward.
  useEffect(() => {
    if (!storeLoaded) return;
    if (!volumeMountedRef.current) { volumeMountedRef.current = true; return; }
    setVolumeHudShow(true);
    clearTimeout(volumeHudTimeoutRef.current);
    volumeHudTimeoutRef.current = setTimeout(() => setVolumeHudShow(false), 850);
  }, [volume, storeLoaded]);
  useEffect(() => () => clearTimeout(volumeHudTimeoutRef.current), []);


  // Which week's track-of-the-week card is open: null (closed), "last" (the
  // week that just ended — what the Monday popup shows) or "current" (this
  // week so far, openable any time from the Stats page). Both cards are
  // derived from playHistory, so they're always fresh and reset every Monday.
  const [weeklyRecapRange, setWeeklyRecapRange] = useState(null);
  const recapCards = useMemo(() => weeklyRecapRange ? {
    last: buildRecapCard(playHistory, library, "last"),
    current: buildRecapCard(playHistory, library, "current"),
  } : null, [weeklyRecapRange, playHistory, library]);
  const weeklyRecapCard = recapCards ? recapCards[weeklyRecapRange] : null;
  const [milestoneModal, setMilestoneModal] = useState(null); // MILESTONE_META entry, shown in a celebration modal right after it's crossed

  // Weekly recap — anchored to real calendar weeks (Monday 00:00, local
  // time) rather than "whenever you've played something in the last 7
  // days". The recap that appears covers the week that just ended. If the
  // app happens to be open right as a new week begins, a 60s check catches
  // it within a minute of midnight; if the app is closed at that moment,
  // the same check runs the moment it's next opened (the immediate call
  // below), so it's never missed, just delayed until you're back.
  useEffect(() => {
    if (!storeLoaded) return;

    function check() {
      const now = new Date();
      const thisMonday = mostRecentMonday(now);
      const currentWeekKey = isoWeekKey(thisMonday);
      if (currentWeekKey === snapRef.current.lastWeeklyRecapWeek) return;

      setLastWeeklyRecapWeek(currentWeekKey); // covered either way — nothing played last week means nothing to recap, not "try again later"
      if (buildRecapCard(snapRef.current.playHistory, snapRef.current.library, "last")) {
        setWeeklyRecapRange("last");
      }
    }

    check(); // catch up immediately — covers "the app was closed when Monday 00:00 hit"
    const id = setInterval(check, 60000); // covers "the app is sitting open right as Monday 00:00 hits"
    return () => clearInterval(id);
  }, [storeLoaded]);
  const shareCanvasRef = useRef(null);
  useEffect(() => {
    const canvas = shareCanvasRef.current;
    if (!shareOpen || !canvas || !currentTrack || !currentLyrics || shareSel.length === 0) return;
    const picked = shareSel.map(i => ({ i, text: (currentLyrics.lines[i]?.text || "").trim() })).filter(l => l.text);
    const draw = () => { if (!cancelled) drawLyricsCard(canvas, { track: currentTrack, lines: picked, style: shareStyle, onCoverReady: draw }); };
    let cancelled = false;
    draw();
    document.fonts?.ready?.then(() => { if (!cancelled && shareCanvasRef.current === canvas) draw(); });
    return () => { cancelled = true; };
  }, [shareOpen, shareSel, shareStyle, currentTrack, currentLyrics]);
  const exportShareCard = () => {
    const canvas = shareCanvasRef.current;
    if (!canvas || !currentTrack) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const safeName = prettyTitle(currentTrack.title, currentTrack.artist).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "lyrics";
      downloadBlob(blob, `reel-lyrics-${safeName}.png`);
    }, "image/png");
  };
  const copyShareCard = () => {
    const canvas = shareCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        pushToast("Lyrics card copied to the clipboard.");
      } catch {
        pushToast("Couldn't copy — use Save image instead.");
      }
    }, "image/png");
  };
  const recapCanvasRef = useRef(null);
  useEffect(() => {
    const canvas = recapCanvasRef.current;
    if (!weeklyRecapCard || !canvas) return;
    let cancelled = false;
    const draw = () => { if (!cancelled && recapCanvasRef.current === canvas) drawRecapCard(canvas, weeklyRecapCard, draw); };
    draw();
    // redraw once web fonts are ready so the first paint never uses a fallback font
    document.fonts?.ready?.then(draw);
    return () => { cancelled = true; };
  }, [weeklyRecapCard]);

  // Opens the card on demand (Stats page button): this week so far if
  // anything's been played since Monday, otherwise last week's.
  const openTrackOfTheWeek = () => {
    if (buildRecapCard(playHistory, library, "current")) setWeeklyRecapRange("current");
    else if (buildRecapCard(playHistory, library, "last")) setWeeklyRecapRange("last");
    else pushToast("Play a few tracks first — nothing to show for this week yet.");
  };
  const exportRecapCard = () => {
    const canvas = recapCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const safeName = prettyTitle(weeklyRecapCard.track.title, weeklyRecapCard.track.artist)
        .replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "track";
      downloadBlob(blob, `reel-track-of-the-week-${safeName}.png`);
    }, "image/png");
  };


  // All-time listening total — same computation as the Stats page's "All
  // time" range, kept separate here since milestones always look at the
  // full history regardless of whatever range the Stats page happens to be
  // showing. Uses each entry's actual listenedSec (real time spent playing
  // it), not the track's nominal duration — starting a track and skipping
  // off it after a few seconds shouldn't count as having listened to the
  // whole thing.
  const totalListeningHours = useMemo(() => {
    let totalSeconds = 0;
    for (const h of playHistory) totalSeconds += h.listenedSec || 0;
    return totalSeconds / 3600;
  }, [playHistory]);

  // A reward accent is unlocked once its milestone has been reached — read
  // from both the persisted list and the live total, so anyone who crossed a
  // tier before rewards existed gets those colors without needing to re-earn them.
  const isAccentUnlocked = useCallback((key) => {
    const def = ACCENTS[key];
    if (!def) return false;
    if (!def.unlockHours) return true;
    return unlockedMilestones.includes(def.unlockHours) || totalListeningHours >= def.unlockHours;
  }, [unlockedMilestones, totalListeningHours]);

  // Milestone badges — fires a celebratory notification the moment each
  // listening-time threshold is first crossed, and records it so it's never
  // re-announced. Checked passively whenever the total changes; no polling.
  useEffect(() => {
    const newlyCrossed = LISTENING_MILESTONES_HOURS.filter(
      h => totalListeningHours >= h && !unlockedMilestones.includes(h)
    );
    if (newlyCrossed.length === 0) return;
    const highest = Math.max(...newlyCrossed);
    setUnlockedMilestones(prev => [...prev, ...newlyCrossed]);
    const meta = MILESTONE_META.find(m => m.hours === highest);
    if (meta) setMilestoneModal({ ...meta, extra: newlyCrossed.length - 1 });
  }, [totalListeningHours, unlockedMilestones]);

  // ---- Sleep timer ----
  const [sleepTimerEndAt, setSleepTimerEndAt] = useState(null); // epoch ms, or null when off
  const [sleepAtTrackEnd, setSleepAtTrackEnd] = useState(false);
  const [sleepTimerMenuOpen, setSleepTimerMenuOpen] = useState(false);
  const [sleepTimerRemainingSec, setSleepTimerRemainingSec] = useState(0);
  const [sleepTimerEndedNotice, setSleepTimerEndedNotice] = useState(false);
  const sleepFadeRafRef = useRef(null);

  const startSleepTimer = (minutes) => {
    cancelAnimationFrame(sleepFadeRafRef.current);
    setSleepAtTrackEnd(false);
    setSleepTimerEndAt(Date.now() + minutes * 60000);
    setSleepTimerMenuOpen(false);
  };
  const startSleepAtTrackEnd = () => {
    cancelAnimationFrame(sleepFadeRafRef.current);
    setSleepTimerEndAt(null);
    setSleepAtTrackEnd(true);
    setSleepTimerMenuOpen(false);
  };
  const cancelSleepTimer = () => {
    cancelAnimationFrame(sleepFadeRafRef.current);
    setSleepTimerEndAt(null);
    setSleepAtTrackEnd(false);
    setSleepTimerMenuOpen(false);
  };

  // Countdown + the actual fade-and-pause when it hits zero. Volume is eased
  // down over 4s (via the same manual rAF-tween approach used for the lyrics
  // auto-scroll, for the same reason: predictable timing) rather than cutting
  // off abruptly, then restored so the next play session isn't silent. Once
  // paused, a modal notice tells you why the music stopped rather than
  // leaving you to notice the silence and wonder what happened.
  useEffect(() => {
    if (!sleepTimerEndAt) { setSleepTimerRemainingSec(0); return; }
    const tick = () => {
      const remainingMs = sleepTimerEndAt - Date.now();
      if (remainingMs <= 0) {
        setSleepTimerRemainingSec(0);
        setSleepTimerEndAt(null);
        const startVol = snapRef.current.volume;
        const fadeStart = performance.now();
        const fadeMs = 4000;
        const step = (now) => {
          const t = Math.min(1, (now - fadeStart) / fadeMs);
          setVolume(Math.max(0, startVol * (1 - t)));
          if (t < 1) {
            sleepFadeRafRef.current = requestAnimationFrame(step);
          } else {
            setIsPlaying(false);
            setVolume(startVol);
            setSleepTimerEndedNotice(true);
          }
        };
        sleepFadeRafRef.current = requestAnimationFrame(step);
        return;
      }
      setSleepTimerRemainingSec(Math.ceil(remainingMs / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sleepTimerEndAt]);
  useEffect(() => () => cancelAnimationFrame(sleepFadeRafRef.current), []);

  // tell the native side to drop the splash once the saved data has loaded
  const uiReadyNotifiedRef = useRef(false);
  useEffect(() => {
    if (uiReadyNotifiedRef.current) return;
    if (!storeLoaded) return;
    uiReadyNotifiedRef.current = true;
    window.reel?.notifyUiReady?.();
  }, [storeLoaded]);

  const saveNow = useCallback(() => {
    if (saveBlockedRef.current) return Promise.resolve();
    const s = snapRef.current;
    // Covers / artist photos are stored once in IndexedDB; the main save only carries a marker for them.
    const toStore = [];
    const tracksOut = s.library.map(t => {
      const key = "t:" + t.id;
      const heavy = isHeavy(t.art), confirmed = heavy && artSaved.get(key) === t.art;
      if (heavy && !confirmed) toStore.push([key, t.art]);
      const keep = confirmed || (!t.art && t.artInIdb);
      return {
        id: t.id, title: t.title, artist: t.artist, album: t.album, duration: t.duration,
        trackNo: t.trackNo, filePath: t.filePath, url: t.url, art: keep ? null : t.art, artInIdb: keep ? true : undefined, dateAdded: t.dateAdded,
        mod: t.mod, dateFixed: t.dateFixed, src: t.src, missing: t.missing ? true : undefined,
        // Mood tags live on the track itself — they have to be in this
        // field list or they're silently dropped on every save and vanish
        // the next time the app starts.
        mood: t.mood || null,
      };
    });
    const photosOut = {};
    for (const [n, v] of Object.entries(s.artistPhotos || {})) {
      const key = "a:" + n;
      if (v === "@idb") photosOut[n] = v;
      else if (isHeavy(v) && artSaved.get(key) === v) photosOut[n] = "@idb";
      else { photosOut[n] = v; if (isHeavy(v)) toStore.push([key, v]); }
    }
    const saving = window.reel.store.save({
      tracks: tracksOut,
      playlists: s.playlists,
      favorites: Array.from(s.favorites),
      playCounts: s.playCounts,
      recentlyPlayed: s.recentlyPlayed,
      queue: s.queue,
      lyrics: s.lyricsMap,
      artistPhotos: photosOut,
      registeredArtistNames: s.registeredArtistNames,
      playHistory: s.playHistory,
      moodReactions: s.moodReactions,
      lastWeeklyRecapWeek: s.lastWeeklyRecapWeek,
      unlockedMilestones: s.unlockedMilestones,
      suggestions: s.suggestions, dismissedSeeds: s.dismissedSeeds, enrichment: s.enrichment, suggestMeta: s.suggestMeta, lastVisitAt: s.lastVisitAt,
      playerState: {
        currentTrackId: s.currentTrackId, shuffle: s.shuffle, repeatMode: s.repeatMode,
        volume: s.volume, lastPositionSec: s.position,
      },
      settings: {
        accentKey: s.accentKey, density: s.density, design: s.design, trackView: s.trackView, librarySort: s.sort, npView: s.npView, theme: s.theme, seekBarStyle: s.seekBarStyle, minSeconds: s.minSeconds, featIn: s.featIn,
      },
    });
    if (toStore.length) Promise.resolve(saving).then(() => setTimeout(() => persistMissing(toStore), 400)).catch(() => {});
    return saving;
  }, []);

  // debounced save on any structural change (excludes position, which would
  // fire every animation frame — that's covered by the interval below)
  useEffect(() => {
    if (!storeLoaded) return;
    const t = setTimeout(saveNow, 2000);
    return () => clearTimeout(t);
  }, [storeLoaded, library, playlists, favorites, playCounts, recentlyPlayed, queue, currentTrackId, shuffle, repeatMode, volume, accentKey, density, design, trackView, sort, npView, theme, seekBarStyle, lyricsMap, artistPhotos, registeredArtistNames, playHistory, moodReactions, lastWeeklyRecapWeek, unlockedMilestones, minSeconds, featIn, suggestions, dismissedSeeds, enrichment, suggestMeta, saveNow]);

  // Periodic position checkpoint while playing. The full save writes the whole library
  // (covers included), so it only runs once a minute; the exact position goes into a tiny
  // key every few seconds and is read back on start-up.
  useEffect(() => {
    if (!isPlaying) return;
    const writePos = () => {
      const s = snapRef.current;
      try { localStorage.setItem("reel-pos", JSON.stringify({ id: s.currentTrackId, pos: s.position })); } catch { /* ignore */ }
    };
    const a = setInterval(writePos, 4000);
    return () => { clearInterval(a); writePos(); };
  }, [isPlaying]);

  // flush to disk before the window actually closes
  useEffect(() => {
    const off = window.reel.onFlushRequest(() => {
      flushListenedSeconds();                    // write the open listening-time entry, then save once state has settled
      setTimeout(() => { saveNow().finally(() => window.reel.flushComplete()); }, 250);
    });
    return off;
  }, [saveNow]);


  // ---- Lock-screen / notification player ----
  // The notification is a native service (ReelPlaybackService.java) with heart, previous, play/pause, next and close.
  // The app sends it ONE state object when something really changes (song, play/pause, seek, heart, returning to the
  // app); while playing, Android moves the bar by itself, so there is no per-second traffic.
  const media = window.reel.media;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const mediaWantedRef = useRef(false);     // the user played something this session and has not pressed the close button
  const mediaArtKeyRef = useRef("");        // cover key already handed to the notification
  const mediaStateRef = useRef({ track: null, playing: false, liked: false });
  mediaStateRef.current = { track: currentTrack, playing: isPlaying, liked: !!currentTrack && favorites.has(currentTrack.id) };
  const pushMedia = useCallback(() => {
    const { track, playing, liked } = mediaStateRef.current;
    if (!track) return;
    if (playing) mediaWantedRef.current = true;
    if (!mediaWantedRef.current) return;      // nothing started yet: no notification at launch
    const eng = engineRef.current;
    const d = (eng?.getDuration?.() || 0) || track.duration || 0;
    const live = eng ? eng.getPosition() : 0;
    const pos = Math.max(0, Math.min(live || 0, d || Infinity));
    const artKey = `${track.id}|${track.art ? String(track.art).length : 0}`;
    const base = { artKey, title: prettyTitle(track.title, track.artist), artist: track.artist || "", album: track.album || "", duration: d, position: pos, playing, liked };
    media.update(base);                       // the text appears at once, the cover follows when it is ready
    if (mediaArtKeyRef.current !== artKey) {
      mediaArtKeyRef.current = artKey;
      Promise.resolve(media.prepareArt(track.art || notifCoverDataUrl(track.id))).then((art) => {
        if (art && mediaArtKeyRef.current === artKey && mediaStateRef.current.track?.id === track.id) media.update({ ...base, position: engineRef.current ? engineRef.current.getPosition() : pos, playing: mediaStateRef.current.playing, liked: mediaStateRef.current.liked, art });
      }).catch(() => {});
    }
  }, [media]);
  pushMediaRef.current = pushMedia;
  useEffect(() => {
    if (!currentTrack) { media.hide(); mediaArtKeyRef.current = ""; return; }
    pushMedia();
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artist, currentTrack?.album, currentTrack?.art, isPlaying, currentTrack ? favorites.has(currentTrack.id) : false]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notification permission (Android 13+): asked once, on the first play, in this one place. If it is refused the
  // help sheet explains how to switch it on; coming back from the system settings re-checks.
  const notifAskedRef = useRef(false);
  useEffect(() => {
    if (!isPlaying || notifAskedRef.current) return;
    notifAskedRef.current = true;
    (async () => {
      await window.reel.requestNotificationPermission?.();   // resolves after the system dialog is closed
      const st = await window.reel.notificationStatus?.();
      if (st && !st.enabled) setNotifHelpOpen(true);
    })();
  }, [isPlaying]);
  useEffect(() => {
    const onVis = async () => {
      if (document.hidden) return;
      pushMediaRef.current?.();                             // re-assert the notification so it can never stay stale
      const st = await window.reel.notificationStatus?.();
      if (st && st.enabled) setNotifHelpOpen(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Buttons on the notification / lock screen / headset
  const mediaCmdRef = useRef(null);
  mediaCmdRef.current = {
    play: () => {
      if (!isPlayingRef.current) { setIsPlaying(true); return; }
      // The UI believes it is playing but the audio was silenced behind our back: start the engine directly.
      const eng = engineRef.current, tr = currentTrackRef.current;
      if (eng && tr && !eng.isPlaying) eng.resume(tr).then((dur) => { if (dur) setDuration(dur); }).catch(() => setIsPlaying(false));
    },
    pause: () => { if (isPlayingRef.current) setIsPlaying(false); },
    next: () => doAdvance(1),
    prev: () => goPrev(),
    seek: (sec) => seekToSec(sec),
    like: () => { const id = snapRef.current.currentTrackId; if (id) toggleFavorite(id); },
    close: () => { mediaWantedRef.current = false; if (isPlayingRef.current) setIsPlaying(false); },
  };
  useEffect(() => {
    return media.onAction((e) => {
      const c = mediaCmdRef.current;
      switch (e && e.action) {
        case "play": c.play(); break;
        case "pause": c.pause(); break;
        case "next": c.next(); break;
        case "prev": c.prev(); break;
        case "seekto": c.seek(typeof e.position === "number" ? e.position : 0); break;
        case "like": c.like(); break;
        case "close": c.close(); break;
        default: break;
      }
    });
  }, [media]);

  useScrobbler({ track: currentTrack, isPlaying, plays: currentTrack ? (playCounts[currentTrack.id] || 0) : 0 });
  useAutoArtistPhotos({ library, artistPhotos, setArtistPhotos, enabled: storeLoaded !== false && online.enabled && online.features.artistBios && online.features.artistPhotosAuto });
  useEffect(() => {
    if (!currentTrack || currentTrack.remote) return;
    if (!(featureOn("lyrics") && getOnline().features.lyricsAuto)) return;
    if (lyricsMap[currentTrack.id]?.lines?.length || lyricsTriedRef.current.has(currentTrack.id)) return;
    const id = setTimeout(() => findLyricsOnline(currentTrack, true), 1500);
    return () => clearTimeout(id);
  }, [currentTrack?.id, online.enabled, online.features.lyrics, online.features.lyricsAuto]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Android hardware back button: close the topmost thing, else go up, else minimize ----
  const backRef = useRef(null);
  backRef.current = () => {
    const scrim = document.querySelector(".modal-scrim");
    if (scrim) { scrim.click(); return; }
    if (trackSheet) return setTrackSheet(null);
    if (settingsOpen) return setSettingsOpen(false);
    if (nowPlayingOpen) return setNowPlayingOpen(false);
    if (selectedIds.size > 0) return setSelectedIds(new Set());
    if (page === "playlists" && openSuggestionId) return setOpenSuggestionId(null);
    if (page === "playlists" && (openSmartKey || openMoodKey)) { setOpenSmartKey(null); setOpenMoodKey(null); return; }
    if (page === "playlists" && openPlaylistId) return setOpenPlaylistId(null);
    if (page === "artists" && openArtistName) return setOpenArtistName(null);
    if (["queue", "recent", "lyrics", "stats", "discover", "health"].includes(page)) return setPage("more");
    if (page !== "library") return setPage("library");
    window.reel?.exitApp?.();
  };
  useEffect(() => {
    const onBack = () => backRef.current();
    window.addEventListener("reel:back", onBack);
    return () => window.removeEventListener("reel:back", onBack);
  }, []);

  useEffect(() => { if (!addSongsOpen && !addSongsToArtistOpen) setAddSongsQuery(""); }, [addSongsOpen, addSongsToArtistOpen]);
  const [justFavoritedId, setJustFavoritedId] = useState(null);
  const toggleFavorite = (id) => setFavorites(prev => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      setJustFavoritedId(id);
      setTimeout(() => setJustFavoritedId(cur => cur === id ? null : cur), 500);
    }
    return next;
  });

  const addIdsToQueue = (ids) => setQueue(prev => [...prev, ...ids]);
  const playIdsNext = (ids) => {
    const cur = snapRef.current.currentTrackId;
    const pos = queueIndexOf(snapRef.current.queue, cur, queuePosRef.current);
    const toInsert = ids.filter(id => id !== cur);        // the song that is playing stays where it is
    if (toInsert.length === 0) return;
    setQueue(prev => {
      if (!cur) return [...toInsert, ...prev.filter(id => !toInsert.includes(id))];
      const before = prev.slice(0, pos + 1).filter((id, i) => i === pos || !toInsert.includes(id));
      const after = prev.slice(pos + 1).filter(id => !toInsert.includes(id));
      queuePosRef.current = before.length - 1;
      return [...before, ...toInsert, ...after];
    });
  };
  const removeFromQueueAt = (idx) => setQueue(prev => prev.filter((_, i) => i !== idx));
  // Shuffle "Up next": what already played and the current song stay where they are, only the songs after it are mixed.
  const shuffleUpNext = () => setQueue(prev => {
    const cur = prev.indexOf(currentTrackId);
    const head = cur < 0 ? [] : prev.slice(0, cur + 1);
    const tail = cur < 0 ? [...prev] : prev.slice(cur + 1);
    if (tail.length < 2) return prev;
    const before = tail.join("|");
    for (let tries = 0; tries < 3; tries++) {
      for (let i = tail.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tail[i], tail[j]] = [tail[j], tail[i]]; }
      if (tail.join("|") !== before) break;                      // make sure the order really changes
    }
    return [...head, ...tail];
  });
  const moveQueue = (idx, dir) => setQueue(prev => {
    const next = [...prev];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return prev;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    return next;
  });
  // Generic array move for drag-and-drop reordering — pulls the dragged
  // item out and reinserts it at the drop index, used by both the queue and
  // playlist-detail drag handlers below.
  const reorderArray = (arr, fromIdx, toIdx) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return arr;
    const next = [...arr];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    return next;
  };
  const moveQueueTo = (fromIdx, toIdx) => setQueue(prev => reorderArray(prev, fromIdx, toIdx));

  // Mood radio — "more like this" based on whatever's currently playing (or
  // the last thing played, if nothing is). Rebuilds the queue from every
  // other track sharing that mood, shuffled, and starts playing it — same
  // idea as a Pandora/Spotify-style radio station seeded from one song.
  const [radioAnimating, setRadioAnimating] = useState(false);
  const startMoodRadio = () => {
    const ref = currentTrack || libraryAll.find(t => t.id === recentlyPlayed[0]);
    if (!ref || !ref.mood) {
      setLibraryNotice("Play a track with a mood tag first, then Radio can build a station from it.");
      return;
    }
    const moodDef = MOOD_PRESETS.find(m => m.key === ref.mood);
    const pool = shuffleArray(library.filter(t => t.mood === ref.mood && t.id !== ref.id));
    if (pool.length === 0) {
      setLibraryNotice(`No other ${moodDef ? moodDef.label : ref.mood} tracks yet to build a radio station from.`);
      return;
    }
    setQueue([ref.id, ...pool.map(t => t.id)]);
    setShuffle(false); // the queue is already a curated shuffle — a second shuffle would undo the "seeded by this song" ordering
    setCurrentTrackId(ref.id);
    setIsPlaying(true);
    setRadioAnimating(true);
    setTimeout(() => setRadioAnimating(false), 1100);
  };

  // ---------- online / library tools ----------
  const removeIdsFromLibrary = (ids) => {
    const set = new Set(ids);
    if (currentTrackId && set.has(currentTrackId)) {
      // The playing song is being removed: move on to the next song that stays, or stop cleanly.
      const q = snapRef.current.queue;
      const from = queueIndexOf(q, currentTrackId, queuePosRef.current);
      const nextId = q.slice(from + 1).find(id => !set.has(id)) || q.slice(0, Math.max(0, from)).find(id => !set.has(id));
      if (nextId && isPlaying) {
        setCurrentTrackId(nextId);
      } else {
        engineRef.current?.pause();
        engineRef.current?.rewind?.();
        engineTrackIdRef.current = null;
        setIsPlaying(false);
        setCurrentTrackId(null);
        setPosition(0);
        setDuration(0);
      }
    }
    setLibrary(prev => prev.filter(t => !set.has(t.id)));
    setFavorites(prev => { const n = new Set(prev); set.forEach(id => n.delete(id)); return n; });
    setPlaylists(prev => prev.map(p => ({ ...p, trackIds: p.trackIds.filter(id => !set.has(id)) })));
    setQueue(prev => prev.filter(id => !set.has(id)));
  };
  useEffect(() => { setFeatIn(featIn); }, [featIn]);
  const cleanUpTitles = () => {
    let n = 0;
    setLibrary(prev => prev.map(t => {
      if (!looksRaw(t)) return t;
      const c = cleanTrackMeta(t);
      if (c.title === t.title && c.artist === t.artist) return t;
      n++;
      return { ...t, title: c.title, artist: c.artist };
    }));
    setTimeout(() => pushToast(n > 0 ? "Titles cleaned up" : "Titles already look clean"), 50);
  };
  // Explore no longer plays anything. Songs streamed by older builds that were never added to a playlist/favourites are cleaned out below.
  // streamed songs nobody added are forgotten as soon as they are no longer playing / queued
  useEffect(() => {
    if (!libraryAll.some(t => t.transient)) return;
    const keep = new Set(queue); if (currentTrackId) keep.add(currentTrackId);
    if (libraryAll.some(t => t.transient && !keep.has(t.id))) setLibrary(prev => prev.filter(t => !t.transient || keep.has(t.id)));
  }, [libraryAll, queue, currentTrackId]);
  const findLyricsOnline = async (track, silent = false) => {
    if (!track || !featureOn("lyrics")) return;
    lyricsTriedRef.current.add(track.id);
    setLyricsBusy(true);
    try {
      const entry = await findLyricsFor(track);
      if (entry) { setLyricsMap(prev => ({ ...prev, [track.id]: entry })); if (!silent) pushToast("Lyrics found and saved with the song"); }
      else if (!silent) pushToast("No lyrics found online for this song");
    } catch { if (!silent) pushToast("Couldn't reach the lyrics service"); }
    setLyricsBusy(false);
  };
  const recommendations = useMemo(
    () => buildRecommendations({ library, playCounts, playHistory, favorites }),
    [library.length, playCounts, playHistory.length, favorites.size] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const createPlaylist = (name) => {
    const n = (name ?? newPlaylistName).trim();
    if (!n) return null;
    const pl = { id: crypto.randomUUID(), name: n, trackIds: [], coverImage: null };
    setPlaylists(prev => [...prev, pl]);
    setNewPlaylistName("");
    return pl.id;
  };
  const addTrackIdsToPlaylist = (playlistId, trackIds) => {
    setPlaylists(prev => prev.map(p => p.id === playlistId
      ? { ...p, trackIds: [...p.trackIds, ...trackIds.filter(id => !p.trackIds.includes(id))] }
      : p));
  };
  const removeTrackFromPlaylist = (playlistId, trackId) => {
    setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, trackIds: p.trackIds.filter(id => id !== trackId) } : p));
  };
  const deletePlaylist = (playlistId) => {
    setPlaylists(prev => prev.filter(p => p.id !== playlistId));
    setOpenPlaylistId(null);
  };
  const renamePlaylist = (playlistId, name) => {
    if (!name.trim()) return;
    setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, name: name.trim() } : p));
  };
  const setPlaylistCover = async (playlistId, file) => {
    const dataUrl = await readImageAsDataURL(file);
    setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, coverImage: dataUrl } : p));
  };

  const saveTrackEdit = () => {
    if (!editingTrack) return;
    const title = editForm.title.trim();
    if (!title) return; // title is the one field that can't be blanked out
    setLibrary(prev => prev.map(t => t.id === editingTrack.id ? {
      ...t,
      title,
      artist: editForm.artist.trim() || "Unknown Artist",
      album: editForm.album.trim() || "Local Files",
      mood: editForm.mood || null,
    } : t));
    setEditingTrack(null);
  };

  // Bulk tag edit — unlike the single-track modal above, title is left out
  // entirely (each track needs its own) and every field can be left as "no
  // change" so a bulk album fix doesn't accidentally overwrite everyone's
  // artist or mood too. Mood additionally supports an explicit "clear".
  const saveBulkEdit = (ids) => {
    const artist = bulkEditForm.artist.trim();
    const album = bulkEditForm.album.trim();
    const moodChange = bulkEditForm.mood; // "" = no change, "__clear__" = clear, else a mood key
    if (!artist && !album && !moodChange || ids.length === 0) return;
    const idSet = new Set(ids);
    setLibrary(prev => prev.map(t => {
      if (!idSet.has(t.id)) return t;
      const next = { ...t };
      if (artist) next.artist = artist;
      if (album) next.album = album;
      if (moodChange === "__clear__") next.mood = null;
      else if (moodChange) next.mood = moodChange;
      return next;
    }));
    if (artist) setRegisteredArtistNames(prev => prev.includes(artist) ? prev : [...prev, artist]);
    setBulkEditOpen(false);
    setBulkEditForm({ artist: "", album: "", mood: "" });
    setSelectedIds(new Set());
  };

  const sortTracks = useCallback((tracks) => {
    const { key, dir } = sort;
    const text = key === "title" || key === "artist" || key === "album";
    const arr = tracks.map((t, i) => ({ t, i }));
    arr.sort((a, b) => {
      let av = a.t[key], bv = b.t[key];
      if (text) { av = fold(av); bv = fold(bv); } else { av = av || 0; bv = bv || 0; }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      // equal values keep their order, so rows never shuffle
      return dir === "asc" ? a.i - b.i : b.i - a.i;
    });
    return arr.map(x => x.t);
  }, [sort]);

  const filteredLibrary = useMemo(() => {
    let arr = library;
    if (query.trim()) {
      // best matches first (exact title, title start, title words, artist, album …), the chosen sort breaks ties
      const scored = arr.map(t => ({ t, s: matchScore(t, query) })).filter(x => x.s > 0);
      const order = new Map(sortTracks(scored.map(x => x.t)).map((t, i) => [t.id, i]));
      return scored.sort((a, b) => b.s - a.s || order.get(a.t.id) - order.get(b.t.id)).map(x => x.t);
    }
    return sortTracks(arr);
  }, [library, query, sortTracks]);

  const favoriteTracks = useMemo(() => sortTracks(library.filter(t => favorites.has(t.id))), [library, favorites, sortTracks]);
  const tracksWithLyrics = useMemo(
    () => library.filter(t => lyricsMap[t.id]?.lines?.length > 0),
    [library, lyricsMap]
  );
  const openPlaylist = playlists.find(p => p.id === openPlaylistId);
  const playlistTracks = useMemo(
    () => openPlaylist ? sortTracks(library.filter(t => openPlaylist.trackIds.includes(t.id))) : [],
    [openPlaylist, library, sortTracks]
  );

  const mostPlayed = useMemo(() => {
    return library
      .filter(t => playCounts[t.id] > 0)
      .sort((a, b) => (playCounts[b.id] || 0) - (playCounts[a.id] || 0))
      .slice(0, 50);
  }, [library, playCounts]);

  const recentTracks = useMemo(
    () => recentlyPlayed.map(id => library.find(t => t.id === id)).filter(Boolean).slice(0, 50),
    [recentlyPlayed, library]
  );

  // ---- Smart (auto-updating) playlists — derived, never manually curated ----
  const recentlyAddedTracks = useMemo(
    () => [...library].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded)).slice(0, 50),
    [library]
  );
  const neverPlayedTracks = useMemo(
    () => library.filter(t => !playCounts[t.id]),
    [library, playCounts]
  );
  const SMART_PLAYLISTS = {
    "recent-added": { name: "Recently Added", desc: "Your newest 50 tracks", icon: Clock, tracks: recentlyAddedTracks },
    "most-played": { name: "Most Played", desc: "Your top 50 by play count", icon: Flame, tracks: mostPlayed },
    "never-played": { name: "Never Played", desc: "Tracks you haven't gotten to yet", icon: Music2, tracks: neverPlayedTracks },
  };
  const [openSmartKey, setOpenSmartKey] = useState(null); // key into SMART_PLAYLISTS, or null
  const openSmart = openSmartKey ? SMART_PLAYLISTS[openSmartKey] : null;

  // ---- Moods — manually tagged, grouped for browsing like a virtual playlist ----
  const moodGroups = useMemo(() => {
    return MOOD_PRESETS
      .map(m => ({ ...m, tracks: library.filter(t => t.mood === m.key) }))
      .filter(m => m.tracks.length > 0);
  }, [library]);
  const [openMoodKey, setOpenMoodKey] = useState(null);
  const openMood = openMoodKey ? moodGroups.find(m => m.key === openMoodKey) : null;

  // ---- Made for you ----
  // 1) look the songs up online (genre, year, related artists — cached 90 days, one album at a time)
  const suggestOn = online.enabled && online.features.suggest !== false;
  useEffect(() => {
    if (!storeLoaded || !suggestOn) return;
    const pool = library.filter(t => !t.remote);
    if (pool.length < MIN_GROUP || pendingEnrichment(pool, snapRef.current.enrichment).length === 0) return;
    const sig = { stop: false };
    const timer = setTimeout(async () => {
      setEnriching(true);
      await enrichLibrary(pool, snapRef.current.enrichment, { signal: sig, onEntry: (k, e) => setEnrichment(prev => ({ ...prev, [k]: e })) }).catch(() => {});
      if (!sig.stop) setEnriching(false);
    }, 5000);
    return () => { sig.stop = true; clearTimeout(timer); setEnriching(false); };
  }, [storeLoaded, suggestOn, library.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2) group them locally, name the groups, make a cover for each. Rebuilt when 5+ songs were added, or once a day.
  const moodForGroups = useMemo(() => moodGroups.map(m => ({ key: m.key, label: m.label, trackIds: m.tracks.map(t => t.id) })), [moodGroups]);
  const enrCount = Object.keys(enrichment).length;
  useEffect(() => {
    if (!storeLoaded || !suggestOn) return;
    const pool = library.filter(t => !t.remote);
    const m = snapRef.current.suggestMeta;
    const due = snapRef.current.suggestions.length === 0 || Math.abs(pool.length - m.libCount) >= 5 || Date.now() - m.builtAt > 864e5 || enrCount - m.enrCount >= 10;
    if (!due || pool.length < MIN_GROUP) return;
    let dead = false;
    const timer = setTimeout(async () => {
      const groups = buildGroups({ library: pool, enrichment, moods: moodForGroups, lastVisit: prevVisitRef.current, dismissed: dismissedSeeds, takenNames: playlists.map(p => p.name) });
      const byId = new Map(pool.map(t => [t.id, t]));
      const old = new Map(snapRef.current.suggestions.map(s => [s.seedKey, s]));
      const next = [];
      for (const g of groups) {
        const prev = old.get(g.seedKey);
        let cover = prev?.cover || null;
        if (!cover) cover = await mosaicCover(g.trackIds.map(id => byId.get(id)).filter(Boolean));
        if (dead) return;
        next.push({ id: prev?.id || crypto.randomUUID(), name: g.name, kind: g.kind, seedKey: g.seedKey, trackIds: g.trackIds, cover });
      }
      if (dead) return;
      setSuggestions(next);
      setSuggestMeta({ builtAt: Date.now(), libCount: pool.length, enrCount });
    }, 1500);
    return () => { dead = true; clearTimeout(timer); };
  }, [storeLoaded, suggestOn, library.length, enrCount, dismissedSeeds]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleSuggestions = useMemo(() => {
    const have = new Set(library.map(t => t.id));
    return suggestions.map(s => ({ ...s, trackIds: s.trackIds.filter(id => have.has(id)) })).filter(s => s.trackIds.length >= 3);
  }, [suggestions, library]);
  const openSuggestion = openSuggestionId ? visibleSuggestions.find(s => s.id === openSuggestionId) || null : null;
  const forgetSuggestion = (s) => {
    setSuggestions(prev => prev.filter(x => x.id !== s.id));
    setDismissedSeeds(prev => [...prev.filter(d => d.seed !== s.seedKey), { seed: s.seedKey, size: s.trackIds.length }]);
    setOpenSuggestionId(null);
  };
  const addSuggestion = (s) => {
    setPlaylists(prev => [...prev, { id: crypto.randomUUID(), name: s.name, trackIds: s.trackIds, coverImage: s.cover || null }]);
    forgetSuggestion(s);
    pushToast(`Added “${s.name}” to your playlists`);
  };

  // Artists: grouped by track.artist name — this store keys artists by name
  // rather than a separate artist id, so "the artist" for a track is just
  // whatever's in its artist field ("Unknown Artist" included). Each entry
  // aggregates its tracks, its albums (grouped by track.album), and total
  // plays across all its tracks, which is what powers the "most played
  // artists" ranking below.
  const artists = useMemo(() => {
    // group raw names by their normalised key; the most used spelling is the one shown
    const groups = new Map(); // key -> { raws: Map(raw -> count), tracks: [] }
    const grp = (raw) => { const k = artistGroupKey(raw); if (!groups.has(k)) groups.set(k, { raws: new Map(), tracks: [] }); return groups.get(k); };
    for (const name of registeredArtistNames) { const g = grp(name); g.raws.set(name, g.raws.get(name) || 0); }
    for (const t of library) { const raw = t.artist || "Unknown Artist"; const g = grp(raw); g.raws.set(raw, (g.raws.get(raw) || 0) + 1); g.tracks.push(t); }
    const byName = new Map(), aliasesOf = new Map();
    for (const g of groups.values()) {
      const raws = [...g.raws.entries()].sort((x, y) => y[1] - x[1]);
      byName.set(raws[0][0], g.tracks);
      aliasesOf.set(raws[0][0], raws.map(r => r[0]));
    }
    return Array.from(byName.entries()).map(([name, tracks]) => {
      const plays = tracks.reduce((sum, t) => sum + (playCounts[t.id] || 0), 0);
      const albumsMap = new Map();
      for (const t of tracks) {
        const albumName = t.album || "Local Files";
        if (!albumsMap.has(albumName)) albumsMap.set(albumName, []);
        albumsMap.get(albumName).push(t);
      }
      const albums = Array.from(albumsMap.entries())
        .map(([albumName, albumTracks]) => ({
          name: albumName,
          tracks: [...albumTracks].sort((a, b) => (a.trackNo || 0) - (b.trackNo || 0) || a.title.localeCompare(b.title)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        name,
        aliases: aliasesOf.get(name) || [name],
        photo: (aliasesOf.get(name) || [name]).map(n => artistPhotos[n]).find(Boolean) || null,
        trackCount: tracks.length,
        albumCount: albumsMap.size,
        plays,
        albums,
        tracks: sortTracks(tracks),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [library, playCounts, artistPhotos, sortTracks, registeredArtistNames]);

  const topArtists = useMemo(
    () => artists.filter(a => a.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 5),
    [artists]
  );

  const filteredArtists = useMemo(() => {
    if (page !== "artists" || !query.trim()) return artists;
    return artists.filter(a => a.name.toLowerCase().includes(query.toLowerCase()) || matchesText(a.name, query));
  }, [artists, query, page]);

  const openArtist = openArtistName ? artists.find(a => a.name === openArtistName || a.aliases.includes(openArtistName)) : null;

  // ---- Stats page ----
  const [notifHelpOpen, setNotifHelpOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [fixIds, setFixIds] = useState(null);        // null = closed · true = whole-library candidates · array = specific songs
  const [importOpen, setImportOpen] = useState(false);
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const lyricsTriedRef = useRef(new Set());
  useEffect(() => { window.reel?.setStatusBarLight?.(theme === "light"); }, [theme]);
  const [splashDone, setSplashDone] = useState(() => !(typeof window !== "undefined" && window.reel?.platform === "android"));
  useEffect(() => { if (splashDone) return; const id = setTimeout(() => setSplashDone(true), 2500); return () => clearTimeout(id); }, [splashDone]);
  const [recentTab, setRecentTab] = useState("recent"); // phone Recent page: "recent" | "most"
  const [statsRange, setStatsRange] = useState("30d"); // "7d" | "30d" | "all"
  const statsData = useMemo(() => {
    const now = Date.now();
    const rangeMs = statsRange === "7d" ? 7 * 86400000 : statsRange === "30d" ? 30 * 86400000 : Infinity;
    const cutoff = now - rangeMs;
    const entries = playHistory.filter(h => h.ts >= cutoff);
    const trackMap = new Map(library.map(t => [t.id, t]));

    let totalSeconds = 0;
    const trackCounts = new Map();
    const artistCounts = new Map();
    const dayCounts = new Map();

    for (const h of entries) {
      const t = trackMap.get(h.id);
      if (!t) continue;
      totalSeconds += h.listenedSec || 0; // actual time spent playing it, not the track's full duration
      trackCounts.set(h.id, (trackCounts.get(h.id) || 0) + 1);
      const artistName = t.artist || "Unknown Artist";
      artistCounts.set(artistName, (artistCounts.get(artistName) || 0) + 1);
      const day = localDayKey(new Date(h.ts));
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    }

    const topTracks = Array.from(trackCounts.entries())
      .map(([id, count]) => ({ track: trackMap.get(id), count }))
      .filter(x => x.track)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topArtistsRanged = Array.from(artistCounts.entries())
      .map(([name, count]) => ({ name, count, photo: artistPhotos[name] || null }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Zero-filled daily activity for the last 14 days, regardless of range,
    // so the chart always has a consistent, readable window.
    const dailyActivity = [];
    for (let i = 13; i >= 0; i--) {
      const t0 = new Date(now);
      const d = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() - i, 12);   // noon: a DST change can't skip or repeat a day
      const key = localDayKey(d);
      dailyActivity.push({ key, count: dayCounts.get(key) || 0, label: d.toLocaleDateString(undefined, { weekday: "narrow" }) });
    }

    return {
      totalPlays: entries.length,
      totalSeconds,
      distinctTracks: trackCounts.size,
      distinctArtists: artistCounts.size,
      topTracks,
      topArtists: topArtistsRanged,
      dailyActivity,
    };
  }, [playHistory, statsRange, library, artistPhotos]);

  // ---- Stats "taste check" — compares this period against the one right
  // before it (e.g. this week vs last week) instead of a single range, so
  // Stats can say something like "38% more energetic" rather than just a flat total.
  const [compareRange, setCompareRange] = useState("month"); // key into COMPARE_RANGES
  const compareData = useMemo(() => {
    const cfg = COMPARE_RANGES[compareRange];
    const now = Date.now();
    const currStart = now - cfg.days * 86400000;
    const prevStart = currStart - cfg.days * 86400000;
    const trackMap = new Map(library.map(t => [t.id, t]));

    function summarize(fromTs, toTs) {
      const entries = playHistory.filter(h => h.ts >= fromTs && h.ts < toTs);
      let totalSeconds = 0;
      const artistCounts = new Map();
      let energySum = 0, energyN = 0;
      for (const h of entries) {
        const t = trackMap.get(h.id);
        if (!t) continue;
        totalSeconds += h.listenedSec || 0; // actual time spent playing it, not the track's full duration
        const artistName = t.artist || "Unknown Artist";
        artistCounts.set(artistName, (artistCounts.get(artistName) || 0) + 1);
        if (t.mood && MOOD_ENERGY[t.mood] != null) { energySum += MOOD_ENERGY[t.mood]; energyN++; }
      }
      const topArtistEntry = Array.from(artistCounts.entries()).sort((a, b) => b[1] - a[1])[0];
      return {
        plays: entries.length,
        totalSeconds,
        artistSet: new Set(artistCounts.keys()),
        topArtist: topArtistEntry ? topArtistEntry[0] : null,
        avgEnergy: energyN > 0 ? energySum / energyN : null,
        energyN,
      };
    }

    const curr = summarize(currStart, now);
    const prev = summarize(prevStart, currStart);

    const pctChange = (a, b) => {
      if (b === 0) return a > 0 ? null : 0; // null = "new" rather than a divide-by-zero %
      return Math.round(((a - b) / b) * 100);
    };

    const newArtists = Array.from(curr.artistSet).filter(a => !prev.artistSet.has(a));

    return {
      label: cfg.label,
      curr, prev,
      playsDeltaPct: pctChange(curr.plays, prev.plays),
      timeDeltaPct: pctChange(curr.totalSeconds, prev.totalSeconds),
      // percentage-point shift on the 0–1 energy scale, expressed as whole points (e.g. 12 = "12pts more energetic")
      energyDeltaPts: (curr.avgEnergy != null && prev.avgEnergy != null)
        ? Math.round((curr.avgEnergy - prev.avgEnergy) * 100) : null,
      hasEnergyData: curr.energyN >= 3 && prev.energyN >= 3,
      newArtistCount: newArtists.length,
      topArtistChanged: !!curr.topArtist && curr.topArtist !== prev.topArtist,
      hasAnyData: curr.plays > 0 || prev.plays > 0,
    };
  }, [playHistory, library, compareRange]);

  // Confetti burst for the milestone celebration modal — angles/distances
  // randomized once per unlock (memoized on the milestone itself) so the
  // pieces don't jitter to new positions on every re-render while the modal
  // is open.
  const milestoneConfetti = useMemo(() => {
    if (!milestoneModal) return [];
    const palette = [milestoneModal.color, "#ffffff", "#ffd76a"];
    return Array.from({ length: 18 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.4;
      const dist = 90 + Math.random() * 70;
      return {
        id: i,
        tx: `${Math.cos(angle) * dist}px`,
        ty: `${Math.sin(angle) * dist - 20}px`,
        tr: `${Math.round((Math.random() - 0.5) * 720)}deg`,
        color: palette[i % palette.length],
        delay: `${(Math.random() * 0.15).toFixed(2)}s`,
        left: `${45 + Math.random() * 10}%`,
      };
    });
  }, [milestoneModal]);

  function handleArtistPhotoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !openArtist) return;
    readImageAsDataURL(file).then(dataUrl => {
      setArtistPhotos(prev => ({ ...prev, [openArtist.name]: dataUrl }));
    });
  }

  const createArtist = (name) => {
    const n = name.trim();
    if (!n) return;
    setRegisteredArtistNames(prev => prev.includes(n) ? prev : [...prev, n]);
    setOpenArtistName(n);
    setCreateArtistOpen(false);
    setNewArtistName("");
  };

  // Renaming cascades everywhere the old name is the identity: every track
  // tagged with it, its photo, and its registry entry — this store keys
  // artists by name, so the name itself has to move consistently or the
  // artist effectively splits in two.
  const renameArtist = (oldName, newName) => {
    const n = newName.trim();
    if (!n || n === oldName) return;
    const names = new Set(artists.find(a => a.name === oldName)?.aliases || [oldName]);   // every spelling grouped under this artist
    setLibrary(prev => prev.map(t => names.has(t.artist) ? { ...t, artist: n } : t));
    setArtistPhotos(prev => {
      const photo = [...names].map(x => prev[x]).find(Boolean);
      const rest = { ...prev }; names.forEach(x => { delete rest[x]; });
      return photo ? { ...rest, [n]: photo } : rest;
    });
    setRegisteredArtistNames(prev => [...prev.filter(x => !names.has(x) && x !== n), n]);
    setOpenArtistName(n);
  };

  // Deleting an artist reverts its tracks to Unknown Artist rather than
  // deleting them — the artist is just a name-based grouping, not an owner
  // of the underlying files.
  const deleteArtist = (name) => {
    const names = new Set(artists.find(a => a.name === name)?.aliases || [name]);
    setLibrary(prev => prev.map(t => names.has(t.artist) ? { ...t, artist: "Unknown Artist" } : t));
    setArtistPhotos(prev => { const n = { ...prev }; names.forEach(x => { delete n[x]; }); return n; });
    setRegisteredArtistNames(prev => prev.filter(x => !names.has(x)));
    setOpenArtistName(null);
    setDeleteArtistConfirm(null);
  };

  const assignTracksToArtist = (name, ids) => {
    const n = name.trim();
    if (!n || ids.length === 0) return;
    const idSet = new Set(ids);
    setLibrary(prev => prev.map(t => idSet.has(t.id) ? { ...t, artist: n } : t));
    setRegisteredArtistNames(prev => prev.includes(n) ? prev : [...prev, n]);
  };

  const rowHeight = density === "compact" ? "6px 8px" : "8px 8px";

  /* ---------- selection helpers ---------- */
  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  // ---- phone: long-press opens the song menu; once something is selected, taps toggle selection ----
  const lpProps = (t, context) => ({
    onTouchStart: () => {
      lpFiredRef.current = false;
      clearTimeout(lpTimerRef.current);
      lpTimerRef.current = setTimeout(() => {
        lpFiredRef.current = true;
        try { navigator.vibrate?.(12); } catch {}
        setSheetPlaylistsOpen(false);
        setSelCtx(context || "library");
        setTrackSheet({ track: t, context });
      }, 430);
    },
    onTouchMove: () => clearTimeout(lpTimerRef.current),
    onTouchEnd: () => clearTimeout(lpTimerRef.current),
    onTouchCancel: () => clearTimeout(lpTimerRef.current),
    onContextMenu: (e) => { e.preventDefault(); clearTimeout(lpTimerRef.current); lpFiredRef.current = true; setSheetPlaylistsOpen(false); setTrackSheet({ track: t, context }); },
  });
  const rowTap = (t, ids) => {
    if (lpFiredRef.current) { lpFiredRef.current = false; return; }
    if (selectedIds.size > 0) { toggleSelect(t.id); return; }
    playTrackId(t.id, ids);
  };

  const selectAll = (tracks) => setSelectedIds(prev => {
    const allSelected = tracks.length > 0 && tracks.every(t => prev.has(t.id));
    if (allSelected) return new Set();
    return new Set(tracks.map(t => t.id));
  });

  function removeSelectedFor(context, idsArg) {
    const ids = idsArg || selectedIds;
    if (context === "library") {
      setLibrary(prev => prev.filter(t => !ids.has(t.id)));
      setFavorites(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
      setPlaylists(prev => prev.map(p => ({ ...p, trackIds: p.trackIds.filter(id => !ids.has(id)) })));
      setQueue(prev => prev.filter(id => !ids.has(id)));
    } else if (context === "favorites") {
      setFavorites(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    } else if (context === "playlist" && openPlaylist) {
      setPlaylists(prev => prev.map(p => p.id === openPlaylist.id ? { ...p, trackIds: p.trackIds.filter(id => !ids.has(id)) } : p));
    } else if (context === "queue") {
      setQueue(prev => prev.filter(id => !ids.has(id)));
    } else if (context === "artist") {
      setLibrary(prev => prev.map(t => ids.has(t.id) ? { ...t, artist: "Unknown Artist" } : t));
    }
    setSelectedIds(new Set());
  }

  const removeLabel = {
    library: "Delete from library",
    favorites: "Remove from favorites",
    playlist: "Remove from playlist",
    queue: "Remove from queue",
    artist: "Remove from artist",
    recent: null,
  };

  /* ---------- Sort control ---------- */
  function renderSortControl() {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <select className="sort-select" value={sort.key} onChange={e => setSort(s => ({ ...s, key: e.target.value }))}>
          <option value="title">Title</option>
          <option value="artist">Artist</option>
          <option value="album">Album</option>
          <option value="dateAdded">Date added</option>
          <option value="duration">Duration</option>
        </select>
        <button className="btn sort-dir" onClick={() => setSort(s => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))} aria-label="Reverse the order">
          {sort.dir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
          <span>{sortDirLabel(sort.key, sort.dir)}</span>
        </button>
      </div>
    );
  }



  /* ---------- Track table renderer (shared) ---------- */
  // Cover-grid alternative to the track table (Bloom / Turntable designs).
  const effectiveTrackView = trackView === "auto" ? (design === "turntable" ? "grid" : "list") : trackView;



  function renderTrackTable(tracks, { context, queueContext } = {}) {
    if (tracks.length === 0) {
      return (
        <div className="empty-state">
          <Library size={34} strokeWidth={1.3} />
          <h3>No tracks here yet</h3>
          <p>Add music from your computer to start building this view. Reel indexes it instantly — no waiting on a scan.</p>
          {page === "library" && (
            <button className="btn btn-accent" onClick={handleAddMusic}>
              <Plus size={14} /> Add music
            </button>
          )}
        </div>
      );
    }
    {
      visibleSelRef.current = tracks.map(x => x.id);
      const selecting = selectedIds.size > 0;
      return (
        <div className="m-list">
          <MobileRows tracks={tracks} row={t => {
            const playing = t.id === currentTrackId;
            const selected = selectedIds.has(t.id);
            const m = t.mood && MOOD_PRESETS.find(x => x.key === t.mood);
            return (
              <div key={t.id}
                className={`m-row${playing ? " playing" : ""}${selected ? " selected" : ""}${page === "library" && query.trim() ? " searching" : ""}`}
                onClick={() => { if (!lpFiredRef.current && selectedIds.size === 0) setSelCtx(context || "library"); rowTap(t, queueContext || tracks.map(x => x.id)); }}
                {...lpProps(t, context)}
              >
                {selecting && <SelCircle on={selected} />}
                <TrackThumb track={t} isPlaying={playing && isPlaying} size={52} />
                <div className="m-txt">
                  <span className="t">{page === "library" && query.trim() ? highlightParts(t.title, query).map((p, k) => p.hit ? <mark key={k}>{p.text}</mark> : p.text) : t.title}</span>
                  <span className="a">
                    <span className="a-name">{t.artist}</span>
                    {m && <span className="mood-badge m-mood" style={{ color: m.color, background: `${m.color}22` }}><m.icon size={10} /> {m.label}</span>}
                  </span>
                </div>
                {!selecting && (
                  <button className={`m-fav${favorites.has(t.id) ? " on" : ""}`} onClick={e => { e.stopPropagation(); toggleFavorite(t.id); }} aria-label="Favorite">
                    <Heart size={18} fill={favorites.has(t.id) ? "currentColor" : "none"} />
                  </button>
                )}
              </div>
            );
          }} />
        </div>
      );
    }

  }

  /* ---------- Recent page simple list ---------- */


  /* ---------- Now Playing stage ---------- */
  function renderUpNextPanel() {
    return (
      <div className="np-panel np-upnext">
        <div className="np-panel-label">Up next</div>
        {upNextTracks.length === 0 ? (
          <div className="np-panel-empty">Nothing queued after this track.</div>
        ) : upNextTracks.map(t => (
          <button key={t.id} className="np-up-row" onClick={() => playTrackId(t.id)}>
            <TrackThumb track={t} isPlaying={false} size={40} />
            <div className="np-up-meta"><div className="t">{t.title}</div><div className="a">{t.artist}</div></div>
            {t.duration > 0 && <span className="np-up-dur mono">{fmtTime(t.duration)}</span>}
          </button>
        ))}
      </div>
    );
  }

  function renderLyricsPanel() {
    const lines = currentLyrics?.lines || [];
    const from = lyricsIsSynced ? Math.max(0, activeLyricsLineIndex - 1) : 0;
    const shown = lines.slice(from, from + 6);
    return (
      <div className="np-panel np-lyrics">
        <div className="np-panel-label np-panel-head">Lyrics{shown.length > 0 && <button className="np-panel-action" onClick={openShareLyrics} title="Share lyrics as a card"><Share2 size={13} /></button>}</div>
        {shown.length === 0 ? (
          <div className="np-panel-empty">
            No lyrics for this track yet.
            <button className="btn btn-sm" onClick={() => setNpView("lyrics")}>Add lyrics</button>
          </div>
        ) : shown.map((l, k) => {
          const i = from + k;
          return (
            <div
              key={i}
              className={`np-ly-line${lyricsIsSynced ? " seekable" : ""}${lyricsIsSynced && i === activeLyricsLineIndex ? " active" : ""}`}
              onClick={lyricsIsSynced ? () => seekTo(duration ? l.time_sec / duration : 0) : undefined}
            >{l.text}</div>
          );
        })}
      </div>
    );
  }

  function renderNowPlayingStage() {
    if (!currentTrack) return null;
    const artBg = currentTrack.art ? `url(${currentTrack.art})` : coverGradient(currentTrack.id);
    if (npView === "vinyl") {
      const progress = duration ? position / duration : 0;
      return (
        <div className="vinyl-stage">
          <div className="vinyl-ring-wrap">
            <VinylProgressRing engineRef={engineRef} isPlaying={isPlaying} fallbackProgress={progress} />
            <div className={`vinyl-disc${isPlaying ? " spinning" : ""}`}>
              <div className="vinyl-label" style={currentTrack.art ? { backgroundImage: artBg } : { background: artBg }}>
                {!currentTrack.art && <Disc3 size={30} strokeWidth={1.4} />}
              </div>
            </div>
          </div>
          <div className="tonearm">
            <div className={`tonearm-body${isPlaying ? " down" : ""}`}><div className="tonearm-head" /></div>
          </div>
        </div>
      );
    }
    if (npView === "cover") {
      return (
        <div className="cover-stage">
          <div className="cover-bg" style={currentTrack.art ? { backgroundImage: artBg } : { background: artBg }} />
          <div className="cover-art-flip" key={currentTrack.id}>
            {/* before the cover in the markup, so the cover always paints on top of it */}
            {lyricsIsSynced && (currentLyrics?.lines?.length || 0) > 0 && <LiveLyricLine lines={currentLyrics.lines} index={activeLyricsLineIndex} />}
            <div className={`cover-art-big${isPlaying ? " breathing" : ""}`} style={currentTrack.art ? { backgroundImage: artBg } : { background: artBg }}>
              {!currentTrack.art && <Music2 size={70} strokeWidth={1.2} />}
            </div>
          </div>
        </div>
      );
    }
    if (npView === "spectrum") {
      return (
        <div className="spectrum-stage">
          <SpectrumCanvas isPlaying={isPlaying} accent={accent} />
        </div>
      );
    }
    return renderLyricsStage();
  }

  function renderRepeatButton(size) {
    const one = repeatMode === "one";
    const p = duration ? Math.min(1, position / duration) : 0;
    return (
      <button
        className={`pb-ctrl repeat-btn${repeatMode !== "off" ? " on" : ""}${one ? " one" : ""}`}
        style={one ? { "--p": `${Math.round(p * 360)}deg` } : undefined}
        onClick={() => setRepeatMode(m => m === "off" ? "all" : m === "all" ? "one" : "off")}
        title={one ? `Repeat one — played ${repeatLoops + 1}× in a row` : `Repeat: ${repeatMode}`}
      >
        <span className="repeat-ring" />
        <span key={`i${repeatLoops}`} className={`repeat-icon${repeatLoops > 0 ? " spin" : ""}`}>
          {one ? <Repeat1 size={size} /> : <Repeat size={size} />}
        </span>
        {one && repeatLoops > 0 && <span key={`b${repeatLoops}`} className="repeat-badge">×{repeatLoops + 1}</span>}
        {one && repeatLoops > 0 && <span key={`p${repeatLoops}`} className="repeat-plus">+1</span>}
      </button>
    );
  }

  // ---- lyrics share card ----
  function openShareLyrics() {
    const lines = currentLyrics?.lines || [];
    let first = lyricsIsSynced ? activeLyricsLineIndex : -1;
    if (first < 0 || !(lines[first]?.text || "").trim()) first = lines.findIndex(l => (l.text || "").trim());
    setShareSel(first >= 0 ? [first] : []);
    setShareOpen(true);
  }
  function toggleShareLine(i, range) {
    const lines = currentLyrics?.lines || [];
    if (shareSel.includes(i)) { setShareSel(shareSel.filter(x => x !== i)); return; }
    let next = [...shareSel, i];
    if (range && shareSel.length) {
      const from = Math.min(shareSel[shareSel.length - 1], i), to = Math.max(shareSel[shareSel.length - 1], i);
      next = [...shareSel];
      for (let k = from; k <= to; k++) if ((lines[k]?.text || "").trim() && !next.includes(k)) next.push(k);
    }
    next = Array.from(new Set(next)).sort((a, b) => a - b);
    if (next.length > MAX_SHARE_LINES) { pushToast(`Up to ${MAX_SHARE_LINES} lines fit on a card.`); return; }
    setShareSel(next);
  }

  function renderLyricsStage() {
    if (!currentTrack) return null;

    if (!currentLyrics || !currentLyrics.lines || currentLyrics.lines.length === 0) {
      return (
        <div className="lyrics-empty">
          <Mic2 size={32} strokeWidth={1.3} />
          <h3>No lyrics yet</h3>
          <p>Import a .lrc file, or paste plain lyrics and sync them while the song plays.</p>
          <div className="lyrics-empty-actions">
            <button className="btn btn-accent" onClick={handleImportLyrics}><Upload size={14} /> Import .lrc</button>
            <button className="btn" onClick={() => { setPasteLyricsText(""); setPasteLyricsOpen(true); }}><FileText size={14} /> Paste lyrics</button>
            {online.enabled && online.features.lyrics && (
              <button className="btn" disabled={lyricsBusy} onClick={() => findLyricsOnline(currentTrack)}><Search size={14} /> {lyricsBusy ? "Searching…" : "Find online"}</button>
            )}
          </div>
        </div>
      );
    }

    if (!lyricsIsSynced) {
      return (
        <div className="lyrics-plain">
          <div className="lyrics-plain-header">
            <span className="lyrics-badge unsynced">Unsynced</span>
            <button className="btn btn-sm btn-accent" onClick={openEditLyrics}><Pencil size={13} /> Edit</button>
            <button className="btn btn-sm btn-accent" onClick={exportLyrics} title="Export as .txt"><Upload size={13} /> Export</button>
            <button className="btn btn-sm btn-accent" onClick={openShareLyrics} title="Share lyrics as a card"><Share2 size={13} /> Share</button>
            <button className="btn btn-sm btn-accent" onClick={() => startTapToSync(currentTrack.id)}><Hand size={13} /> Sync now</button>
          </div>
          <div className="lyrics-plain-lines">
            {currentLyrics.lines.map((l, i) => <p key={i}>{l.text}</p>)}
          </div>
        </div>
      );
    }

    return (
      <div className="lyrics-synced">
        <button className="btn btn-sm btn-accent lyrics-export-btn" onClick={exportLyrics} title="Export as .lrc"><Upload size={13} /> Export</button>
        <button className="btn btn-sm btn-accent lyrics-share-btn" onClick={openShareLyrics} title="Share lyrics as a card"><Share2 size={13} /> Share</button>
        <button className="btn btn-sm btn-accent lyrics-edit-btn" onClick={openEditLyrics}><Pencil size={13} /> Edit</button>
        <div className="lyrics-list">
          {currentLyrics.lines.map((l, i) => (
            <p
              key={i}
              ref={i === activeLyricsLineIndex ? lyricsActiveLineRef : null}
              className={`lyrics-line${i === activeLyricsLineIndex ? " active" : ""}${i < activeLyricsLineIndex ? " past" : ""}`}
              onClick={() => seekTo(duration ? l.time_sec / duration : 0)}
            >
              {l.text}
            </p>
          ))}
        </div>
      </div>
    );
  }

  const matchesAddQuery = (t) => {
    const q = addSongsQuery.trim().toLowerCase();
    return !q || `${t.title} ${t.artist} ${t.album || ""}`.toLowerCase().includes(q) || matchesTrack(t, addSongsQuery);
  };
  const libraryNotInPlaylist = openPlaylist ? library.filter(t => !openPlaylist.trackIds.includes(t.id) && matchesAddQuery(t)) : [];
  const libraryNotInArtist = openArtist ? library.filter(t => !openArtist.aliases.includes(t.artist) && matchesAddQuery(t)) : [];

  return (
    <div className={`reel-root is-mobile${selectedIds.size > 0 ? " sel-mode" : ""}${nowPlayingOpen ? " np-open" : ""}${design !== "classic" ? ` design-${design}` : ""}`} style={rootStyle}>
      {!splashDone && (
        <div className="app-splash" aria-hidden="true">
          <div className="app-splash-inner">
            <div className="app-splash-mark">
              <i className="b b1" /><i className="b b2" /><i className="b b3" /><i className="b b4" /><i className="b b5" />
            </div>
            <div className="app-splash-word"><span>R</span><span>e</span><span>e</span><span>l</span></div>
          </div>
        </div>
      )}
      {design !== "classic" && <div className="design-bg" />}
      <div className={`volume-hud${volumeHudShow ? " show" : ""}`}>
        {volume === 0 ? <VolumeX size={16} color="var(--text)" /> : volume < 0.5 ? <Volume1 size={16} color="var(--text)" /> : <Volume2 size={16} color="var(--text)" />}
        <div className="volume-hud-track"><div className="volume-hud-fill" style={{ width: `${Math.round(volume * 100)}%` }} /></div>
        <span className="volume-hud-pct">{Math.round(volume * 100)}%</span>
      </div>
      <input
        ref={coverInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files[0] && openPlaylistId) setPlaylistCover(openPlaylistId, e.target.files[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={lyricsFileInputRef} type="file" accept=".lrc,.txt" style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files[0]) handleImportLyricsFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={artistPhotoInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={handleArtistPhotoChange}
      />

      {(
        <nav className="mobile-tabs">
          {[["library", Library, "Library"], ["favorites", Heart, "Favorites"], ["playlists", ListMusic, "Playlists"], ["artists", Users, "Artists"], ["more", MoreHorizontal, "More"]].map(([key, Icon, label]) => {
            const on = key === "more" ? MORE_PAGES.includes(page) : page === key;
            return (
            <button
              key={key}
              className={`mobile-tab${on ? " active" : ""}`}
              onClick={() => { setPage(key); setOpenPlaylistId(null); setSelectedIds(new Set()); if (key === "artists") setOpenArtistName(null); }}
            >
              <Icon size={20} strokeWidth={on ? 2.4 : 1.8} />
              <span>{label}</span>
            </button>
            );
          })}
        </nav>
      )}

      {/* MAIN */}
      <div className="main-col">
        <div className={`topbar${((page === "queue" && queue.length > 0) || page === "stats" || page === "discover" || page === "health") ? " m-hide" : ""}`}>
          {(openPlaylist || openArtist || openSmart || openMood || ["queue", "recent", "lyrics", "stats"].includes(page)) && (
            <button className="btn btn-icon mobile-menu-btn" onClick={() => backRef.current()} aria-label="Back"><ChevronLeft size={20} /></button>
          )}
          <div className="page-title">
            {page === "library" && "Library"}
            {page === "favorites" && "Favorites"}
            {page === "playlists" && !openPlaylist && !openSmart && !openMood && !openSuggestion && "Playlists"}
            {page === "playlists" && openSuggestion && openSuggestion.name}
            {page === "playlists" && openPlaylist && openPlaylist.name}
            {page === "playlists" && openSmart && openSmart.name}
            {page === "playlists" && openMood && openMood.label}
            {page === "artists" && !openArtist && "Artists"}
            {page === "artists" && openArtist && openArtist.name}
            {page === "queue" && "Play Queue"}
            {page === "recent" && "Recent"}
            {page === "lyrics" && "Lyrics"}
            {page === "stats" && "Stats"}
            {page === "more" && "More"}
            {page === "discover" && "Explore"}
            {page === "health" && "Library health"}
          </div>
          {(page === "library" || page === "favorites" || (page === "playlists" && openPlaylist)) && (
            <>
              {page !== "playlists" && (
                <div className="search-box">
                  <Search size={14} />
                  <input placeholder="Search titles or artists" value={query} onChange={e => setQuery(e.target.value)} />
                </div>
              )}
              {renderSortControl()}
            </>
          )}
          {page === "artists" && !openArtist && (
            <div className="search-box">
              <Search size={14} />
              <input placeholder="Search artists" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {design !== "classic" && (page === "library" || page === "favorites") && (
              <div className="view-toggle">
                <button className={`view-toggle-btn${effectiveTrackView === "list" ? " active" : ""}`} onClick={() => setTrackView("list")} title="List view"><List size={14} /></button>
                <button className={`view-toggle-btn${effectiveTrackView === "grid" ? " active" : ""}`} onClick={() => setTrackView("grid")} title="Cover grid"><LayoutGrid size={14} /></button>
              </div>
            )}
            {page === "library" && (
              <button className="btn btn-accent" onClick={handleAddMusic} disabled={scanning}>
                <FolderOpen size={14} /> {scanning ? "Scanning…" : "Scan music"}
              </button>
            )}
            {page === "queue" && queue.length > 0 && (
              <>
                <button className="btn" onClick={shuffleUpNext}><Shuffle size={14} /> Shuffle</button>
                <button className="btn" onClick={() => setQueue([])}><Trash2 size={14} /> Clear queue</button>
              </>
            )}
            {page === "artists" && !openArtist && (
              <button className="btn btn-accent" onClick={() => setCreateArtistOpen(true)}><Plus size={14} /> New artist</button>
            )}
          </div>
        </div>

        {libraryNotice && (
          <div className="library-notice-bar">
            <span>{libraryNotice}</span>
            <button className="icon-btn" onClick={() => setLibraryNotice(null)}><X size={13} /></button>
          </div>
        )}

        <div className="page-body page-fade" key={page + (openPlaylistId || "")}>
          {page === "discover" && (
            <ExplorePage onBack={() => setPage("more")} currentTrack={currentTrack} library={library} playCounts={playCounts} favorites={favorites} onOpenSettings={() => setSettingsOpen(true)} />
          )}
          {page === "health" && (
            <HealthPage onBack={() => setPage("more")} library={library} lyricsMap={lyricsMap} playCounts={playCounts}
              onRemoveIds={removeIdsFromLibrary} onFix={(ids) => setFixIds(ids)} onCleanTitles={cleanUpTitles}
              onOpenSettings={() => setSettingsOpen(true)} pushToast={pushToast} />
          )}
          {page === "more" && (
            <div className="more-list">
              {[
                ["queue", Radio, "Queue", `${queue.length} up next`],
                ["recent", Clock, "Recent", "What you played lately"],
                ["lyrics", Mic2, "Lyrics", `${tracksWithLyrics.length} song${tracksWithLyrics.length !== 1 ? "s" : ""} with lyrics`],
                ["stats", BarChart3, "Stats", "Listening time, track of the week, milestones"],
              ].map(([key, Icon, label, sub]) => (
                <button key={key} className="more-row" onClick={() => { setPage(key); setOpenPlaylistId(null); }}>
                  <span className="more-ico"><Icon size={19} /></span>
                  <span className="more-txt"><b>{label}</b><i>{sub}</i></span>
                  <ChevronRight size={17} />
                </button>
              ))}
              <button className="more-row" onClick={() => { setPage("discover"); setOpenPlaylistId(null); }}>
                <span className="more-ico"><Radio size={19} /></span>
                <span className="more-txt"><b>Explore</b><i>New songs like the ones you play</i></span>
                <ChevronRight size={17} />
              </button>
              <button className="more-row" onClick={() => { setPage("health"); setOpenPlaylistId(null); }}>
                <span className="more-ico"><Tags size={19} /></span>
                <span className="more-txt"><b>Library health</b><i>Duplicates and missing info</i></span>
                <ChevronRight size={17} />
              </button>
              <button className="more-row" onClick={() => setSettingsOpen(true)}>
                <span className="more-ico"><Settings size={19} /></span>
                <span className="more-txt"><b>Settings</b><i>Design, accent color, sleep timer, notifications</i></span>
                <ChevronRight size={17} />
              </button>
            </div>
          )}
          {page === "library" && (
            <>
              {library.length > 0 && (
                <div className="library-hero">
                  <div className="library-hero-icon"><Library size={40} strokeWidth={1.3} /></div>
                  <div className="playlist-hero-info">
                    <div className="playlist-hero-eyebrow">Your music</div>
                    <h2 className="playlist-hero-title">Library</h2>
                    <div className="playlist-hero-meta">
                      {library.length} track{library.length !== 1 ? "s" : ""} · {artists.length} artist{artists.length !== 1 ? "s" : ""} · {fmtDuration(library.reduce((sum, t) => sum + (t.duration || 0), 0))}
                    </div>
                    <div className="playlist-hero-actions">
                      <button
                        className="playlist-hero-play"
                        disabled={filteredLibrary.length === 0}
                        title="Play"
                        onClick={() => { setShuffle(false); playTrackId(filteredLibrary[0].id, filteredLibrary.map(t => t.id)); }}
                      >
                        <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
                      </button>
                      <button
                        className="playlist-hero-shuffle"
                        disabled={filteredLibrary.length === 0}
                        title="Shuffle play"
                        onClick={() => {
                          setShuffle(true);
                          const rand = filteredLibrary[Math.floor(Math.random() * filteredLibrary.length)];
                          playTrackId(rand.id, filteredLibrary.map(t => t.id));
                        }}
                      >
                        <Shuffle size={17} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {library.length >= 8 && !query.trim() && <RecommendationsCard recs={recommendations} onPlay={(t, ids) => playTrackId(t.id, ids)} />}
              {renderTrackTable(filteredLibrary, { context: "library" })}
            </>
          )}
          {page === "favorites" && (
            <>
              <div className="favorites-hero">
                <div className="favorites-hero-icon"><Heart size={40} fill="currentColor" /></div>
                <div className="playlist-hero-info">
                  <div className="playlist-hero-eyebrow">Your favorites</div>
                  <h2 className="playlist-hero-title">Favorites</h2>
                  <div className="playlist-hero-meta">
                    {favoriteTracks.length} track{favoriteTracks.length !== 1 ? "s" : ""}
                    {favoriteTracks.length > 0 && (
                      <> · {fmtDuration(favoriteTracks.reduce((sum, t) => sum + (t.duration || 0), 0))}</>
                    )}
                  </div>
                  <div className="playlist-hero-actions">
                    <button
                      className="favorites-hero-play"
                      disabled={favoriteTracks.length === 0}
                      title="Play"
                      onClick={() => { setShuffle(false); playTrackId(favoriteTracks[0].id, favoriteTracks.map(t => t.id)); }}
                    >
                      <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
                    </button>
                    <button
                      className="playlist-hero-shuffle"
                      disabled={favoriteTracks.length === 0}
                      title="Shuffle play"
                      onClick={() => {
                        setShuffle(true);
                        const rand = favoriteTracks[Math.floor(Math.random() * favoriteTracks.length)];
                        playTrackId(rand.id, favoriteTracks.map(t => t.id));
                      }}
                    >
                      <Shuffle size={17} />
                    </button>
                  </div>
                </div>
              </div>
              {renderTrackTable(favoriteTracks, { context: "favorites" })}
            </>
          )}

          {page === "playlists" && !openPlaylist && !openSmart && !openMood && !openSuggestion && (
            <>
              <div className="pl-actions">
                <button className="pl-act" onClick={() => setImportOpen(true)}><Download size={17} /><span>Import playlist</span></button>
                <button className="pl-act pl-act-main" onClick={() => setCreatePlaylistOpen(true)}><Plus size={18} strokeWidth={2.2} /><span>New playlist</span></button>
              </div>

              {!suggestOn ? (
                <button className="mfy-off" onClick={() => setSettingsOpen(true)}>
                  <Sparkles size={18} />
                  <span><b>Playlists made for you</b><i>Turn on online features to group your songs by genre, era and similar artists.</i></span>
                  <ChevronRight size={16} />
                </button>
              ) : visibleSuggestions.length > 0 ? (
                <>
                  <div className="pl-label mfy-label">MADE FOR YOU{enriching && <span className="mfy-sync"><Loader2 size={11} className="spin" /> reading your library online</span>}</div>
                  <div className="mfy-strip">
                    {visibleSuggestions.map(s => (
                      <div key={s.id} className="mfy-card">
                        <button className="mfy-cover" style={s.cover ? { backgroundImage: `url(${s.cover})` } : { background: coverGradient(s.seedKey) }} onClick={() => setOpenSuggestionId(s.id)} aria-label={`Open ${s.name}`}>
                          {!s.cover && <ListMusic size={26} strokeWidth={1.4} />}
                        </button>
                        <button className="mfy-add" onClick={() => addSuggestion(s)} aria-label={`Add ${s.name} to my playlists`}><Plus size={16} strokeWidth={2.4} /></button>
                        <button className="mfy-x" onClick={() => forgetSuggestion(s)} aria-label="Not interested"><X size={13} strokeWidth={2.4} /></button>
                        <b>{s.name}</b>
                        <i>{s.trackIds.length} songs</i>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mfy-note">
                  {library.filter(t => !t.remote).length < MIN_GROUP
                    ? "Add a few more songs and Reel will propose playlists made from them."
                    : enriching ? <><Loader2 size={12} className="spin" /> Reading your library online to make playlists…</> : "Playlists made for you will appear here once your songs have been looked up."}
                </p>
              )}

              <div className="pl-label">SMART</div>
              <div className="pl-strip">
                {Object.entries(SMART_PLAYLISTS).map(([key, sp]) => (
                  <button key={key} className="pl-smart" style={{ background: coverGradient(key) }} onClick={() => { setOpenSmartKey(key); setOpenMoodKey(null); }}>
                    <sp.icon size={22} strokeWidth={1.6} />
                    <span><b>{sp.name}</b><i>{sp.tracks.length} track{sp.tracks.length !== 1 ? "s" : ""}</i></span>
                  </button>
                ))}
              </div>

              {moodGroups.length > 0 && (
                <>
                  <div className="pl-label">MOODS</div>
                  <div className="mood-chip-row" style={{ marginBottom: 8 }}>
                    {moodGroups.map(m => (
                      <button key={m.key} className="mood-chip" style={{ borderColor: m.color, color: m.color, background: `${m.color}18` }} onClick={() => { setOpenMoodKey(m.key); setOpenSmartKey(null); }}>
                        <m.icon size={13} /> {m.label} <span style={{ opacity: 0.7 }}>· {m.tracks.length}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="pl-label">YOUR PLAYLISTS</div>
              <div className="pl-rows">
                {playlists.map(p => (
                  <button key={p.id} className="pl-row" onClick={() => setOpenPlaylistId(p.id)}>
                    <span className="pl-thumb" style={p.coverImage ? { backgroundImage: `url(${lightArt(p.coverImage)})` } : { background: coverGradient(p.id) }}>
                      {!p.coverImage && <ListMusic size={20} strokeWidth={1.5} />}
                    </span>
                    <span className="pl-row-txt"><b>{p.name}</b><i>{p.trackIds.length} track{p.trackIds.length !== 1 ? "s" : ""}</i></span>
                    <ChevronRight size={16} className="pl-chev" />
                  </button>
                ))}
              </div>
              {playlists.length === 0 && <p className="mfy-note">No playlists yet — tap “New playlist” to start one, or add one from “Made for you”.</p>}
            </>
          )}

          {page === "playlists" && openSuggestion && (() => {
            const tracks = openSuggestion.trackIds.map(id => libraryAll.find(t => t.id === id)).filter(Boolean);
            const why = { genre: "Songs from your library with this genre", decade: "Genre and era, from your own songs", circle: "Artists that sound alike, all from your library", mood: "Songs you tagged with this mood", new: "Songs you added recently", script: "Grouped by language" }[openSuggestion.kind] || "Made from your songs";
            return (
              <>
                <button className="btn" style={{ marginBottom: 14 }} onClick={() => setOpenSuggestionId(null)}>← All playlists</button>
                <div className="mfy-hero">
                  <div className="mfy-hero-cover" style={openSuggestion.cover ? { backgroundImage: `url(${openSuggestion.cover})` } : { background: coverGradient(openSuggestion.seedKey) }} />
                  <div className="mfy-hero-info">
                    <div className="mfy-eyebrow"><Sparkles size={12} /> Made for you</div>
                    <h2>{openSuggestion.name}</h2>
                    <p>{tracks.length} songs · {why}</p>
                  </div>
                </div>
                <div className="mfy-hero-actions">
                  <button className="btn btn-accent mfy-add-btn" onClick={() => addSuggestion(openSuggestion)}><Plus size={17} /> Add to my playlists</button>
                  <button className="btn btn-icon" title="Play" disabled={!tracks.length} onClick={() => { setShuffle(false); playTrackId(tracks[0].id, tracks.map(t => t.id)); }}><Play size={17} fill="currentColor" /></button>
                  <button className="btn btn-icon" title="Shuffle" disabled={!tracks.length} onClick={() => { setShuffle(true); playTrackId(tracks[Math.floor(Math.random() * tracks.length)].id, tracks.map(t => t.id)); }}><Shuffle size={17} /></button>
                  <button className="btn btn-icon" title="Not interested" onClick={() => forgetSuggestion(openSuggestion)}><X size={17} /></button>
                </div>
                {renderTrackTable(tracks, { context: "smart", queueContext: tracks.map(t => t.id) })}
              </>
            );
          })()}

          {page === "playlists" && openSmart && (
            <>
              <button className="btn" style={{ marginBottom: 18 }} onClick={() => setOpenSmartKey(null)}>← All playlists</button>
              <div className="playlist-hero">
                <div className="playlist-hero-backdrop" style={{ background: coverGradient(openSmartKey) }} />
                <div className="playlist-hero-content">
                  <div className="playlist-hero-cover" style={{ background: coverGradient(openSmartKey) }}>
                    <openSmart.icon size={38} strokeWidth={1.3} />
                  </div>
                  <div className="playlist-hero-info">
                    <div className="playlist-hero-eyebrow">Smart playlist</div>
                    <h2 className="playlist-hero-title">{openSmart.name}</h2>
                    <div className="playlist-hero-meta">
                      {openSmart.desc} · {openSmart.tracks.length} track{openSmart.tracks.length !== 1 ? "s" : ""}
                    </div>
                    <div className="playlist-hero-actions">
                      <button
                        className="playlist-hero-play"
                        disabled={openSmart.tracks.length === 0}
                        title="Play"
                        onClick={() => { setShuffle(false); playTrackId(openSmart.tracks[0].id, openSmart.tracks.map(t => t.id)); }}
                      >
                        <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
                      </button>
                      <button
                        className="playlist-hero-shuffle"
                        disabled={openSmart.tracks.length === 0}
                        title="Shuffle play"
                        onClick={() => {
                          setShuffle(true);
                          const rand = openSmart.tracks[Math.floor(Math.random() * openSmart.tracks.length)];
                          playTrackId(rand.id, openSmart.tracks.map(t => t.id));
                        }}
                      >
                        <Shuffle size={17} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {openSmart.tracks.length === 0 ? (
                <div className="empty-state">
                  <openSmart.icon size={30} strokeWidth={1.3} />
                  <h3>Nothing here yet</h3>
                  <p>This list updates automatically as your library and listening habits change.</p>
                </div>
              ) : (
                renderTrackTable(openSmart.tracks, { context: "smart", queueContext: openSmart.tracks.map(t => t.id) })
              )}
            </>
          )}

          {page === "playlists" && openMood && (
            <>
              <button className="btn" style={{ marginBottom: 18 }} onClick={() => setOpenMoodKey(null)}>← All playlists</button>
              <div className="playlist-hero">
                <div className="playlist-hero-backdrop" style={{ background: `linear-gradient(135deg, ${openMood.color}, #0D0D10)` }} />
                <div className="playlist-hero-content">
                  <div className="playlist-hero-cover" style={{ background: openMood.color }}>
                    <openMood.icon size={38} strokeWidth={1.3} color="#0D0D10" />
                  </div>
                  <div className="playlist-hero-info">
                    <div className="playlist-hero-eyebrow">Mood</div>
                    <h2 className="playlist-hero-title">{openMood.label}</h2>
                    <div className="playlist-hero-meta">
                      {openMood.tracks.length} track{openMood.tracks.length !== 1 ? "s" : ""}
                    </div>
                    <div className="playlist-hero-actions">
                      <button
                        className="playlist-hero-play"
                        title="Play"
                        onClick={() => { setShuffle(false); playTrackId(openMood.tracks[0].id, openMood.tracks.map(t => t.id)); }}
                      >
                        <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
                      </button>
                      <button
                        className="playlist-hero-shuffle"
                        title="Shuffle play"
                        onClick={() => {
                          setShuffle(true);
                          const rand = openMood.tracks[Math.floor(Math.random() * openMood.tracks.length)];
                          playTrackId(rand.id, openMood.tracks.map(t => t.id));
                        }}
                      >
                        <Shuffle size={17} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {renderTrackTable(openMood.tracks, { context: "mood", queueContext: openMood.tracks.map(t => t.id) })}
            </>
          )}

          {page === "playlists" && openPlaylist && (
            <>
              <button className="btn" style={{ marginBottom: 18 }} onClick={() => setOpenPlaylistId(null)}>← All playlists</button>

              <div className="playlist-hero">
                <div
                  className="playlist-hero-backdrop"
                  style={openPlaylist.coverImage ? { backgroundImage: `url(${openPlaylist.coverImage})` } : { background: coverGradient(openPlaylist.id) }}
                />
                <div className="playlist-hero-content">
                  <div
                    className="playlist-hero-cover"
                    style={openPlaylist.coverImage ? { backgroundImage: `url(${openPlaylist.coverImage})` } : { background: coverGradient(openPlaylist.id) }}
                  >
                    {!openPlaylist.coverImage && <ListMusic size={38} strokeWidth={1.3} />}
                    <button className="cover-upload-btn" onClick={() => coverInputRef.current.click()}>
                      <Camera size={20} />
                    </button>
                  </div>
                  <div className="playlist-hero-info">
                    <div className="playlist-hero-eyebrow">Playlist</div>
                    {renamingPlaylist ? (
                      <input
                        className="rename-input playlist-hero-title-input"
                        autoFocus value={playlistNameEdit}
                        onChange={e => setPlaylistNameEdit(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { renamePlaylist(openPlaylist.id, playlistNameEdit); setRenamingPlaylist(false); }
                          if (e.key === "Escape") setRenamingPlaylist(false);
                        }}
                        onBlur={() => { renamePlaylist(openPlaylist.id, playlistNameEdit); setRenamingPlaylist(false); }}
                      />
                    ) : (
                      <h2 className="playlist-hero-title">{openPlaylist.name}</h2>
                    )}
                    <div className="playlist-hero-meta">
                      {openPlaylist.trackIds.length} track{openPlaylist.trackIds.length !== 1 ? "s" : ""}
                      {openPlaylist.trackIds.length > 0 && (
                        <> · {fmtDuration(playlistTracks.reduce((sum, t) => sum + (t.duration || 0), 0))}</>
                      )}
                    </div>

                    <div className="playlist-hero-actions">
                      <button
                        className="playlist-hero-play"
                        disabled={openPlaylist.trackIds.length === 0}
                        title="Play"
                        onClick={() => { setShuffle(false); playTrackId(openPlaylist.trackIds[0], openPlaylist.trackIds); }}
                      >
                        <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
                      </button>
                      <button
                        className="playlist-hero-shuffle"
                        disabled={openPlaylist.trackIds.length === 0}
                        title="Shuffle play"
                        onClick={() => {
                          setShuffle(true);
                          const rand = openPlaylist.trackIds[Math.floor(Math.random() * openPlaylist.trackIds.length)];
                          playTrackId(rand, openPlaylist.trackIds);
                        }}
                      >
                        <Shuffle size={17} />
                      </button>
                      <div className="playlist-hero-secondary">
                        <button className="icon-btn" title="Add songs" onClick={() => setAddSongsOpen(true)}><Plus size={16} /></button>
                        <button className="icon-btn" title="Share list (titles & artists only)" onClick={async () => {
                          const list = playlistTracks.map(t => ({ artist: t.artist, title: t.title }));
                          const r = await shareText(openPlaylist.name, playlistShareText(openPlaylist.name, list));
                          if (r === "copied") pushToast("Song list copied");
                        }}><Share2 size={15} /></button>
                        <button className="icon-btn" title="Rename" onClick={() => { setRenamingPlaylist(true); setPlaylistNameEdit(openPlaylist.name); }}><Pencil size={15} /></button>
                        <button className="icon-btn" title="Delete" style={{ color: "#E8615D" }} onClick={() => deletePlaylist(openPlaylist.id)}><Trash2 size={15} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {renderTrackTable(playlistTracks, { context: "playlist", queueContext: openPlaylist.trackIds })}
            </>
          )}

          {page === "artists" && !openArtist && (
            artists.length === 0 ? (
              <div className="empty-state">
                <Users size={34} strokeWidth={1.3} />
                <h3>No artists yet</h3>
                <p>Add music to your library and artists will show up here automatically, grouped from each track's tag — or create one yourself and add songs to it.</p>
                <button className="btn btn-accent" style={{ marginTop: 4 }} onClick={() => setCreateArtistOpen(true)}><Plus size={14} /> New artist</button>
              </div>
            ) : (
              <>
                {topArtists.length > 0 && !query.trim() && (
                  <>
                    <div className="artists-section-header"><Trophy size={15} color="var(--accent)" /><h4>Most played artists</h4></div>
                    <div className="top-artists-list">
                      {topArtists.map((a, i) => (
                        <div key={a.name} className="top-artist-circle" onClick={() => openArtistFromList(a.name)}>
                          <div className="top-artist-circle-avatar-wrap">
                            <div
                              className="avatar"
                              style={a.photo ? { backgroundImage: `url(${a.photo})` } : { background: coverGradient(a.name) }}
                            >
                              {!a.photo && <User size={26} strokeWidth={1.4} />}
                            </div>
                            <div className="rank">{i + 1}</div>
                          </div>
                          <div className="name">{a.name}</div>
                          <div className="plays"><Flame size={10} color="var(--accent)" /> {a.plays} play{a.plays !== 1 ? "s" : ""}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="artists-section-header"><Users size={15} color="var(--accent)" /><h4>All artists</h4></div>
                {(() => {
                  // A–Z sections, three artists per row; the side index appears for long lists
                  const sorted = [...filteredArtists].sort((x, y) => fold(x.name).localeCompare(fold(y.name)));
                  const letterOf = (n) => { const c = fold(n).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : "#"; };
                  const groups = [];
                  for (const a of sorted) { const L = letterOf(a.name); const g = groups[groups.length - 1]; if (g && g.L === L) g.items.push(a); else groups.push({ L, items: [a] }); }
                  const showIndex = !query.trim() && sorted.length >= 24 && groups.length > 3;
                  const jump = (L) => { const el = document.getElementById(`ar-${L}`); if (el) el.scrollIntoView({ block: "start" }); };
                  return (
                    <div className={`ar-wrap${showIndex ? " has-index" : ""}`}>
                      {groups.map(g => (
                        <section key={g.L} id={`ar-${g.L}`} className="ar-sec">
                          <div className="ar-letter">{g.L}</div>
                          <div className="ar-grid">
                            {g.items.map(a => (
                              <button key={a.name} className="ar-item" onClick={() => openArtistFromList(a.name)}>
                                <span className="ar-ava" style={a.photo ? { backgroundImage: `url(${a.photo})` } : { background: coverGradient(a.name) }}>
                                  {!a.photo && <b>{(fold(a.name).charAt(0) || "?").toUpperCase()}</b>}
                                </span>
                                <span className="ar-name">{a.name}</span>
                                <span className="ar-sub">{a.trackCount} track{a.trackCount !== 1 ? "s" : ""}</span>
                              </button>
                            ))}
                          </div>
                        </section>
                      ))}
                      {showIndex && (
                        <div className="ar-index" onTouchMove={(e) => { const t = e.touches[0]; const el = document.elementFromPoint(t.clientX, t.clientY); const L = el && el.dataset && el.dataset.l; if (L) jump(L); }}>
                          {groups.map(g => <button key={g.L} data-l={g.L} onClick={() => jump(g.L)}>{g.L}</button>)}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )
          )}

          {page === "artists" && openArtist && (
            <>
              <button className="btn" style={{ marginBottom: 18 }} onClick={() => setOpenArtistName(null)}>← All artists</button>

              <div className="playlist-hero">
                <div
                  className="playlist-hero-backdrop"
                  style={openArtist.photo ? { backgroundImage: `url(${openArtist.photo})` } : { background: coverGradient(openArtist.name) }}
                />
                <div className="playlist-hero-content">
                  <div
                    className="playlist-hero-cover artist-hero-avatar"
                    style={openArtist.photo ? { backgroundImage: `url(${openArtist.photo})` } : { background: coverGradient(openArtist.name) }}
                  >
                    {!openArtist.photo && <User size={44} strokeWidth={1.2} />}
                    <button className="cover-upload-btn" onClick={() => artistPhotoInputRef.current.click()}>
                      <Camera size={20} />
                    </button>
                  </div>
                  <div className="playlist-hero-info">
                    <div className="playlist-hero-eyebrow">Artist</div>
                    {renamingArtist ? (
                      <input
                        className="rename-input playlist-hero-title-input"
                        autoFocus value={artistNameEdit}
                        onChange={e => setArtistNameEdit(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { renameArtist(openArtist.name, artistNameEdit); setRenamingArtist(false); }
                          if (e.key === "Escape") setRenamingArtist(false);
                        }}
                        onBlur={() => { renameArtist(openArtist.name, artistNameEdit); setRenamingArtist(false); }}
                      />
                    ) : (
                      <h2 className="playlist-hero-title">{openArtist.name}</h2>
                    )}
                    <div className="playlist-hero-meta">
                      {openArtist.trackCount} track{openArtist.trackCount !== 1 ? "s" : ""} · {openArtist.albumCount} album{openArtist.albumCount !== 1 ? "s" : ""}
                      {openArtist.plays > 0 && <> · {openArtist.plays} play{openArtist.plays !== 1 ? "s" : ""}</>}
                    </div>
                    <div className="playlist-hero-actions">
                      <button
                        className="playlist-hero-play"
                        disabled={openArtist.tracks.length === 0}
                        title="Play"
                        onClick={() => { setShuffle(false); playTrackId(openArtist.tracks[0].id, openArtist.tracks.map(t => t.id)); }}
                      >
                        <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
                      </button>
                      <button
                        className="playlist-hero-shuffle"
                        disabled={openArtist.tracks.length === 0}
                        title="Shuffle play"
                        onClick={() => {
                          setShuffle(true);
                          const rand = openArtist.tracks[Math.floor(Math.random() * openArtist.tracks.length)];
                          playTrackId(rand.id, openArtist.tracks.map(t => t.id));
                        }}
                      >
                        <Shuffle size={17} />
                      </button>
                      <div className="playlist-hero-secondary">
                        <button className="icon-btn" title="Add songs" onClick={() => setAddSongsToArtistOpen(true)}><Plus size={16} /></button>
                        <button className="icon-btn" title="Rename" onClick={() => { setRenamingArtist(true); setArtistNameEdit(openArtist.name); }}><Pencil size={15} /></button>
                        <button className="icon-btn" title="Delete artist" style={{ color: "#E8615D" }} onClick={() => setDeleteArtistConfirm(openArtist.name)}><Trash2 size={15} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <ArtistExtras
                artistName={openArtist.name} hasPhoto={!!openArtist.photo} tracks={openArtist.tracks}
                onUsePhoto={(d) => setArtistPhotos(prev => ({ ...prev, [openArtist.name]: d }))}
                onOpenArtist={(n) => setOpenArtistName(n)}
                existingArtists={new Set(artists.map(a => a.name))}
              />

              {openArtist.tracks.length === 0 && (
                <div className="empty-state">
                  <Users size={30} strokeWidth={1.3} />
                  <h3>No songs yet</h3>
                  <p>Use "Add songs" above, or select tracks anywhere in your library and use "Assign to artist".</p>
                </div>
              )}

              {openArtist.albums.map(album => (
                <div key={album.name} className="album-section">
                  <div className="album-section-header">
                    <div className="album-section-cover" style={{ background: coverGradient(openArtist.name + album.name) }}>
                      <Disc3 size={16} strokeWidth={1.4} />
                    </div>
                    <h4>{album.name}</h4>
                    <span className="count">{album.tracks.length} track{album.tracks.length !== 1 ? "s" : ""}</span>
                  </div>
                  {renderTrackTable(album.tracks, { context: "artist", queueContext: openArtist.tracks.map(t => t.id) })}
                </div>
              ))}
            </>
          )}

          {page === "queue" && (
            queue.length > 0 ? (
              <>
                <div className="m-head">
                  <button className="m-back" onClick={() => setPage("more")} aria-label="Back to More"><ChevronLeft size={22} /></button>
                  <div>
                    <h1>Queue</h1>
                    <p>{queue.length} song{queue.length !== 1 ? "s" : ""} · {fmtDuration(queue.reduce((sum, id) => sum + (libraryAll.find(t => t.id === id)?.duration || 0), 0))}</p>
                  </div>
                  <div className="m-head-actions">
                    <button className="m-pill m-pill-icon" onClick={shuffleUpNext} aria-label="Shuffle up next" title="Shuffle up next"><Shuffle size={18} /></button>
                    <button className="m-pill" onClick={() => setQueue([])}>Clear</button>
                  </div>
                </div>
                {currentTrack && (
                  <>
                    <div className="m-label">Now playing</div>
                    <div className="m-np-card" onClick={() => setNowPlayingOpen(true)}>
                      <TrackThumb track={currentTrack} isPlaying={isPlaying} size={64} />
                      <div className="m-np-card-txt">
                        <b>{currentTrack.title}</b>
                        <i>{currentTrack.artist}</i>
                        <div className="m-np-bar"><div style={{ width: `${duration ? Math.min(100, (position / duration) * 100) : 0}%` }} /></div>
                      </div>
                    </div>
                  </>
                )}
                <div className="m-label">Up next</div>
                <div className="m-list">
                  {(() => {
                    const curIdx = queueIndexOf(queue, currentTrackId, queuePosRef.current);
                    return queue.map((id, idx) => ({ id, idx })).filter(({ idx }) => curIdx < 0 || idx > curIdx).map(({ id, idx }) => {
                      const t = libraryAll.find(x => x.id === id);
                      if (!t) return null;
                      return (
                        <div key={idx} data-qidx={idx}
                          className={`m-row${dragFromIndex === idx ? " dragging" : ""}${dragOverIndex === idx && dragFromIndex !== null && dragFromIndex !== idx ? (dragFromIndex < idx ? " drop-after" : " drop-before") : ""}`}
                          onClick={() => { if (lpFiredRef.current) { lpFiredRef.current = false; return; } playTrackId(t.id, queue, idx); }}
                          {...lpProps(t, "queue")}>
                          <TrackThumb track={t} isPlaying={false} size={48} />
                          <div className="m-txt"><span className="t">{t.title}</span><span className="a"><span className="a-name">{t.artist}</span></span></div>
                          <button className="m-grip" aria-label="Drag to reorder" onClick={e => e.stopPropagation()}
                            onPointerDown={e => {
                              e.stopPropagation();
                              clearTimeout(lpTimerRef.current);
                              try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                              try { navigator.vibrate?.(10); } catch {}
                              setDragFromIndex(idx); setDragOverIndex(idx);
                            }}
                            onPointerMove={e => {
                              if (dragFromIndex === null) return;
                              const y = e.clientY, h = window.innerHeight;
                              const scroller = document.querySelector(".page-body");
                              if (scroller) { if (y < 120) scroller.scrollTop -= 14; else if (y > h - 190) scroller.scrollTop += 14; }
                              const el = document.elementFromPoint(e.clientX, y)?.closest?.("[data-qidx]");
                              if (el) { const n = Number(el.dataset.qidx); if (n !== dragOverIndex) setDragOverIndex(n); }
                            }}
                            onPointerUp={() => {
                              if (dragFromIndex !== null && dragOverIndex !== null && dragOverIndex !== dragFromIndex) moveQueueTo(dragFromIndex, dragOverIndex);
                              setDragFromIndex(null); setDragOverIndex(null);
                            }}
                            onPointerCancel={() => { setDragFromIndex(null); setDragOverIndex(null); }}>
                            <GripVertical size={18} />
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Radio size={34} strokeWidth={1.3} />
                <h3>Queue is empty</h3>
                <p>Play something from your Library, or use the + button on any track to add it here.</p>
                {currentTrack?.mood && (
                  <button className="btn btn-accent" style={{ marginTop: 4 }} onClick={startMoodRadio}>
                    <Radio size={14} /> Start {MOOD_PRESETS.find(m => m.key === currentTrack.mood)?.label || currentTrack.mood} radio
                  </button>
                )}
              </div>
            )
          )}

          {page === "recent" && (() => {
            const lastPlay = {};
            for (const h of playHistory) if (!lastPlay[h.id] || h.ts > lastPlay[h.id]) lastPlay[h.id] = h.ts;
            const dayLabel = (ts) => {
              if (!ts) return "";
              const d = new Date(ts), now = new Date();
              const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
              const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
              if (diff <= 0) return "Today";
              if (diff === 1) return "Yesterday";
              if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
              return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
            };
            const list = recentTab === "most" ? mostPlayed : recentTracks;
            return (
              <>
                <div className="m-head"><div><h1>Recent</h1></div></div>
                <div className="m-seg">
                  <button className={recentTab === "recent" ? "on" : ""} onClick={() => setRecentTab("recent")}>Recently played</button>
                  <button className={recentTab === "most" ? "on" : ""} onClick={() => setRecentTab("most")}>Most played</button>
                </div>
                {list.length === 0 ? (
                  <p className="m-empty">Nothing played yet.</p>
                ) : (
                  <div className="m-list">
                    {list.map(t => (
                      <div key={t.id} className={`m-row${t.id === currentTrackId ? " playing" : ""}`}
                        onClick={() => { if (lpFiredRef.current) { lpFiredRef.current = false; return; } playTrackId(t.id, list.map(x => x.id)); }}
                        {...lpProps(t, "recent")}>
                        <TrackThumb track={t} isPlaying={t.id === currentTrackId && isPlaying} size={48} />
                        <div className="m-txt"><span className="t">{t.title}</span><span className="a"><span className="a-name">{t.artist}</span></span></div>
                        <span className="m-when">{recentTab === "most" ? `${playCounts[t.id] || 0} play${(playCounts[t.id] || 0) !== 1 ? "s" : ""}` : dayLabel(lastPlay[t.id])}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}

          {page === "lyrics" && (
            tracksWithLyrics.length === 0 ? (
              <div className="empty-state">
                <Mic2 size={34} strokeWidth={1.3} />
                <h3>No lyrics yet</h3>
                <p>Open any song's Now Playing view and import, paste, or embed lyrics — they'll show up here.</p>
              </div>
            ) : (
              <>
                <div className="library-hero">
                  <div className="library-hero-icon"><Mic2 size={40} strokeWidth={1.3} /></div>
                  <div className="playlist-hero-info">
                    <div className="playlist-hero-eyebrow">Sing along</div>
                    <h2 className="playlist-hero-title">Lyrics</h2>
                    <div className="playlist-hero-meta">
                      {tracksWithLyrics.length} track{tracksWithLyrics.length !== 1 ? "s" : ""} with lyrics
                    </div>
                    <div className="playlist-hero-actions">
                      <button
                        className="playlist-hero-play"
                        title="Play all"
                        onClick={() => { setShuffle(false); playTrackId(tracksWithLyrics[0].id, tracksWithLyrics.map(t => t.id)); }}
                      >
                        <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
                      </button>
                      <button
                        className="playlist-hero-shuffle"
                        title="Shuffle play"
                        onClick={() => {
                          setShuffle(true);
                          const rand = tracksWithLyrics[Math.floor(Math.random() * tracksWithLyrics.length)];
                          playTrackId(rand.id, tracksWithLyrics.map(t => t.id));
                        }}
                      >
                        <Shuffle size={17} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="lyrics-page-list">
                  {tracksWithLyrics.map(t => {
                    const lyr = lyricsMap[t.id];
                    const synced = lyr?.format === "lrc" && lyr.lines.every(l => typeof l.time_sec === "number");
                    return (
                      <div key={t.id} className="lyrics-page-row" onClick={() => {
                        if (currentTrackId !== t.id) playTrackId(t.id, tracksWithLyrics.map(x => x.id));
                        setNpView("lyrics");
                        setNowPlayingOpen(true);
                      }}>
                        <TrackThumb track={t} isPlaying={t.id === currentTrackId && isPlaying} size={36} />
                        <div className="track-title-text" style={{ flex: 1, minWidth: 0 }}>
                          <span className="t" style={{ color: t.id === currentTrackId ? "var(--accent)" : undefined }}>{t.title}</span>
                          <span className="a clickable" onClick={e => { e.stopPropagation(); goToArtist(t.artist); }}>{t.artist}</span>
                        </div>
                        <span className={`lyrics-badge ${synced ? "synced" : "unsynced"}`}>{synced ? "Synced" : "Unsynced"}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )
          )}

          {page === "stats" && (
            !(statsData.totalPlays === 0 && library.length === 0) ? (
              <>
                <div className="m-head"><button className="m-back" onClick={() => setPage("more")} aria-label="Back to More"><ChevronLeft size={22} /></button><div><h1>Stats</h1></div></div>
                <div className="m-seg">
                  {[["7d", "7 days"], ["30d", "30 days"], ["all", "All time"]].map(([k, l]) => (
                    <button key={k} className={statsRange === k ? "on" : ""} onClick={() => { setStatsRange(k); if (k === "7d") setCompareRange("week"); else if (k === "30d") setCompareRange("month"); }}>{l}</button>
                  ))}
                </div>
                <div className="m-card m-card-big">
                  <span className="m-card-label">Listening time</span>
                  <b className="m-card-value">{fmtDuration(statsData.totalSeconds)}</b>
                  {statsRange !== "all" && compareData.hasAnyData && compareData.timeDeltaPct != null && compareData.timeDeltaPct !== 0 && (
                    <span className={`m-delta ${compareData.timeDeltaPct > 0 ? "up" : "down"}`}>
                      {compareData.timeDeltaPct > 0 ? "Up" : "Down"} {Math.abs(compareData.timeDeltaPct)}% on the previous {statsRange === "7d" ? "7" : "30"} days
                    </span>
                  )}
                </div>
                <div className="m-card-trio">
                  <div className="m-card"><span className="m-card-label">Plays</span><b className="m-card-value sm">{statsData.totalPlays}</b></div>
                  <div className="m-card"><span className="m-card-label">Songs</span><b className="m-card-value sm">{statsData.distinctTracks}</b></div>
                  <div className="m-card"><span className="m-card-label">Artists</span><b className="m-card-value sm">{statsData.distinctArtists}</b></div>
                </div>
                <div className="m-card m-card-chart">
                  <span className="m-card-title">Daily activity</span>
                  <div className="m-bars">
                    {statsData.dailyActivity.map(d => {
                      const max = Math.max(1, ...statsData.dailyActivity.map(x => x.count));
                      return <div key={d.key} className="m-bar-wrap" title={`${d.key}: ${d.count}`}><div className="m-bar" style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }} /></div>;
                    })}
                  </div>
                </div>
                <button className="m-wide-btn" onClick={openTrackOfTheWeek}><Trophy size={17} /> Track of the week <ChevronRight size={17} /></button>
                {statsData.topTracks.length > 0 && (
                  <>
                    <div className="m-label">Top songs</div>
                    <div className="m-list">
                      {statsData.topTracks.map(({ track, count }) => (
                        <div key={track.id} className="m-row" onClick={() => playTrackId(track.id, statsData.topTracks.map(x => x.track.id))}>
                          <TrackThumb track={track} isPlaying={track.id === currentTrackId && isPlaying} size={48} />
                          <div className="m-txt"><span className="t">{track.title}</span><span className="a"><span className="a-name">{track.artist}</span></span></div>
                          <span className="m-plays">{count} play{count !== 1 ? "s" : ""}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="m-label">Milestones</div>
                <div className="stats-section">
                  <div className="artists-section-header"><Award size={15} color="var(--accent)" /><h4>Milestones</h4></div>
                  <div className="milestones-grid">
                    {MILESTONE_META.map(({ hours: h, name, icon: MIcon, color, rewardName }) => {
                      const achieved = unlockedMilestones.includes(h) || totalListeningHours >= h;
                      return (
                        <div
                          key={h}
                          className={`milestone-badge${achieved ? " achieved" : ""}`}
                          style={achieved ? { background: `${color}14`, boxShadow: `0 6px 18px ${color}22` } : undefined}
                          title={achieved ? `${name} — ${h} hours listened · unlocked the ${rewardName} accent` : `${fmtDuration(Math.max(0, (h - totalListeningHours) * 3600))} to go · unlocks the ${rewardName} accent`}
                        >
                          <div className="milestone-icon-ring" style={achieved ? { background: `${color}22`, borderColor: `${color}55`, color } : undefined}>
                            {achieved ? <MIcon size={18} /> : <Lock size={15} />}
                          </div>
                          <span className="h">{h}h</span>
                          {achieved && <span className="n">{name}</span>}
                          <span className="milestone-reward" style={{ opacity: achieved ? 1 : 0.55 }}>
                            <i style={{ background: color }} />{rewardName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="stats-section">
                      <div className="artists-section-header"><Users size={15} color="var(--accent)" /><h4>Top artists</h4></div>
                      <div className="top-artists-list">
                        {statsData.topArtists.map((a, i) => (
                          <div key={a.name} className="top-artist-circle" onClick={() => goToArtist(a.name)}>
                            <div className="top-artist-circle-avatar-wrap">
                              <div className="avatar" style={a.photo ? { backgroundImage: `url(${a.photo})` } : { background: coverGradient(a.name) }}>
                                {!a.photo && <User size={26} strokeWidth={1.4} />}
                              </div>
                              <div className="rank">{i + 1}</div>
                            </div>
                            <div className="name">{a.name}</div>
                            <div className="plays"><Flame size={10} color="var(--accent)" /> {a.count} play{a.count !== 1 ? "s" : ""}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                <div className="m-label">Taste check</div>
                <div className="stats-section">
                    <div className="artists-section-header"><Sparkles size={15} color="var(--accent)" /><h4>Taste check</h4></div>
                    <div className="compare-tabs">
                      {Object.keys(COMPARE_RANGES).map(key => (
                        <button key={key} className={`stats-tab${compareRange === key ? " active" : ""}`} onClick={() => setCompareRange(key)}>
                          {key === "week" ? "This week" : key === "month" ? "This month" : "Last 90 days"}
                        </button>
                      ))}
                    </div>
                    {!compareData.hasAnyData ? (
                      <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
                        Not enough listening yet in this window to compare.
                      </p>
                    ) : (
                      <div className="compare-card">
                        <div className="compare-line">
                          {compareData.timeDeltaPct == null ? (
                            <><Sparkles size={14} className="compare-icon up" /><span>First time listening in this window — {fmtDuration(compareData.curr.totalSeconds)} so far.</span></>
                          ) : compareData.timeDeltaPct === 0 ? (
                            <><Minus size={14} className="compare-icon flat" /><span>Listening time held steady vs last {compareData.label}.</span></>
                          ) : (
                            <>
                              {compareData.timeDeltaPct > 0 ? <TrendingUp size={14} className="compare-icon up" /> : <TrendingDown size={14} className="compare-icon down" />}
                              <span>{compareData.timeDeltaPct > 0 ? "+" : ""}{compareData.timeDeltaPct}% listening time vs last {compareData.label} ({fmtDuration(compareData.curr.totalSeconds)} now, {fmtDuration(compareData.prev.totalSeconds)} before).</span>
                            </>
                          )}
                        </div>

                        {compareData.hasEnergyData && compareData.energyDeltaPts !== null && (
                          <div className="compare-line">
                            {Math.abs(compareData.energyDeltaPts) < 3 ? (
                              <><Minus size={14} className="compare-icon flat" /><span>Mood mix stayed about the same.</span></>
                            ) : (
                              <>
                                {compareData.energyDeltaPts > 0 ? <Zap size={14} className="compare-icon up" /> : <Wind size={14} className="compare-icon down" />}
                                <span>Leaning {Math.abs(compareData.energyDeltaPts)} points {compareData.energyDeltaPts > 0 ? "more energetic" : "calmer"} than last {compareData.label}.</span>
                              </>
                            )}
                          </div>
                        )}

                        {compareData.newArtistCount > 0 && (
                          <div className="compare-line">
                            <Users size={14} className="compare-icon up" />
                            <span>{compareData.newArtistCount} new artist{compareData.newArtistCount !== 1 ? "s" : ""} entered the mix.</span>
                          </div>
                        )}

                        {compareData.topArtistChanged && (
                          <div className="compare-line">
                            <Trophy size={14} className="compare-icon up" />
                            <span>New #1: {compareData.curr.topArtist}{compareData.prev.topArtist ? ` (was ${compareData.prev.topArtist})` : ""}.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
              </>
            ) : (
              <div className="empty-state">
                <BarChart3 size={34} strokeWidth={1.3} />
                <h3>Nothing to show yet</h3>
                <p>Play some music and your stats will start building up here.</p>
              </div>
            )
          )}
        </div>

        {/* PLAYER BAR */}
        {playbackError && (
          <div className="playback-error-bar">
            <span>{playbackError}</span>
            <button className="icon-btn" onClick={() => setPlaybackError(null)}><X size={13} /></button>
          </div>
        )}
        <div className="player-bar" ref={playerBarRef} style={{ "--pbp": `${duration ? Math.min(100, (position / duration) * 100) : 0}%` }}>
          <div className="pb-track" onClick={() => currentTrack && setNowPlayingOpen(true)}>
            {currentTrack ? <TrackThumb track={currentTrack} isPlaying={isPlaying} size={46} /> : (
              <div className="pb-art" style={{ background: "var(--surface-2)" }}><Music2 size={18} strokeWidth={1.5} color="var(--text-faint)" /></div>
            )}
            <div className="pb-meta">
              <div className="t">{currentTrack ? currentTrack.title : "Nothing playing"}</div>
              <div className="a">{currentTrack ? currentTrack.artist : "Add music to get started"}</div>
            </div>
          </div>

          <button className="pb-queue-btn" aria-label="Queue" onClick={() => { setPage("queue"); setOpenPlaylistId(null); setNowPlayingOpen(false); }}><ListEnd size={20} /></button>
          <div className="pb-center">
            <div className="pb-controls">
              <button className={`pb-ctrl${shuffle ? " on" : ""}`} onClick={() => setShuffle(s => !s)} title="Shuffle"><Shuffle size={15} /></button>
              <button className="pb-ctrl" onClick={() => goPrev()} title="Previous"><SkipBack size={16} fill="currentColor" /></button>
              <button className="pb-play" onClick={togglePlay}>
                {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" style={{ marginLeft: 1 }} />}
              </button>
              <button className="pb-ctrl" onClick={() => advance(1)} title="Next"><SkipForward size={16} fill="currentColor" /></button>
              {renderRepeatButton(15)}
            </div>
            <div className="pb-seek-row">
              <span className="pb-time mono">{fmtTime(position)}</span>
              <SeekBar style={seekBarStyle} peaks={activePeaks} progress={duration ? position / duration : 0} onSeek={seekTo} accent={accent} />
              <span className="pb-time mono">{fmtTime(duration)}</span>
            </div>
          </div>

          <div className="pb-right">
            <div className="popover-wrap">
              <button
                className={`icon-btn${sleepTimerEndAt || sleepAtTrackEnd ? " active" : ""}`}
                onClick={() => setSleepTimerMenuOpen(o => !o)}
                title="Sleep timer"
              >
                <Timer size={16} />
                {sleepTimerEndAt && <span className="sleep-timer-badge">{Math.ceil(sleepTimerRemainingSec / 60)}m</span>}
                {sleepAtTrackEnd && <span className="sleep-timer-badge">•</span>}
              </button>
              {sleepTimerMenuOpen && (
                <div className="popover" style={{ bottom: "calc(100% + 6px)", top: "auto" }}>
                  {(sleepTimerEndAt || sleepAtTrackEnd) && (
                    <>
                      <button className="popover-item" onClick={cancelSleepTimer}>
                        <Timer size={13} /> Turn off {sleepTimerEndAt ? `(${Math.ceil(sleepTimerRemainingSec / 60)}m left)` : "(end of track)"}
                      </button>
                      <div className="popover-divider" />
                    </>
                  )}
                  {[15, 30, 45, 60].map(min => (
                    <button key={min} className="popover-item" onClick={() => startSleepTimer(min)}>
                      <Timer size={13} /> {min} minutes
                    </button>
                  ))}
                  <button className="popover-item" onClick={startSleepAtTrackEnd}>
                    <Timer size={13} /> End of current track
                  </button>
                </div>
              )}
            </div>
            <div className={`volume-row${volumeHudShow ? " pulsing" : ""}`}>
              {volume === 0 ? <VolumeX size={15} color="var(--text-dim)" /> : volume < 0.5 ? <Volume1 size={15} color="var(--text-dim)" /> : <Volume2 size={15} color="var(--text-dim)" />}
              <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(parseFloat(e.target.value))} />
            </div>
          </div>
        </div>
      </div>

      {/* NOW PLAYING OVERLAY */}
      {nowPlayingOpen && currentTrack && (
        <div className={`now-playing np-m np-v-${npView === "lyrics" ? "lyrics" : "player"}`}>
          <div
            className="np-glow"
            key={`glow-${currentTrack.id}`}
            style={{
              background: `radial-gradient(circle at 25% 18%, ${npGlowColors(currentTrack)[0]}, transparent 55%), radial-gradient(circle at 78% 82%, ${npGlowColors(currentTrack)[1]}, transparent 55%)`,
            }}
          />
          {(
            <div className="np-top np-top-m">
              <button className="btn btn-icon" onClick={() => setNowPlayingOpen(false)}><ChevronDown size={20} /></button>
              <div className="np-style-tabs">
                <button className={`np-tab${npView !== "lyrics" ? " active" : ""}`} onClick={() => setNpView("cover")}>Player</button>
                <button className={`np-tab${npView === "lyrics" ? " active" : ""}`} onClick={() => setNpView("lyrics")}>Lyrics</button>
              </div>
              <button className="btn btn-icon" onClick={() => setNpMenuOpen(true)} aria-label="More"><MoreHorizontal size={20} /></button>
            </div>
          )}
          {npView === "lyrics" && (
            <div className="np-lyr-head"><b>{currentTrack.title}</b><i>{currentTrack.artist}</i></div>
          )}

          <div className={`np-body${design !== "classic" ? " np-body-split" : ""}`}>
            {npView !== "lyrics" && (
              <button className="np-view-toggle" onClick={() => setNpView(v => v === "vinyl" ? "cover" : "vinyl")} aria-label="Switch cover / vinyl">
                {npView === "vinyl" ? <ImageIcon size={18} /> : <Disc3 size={18} />}
                <span>{npView === "vinyl" ? "Cover" : "Vinyl"}</span>
              </button>
            )}
            {repeatMode === "one" && repeatLoops > 0 && <div key={`burst${repeatLoops}`} className="loop-burst" />}
            {design === "classic" ? renderNowPlayingStage() : (
              <>
                {design === "turntable" && renderUpNextPanel()}
                <div className="np-stage">{renderNowPlayingStage()}</div>
                {design === "turntable" && npView !== "lyrics" && renderLyricsPanel()}
                {design === "bloom" && (
                  <div className="np-side-col">
                    {renderUpNextPanel()}
                    {npView !== "lyrics" && renderLyricsPanel()}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="np-footer">
            {npView === "lyrics" && currentLyrics?.lines?.length > 0 && (
              <button className="np-share-pill" onClick={openShareLyrics}><Share2 size={18} /> Share lyrics</button>
            )}
            <div className={`np-meta${String(currentTrack.title || "").length > 26 ? " np-meta-long" : ""}`}>
              <div className="t">
                {currentTrack.title}
                {currentTrack.mood && MOOD_PRESETS.find(m => m.key === currentTrack.mood) && (() => {
                  const m = MOOD_PRESETS.find(x => x.key === currentTrack.mood);
                  return (
                    <span className="mood-badge" style={{ color: m.color, background: `${m.color}22`, marginLeft: 10, verticalAlign: 2 }}>
                      <m.icon size={10} /> {m.label}
                    </span>
                  );
                })()}
              </div>
              <div className="a">{currentTrack.artist} — {currentTrack.album}</div>
              {repeatMode === "one" && repeatLoops > 0 && (
                <button key={`pill${repeatLoops}`} className="loop-pill" onClick={() => setRepeatMode("off")} title="Click to stop repeating">
                  <Repeat1 size={12} /> Played {repeatLoops + 1}× in a row
                </button>
              )}
            </div>
            <div className="np-reaction-row">
              {MOOD_PRESETS.map(m => (
                <button
                  key={m.key}
                  className={`np-reaction-btn${currentTrack.mood === m.key ? " active" : ""}`}
                  style={currentTrack.mood === m.key ? { borderColor: m.color, color: m.color, background: `${m.color}22` } : undefined}
                  onClick={() => reactMood(m.key)}
                  title={`React: ${m.label}`}
                >
                  <m.icon size={15} />
                  {reactionPops.filter(p => p.mood === m.key).map(p => (
                    <m.icon key={p.popId} size={15} className="np-reaction-pop" style={{ color: m.color }} />
                  ))}
                </button>
              ))}
            </div>
            <div className="pb-seek-row np-seek">
              <span className="pb-time mono">{fmtTime(position)}</span>
              <SeekBar style={seekBarStyle} peaks={activePeaks} progress={duration ? position / duration : 0} onSeek={seekTo} accent={accent} />
              <span className="pb-time mono">{fmtTime(duration)}</span>
            </div>
            <div className="np-controls-row">
              <div className="np-controls-spacer" />
              <div className="pb-controls">
                <button className={`pb-ctrl${shuffle ? " on" : ""}`} onClick={() => setShuffle(s => !s)}><Shuffle size={17} /></button>
                <button className="pb-ctrl" onClick={() => goPrev()}><SkipBack size={19} fill="currentColor" /></button>
                <button className="pb-play" style={{ width: 42, height: 42 }} onClick={togglePlay}>
                  {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" style={{ marginLeft: 2 }} />}
                </button>
                <button className="pb-ctrl" onClick={() => advance(1)}><SkipForward size={19} fill="currentColor" /></button>
                {renderRepeatButton(17)}
              </div>
              <div className={`np-volume${volumeHudShow ? " pulsing" : ""}`}>
                {volume === 0 ? <VolumeX size={15} color="var(--text-dim)" /> : volume < 0.5 ? <Volume1 size={15} color="var(--text-dim)" /> : <Volume2 size={15} color="var(--text-dim)" />}
                <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(parseFloat(e.target.value))} />
              </div>
            </div>
          </div>

          {tapSyncActive && (
            <div className="tap-sync-overlay">
              <div className="tap-sync-header">
                <h3>Tap to sync</h3>
                <p>Tap (or press Space) the instant each line starts. Don't tap during the intro — the first line just gets whatever timestamp that turns out to be.</p>
              </div>
              <div className="tap-sync-lines">
                {currentLyrics?.lines.map((l, i) => (
                  <div key={i} className={`tap-sync-line${i === tapSyncTimes.length ? " current" : ""}${i < tapSyncTimes.length ? " done" : ""}`}>
                    {i < tapSyncTimes.length && <Check size={13} className="tap-sync-check" />}
                    {l.text}
                  </div>
                ))}
              </div>
              <div className="tap-sync-controls">
                <span className="mono">{fmtTime(position)}</span>
                <button className="tap-sync-button" onClick={tapNextLine}><Hand size={20} /></button>
                <button className="btn" onClick={cancelTapSync}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SETTINGS PANEL */}
      {settingsOpen && (
        <div className="settings-panel">
          <div className="settings-header">
            <button className="btn btn-icon settings-back" onClick={() => setSettingsOpen(false)} aria-label="Back"><ChevronLeft size={20} /></button>
            <h3>Settings</h3>
            <button className="btn btn-icon settings-close" onClick={() => setSettingsOpen(false)}><X size={16} /></button>
          </div>
          <div className="settings-body">
            <div className="settings-section">
              <div className="settings-label">Design</div>
              <div className="design-picker">
                {DESIGNS.map(d => (
                  <button key={d.key} className={`design-card${design === d.key ? " selected" : ""}`} onClick={() => setDesign(d.key)}>
                    <div className={`design-thumb dt-${d.key}`} />
                    <div><div className="design-name">{d.name}</div><div className="design-sub">{d.sub}</div></div>
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-section">
              <div className="settings-label">Colors</div>
              <div className="settings-card settings-accent">
              <span className="settings-row-label">Accent</span>
              <div className="accent-row">
                {FREE_ACCENT_KEYS.map((key) => (
                  <button
                    key={key}
                    className={`accent-swatch${accentKey === key ? " selected" : ""}`}
                    style={{ background: ACCENTS[key].hex }}
                    title={ACCENTS[key].name}
                    onClick={() => setAccentKey(key)}
                  >
                    {accentKey === key && <Check size={14} color="#0D0D10" strokeWidth={3} />}
                  </button>
                ))}
              </div>
              <div className="settings-sublabel">
                Milestone colors <span>{REWARD_ACCENT_KEYS.filter(isAccentUnlocked).length}/{REWARD_ACCENT_KEYS.length} unlocked</span>
              </div>
              <div className="accent-row">
                {REWARD_ACCENT_KEYS.map((key) => {
                  const val = ACCENTS[key];
                  const unlocked = isAccentUnlocked(key);
                  const tier = MILESTONE_META.find(m => m.reward === key);
                  return (
                    <button
                      key={key}
                      className={`accent-swatch${accentKey === key ? " selected" : ""}${unlocked ? "" : " locked"}`}
                      style={unlocked ? { background: val.hex } : { background: hexToRgba(val.hex, 0.16), borderColor: hexToRgba(val.hex, 0.35) }}
                      title={unlocked ? val.name : `${val.name} — unlocks at ${val.unlockHours}h of listening${tier ? ` (${tier.name})` : ""}`}
                      disabled={!unlocked}
                      onClick={() => unlocked && setAccentKey(key)}
                    >
                      {!unlocked && <Lock size={12} color={val.hex} />}
                      {unlocked && accentKey === key && <Check size={14} color="#0D0D10" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
              </div>
            </div>
            <div className="settings-section">
              <div className="settings-label">Appearance</div>
              <div className="settings-card">
                <div className="settings-row">
                  <span className="settings-row-label">Theme</span>
                  <div className="density-toggle">
                    <button className={`density-opt${theme === "dark" ? " selected" : ""}`} onClick={() => setTheme("dark")}>Dark</button>
                    <button className={`density-opt${theme === "light" ? " selected" : ""}`} onClick={() => setTheme("light")}>Light</button>
                  </div>
                </div>
                <div className="settings-row">
                  <span className="settings-row-label">Density</span>
                  <div className="density-toggle">
                    <button className={`density-opt${density === "comfortable" ? " selected" : ""}`} onClick={() => setDensity("comfortable")}>Roomy</button>
                    <button className={`density-opt${density === "compact" ? " selected" : ""}`} onClick={() => setDensity("compact")}>Compact</button>
                  </div>
                </div>
                <div className="settings-row">
                  <span className="settings-row-label">Seek bar</span>
                  <div className="density-toggle">
                    <button className={`density-opt${seekBarStyle === "waveform" ? " selected" : ""}`} onClick={() => setSeekBarStyle("waveform")}>Wave</button>
                    <button className={`density-opt${seekBarStyle === "line" ? " selected" : ""}`} onClick={() => setSeekBarStyle("line")}>Line</button>
                  </div>
                </div>
              </div>
            </div>
            {(
              <div className="settings-section">
                <div className="settings-label">Library</div>
                <div className="settings-card">
                  <button className="settings-link" onClick={() => { setSettingsOpen(false); handleAddMusic(); }}>Scan for new songs <ChevronRight size={18} /></button>
                  <button className="settings-link" onClick={async () => {
                    await window.reel.requestNotificationPermission?.();
                    const st = await window.reel.notificationStatus?.();
                    if (st && st.enabled) pushToast("Notifications are on — the lock-screen player will show while music plays");
                    else setNotifHelpOpen(true);
                  }}>Lock-screen player &amp; notifications <ChevronRight size={18} /></button>
                  <button className="settings-link" onClick={cleanUpTitles}>Clean up titles <ChevronRight size={18} /></button>
                  <div className="settings-row">
                    <span className="settings-row-label">Skip clips under</span>
                    <div className="density-toggle">
                      {[[0, "Off"], [15, "15s"], [30, "30s"], [60, "1m"]].map(([v, l]) => (
                        <button key={v} className={`density-opt${minSeconds === v ? " selected" : ""}`} onClick={() => setMinSeconds(v)}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-row">
                    <span className="settings-row-label">Featured artists</span>
                    <div className="density-toggle">
                      <button className={`density-opt${featIn === "title" ? " selected" : ""}`} onClick={() => setFeatInState("title")}>In title</button>
                      <button className={`density-opt${featIn === "artist" ? " selected" : ""}`} onClick={() => setFeatInState("artist")}>In artist</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <OnlineSettings pushToast={pushToast} />
            <div className="settings-section">
              <div className="settings-label">Tools</div>
              <div className="settings-card">
                <button className="settings-link" onClick={() => { setSettingsOpen(false); setPage("health"); setOpenPlaylistId(null); }}>Library health — duplicates &amp; missing info <ChevronRight size={18} /></button>
                <button className="settings-link" onClick={() => { setSettingsOpen(false); setPage("discover"); setOpenPlaylistId(null); }}>Explore <ChevronRight size={18} /></button>
                {online.enabled && online.features.tagsCovers && <button className="settings-link" onClick={() => { setSettingsOpen(false); setFixIds(true); }}>Fix tags &amp; covers online <ChevronRight size={18} /></button>}
                {online.enabled && online.features.artistBios && <button className="settings-link" onClick={() => { setSettingsOpen(false); setPhotosOpen(true); }}>Find artist photos <ChevronRight size={18} /></button>}
                {library.some(t => t.remote) && <button className="settings-link" onClick={() => { const ids = library.filter(t => t.remote).map(t => t.id); removeIdsFromLibrary(ids); pushToast(`Removed ${ids.length} streamed songs`); }}>Remove streamed songs from library <ChevronRight size={18} /></button>}
              </div>
            </div>
            <PlaybackSettings />
            <div className="settings-section">
              <div className="settings-label">About</div>
              <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, margin: 0 }}>
                Reel for Android — a local-first music player. Your songs stay on your phone.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ADD SONGS MODAL */}
      {addSongsOpen && openPlaylist && (
        <div className="modal-scrim" onClick={() => setAddSongsOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add songs to "{openPlaylist.name}"</h3>
              <button className="btn btn-icon" onClick={() => setAddSongsOpen(false)}><X size={16} /></button>
            </div>
            <div className="modal-sub"><b>{addSongsSelected.size}</b> selected</div>
            <div className="modal-search">
              <Search size={14} />
              <input value={addSongsQuery} onChange={e => setAddSongsQuery(e.target.value)} placeholder="Search songs to add" />
              {addSongsQuery && <button className="icon-btn" onClick={() => setAddSongsQuery("")}><X size={13} /></button>}
            </div>
            <div className="modal-list">
              {libraryNotInPlaylist.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "var(--text-faint)", padding: "10px 6px" }}>
                  addSongsQuery ? "No songs match your search." : "Every track in your library is already in this playlist."
                </p>
              ) : libraryNotInPlaylist.map(t => {
                const checked = addSongsSelected.has(t.id);
                return (
                  <div key={t.id} className="modal-row" onClick={() => setAddSongsSelected(prev => {
                    const n = new Set(prev); checked ? n.delete(t.id) : n.add(t.id); return n;
                  })}>
                    <SelCircle on={checked} />
                    <TrackThumb track={t} isPlaying={false} size={48} />
                    <div className="track-title-text">
                      <span className="t">{t.title}</span>
                      <span className="a">{t.artist}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => { setAddSongsOpen(false); setAddSongsSelected(new Set()); }}>Cancel</button>
              <button
                className="btn btn-accent"
                disabled={addSongsSelected.size === 0}
                onClick={() => {
                  addTrackIdsToPlaylist(openPlaylist.id, Array.from(addSongsSelected));
                  setAddSongsSelected(new Set());
                  setAddSongsOpen(false);
                }}
              >
                Add {addSongsSelected.size > 0 ? addSongsSelected.size : ""} song{addSongsSelected.size === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD SONGS TO ARTIST MODAL */}
      {addSongsToArtistOpen && openArtist && (
        <div className="modal-scrim" onClick={() => setAddSongsToArtistOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add songs to "{openArtist.name}"</h3>
              <button className="btn btn-icon" onClick={() => setAddSongsToArtistOpen(false)}><X size={16} /></button>
            </div>
            <div className="modal-sub"><b>{addSongsSelected.size}</b> selected</div>
            <div className="modal-search">
              <Search size={14} />
              <input value={addSongsQuery} onChange={e => setAddSongsQuery(e.target.value)} placeholder="Search songs to add" />
              {addSongsQuery && <button className="icon-btn" onClick={() => setAddSongsQuery("")}><X size={13} /></button>}
            </div>
            <div className="modal-list">
              {libraryNotInArtist.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "var(--text-faint)", padding: "10px 6px" }}>
                  addSongsQuery ? "No songs match your search." : "Every other track is already credited to this artist."
                </p>
              ) : libraryNotInArtist.map(t => {
                const checked = addSongsSelected.has(t.id);
                return (
                  <div key={t.id} className="modal-row" onClick={() => setAddSongsSelected(prev => {
                    const n = new Set(prev); checked ? n.delete(t.id) : n.add(t.id); return n;
                  })}>
                    <SelCircle on={checked} />
                    <TrackThumb track={t} isPlaying={false} size={48} />
                    <div className="track-title-text">
                      <span className="t">{t.title}</span>
                      <span className="a">{t.artist}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => { setAddSongsToArtistOpen(false); setAddSongsSelected(new Set()); }}>Cancel</button>
              <button
                className="btn btn-accent"
                disabled={addSongsSelected.size === 0}
                onClick={() => {
                  assignTracksToArtist(openArtist.name, Array.from(addSongsSelected));
                  setAddSongsSelected(new Set());
                  setAddSongsToArtistOpen(false);
                }}
              >
                Add {addSongsSelected.size > 0 ? addSongsSelected.size : ""} song{addSongsSelected.size === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE ARTIST MODAL */}
      {createArtistOpen && (
        <div className="modal-scrim" onClick={() => { setCreateArtistOpen(false); setNewArtistName(""); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxHeight: "none" }}>
            <div className="modal-header">
              <h3>New artist</h3>
              <button className="btn btn-icon" onClick={() => { setCreateArtistOpen(false); setNewArtistName(""); }}><X size={16} /></button>
            </div>
            <div style={{ padding: "16px 18px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="settings-label" style={{ marginBottom: 0 }}>Name</span>
                <input
                  className="rename-input" style={{ padding: "8px 10px", fontSize: 13 }}
                  autoFocus placeholder="e.g. Tems"
                  value={newArtistName}
                  onChange={e => setNewArtistName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newArtistName.trim()) createArtist(newArtistName);
                    if (e.key === "Escape") { setCreateArtistOpen(false); setNewArtistName(""); }
                  }}
                />
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => { setCreateArtistOpen(false); setNewArtistName(""); }}>Cancel</button>
              <button className="btn btn-accent" disabled={!newArtistName.trim()} onClick={() => createArtist(newArtistName)}>
                <Plus size={14} /> Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE ARTIST CONFIRM */}
      {deleteArtistConfirm && (
        <div className="modal-scrim" onClick={() => setDeleteArtistConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxHeight: "none" }}>
            <div className="modal-header">
              <h3>Delete "{deleteArtistConfirm}"?</h3>
              <button className="btn btn-icon" onClick={() => setDeleteArtistConfirm(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: "16px 18px", fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>
              This won't delete any songs — the {(artists.find(a => a.name === deleteArtistConfirm)?.trackCount) || 0} track
              {(artists.find(a => a.name === deleteArtistConfirm)?.trackCount) === 1 ? "" : "s"} credited to
              {" "}{deleteArtistConfirm} will just go back to "Unknown Artist".
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDeleteArtistConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteArtist(deleteArtistConfirm)}><Trash2 size={13} /> Delete artist</button>
            </div>
          </div>
        </div>
      )}

      {/* PASTE LYRICS MODAL */}
      {pasteLyricsOpen && currentTrack && (
        <div className="modal-scrim" onClick={() => setPasteLyricsOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxHeight: "none", width: 480 }}>
            <div className="modal-header">
              <h3>Paste lyrics — {currentTrack.title}</h3>
              <button className="btn btn-icon" onClick={() => setPasteLyricsOpen(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: "16px 18px" }}>
              <textarea
                className="lyrics-paste-textarea"
                placeholder={"One line per lyric line, no timestamps needed —\nyou'll sync it to the song next."}
                autoFocus
                value={pasteLyricsText}
                onChange={e => setPasteLyricsText(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setPasteLyricsOpen(false)}>Cancel</button>
              <button className="btn btn-accent" disabled={!pasteLyricsText.trim()} onClick={savePastedLyrics}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT LYRICS MODAL */}
      {editLyricsOpen && currentTrack && (
        <div className="modal-scrim" onClick={() => setEditLyricsOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxHeight: "none", width: 520 }}>
            <div className="modal-header">
              <h3>Edit lyrics — {currentTrack.title}</h3>
              <button className="btn btn-icon" onClick={() => setEditLyricsOpen(false)}><X size={16} /></button>
            </div>
            <div className="modal-list" style={{ maxHeight: "50vh" }}>
              {editLyricsDraft.map((l, i) => (
                <div key={i} className="edit-lyrics-row">
                  <span className="edit-lyrics-time">{typeof l.time_sec === "number" ? fmtTime(l.time_sec) : "—"}</span>
                  <input
                    className="edit-lyrics-input"
                    value={l.text}
                    placeholder="(empty — will be removed on save)"
                    onChange={e => updateDraftLineText(i, e.target.value)}
                  />
                  <div className="edit-lyrics-row-actions">
                    {typeof l.time_sec === "number" && (
                      <button className="icon-btn" title="Re-tap this line's timestamp to the current playback position" onClick={() => retapDraftLine(i)}>
                        <Hand size={13} />
                      </button>
                    )}
                    <button className="icon-btn" title="Delete line" onClick={() => deleteDraftLine(i)}><Trash2 size={13} color="#E8615D" /></button>
                  </div>
                </div>
              ))}
              <div className="edit-lyrics-add-row" onClick={addDraftLine}>
                <Plus size={14} /> Add line{currentTrack && isPlaying ? ` at ${fmtTime(position)}` : ""}
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: "space-between" }}>
              <button className="btn btn-danger" onClick={deleteLyrics}><Trash2 size={13} /> Delete all lyrics</button>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => setEditLyricsOpen(false)}>Cancel</button>
                <button className="btn btn-accent" onClick={saveEditLyrics}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE PLAYLIST MODAL */}
      {createPlaylistOpen && (
        <div className="modal-scrim" onClick={() => { setCreatePlaylistOpen(false); setNewPlaylistName(""); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxHeight: "none" }}>
            <div className="modal-header">
              <h3>New playlist</h3>
              <button className="btn btn-icon" onClick={() => { setCreatePlaylistOpen(false); setNewPlaylistName(""); }}><X size={16} /></button>
            </div>
            <div style={{ padding: "16px 18px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="settings-label" style={{ marginBottom: 0 }}>Name</span>
                <input
                  className="rename-input" style={{ padding: "8px 10px", fontSize: 13 }}
                  autoFocus placeholder="e.g. Late night drive"
                  value={newPlaylistName}
                  onChange={e => setNewPlaylistName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newPlaylistName.trim()) { createPlaylist(); setCreatePlaylistOpen(false); }
                    if (e.key === "Escape") { setCreatePlaylistOpen(false); setNewPlaylistName(""); }
                  }}
                />
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => { setCreatePlaylistOpen(false); setNewPlaylistName(""); }}>Cancel</button>
              <button
                className="btn btn-accent" disabled={!newPlaylistName.trim()}
                onClick={() => { createPlaylist(); setCreatePlaylistOpen(false); }}
              >
                <Plus size={14} /> Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TRACK MODAL */}
      {photosOpen && (
        <ArtistPhotosSheet library={library} artistPhotos={artistPhotos} setArtistPhotos={setArtistPhotos} onClose={() => setPhotosOpen(false)} pushToast={pushToast} />
      )}
      {fixIds && (
        <FixSheet library={library} setLibrary={setLibrary} ids={Array.isArray(fixIds) ? fixIds : null} onClose={() => setFixIds(null)} pushToast={pushToast} />
      )}
      {importOpen && (
        <ImportSheet library={library} onClose={() => setImportOpen(false)}
          onCreate={(name, ids) => { const id = createPlaylist(name); if (id) { addTrackIdsToPlaylist(id, ids); pushToast(`Created “${name}” with ${ids.length} songs`); setPage("playlists"); } }} />
      )}

      {loadError && (
        <div className="sheet-scrim">
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <div className="sheet-title">Couldn't read your library</div>
            <p className="sheet-text">Reel's data file could not be opened, so nothing has been saved over it. A copy of the damaged file was kept as reel-library.bad.json. Try again first; only choose "Start fresh" if you accept an empty library.</p>
            <div className="sheet-cta">
              <button className="btn btn-accent" onClick={() => window.location.reload()}>Try again</button>
              <button className="btn" onClick={() => { saveBlockedRef.current = false; setLoadError(null); }}>Start fresh</button>
            </div>
          </div>
        </div>
      )}
      {notifHelpOpen && (
        <div className="sheet-scrim" onClick={() => setNotifHelpOpen(false)}>
          <div className="sheet" {...sheetSwipe(() => setNotifHelpOpen(false))}>
            <div className="sheet-grab" />
            <div className="sheet-title">Turn on notifications</div>
            <p className="sheet-text">Android hides the lock-screen and notification-shade player until Reel is allowed to send notifications.</p>
            <div className="sheet-cta">
              <button className="btn btn-accent" onClick={() => { setNotifHelpOpen(false); window.reel.openNotificationSettings?.(); }}>Open notification settings</button>
              <button className="btn" onClick={() => setNotifHelpOpen(false)}>Not now</button>
            </div>
          </div>
        </div>
      )}

      {npMenuOpen && currentTrack && (
        <div className="sheet-scrim" onClick={() => setNpMenuOpen(false)}>
          <div className="sheet" {...sheetSwipe(() => setNpMenuOpen(false))}>
            <div className="sheet-grab" />
            <div className="sheet-head">
              <TrackThumb track={currentTrack} isPlaying={false} size={46} />
              <div className="sheet-head-txt"><b>{currentTrack.title}</b><i>{currentTrack.artist}</i></div>
            </div>
            <div className="sheet-moods">
              {MOOD_PRESETS.map(m => (
                <button key={m.key} className={`sheet-mood${currentTrack.mood === m.key ? " on" : ""}`}
                  style={currentTrack.mood === m.key ? { color: m.color, borderColor: m.color, background: `${m.color}22` } : undefined}
                  onClick={() => reactMood(m.key)}>
                  <m.icon size={13} /> {m.label}
                </button>
              ))}
            </div>
            <div className="sheet-actions">
              <button onClick={() => toggleFavorite(currentTrack.id)}><Heart size={17} fill={favorites.has(currentTrack.id) ? "currentColor" : "none"} /> {favorites.has(currentTrack.id) ? "Remove from favorites" : "Add to favorites"}</button>
              {currentLyrics?.lines?.length > 0 ? (
                <>
                  <button onClick={() => { setNpMenuOpen(false); openEditLyrics(); }}><Pencil size={17} /> Edit lyrics</button>
                  <button onClick={() => { setNpMenuOpen(false); exportLyrics(); }}><Upload size={17} /> Export lyrics</button>
                </>
              ) : (
                <>
                  {online.enabled && online.features.lyrics && <button onClick={() => { setNpMenuOpen(false); findLyricsOnline(currentTrack); }}><Search size={17} /> Find lyrics online</button>}
                  <button onClick={() => { setNpMenuOpen(false); setPasteLyricsText(""); setPasteLyricsOpen(true); }}><Pencil size={17} /> Add lyrics</button>
                  <button onClick={() => { setNpMenuOpen(false); handleImportLyrics(); }}><Upload size={17} /> Import .lrc</button>
                </>
              )}
              <button onClick={() => { setNpMenuOpen(false); startSleepAtTrackEnd(); }}><Timer size={17} /> Sleep at end of song</button>
              <button onClick={() => { setNpMenuOpen(false); setNowPlayingOpen(false); goToArtist(currentTrack.artist); }}><Users size={17} /> Go to artist</button>
            </div>
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (() => {
        const ids = library.filter(t => selectedIds.has(t.id)).map(t => t.id);
        const done = () => setSelectedIds(new Set());
        return (
          <>
            <div className="sel-header">
              <button className="sel-x" onClick={done} aria-label="Cancel"><X size={22} /></button>
              <h2>{selectedIds.size} selected</h2>
              <button className="m-pill" onClick={() => setSelectedIds(new Set(visibleSelRef.current))}>Select all</button>
            </div>
            <div className="sel-bar">
              <button onClick={() => { playIdsNext(ids); done(); }}><ListEnd size={22} /><span>Play next</span></button>
              <button onClick={() => { addIdsToQueue(ids); done(); }}><Plus size={22} /><span>Queue</span></button>
              <button onClick={() => setSelSheet("playlist")}><ListMusic size={22} /><span>Playlist</span></button>
              <button onClick={() => setSelSheet("artist")}><Users size={22} /><span>Artist</span></button>
              <button onClick={() => setSelSheet("more")}><MoreHorizontal size={22} /><span>More</span></button>
            </div>
            {selSheet && (
              <div className="sheet-scrim" onClick={() => setSelSheet(null)}>
                <div className="sheet" {...sheetSwipe(() => setSelSheet(null))}>
                  <div className="sheet-grab" />
                  {selSheet === "playlist" && (
                    <>
                      <div className="sheet-title">Add {ids.length} to playlist</div>
                      <div className="sheet-actions">
                        {playlists.length === 0 && <div className="sheet-empty">No playlists yet — create one from the Playlists tab.</div>}
                        {playlists.map(pl => (
                          <button key={pl.id} onClick={() => { addTrackIdsToPlaylist(pl.id, ids); setSelSheet(null); done(); }}><ListMusic size={17} /> {pl.name}</button>
                        ))}
                      </div>
                    </>
                  )}
                  {selSheet === "artist" && (
                    <>
                      <div className="sheet-title">Assign {ids.length} to artist</div>
                      <div className="sheet-newartist">
                        <input placeholder="New artist…" value={selectionNewArtistName} onChange={e => setSelectionNewArtistName(e.target.value)} />
                        <button className="btn btn-accent" disabled={!selectionNewArtistName.trim()} onClick={() => { assignTracksToArtist(selectionNewArtistName, ids); setSelectionNewArtistName(""); setSelSheet(null); done(); }}>Add</button>
                      </div>
                      <div className="sheet-actions">
                        {artists.map(a => (
                          <button key={a.name} onClick={() => { assignTracksToArtist(a.name, ids); setSelSheet(null); done(); }}><Users size={17} /> {a.name}</button>
                        ))}
                      </div>
                    </>
                  )}
                  {selSheet === "more" && (
                    <div className="sheet-actions">
                      <button onClick={() => { setSelSheet(null); setBulkEditForm({ artist: "", album: "" }); setBulkEditOpen(true); }}><Tags size={17} /> Edit tags</button>
                      <button onClick={() => { setFavorites(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; }); setSelSheet(null); done(); }}><Heart size={17} /> Add to favorites</button>
                      {removeLabel[selCtx] && (
                        <button className="danger" onClick={() => { setSelSheet(null); removeSelectedFor(selCtx); }}><Trash2 size={17} /> {removeLabel[selCtx]}</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {trackSheet && (() => {
        const t = libraryAll.find(x => x.id === trackSheet.track.id) || trackSheet.track;
        const ctx = trackSheet.context;
        const close = () => setTrackSheet(null);
        return (
          <div className="sheet-scrim" onClick={close}>
            <div className="sheet" {...sheetSwipe(close)}>
              <div className="sheet-grab" />
              <div className="sheet-head">
                <TrackThumb track={t} isPlaying={false} size={46} />
                <div className="sheet-head-txt"><b>{t.title}</b><i>{t.artist}</i></div>
              </div>
              <div className="sheet-moods">
                {MOOD_PRESETS.map(m => (
                  <button key={m.key} className={`sheet-mood${t.mood === m.key ? " on" : ""}`}
                    style={t.mood === m.key ? { color: m.color, borderColor: m.color, background: `${m.color}22` } : undefined}
                    onClick={() => setLibrary(prev => prev.map(x => x.id === t.id ? { ...x, mood: x.mood === m.key ? null : m.key } : x))}>
                    <m.icon size={13} /> {m.label}
                  </button>
                ))}
              </div>
              {!sheetPlaylistsOpen ? (
                <div className="sheet-actions">
                  <button onClick={() => { playTrackId(t.id); close(); }}><Play size={17} /> Play</button>
                  <button onClick={() => { playIdsNext([t.id]); close(); }}><ListEnd size={17} /> Play next</button>
                  <button onClick={() => { addIdsToQueue([t.id]); close(); }}><ListPlus size={17} /> Add to queue</button>
                  <button onClick={() => toggleFavorite(t.id)}><Heart size={17} fill={favorites.has(t.id) ? "currentColor" : "none"} /> {favorites.has(t.id) ? "Remove from favorites" : "Add to favorites"}</button>
                  <button onClick={() => setSheetPlaylistsOpen(true)}><ListMusic size={17} /> Add to playlist</button>
                  <button onClick={() => { close(); goToArtist(t.artist); }}><Users size={17} /> Go to artist</button>
                  <button onClick={() => { setSelCtx(ctx || "library"); setSelectedIds(new Set([t.id])); close(); }}><CheckSquare size={17} /> Select</button>
                  <button onClick={() => { close(); setEditingTrack(t); setEditForm({ title: t.title, artist: t.artist, album: t.album, mood: t.mood || "" }); }}><Pencil size={17} /> Edit info</button>
                  {online.enabled && online.features.tagsCovers && !t.remote && <button onClick={() => { close(); setFixIds([t.id]); }}><Wand2 size={17} /> Find tags &amp; cover</button>}
                  {removeLabel[ctx] && (
                    <button className="danger" onClick={() => { removeSelectedFor(ctx, new Set([t.id])); close(); }}><Trash2 size={17} /> {removeLabel[ctx]}</button>
                  )}
                </div>
              ) : (
                <div className="sheet-actions">
                  <button onClick={() => setSheetPlaylistsOpen(false)}><ChevronLeft size={17} /> Back</button>
                  {playlists.length === 0 && <div className="sheet-empty">No playlists yet — create one from the Playlists tab.</div>}
                  {playlists.map(pl => (
                    <button key={pl.id} onClick={() => { addTrackIdsToPlaylist(pl.id, [t.id]); close(); }}><ListMusic size={17} /> {pl.name}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {editingTrack && (
        <div className="modal-scrim" onClick={() => setEditingTrack(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxHeight: "none" }}>
            <div className="modal-header">
              <h3>Edit track info</h3>
              <button className="btn btn-icon" onClick={() => setEditingTrack(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="settings-label" style={{ marginBottom: 0 }}>Title</span>
                <input
                  className="rename-input" style={{ padding: "8px 10px", fontSize: 13 }}
                  autoFocus value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") saveTrackEdit(); if (e.key === "Escape") setEditingTrack(null); }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="settings-label" style={{ marginBottom: 0 }}>Artist</span>
                <input
                  className="rename-input" style={{ padding: "8px 10px", fontSize: 13 }}
                  value={editForm.artist}
                  onChange={e => setEditForm(f => ({ ...f, artist: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") saveTrackEdit(); if (e.key === "Escape") setEditingTrack(null); }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="settings-label" style={{ marginBottom: 0 }}>Album</span>
                <input
                  className="rename-input" style={{ padding: "8px 10px", fontSize: 13 }}
                  value={editForm.album}
                  onChange={e => setEditForm(f => ({ ...f, album: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") saveTrackEdit(); if (e.key === "Escape") setEditingTrack(null); }}
                />
              </label>
              <div>
                <span className="settings-label">Mood</span>
                <div className="mood-chip-row">
                  <button
                    className={`mood-chip${!editForm.mood ? " selected" : ""}`}
                    onClick={() => setEditForm(f => ({ ...f, mood: "" }))}
                  >
                    None
                  </button>
                  {MOOD_PRESETS.map(m => (
                    <button
                      key={m.key}
                      className={`mood-chip${editForm.mood === m.key ? " selected" : ""}`}
                      style={editForm.mood === m.key ? { borderColor: m.color, color: m.color, background: `${m.color}22` } : undefined}
                      onClick={() => setEditForm(f => ({ ...f, mood: m.key }))}
                    >
                      <m.icon size={12} /> {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setEditingTrack(null)}>Cancel</button>
              <button className="btn btn-accent" disabled={!editForm.title.trim()} onClick={saveTrackEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* BULK EDIT TAGS MODAL */}
      {bulkEditOpen && (
        <div className="modal-scrim" onClick={() => setBulkEditOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxHeight: "none" }}>
            <div className="modal-header">
              <h3>Edit tags — {selectedIds.size} track{selectedIds.size !== 1 ? "s" : ""}</h3>
              <button className="btn btn-icon" onClick={() => setBulkEditOpen(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0, lineHeight: 1.5 }}>
                Leave a field blank to leave that tag alone — only fields you fill in get applied to all {selectedIds.size} selected track{selectedIds.size !== 1 ? "s" : ""}.
              </p>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="settings-label" style={{ marginBottom: 0 }}>Artist</span>
                <input
                  className="rename-input" style={{ padding: "8px 10px", fontSize: 13 }}
                  autoFocus placeholder="(no change)"
                  value={bulkEditForm.artist}
                  onChange={e => setBulkEditForm(f => ({ ...f, artist: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Escape") setBulkEditOpen(false); }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="settings-label" style={{ marginBottom: 0 }}>Album</span>
                <input
                  className="rename-input" style={{ padding: "8px 10px", fontSize: 13 }}
                  placeholder="(no change)"
                  value={bulkEditForm.album}
                  onChange={e => setBulkEditForm(f => ({ ...f, album: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Escape") setBulkEditOpen(false); }}
                />
              </label>
              <div>
                <span className="settings-label">Mood</span>
                <div className="mood-chip-row">
                  <button
                    className={`mood-chip${bulkEditForm.mood === "" ? " selected" : ""}`}
                    onClick={() => setBulkEditForm(f => ({ ...f, mood: "" }))}
                  >
                    No change
                  </button>
                  <button
                    className={`mood-chip${bulkEditForm.mood === "__clear__" ? " selected" : ""}`}
                    onClick={() => setBulkEditForm(f => ({ ...f, mood: "__clear__" }))}
                  >
                    Clear
                  </button>
                  {MOOD_PRESETS.map(m => (
                    <button
                      key={m.key}
                      className={`mood-chip${bulkEditForm.mood === m.key ? " selected" : ""}`}
                      style={bulkEditForm.mood === m.key ? { borderColor: m.color, color: m.color, background: `${m.color}22` } : undefined}
                      onClick={() => setBulkEditForm(f => ({ ...f, mood: m.key }))}
                    >
                      <m.icon size={12} /> {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setBulkEditOpen(false)}>Cancel</button>
              <button
                className="btn btn-accent"
                disabled={!bulkEditForm.artist.trim() && !bulkEditForm.album.trim() && !bulkEditForm.mood}
                onClick={() => saveBulkEdit(Array.from(selectedIds))}
              >
                Apply to {selectedIds.size} track{selectedIds.size !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LYRICS SHARE CARD — pick lines, preview, save */}
      {shareOpen && currentTrack && currentLyrics && (
        <div className="modal-scrim recap-scrim" onClick={() => setShareOpen(false)}>
          <div className="share-modal" onClick={e => e.stopPropagation()}>
            <button className="btn btn-icon recap-close" onClick={() => setShareOpen(false)}><X size={16} /></button>
            <div className="share-pick">
              <div className="share-pick-head">
                <div className="share-title">Share lyrics</div>
                <div className="share-sub"><b>{shareSel.length}</b> of {MAX_SHARE_LINES} lines selected · shift-click selects a range</div>
              </div>
              <div className="share-lines">
                {currentLyrics.lines.map((l, i) => {
                  const text = (l.text || "").trim();
                  if (!text) return null;
                  const sel = shareSel.includes(i);
                  return (
                    <button key={i} className={`share-line${sel ? " selected" : ""}${lyricsIsSynced && i === activeLyricsLineIndex ? " playing" : ""}`} onClick={(e) => toggleShareLine(i, e.shiftKey)}>
                      <span className="share-check">{sel && <Check size={12} strokeWidth={3} />}</span>
                      <span>{text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="share-preview">
              <div className="recap-switch">
                {[["bloom", "Bloom"], ["aurora", "Aurora"], ["paper", "Paper"]].map(([k, label]) => (
                  <button key={k} className={shareStyle === k ? "active" : ""} onClick={() => setShareStyle(k)}>{label}</button>
                ))}
              </div>
              {shareSel.length > 0 ? (
                <canvas ref={shareCanvasRef} className="share-canvas" />
              ) : (
                <div className="share-empty"><Share2 size={26} strokeWidth={1.4} />Pick the lines you want on the card</div>
              )}
              <div className="recap-actions">
                <button className="btn" onClick={() => setShareSel([])} disabled={shareSel.length === 0}>Clear</button>
                <button className="btn" onClick={copyShareCard} disabled={shareSel.length === 0}><Copy size={14} /> Copy</button>
                <button className="btn btn-accent" onClick={exportShareCard} disabled={shareSel.length === 0}><Download size={14} /> Save image</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WEEKLY RECAP SHARE CARD */}
      {weeklyRecapRange && (
        <div className="modal-scrim recap-scrim" onClick={() => setWeeklyRecapRange(null)}>
          <div className="recap-modal" onClick={e => e.stopPropagation()}>
            <button className="btn btn-icon recap-close" onClick={() => setWeeklyRecapRange(null)}><X size={16} /></button>
            <div className="recap-switch">
              <button
                className={weeklyRecapRange === "current" ? "active" : ""}
                disabled={!recapCards?.current}
                onClick={() => setWeeklyRecapRange("current")}
              >This week</button>
              <button
                className={weeklyRecapRange === "last" ? "active" : ""}
                disabled={!recapCards?.last}
                onClick={() => setWeeklyRecapRange("last")}
              >Last week</button>
            </div>
            {weeklyRecapCard ? (
              <canvas ref={recapCanvasRef} className="recap-canvas" />
            ) : (
              <div className="recap-empty">
                <Trophy size={26} strokeWidth={1.4} />
                <p>Nothing played in this week yet.</p>
              </div>
            )}
            <div className="recap-actions">
              <button className="btn" onClick={() => setWeeklyRecapRange(null)}>Close</button>
              <button className="btn btn-accent" onClick={exportRecapCard} disabled={!weeklyRecapCard}>
                <Download size={14} /> Save image
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MILESTONE CELEBRATION MODAL — pops up the moment a listening-time
          threshold is crossed, with a confetti burst in that tier's own
          color so each milestone feels like its own distinct achievement
          rather than a repeat of the last one. */}
      {milestoneModal && (
        <div className="modal-scrim milestone-scrim" onClick={() => setMilestoneModal(null)}>
          <div className="milestone-modal-card" onClick={e => e.stopPropagation()}>
            <button className="btn btn-icon milestone-modal-close" onClick={() => setMilestoneModal(null)}><X size={16} /></button>
            {milestoneConfetti.map(p => (
              <span
                key={p.id}
                className="milestone-confetti-piece"
                style={{ left: p.left, background: p.color, animationDelay: p.delay, "--tx": p.tx, "--ty": p.ty, "--tr": p.tr }}
              />
            ))}
            <div className="milestone-modal-icon-ring" style={{ background: `${milestoneModal.color}22`, border: `1px solid ${milestoneModal.color}55`, color: milestoneModal.color }}>
              <milestoneModal.icon size={38} />
            </div>
            <div className="milestone-modal-eyebrow">Milestone unlocked</div>
            <div className="milestone-modal-name">{milestoneModal.name}</div>
            <div className="milestone-modal-sub">{milestoneModal.hours} hour{milestoneModal.hours !== 1 ? "s" : ""} of listening in Reel</div>
            <div className="milestone-reward-box" style={{ borderColor: `${milestoneModal.color}55`, background: `${milestoneModal.color}12` }}>
              <span className="milestone-reward-swatch" style={{ background: milestoneModal.color, boxShadow: `0 0 18px ${milestoneModal.color}88` }} />
              <div>
                <div className="milestone-reward-eyebrow">Reward unlocked</div>
                <div className="milestone-reward-name">{milestoneModal.rewardName} accent color</div>
              </div>
            </div>
            {milestoneModal.extra > 0 && (
              <div className="milestone-modal-sub" style={{ fontSize: 11.5 }}>
                + {milestoneModal.extra} more color{milestoneModal.extra !== 1 ? "s" : ""} from the tiers you passed — see Settings
              </div>
            )}
            <div className="milestone-modal-actions">
              <button className="btn" onClick={() => setMilestoneModal(null)}>Later</button>
              <button
                className="btn btn-accent"
                onClick={() => { setAccentKey(milestoneModal.reward); setMilestoneModal(null); }}
              >
                Use {milestoneModal.rewardName} now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SLEEP TIMER ENDED MODAL */}
      {sleepTimerEndedNotice && (
        <div className="modal-scrim" onClick={() => setSleepTimerEndedNotice(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxHeight: "none", width: 380 }}>
            <div className="modal-header">
              <h3><Timer size={16} style={{ verticalAlign: -2, marginRight: 6 }} /> Sleep timer ended</h3>
              <button className="btn btn-icon" onClick={() => setSleepTimerEndedNotice(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: "16px 18px", fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>
              Your sleep timer ran out, so playback has been paused.
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setSleepTimerEndedNotice(false)}>OK</button>
              <button className="btn btn-accent" onClick={() => { setIsPlaying(true); setSleepTimerEndedNotice(false); }}>
                <Play size={13} fill="currentColor" /> Resume playing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IDLE AMBIENT SCREENSAVER — fades in once playback has sat paused for
          a while, drifting the last track's own glow colors instead of the
          app just sitting static. Any click dismisses it. */}
      {idleAmbientActive && currentTrack && !nowPlayingOpen && (
        <div className="idle-ambient" onClick={dismissIdleAmbient}>
          <div
            className="idle-ambient-glow"
            style={{ background: `radial-gradient(circle at 30% 25%, ${npGlowColors(currentTrack)[0]}, transparent 60%), radial-gradient(circle at 75% 75%, ${npGlowColors(currentTrack)[1]}, transparent 60%)` }}
          />
          <div className="idle-ambient-meta">
            <Music2 size={14} />
            <span>{currentTrack.title} — {currentTrack.artist}</span>
          </div>
        </div>
      )}

      {/* APP TOAST STACK — lightweight, auto-dismissing (loop-streak, etc.),
          separate from the heavier milestone celebration modal. */}
      {appToasts.length > 0 && (
        <div className="app-toast-stack">
          {appToasts.map(t => (
            <div key={t.id} className="app-toast">
              <Repeat size={14} color="var(--accent)" />
              <span>{t.text}</span>
              <button className="btn btn-icon" onClick={() => setAppToasts(prev => prev.filter(x => x.id !== t.id))}><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
