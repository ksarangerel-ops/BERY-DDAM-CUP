/* ============================================================
   DDAM ESPORT CUP CS2 — entry point
============================================================ */
import './style.css';
import html2canvas from 'html2canvas';
import {
  MATCHES, NUM_MATCHES, groupMatches, lowerMatches, finalMatches,
  SERIES_RESULTS, pointsForSeries, TOURNAMENT_ID,
} from './config.js';
import { createStore, blankState, MODE, writeCache } from './store.js';
import {
  computeStandings, computePlayers, computeGroupStandings, completedGroupStage,
  completedLowerStage, qualifiedTeams, lowerWinners, matchWinner, seriesStats, matchTeams, matchComplete,
} from './scoring.js';
import { ICONS } from './icons.js';
import { enhanceSelects, setSelectState, syncSelect } from './select.js';
import { assetUrl, pickImage, prepareImage } from './dota2/assets.js';
import {
  isConfigured, missingKeys, isLive,
  getSession, subscribeAuth, signIn, signOut,
  uploadMedia, removeMedia,
} from './supabase.js';
import { applySharedProfiles, saveSharedProfiles, subscribeSharedProfiles } from './shared/team-profiles.js';

let state = blankState();
let currentMatch = 1;
let showAllPlayers = false;
let formDirty = false;
let pendingRemote = false;
let rosterSaving = false;
let lastSelfPublish = null;
let authSession = null;
let currentAdminPanel = 'matches';
let sharedProfiles = {};

const $ = id => document.getElementById(id);
const LEADER_AVATARS = {
  ALP: '/leader-avatars/gegeenee.png',
  BRV: '/leader-avatars/ganaa.png',
  CHR: '/leader-avatars/garidaa.png',
  DLT: '/leader-avatars/amaraa.png',
  ECH: '/leader-avatars/bery.png',
  FOX: '/leader-avatars/bagaa.png',
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const num = n => (n || 0).toLocaleString('en-US');
const teamOf = pid => state.teams.find(team => team.players.some(player => player.id === pid));
const mediaSrc = value => assetUrl(value);
const initials = value => String(value || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';
// CS2 keeps its own team names and logos. Do not let another game overwrite them.
const applySharedIdentity = value => value;
const matchConfig = matchNo => MATCHES.find(match => match.id === Number(matchNo));
const firstUnplayedMatch = () => MATCHES.find(match => !matchComplete(state, match))?.id || 1;
const activeTeamsForMatch = (matchNo = currentMatch) => matchTeams(state, matchNo);
const matchTitle = (matchNo = currentMatch) => {
  const match = matchConfig(matchNo);
  return match ? match.label : 'Series';
};
const gameNumber = match => match.id;

function resultOptions(match) {
  const values = SERIES_RESULTS[match.stage] || SERIES_RESULTS.group;
  return values.map(value => {
    const points = pointsForSeries(match.stage, value);
    const wins = Number(value[0]), losses = Number(value[2]);
    const label = `${value} · ${wins === losses ? 'Draw' : wins > losses ? 'Win' : 'Loss'} · ${points} pts`;
    return `<option value="${value}">${label}</option>`;
  }).join('');
}

function previewResult(match, series) {
  if (!series) return null;
  const wins = Number(series[0]);
  const losses = Number(series[2]);
  return {
    wins,
    losses,
    draws: wins === losses ? 1 : 0,
    points: pointsForSeries(match.stage, series),
  };
}

function oppositeSeries(match, series) {
  return (match.stage === 'final'
    ? { '2-0': '0-2', '2-1': '1-2', '1-2': '2-1', '0-2': '2-0', '': '' }
    : { '1-0': '0-1', '0-1': '1-0', '': '' })[series] || '';
}

/* ---------- store wiring ---------- */
const store = createStore({
  onState(next, { fromRemote }) {
    next = applySharedIdentity(next);
    if (rosterSaving || (fromRemote && next.updated && next.updated === lastSelfPublish)) {
      state = next;
      renderBoard();
      syncTeamCardHeaders();
      renderTeamEditorValues();
      return;
    }
    if (fromRemote && formDirty) {
      pendingRemote = true;
      state = next;
      renderBoard();
      renderRemoteNotice();
      return;
    }
    state = next;
    pendingRemote = false;
    if (!state.results[currentMatch] && fromRemote) currentMatch = firstUnplayedMatch();
    renderAll();
  },
  onMode: renderSyncBadge,
});

/* ---------- board ---------- */
function renderSectionIcons() {
  $('iconStandings').innerHTML = ICONS.trophy('ico w-4 h-4');
  $('iconFrag').innerHTML = ICONS.crown('ico w-4 h-4');
  $('iconMap').innerHTML = ICONS.map('ico w-4 h-4');
}

function renderSyncBadge() {
  const el = $('syncBadge');
  if (!el) return;
  const mode = store.getMode();
  const cfg = {
    [MODE.LIVE]: ['LIVE', 'text-emerald-300 border-emerald-400/50 bg-emerald-400/10', 'bg-emerald-400 animate-pulse', `Live — synced to Supabase (${TOURNAMENT_ID})`],
    [MODE.SYNCING]: ['SYNC', 'text-gold border-gold/50 bg-gold/10', 'bg-gold animate-pulse', 'Connecting to Supabase…'],
    [MODE.LOCAL]: ['LOCAL', 'text-slate-400 border-line bg-ink/60', 'bg-slate-500', isConfigured
      ? 'Supabase unreachable — changes are saved on this device only'
      : `Supabase not configured (missing: ${missingKeys.join(', ') || 'all keys'}) — this device only`],
  }[mode];
  el.className = `inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[9px] font-display font-black uppercase tracking-[.15em] ${cfg[1]}`;
  el.title = cfg[3];
  el.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${cfg[2]}"></span>${cfg[0]}`;
}

function renderRemoteNotice() {
  const el = $('remoteNotice');
  if (el) el.classList.toggle('hidden', !pendingRemote);
}

function renderMapChips() {
  $('mapChips').innerHTML = MATCHES.map(match => {
    const played = matchComplete(state, match);
    const group = match.stage === 'group' ? 'GROUP BO1' : match.stage === 'lower' ? 'LOWER BO1' : 'FINAL BO3';
    return `<div class="clip-tag px-3 sm:px-4 py-2 border ${played ? 'border-gold/60 bg-gold/15' : 'border-line bg-ink/40'}">
      <div class="text-[9px] uppercase tracking-[.2em] font-display font-bold ${played ? 'text-gold' : 'text-slate-500'}">${group} · M${gameNumber(match)}</div>
      <div class="text-xs sm:text-sm font-bold ${played ? 'text-white' : 'text-slate-500'}">${match.format}</div>
    </div>`;
  }).join('');
}

function renderFormatRules() {
  const finalists = qualifiedTeams(state);
  const groupDone = completedGroupStage(state);
  const lowerDone = completedLowerStage(state);
  $('formatRules').innerHTML = `
    <div class="rounded-2xl glass p-5 border border-cyan/20">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-[.3em] font-display font-black text-cyan">CS2 TOURNAMENT FORMAT</div>
          <h3 class="font-display font-black text-lg sm:text-xl text-white mt-1">DDAM ESPORT CUP — 6 Team CS2 Bracket</h3>
        </div>
        <span class="text-[10px] uppercase tracking-widest font-display font-black px-2 py-1 rounded border ${finalists.length === 4 ? 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10' : 'text-gold border-gold/40 bg-gold/10'}">${finalists.length}/4 finalists ready</span>
      </div>
      <div class="grid gap-3 md:grid-cols-3 mt-4 text-sm">
        <div class="rounded-xl bg-ink/50 border border-line p-3"><b class="text-gold">1. Group Stage · BO1</b><br><span class="text-slate-400">All 6 teams play each other once. There are 15 BO1 matches and the results create Seed 1–6.</span></div>
        <div class="rounded-xl bg-ink/50 border border-line p-3"><b class="text-cyan">2. Upper / Lower</b><br><span class="text-slate-400">Seed 1/2 wait in Upper. Seeds 3/6 and 4/5 play two Lower BO1 qualifiers; the winners advance.</span></div>
        <div class="rounded-xl bg-ink/50 border border-line p-3"><b class="text-white">3. Playoff · 4 BO3</b><br><span class="text-slate-400">Two semifinal BO3 matches decide the Grand Final and 3rd Place Final. Winners play for 1st/2nd; losers play for 3rd/4th.</span></div>
      </div>
      <p class="text-xs text-slate-500 mt-4">Current status: ${finalists.length ? 'The 4-team playoff is ready.' : !groupDone ? 'Complete all 15 Group Stage matches first.' : !lowerDone ? 'Group seeds are ready; complete both Lower BO1 qualifiers.' : 'Complete the qualification stage.'}</p>
    </div>`;
}

function renderStageCards() {
  const groupRows = computeGroupStandings(state);
  const finalists = new Set(qualifiedTeams(state).map(team => team.id));
  const lower = lowerMatches().map(match => ({ match, teams: matchTeams(state, match), winner: matchWinner(state, match) }));
  $('stageCards').innerHTML = `
    <div class="rounded-2xl glass overflow-hidden xl:col-span-2">
      <div class="px-4 py-3 glass-2 border-b border-cyan/20 flex items-center justify-between"><span class="font-display font-black text-xs uppercase tracking-[.2em] text-white">Group Stage · BO1 · 15 Matches</span><span class="text-[9px] uppercase tracking-widest font-display font-bold ${completedGroupStage(state) ? 'text-gold' : 'text-slate-500'}">${completedGroupStage(state) ? 'Seeded 1–6' : `${groupMatches().filter(match => matchComplete(state, match)).length}/15 played`}</span></div>
      <div class="divide-y divide-line/50">${groupRows.map(row => `<div class="flex items-center gap-2 px-4 py-2.5 text-sm ${finalists.has(row.team.id) ? 'bg-gold/10' : ''}"><span class="w-7 font-mono font-extrabold ${row.rank <= 2 ? 'text-gold' : 'text-slate-500'}">S${row.rank}</span><span class="flex-1 font-semibold truncate text-slate-200">${esc(row.team.name)}</span>${row.rank <= 2 ? '<span class="text-[8px] uppercase tracking-widest font-display font-black text-gold">UPPER</span>' : row.rank <= 6 ? '<span class="text-[8px] uppercase tracking-widest font-display font-black text-cyan">LOWER</span>' : ''}<span class="font-mono text-xs font-extrabold text-white">${row.total}P</span></div>`).join('')}</div>
    </div>
    <div class="rounded-2xl glass overflow-hidden">
      <div class="px-4 py-3 glass-2 border-b border-gold/20 flex items-center justify-between"><span class="font-display font-black text-xs uppercase tracking-[.2em] text-white">Lower Qualifier · BO1</span><span class="text-[9px] uppercase tracking-widest font-display font-bold text-cyan">2 winners advance</span></div>
      <div class="divide-y divide-line/50">${lower.map(({ match, teams, winner }) => `<div class="px-4 py-3"><div class="text-[9px] uppercase tracking-widest text-slate-500">${esc(match.label)}</div><div class="mt-1 flex items-center gap-2 text-sm"><span class="flex-1 font-semibold truncate">${teams[0] ? esc(teams[0].name) : `Seed ${match.seedPair[0]}`}</span><b class="text-cyan">vs</b><span class="flex-1 text-right font-semibold truncate">${teams[1] ? esc(teams[1].name) : `Seed ${match.seedPair[1]}`}</span></div><div class="mt-1 text-right text-[9px] uppercase tracking-widest ${winner ? 'text-gold' : 'text-slate-500'}">${winner ? `Winner: ${esc(winner.name)}` : teams.length ? 'Waiting for BO1 result' : 'Complete Group Stage first'}</div></div>`).join('')}</div>
    </div>`;
}

function renderBracket() {
  const finalists = qualifiedTeams(state);
  const ready = finalists.length === 4;
  const finals = finalMatches();
  const matchCard = match => {
    const teams = matchTeams(state, match);
    const fallbackNames = match.bracket === 'semi'
      ? [`Seed ${match.semi}`, `Lower Q${match.semi}`]
      : match.bracket === 'grand'
        ? ['Semifinal 1 winner', 'Semifinal 2 winner']
        : ['Semifinal 1 loser', 'Semifinal 2 loser'];
    const names = teams.length === 2 ? teams.map(team => esc(team.name)) : fallbackNames;
    const complete = matchComplete(state, match);
    const status = complete ? 'Saved' : (teams.length === 2 ? 'Open' : 'Locked');
    const footer = match.bracket === 'semi' ? 'SEMIFINAL · BO3' : match.bracket === 'grand' ? 'GRAND FINAL · BO3 · 1ST / 2ND' : '3RD PLACE · BO3 · 3RD / 4TH';
    return `<div class="bracket-match ${complete ? 'is-saved' : ''}"><div class="px-3 py-2 border-b border-gold/20 flex items-center justify-between"><span class="bracket-round-title">M${match.id} · ${esc(match.label.split(' · ')[0])}</span><span class="text-[9px] uppercase tracking-widest ${complete ? 'text-gold' : 'text-slate-500'}">${status}</span></div><span>${names[0]}</span><span>${names[1]}</span><div class="px-3 py-2 text-[9px] uppercase tracking-widest text-slate-500">${footer}</div></div>`;
  };
  const groupRows = computeGroupStandings(state);
  const groupPlayed = groupMatches().filter(match => matchComplete(state, match)).length;
  const lowerPlayed = lowerMatches().filter(match => matchComplete(state, match)).length;
  const finalPlayed = finalMatches().filter(match => matchComplete(state, match)).length;
  const visualStatus = finalPlayed ? 'PLAYOFF LIVE' : lowerPlayed ? 'LOWER QUALIFIERS' : groupPlayed ? 'GROUP STAGE LIVE' : 'MATCH DAY READY';
  $('bracket').innerHTML = `<div class="rounded-2xl glass overflow-hidden border border-gold/25">
    <div class="px-4 sm:px-5 py-3 glass-2 border-b border-gold/20 flex items-center justify-between gap-3"><div class="flex items-center gap-2.5"><span class="w-1.5 h-5 rounded-full bg-gold"></span><h3 class="font-display font-black text-xs sm:text-sm uppercase tracking-[.2em] text-white">Upper → Lower → Playoff BO3</h3></div><span class="text-[9px] uppercase tracking-widest font-display font-black ${ready ? 'text-gold' : 'text-slate-500'}">${ready ? '4 finalists ready' : 'Waiting for qualification'}</span></div>
    <div class="grid items-stretch gap-4 lg:grid-cols-3 p-4 sm:p-5">
      <div class="bracket-stage rounded-xl border border-gold/30 bg-gold/5 p-3"><div class="text-[10px] uppercase tracking-[.2em] font-display font-black text-gold mb-3">Upper · waiting slots</div><div class="grid gap-2"><div class="bracket-match"><span>Seed 1 · ${groupRows[0] ? esc(groupRows[0].team.name) : 'Waiting'}</span><span>Upper slot</span></div><div class="bracket-match"><span>Seed 2 · ${groupRows[1] ? esc(groupRows[1].team.name) : 'Waiting'}</span><span>Upper slot</span></div></div><div class="qualifier-visual mt-4"><div class="qualifier-scan"></div><div class="qualifier-orbit"><img src="/game-logos/counter-strike-2.png" alt="CS2 playoff" class="qualifier-logo"></div><div class="qualifier-kicker">QUALIFICATION CORE</div><div class="qualifier-status">${visualStatus}</div><div class="qualifier-stats"><div><strong>${groupPlayed}/15</strong><span>GROUP</span></div><div><strong>${lowerPlayed}/2</strong><span>LOWER</span></div><div><strong>${finalPlayed}/4</strong><span>PLAYOFF</span></div></div><div class="qualifier-track"><span class="${groupPlayed === 15 ? 'is-live' : ''}">01 GROUP</span><span class="${lowerPlayed === 2 ? 'is-live' : ''}">02 LOWER</span><span class="${finalPlayed === 4 ? 'is-live' : ''}">03 PODIUM</span></div></div><div class="bracket-stage-art upper-art"><span class="stage-art-kicker">UPPER RESERVE</span><b>SEED 1 / 2</b><span>WAIT FOR THE LOWER GATE</span></div></div>
      <div class="bracket-stage rounded-xl border border-cyan/30 bg-cyan/5 p-3"><div class="text-[10px] uppercase tracking-[.2em] font-display font-black text-cyan mb-3">Lower · BO1 qualifiers</div><div class="grid gap-3">${lowerMatches().map(match => { const teams = matchTeams(state, match); const winner = matchWinner(state, match); return `<div class="bracket-match"><div class="px-3 py-2 text-[9px] uppercase tracking-widest text-slate-500">${esc(match.label)}</div><span>${teams[0] ? esc(teams[0].name) : `Seed ${match.seedPair[0]}`}</span><span>${teams[1] ? esc(teams[1].name) : `Seed ${match.seedPair[1]}`}</span><div class="px-3 py-2 text-[9px] uppercase tracking-widest ${winner ? 'text-gold' : 'text-slate-500'}">${winner ? `Advances: ${esc(winner.name)}` : 'BO1 winner advances'}</div></div>`; }).join('')}</div><div class="bracket-stage-art lower-art"><span class="stage-art-kicker">LOWER GATE</span><div class="stage-art-lane"><span>S3</span><i>VS</i><span>S6</span></div><div class="stage-art-line"></div><div class="stage-art-lane"><span>S4</span><i>VS</i><span>S5</span></div><b>2 WINNERS → SEMIFINALS</b></div></div>
      <div class="bracket-stage bracket-stage-final rounded-xl border border-line bg-ink/30 p-3 lg:col-span-1"><div class="text-[10px] uppercase tracking-[.2em] font-display font-black text-white mb-3">Final playoff · 4 BO3 matches</div><div class="grid gap-2">${finals.map(matchCard).join('')}</div></div>
    </div>
    <div class="bracket-rail mx-4 sm:mx-5 mb-4"><div class="flex items-center justify-between gap-3"><div><div class="text-[10px] uppercase tracking-[.25em] font-display font-black text-cyan">Road to the podium</div><div class="text-xs text-slate-400 mt-1">Хоосон зайг шат бүрийн дараалал, хожигчдын замаар харууллаа.</div></div><span class="text-[9px] uppercase tracking-widest font-display font-black text-gold">4 BO3 FINALS</span></div><div class="relative grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4"><div class="absolute hidden sm:block left-[12%] right-[12%] top-4 h-px bg-gradient-to-r from-cyan/40 via-gold/70 to-gold/40"></div><div class="bracket-rail"><span class="bracket-rail-node">01</span><b>SEED 1 / 2</b><small>UPPER WAIT</small></div><div class="bracket-rail"><span class="bracket-rail-node">02</span><b>LOWER WINNERS</b><small>2 × BO1</small></div><div class="bracket-rail"><span class="bracket-rail-node is-gold">03</span><b>SEMIFINALS</b><small>2 × BO3</small></div><div class="bracket-rail"><span class="bracket-rail-node is-gold">04</span><b>GRAND + 3RD</b><small>2 × BO3 · 1–4</small></div></div></div>
    <p class="px-4 pb-4 text-[11px] text-slate-500">All 6 teams play 15 Group Stage BO1 matches. Seed 1/2 wait Upper; Seeds 3/6 and 4/5 play Lower BO1. The two Lower winners meet the Upper seeds in 2 BO3 semifinals; winners play the Grand Final and losers play the 3rd Place Final.</p>
  </div>`;
}

function renderStandings() {
  const rows = computeStandings(state);
  $('standings').innerHTML = rows.map(row => {
    const active = row.series > 0;
    const badge = !active ? 'bg-panel2 text-slate-500 border border-line'
      : row.rank === 1 ? 'bg-gradient-to-br from-gold2 to-amber-600 text-ink'
      : row.rank === 2 ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-ink'
      : row.rank === 3 ? 'bg-gradient-to-br from-amber-600 to-amber-800 text-white'
      : 'bg-panel2 text-slate-400 border border-line';
    return `<tr class="${row.rank === 1 && active ? 'row-champ' : ''} hover:bg-white/[.04] transition">
      <td class="py-3.5 pl-4 pr-2"><span class="inline-grid place-items-center w-9 h-9 rounded-lg font-display font-black text-sm ${badge}">${row.rank}</span></td>
      <td class="py-3.5 px-2"><div class="flex items-center gap-2.5">
        ${mediaSrc(row.team.logo) ? `<img class="cs-inline-logo" src="${esc(mediaSrc(row.team.logo))}" alt="${esc(row.team.name)} logo">` : ''}
        <span class="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-ink/70 border border-line text-cyan">${esc(row.team.tag)}</span>
        <span class="font-display font-bold text-sm sm:text-base whitespace-nowrap ${row.rank === 1 && active ? 'champ-name' : 'text-white'}">${esc(row.team.name)}</span>
        <span class="text-[9px] uppercase tracking-widest font-bold ${row.qualified ? 'text-gold' : 'text-slate-500'}">${row.qualified ? 'Playoff' : completedGroupStage(state) ? (row.rank <= 2 ? 'Upper' : 'Lower') : 'Group Stage'}</span>
        ${row.qualified ? `<span class="text-[8px] uppercase tracking-widest font-display font-black px-1.5 py-0.5 rounded bg-gold/15 text-gold border border-gold/30">Qualified</span>` : ''}
      </div></td>
      <td class="py-3.5 px-2 text-center font-mono font-bold text-slate-300">${row.series}</td>
      <td class="py-3.5 px-2 text-center font-mono font-bold text-slate-300">${row.wins}-${row.draws}-${row.losses}</td>
      <td class="py-3.5 px-2 text-center font-mono font-bold text-cyan">${row.gamesWon}</td>
      <td class="py-3.5 px-2 text-center font-mono font-bold text-gold">${row.groupPoints}</td>
      <td class="py-3.5 px-2 text-center font-mono font-bold text-cyan">${row.finalPoints}</td>
      <td class="py-3.5 pr-4 pl-2 text-right font-display font-black text-lg sm:text-xl ${row.rank === 1 && active ? 'text-gold' : 'text-white'}">${row.total}</td>
    </tr>`;
  }).join('');
  $('genAt').textContent = new Date().toLocaleString();
}

function renderRosters() {
  const rows = computePlayers(state);
  const list = showAllPlayers ? rows : rows.slice(0, 10);
  const groupPlayed = groupMatches().filter(match => matchComplete(state, match)).length;
  const champion = finalMatches().every(match => matchComplete(state, match))
    ? computeStandings(state).find(row => row.rank === 1 && row.qualified)
    : null;
  $('leaderCards').innerHTML = state.teams.map((team, index) => {
    const leaderAvatar = LEADER_AVATARS[team.tag] || mediaSrc(team.players?.[0]?.photo) || `/leader-avatars/leader-${index + 1}.png`;
    return `
    <article class="leader-card leader-card-${index + 1}">
      <div class="leader-card-head">
        <span>TEAM ${esc(team.name.replace(/^Team\s+/i, ''))}</span>
        <b>${esc(team.tag)}</b>
      </div>
      <div class="leader-card-body">
        <div class="leader-avatar"><img src="${leaderAvatar}" alt="${esc(team.name)} leader"></div>
        <div class="leader-copy">
          <span class="leader-role">TEAM LEADER</span>
          <strong>${esc(team.name)}</strong>
          <small>Captain · ${esc(team.tag)}</small>
        </div>
      </div>
    </article>`;
  }).join('');
  $('mvpCard').innerHTML = champion
    ? `<div class="mvp-card rainbow-border h-full rounded-2xl border border-gold/60 bg-gradient-to-br from-gold/20 via-panel/85 to-ink/90 backdrop-blur-md p-5 flex flex-col justify-center text-center">
        <img src="/game-logos/counter-strike-2.png" alt="CS2" class="champion-logo mx-auto mb-3">
        <div class="text-[10px] uppercase tracking-[.35em] font-display font-black text-gold">CHAMPION · 1ST PLACE</div>
        <div class="font-display font-black text-2xl sm:text-3xl mt-2 text-white champ-name">${esc(champion.team.name)}</div>
        <div class="text-sm text-slate-300 mt-1"><span class="font-mono text-cyan">${esc(champion.team.tag)}</span> · Grand Final winner</div>
        <div class="mt-4 inline-flex self-center items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] uppercase tracking-[.2em] font-display font-black text-gold">${champion.finalPoints} final points</div>
      </div>`
    : `<div class="h-full rounded-2xl border border-cyan/40 bg-gradient-to-br from-cyan/10 via-panel/80 to-ink/90 backdrop-blur-md p-5 flex flex-col justify-center text-center">
        <img src="/game-logos/counter-strike-2.png" alt="CS2" class="champion-logo mx-auto mb-2 opacity-80">
        <div class="text-[10px] uppercase tracking-[.3em] font-display font-black text-cyan">CS2 CUP STATUS</div>
        <div class="font-display font-black text-xl sm:text-2xl mt-2 text-white">${state.teams.length} Teams</div>
        <div class="text-sm text-slate-400 mt-1">${groupPlayed}/15 Group Stage matches complete</div>
        <div class="grid grid-cols-2 gap-2 mt-4">
          <div class="rounded-xl bg-ink/70 border border-line py-2.5"><div class="font-display font-black text-2xl text-gold">15</div><div class="text-[9px] uppercase tracking-[.2em] font-bold text-slate-500">Group BO1</div></div>
          <div class="rounded-xl bg-ink/70 border border-line py-2.5"><div class="font-display font-black text-2xl text-cyan">4</div><div class="text-[9px] uppercase tracking-[.2em] font-bold text-slate-500">Final BO3</div></div>
        </div>
      </div>`;
  $('mvpTable').innerHTML = list.map(row => `<tr class="hover:bg-white/[.04] transition">
    <td class="py-2.5 pl-4 pr-2"><span class="font-display font-black text-xs text-slate-500">${row.rank}</span></td>
    <td class="py-2.5 px-2"><div class="flex items-center gap-2"><span class="cs-inline-player">${mediaSrc(row.player.photo) ? `<img src="${esc(mediaSrc(row.player.photo))}" alt="${esc(row.player.name)}">` : esc(initials(row.player.name))}</span><span class="font-display font-bold text-sm text-white">${esc(row.player.name)}</span></div></td>
    <td class="py-2.5 px-2"><span class="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-ink/70 border border-line text-cyan">${esc(row.team.tag)}</span><span class="text-xs font-semibold text-slate-400 ml-1 hidden sm:inline">${esc(row.team.name)}</span></td>
    <td class="py-2.5 px-2 text-center font-mono font-bold text-slate-600">—</td>
  </tr>`).join('');
  $('btnMore').textContent = showAllPlayers ? 'Show top 10' : `Show all ${rows.length}`;
}

function renderPerformanceBlock(match, teams) {
  const rows = teams.flatMap(team => team.players.map(player => ({
    team,
    player,
    stats: state.results[match.id]?.[team.id]?.players?.[player.id] || {},
  })));
  const hasStats = rows.some(row => Object.values(row.stats).some(value => value !== '' && value != null));
  if (!hasStats) return `<div class="mt-3 rounded-xl glass overflow-hidden border border-cyan/20"><div class="px-4 py-3 glass-2 border-b border-cyan/20 flex items-center justify-between gap-3"><span class="font-display font-black text-[10px] uppercase tracking-[.2em] text-white">Player Performance</span><span class="text-[9px] uppercase tracking-widest text-slate-500">Awaiting admin input</span></div><div class="px-4 py-3 text-xs text-slate-500">K/D/A, damage, net worth, level and items can be added from Admin after this series.</div></div>`;
  return `<div class="mt-3 rounded-xl glass overflow-hidden border border-cyan/25"><div class="px-4 py-3 glass-2 border-b border-cyan/20 flex items-center justify-between gap-3"><div class="flex items-center gap-2"><span class="text-cyan">${ICONS.crown('ico w-4 h-4')}</span><span class="font-display font-black text-[10px] uppercase tracking-[.2em] text-white">Player Performance</span></div><span class="text-[9px] uppercase tracking-widest text-cyan">${match.format} series stats</span></div><div class="overflow-x-auto"><div class="min-w-[720px] grid grid-cols-[minmax(150px,1.4fr)_minmax(70px,.65fr)_minmax(90px,.8fr)_minmax(100px,.9fr)_minmax(55px,.45fr)_minmax(180px,1.5fr)] gap-2 px-4 py-2 text-[9px] uppercase tracking-widest font-display font-bold text-slate-500 border-b border-line/70"><span>Player / Team</span><span class="text-center">K / D / A</span><span class="text-center">Damage</span><span class="text-center">Net worth</span><span class="text-center">Level</span><span>Items</span>${rows.map(row => {
    const stats = row.stats;
    const kda = [stats.kills, stats.deaths, stats.assists].every(value => value !== '' && value != null) ? `${stats.kills}/${stats.deaths}/${stats.assists}` : '—';
    return `<span class="truncate py-2 text-slate-200"><b class="text-white">${esc(row.player.name)}</b><small class="block mt-0.5 text-cyan">${esc(row.team.tag)}</small></span><span class="py-2 text-center font-mono font-bold text-white">${esc(kda)}</span><span class="py-2 text-center font-mono font-bold text-cyan">${esc(stats.damage ?? '—')}</span><span class="py-2 text-center font-mono font-bold text-gold">${esc(stats.netWorth ?? '—')}</span><span class="py-2 text-center font-mono font-bold text-white">${esc(stats.level ?? '—')}</span><span class="truncate py-2 text-slate-400">${esc(stats.items || '—')}</span>`;
  }).join('')}</div></div></div>`;
}

function renderMatchCards() {
  $('matchCards').innerHTML = MATCHES.map(match => {
    const teams = activeTeamsForMatch(match.id);
    if (!teams.length) {
      const text = match.stage === 'group'
        ? 'Group Stage match is waiting for the six-team board.'
        : match.stage === 'lower'
          ? 'Complete all 15 Group Stage BO1 matches first.'
          : 'Complete both Lower BO1 qualifiers first.';
      return `<div class="rounded-xl border border-dashed border-line bg-ink/40 p-5 text-center"><div class="font-display font-bold text-xs uppercase tracking-[.2em] text-slate-500">${match.label}</div><div class="text-sm text-slate-600 mt-2 font-semibold">${text}</div></div>`;
    }
    if (!matchComplete(state, match)) {
      return `<div class="rounded-xl border border-dashed border-line bg-ink/40 p-5 text-center"><div class="font-display font-bold text-xs uppercase tracking-[.2em] text-slate-500">${match.label}</div><div class="text-xs text-slate-600 mt-1 font-semibold">${teams.length} teams · waiting for result</div></div>`;
    }
    const list = teams.map(team => ({ team, stats: seriesStats(state, match.id, team.id) })).filter(row => row.stats).sort((a, b) => b.stats.points - a.stats.points || b.stats.wins - a.stats.wins);
    return `<div><div class="rounded-xl glass overflow-hidden"><div class="px-4 py-3 glass-2 border-b border-gold/20 flex items-center justify-between"><span class="font-display font-bold text-xs uppercase tracking-[.2em] text-white">${match.label}</span><span class="font-display font-bold text-xs uppercase tracking-[.2em] text-gold">${match.format}</span></div><div class="divide-y divide-line/50">${list.map(row => `<div class="flex items-center gap-2 px-4 py-2.5 text-sm"><span class="w-6 font-mono font-extrabold text-slate-500">${row.stats.series}</span><span class="flex-1 font-semibold truncate text-slate-200">${esc(row.team.name)}</span><span class="font-mono text-xs font-extrabold text-cyan">${row.stats.points}P</span></div>`).join('')}</div></div>${renderPerformanceBlock(match, teams)}</div>`;
  }).join('');
}

function renderSavedAt() {
  $('savedAt').textContent = state.updated ? 'Last updated: ' + new Date(state.updated).toLocaleString() : 'No results saved yet';
}

/* ---------- admin ---------- */
function renderMatchTabs() {
  const groupTabs = `<div class="w-full mt-1"><div class="text-[10px] uppercase tracking-[.2em] font-display font-black text-cyan mb-2">Group Stage · 15 matches · BO1</div><div class="flex flex-wrap gap-2">${groupMatches().map(renderMatchTab).join('')}</div></div>`;
  const lowerTabs = `<div class="w-full mt-3 pt-3 border-t border-line/70"><div class="text-[10px] uppercase tracking-[.2em] font-display font-black text-cyan mb-2">Lower Qualifier · 2 matches · BO1</div><div class="flex flex-wrap gap-2">${lowerMatches().map(renderMatchTab).join('')}</div></div>`;
  const finalTabs = `<div class="w-full mt-3 pt-3 border-t border-line/70"><div class="text-[10px] uppercase tracking-[.2em] font-display font-black text-gold mb-2">Final Playoff · 4 matches · BO3</div><div class="flex flex-wrap gap-2">${finalMatches().map(renderMatchTab).join('')}</div></div>`;
  $('matchTabs').innerHTML = groupTabs + lowerTabs + finalTabs;
  document.querySelectorAll('.mtab').forEach(button => {
    button.onclick = () => {
      if (formDirty && !confirm('You have unsaved changes for this series. Switch anyway?')) return;
      currentMatch = +button.dataset.match;
      formDirty = false;
      renderAdmin();
    };
  });
  $('curMatchLabel').textContent = matchTitle();
}

function renderMatchTab(match) {
  const on = match.id === currentMatch;
  return `<button type="button" data-match="${match.id}" class="mtab clip-tag px-4 py-3 border text-left transition ${on ? 'bg-gold text-ink border-gold shadow-gold' : 'bg-ink/50 border-line hover:border-cyan'}"><div class="font-display font-black text-xs uppercase tracking-[.15em] ${on ? 'text-ink' : 'text-white'}">Match ${gameNumber(match)}</div><div class="text-[11px] font-bold ${on ? 'text-ink/70' : 'text-slate-400'}">${match.format}${matchComplete(state, match) ? ' · ✓ saved' : ''}</div></button>`;
}

const PERFORMANCE_FIELDS = [
  { key: 'kills', label: 'K', placeholder: '0' },
  { key: 'deaths', label: 'D', placeholder: '0' },
  { key: 'assists', label: 'A', placeholder: '0' },
  { key: 'damage', label: 'Damage', placeholder: '0' },
  { key: 'netWorth', label: 'Net worth', placeholder: '0' },
  { key: 'level', label: 'Level', placeholder: '0' },
  { key: 'items', label: 'Items', placeholder: 'Blink, BKB…', text: true },
];

function renderPerformanceInputs(team, result) {
  const playerStats = result[team.id]?.players || {};
  return `<details class="mt-3 rounded-xl border border-cyan/20 bg-ink/40 overflow-hidden"><summary class="cursor-pointer px-3 py-2.5 text-[10px] uppercase tracking-[.2em] font-display font-black text-cyan hover:bg-cyan/5">Player Performance · optional</summary><div class="overflow-x-auto p-3"><div class="min-w-[640px] grid grid-cols-[minmax(130px,1.1fr)_repeat(6,minmax(62px,.55fr))_minmax(150px,1.2fr)] gap-2 items-center text-[9px] uppercase tracking-widest font-display font-bold text-slate-500"><span>Player</span>${PERFORMANCE_FIELDS.slice(0, 6).map(field => `<span class="text-center">${field.label}</span>`).join('')}<span>Items</span>${team.players.map(player => {
    const saved = playerStats[player.id] || {};
    return `<span class="truncate text-slate-300">${esc(player.name)}</span>${PERFORMANCE_FIELDS.map(field => `<input data-performance-player="${player.id}" data-performance-key="${field.key}" type="${field.text ? 'text' : 'number'}" min="0" value="${esc(saved[field.key] ?? '')}" placeholder="${field.placeholder}" class="performance-input min-w-0 rounded-md bg-ink/60 border border-line px-2 py-1.5 text-[11px] font-bold text-white focus:outline-none focus:border-cyan">`).join('')}`;
  }).join('')}</div></div></details>`;
}

function renderTeamCards() {
  const match = matchConfig(currentMatch);
  const teams = activeTeamsForMatch();
  const result = state.results[currentMatch] || {};
  if (!teams.length) {
    const title = match.stage === 'group'
      ? 'Group Stage'
      : match.stage === 'lower' ? 'Lower Qualifier is locked' : 'Final Playoff is locked';
    const message = match.stage === 'group'
      ? 'This Group Stage BO1 uses the six registered teams.'
      : match.stage === 'lower'
        ? 'Complete all 15 Group Stage BO1 matches first.'
        : 'Complete both Lower BO1 qualifiers first.';
    $('teamCards').innerHTML = `<div class="xl:col-span-2 rounded-2xl border border-dashed border-gold/40 bg-gold/5 p-6 text-center"><div class="font-display font-black text-sm uppercase tracking-[.2em] text-gold">${title}</div><div class="text-sm text-slate-300 mt-2 font-semibold">${message}</div></div>`;
    $('rankWarn').textContent = '';
    return;
  }
  $('teamCards').innerHTML = teams.map(team => {
    const current = result[team.id]?.series || '';
    const players = team.players.map(player => `<div class="grid grid-cols-[1fr] gap-2 items-center" data-player="${player.id}"><input type="text" value="${esc(player.name)}" maxlength="24" placeholder="Player name" class="p-name bg-ink/60 border border-line rounded-lg px-2.5 py-2 text-sm font-bold text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold min-w-0"></div>`).join('');
    const stageLabel = match.stage === 'group' ? 'GROUP BO1' : match.stage === 'lower' ? 'LOWER BO1' : 'FINAL BO3';
    return `<div class="team-card rounded-2xl glass overflow-hidden" data-team="${team.id}"><div class="px-4 py-3 glass-2 border-b border-gold/20 flex items-center gap-2.5 flex-wrap"><span class="tc-tag font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-ink/70 border border-line text-cyan">${esc(team.tag)}</span><span class="tc-name font-display font-bold text-sm text-white">${esc(team.name)}</span><span class="tc-zone text-[9px] uppercase tracking-widest font-bold text-gold">${stageLabel}</span><div class="sel ml-auto"><select class="t-series select-esports" aria-label="${stageLabel} result for ${esc(team.name)}"><option value="">Result —</option>${resultOptions(match)}</select></div></div><div class="px-4 pt-3 pb-2 text-[9px] uppercase tracking-[.18em] font-display font-bold text-slate-500">Roster · 5 players</div><div class="px-4 pb-3 space-y-2">${players}</div><div class="px-4 pb-3">${renderPerformanceInputs(team, result)}</div><div class="px-4 py-2.5 bg-ink/60 border-t border-line/70 flex items-center gap-4 text-xs"><span class="uppercase tracking-[.15em] font-display font-bold text-slate-500">Series result</span><span class="t-series-label font-mono font-extrabold text-cyan text-base">${current || '—'}</span><span class="uppercase tracking-[.15em] font-display font-bold text-slate-500 ml-auto">Points</span><span class="t-pts font-display font-black text-white text-base">${current ? `${previewResult(match, current).points}` : '—'}</span></div></div>`;
  }).join('');

  document.querySelectorAll('#teamCards .t-series').forEach(select => {
    const saved = result[select.closest('.team-card').dataset.team]?.series || '';
    select.value = saved;
    select.addEventListener('change', () => {
      const currentCard = select.closest('.team-card');
      const otherSelect = [...document.querySelectorAll('#teamCards .team-card')]
        .find(card => card !== currentCard)?.querySelector('.t-series');
      if (otherSelect) {
        otherSelect.value = oppositeSeries(match, select.value);
        syncSelect(otherSelect);
      }
      formDirty = true;
      updateLive();
    });
  });
  document.querySelectorAll('#teamCards .p-name').forEach(input => {
    const pid = input.closest('[data-player]').dataset.player;
    input.addEventListener('change', () => savePlayerName(pid, input));
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); input.blur(); } });
  });
  enhanceSelects(document.getElementById('teamCards'));
  updateLive();
}

function syncTeamCardHeaders() {
  const match = matchConfig(currentMatch);
  const stageLabel = match?.stage === 'group' ? 'GROUP BO1' : match?.stage === 'lower' ? 'LOWER BO1' : 'FINAL BO3';
  document.querySelectorAll('#teamCards .team-card').forEach(card => {
    const team = state.teams.find(item => item.id === card.dataset.team);
    if (!team) return;
    card.querySelector('.tc-tag').textContent = team.tag;
    card.querySelector('.tc-name').textContent = team.name;
    card.querySelector('.tc-zone').textContent = stageLabel;
  });
}

/* ---------- roster saves ---------- */
async function syncSharedIdentity(teams) {
  if (!isLive() || !authSession?.user || !teams?.length) return;
  const changes = {};
  teams.forEach(team => { changes[team.tag] = { tag: team.tag, name: team.name, logo: team.logo || null }; });
  try { sharedProfiles = await saveSharedProfiles(changes); }
  catch (error) { console.warn('[shared-profiles] CS2 sync failed:', error); }
}
async function saveRoster(mutate, okMsg) {
  const next = structuredClone(state);
  if (mutate(next) === false) return null;
  rosterSaving = true;
  let result;
  try { result = await store.publish(next); } finally { rosterSaving = false; }
  lastSelfPublish = result.updated || null;
  renderTeamEditorValues();
  if (!result.ok) toast('⚠ Saved on this device only — Supabase write failed', true);
  else if (result.local) toast(`${okMsg} — saved on this device only`);
  else toast(`✓ ${okMsg}`);
  return result;
}

async function savePlayerName(pid, input) {
  const team = teamOf(pid), player = team?.players.find(item => item.id === pid);
  if (!player) return;
  const value = input.value.trim();
  if (!value) { input.value = player.name; return; }
  if (value === player.name) return;
  await saveRoster(next => {
    const target = next.teams.find(item => item.players.some(candidate => candidate.id === pid));
    target.players.find(item => item.id === pid).name = value;
  }, 'Player name saved');
}

function updateLive() {
  const match = matchConfig(currentMatch);
  let missing = 0;
  document.querySelectorAll('#teamCards .team-card').forEach(card => {
    const select = card.querySelector('.t-series');
    const value = select.value;
    const preview = previewResult(match, value);
    if (!value) missing++;
    card.querySelector('.t-series-label').textContent = value || '—';
    card.querySelector('.t-pts').textContent = preview ? preview.points : '—';
    setSelectState(select, { error: false, empty: !value });
  });
  $('rankWarn').textContent = missing ? `⚠ Select the ${match.format} result` : '';
}

function renderTeamEditor() {
  $('teamEditor').innerHTML = state.teams.map((team, index) => `<div class="flex items-center gap-2"><span class="w-6 text-center font-mono text-[10px] text-slate-500">${index + 1}</span><input value="${esc(team.tag)}" data-i="${index}" data-f="tag" maxlength="4" class="tin w-14 bg-ink/60 border border-line rounded px-2 py-1.5 text-[11px] font-mono font-extrabold text-cyan uppercase focus:outline-none focus:border-cyan"><input value="${esc(team.name)}" data-i="${index}" data-f="name" maxlength="28" class="tin flex-1 min-w-0 bg-ink/60 border border-line rounded px-2 py-1.5 text-sm font-bold text-white focus:outline-none focus:border-gold"></div>`).join('');
  document.querySelectorAll('.tin').forEach(input => {
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); input.blur(); } });
    input.addEventListener('change', () => {
      const index = +input.dataset.i, field = input.dataset.f;
      const value = field === 'tag' ? input.value.trim().toUpperCase() : input.value.trim();
      if (!value) { input.value = state.teams[index][field]; return; }
      if (value === state.teams[index][field]) return;
      input.value = value;
      saveRoster(next => { next.teams[index][field] = value; }, field === 'tag' ? 'Team tag saved' : 'Team name saved');
    });
  });
}

function renderTeamEditorValues() {
  document.querySelectorAll('#teamEditor .tin').forEach(input => {
    const team = state.teams[+input.dataset.i];
    if (team && document.activeElement !== input) input.value = team[input.dataset.f];
  });
}

function renderMediaEditor() {
  const root = $('mediaEditor');
  if (!root) return;
  root.innerHTML = state.teams.map(team => {
    const logo = mediaSrc(team.logo);
    return `<section class="cs-media-team">
      <div class="cs-media-team-head">
        <span class="cs-media-logo">${logo ? `<img src="${esc(logo)}" alt="${esc(team.name)} logo">` : esc(initials(team.name))}</span>
        <div class="min-w-0"><b class="block truncate text-sm text-white">${esc(team.name)}</b><small class="text-[10px] uppercase tracking-widest text-slate-500">${esc(team.tag)} · 5 players</small></div>
        <div class="ml-auto flex flex-wrap justify-end gap-1.5">
          <button type="button" class="cs-media-logo-upload cs-media-btn" data-team="${team.id}">${logo ? 'Change logo' : 'Upload logo'}</button>
          ${logo ? `<button type="button" class="cs-media-logo-remove cs-media-btn cs-media-btn--muted" data-team="${team.id}">Remove</button>` : ''}
        </div>
      </div>
      <div class="cs-media-players">
        ${team.players.map(player => {
          const photo = mediaSrc(player.photo);
          return `<div class="cs-media-player-row" data-player="${player.id}">
            <span class="cs-media-player">${photo ? `<img src="${esc(photo)}" alt="${esc(player.name)}">` : esc(initials(player.name))}</span>
            <input class="cs-media-name" data-player="${player.id}" value="${esc(player.name)}" maxlength="24" aria-label="Player name">
            <button type="button" class="cs-media-photo-upload cs-media-btn" data-player="${player.id}">${photo ? 'Change photo' : 'Upload photo'}</button>
            ${photo ? `<button type="button" class="cs-media-photo-remove cs-media-btn cs-media-btn--muted" data-player="${player.id}">Remove</button>` : ''}
          </div>`;
        }).join('')}
      </div>
    </section>`;
  }).join('');

  document.querySelectorAll('#mediaEditor .cs-media-logo-upload').forEach(button => { button.onclick = () => uploadTeamLogo(button.dataset.team); });
  document.querySelectorAll('#mediaEditor .cs-media-logo-remove').forEach(button => { button.onclick = () => removeTeamLogo(button.dataset.team); });
  document.querySelectorAll('#mediaEditor .cs-media-photo-upload').forEach(button => { button.onclick = () => uploadPlayerPhoto(button.dataset.player); });
  document.querySelectorAll('#mediaEditor .cs-media-photo-remove').forEach(button => { button.onclick = () => removePlayerPhoto(button.dataset.player); });
  document.querySelectorAll('#mediaEditor .cs-media-name').forEach(input => {
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); input.blur(); } });
    input.addEventListener('change', () => savePlayerName(input.dataset.player, input));
  });
}

async function uploadPlayerPhoto(pid) {
  const player = teamOf(pid)?.players.find(item => item.id === pid);
  if (!player) return;
  const file = await pickImage();
  if (!file) return;
  let data;
  try { data = await prepareImage(file, 'photo'); } catch (error) { toast(error.message || 'Could not process that image', true); return; }
  const previous = player.photo;
  let value = data;
  const storedOnline = isLive();
  if (storedOnline) {
    try { value = await uploadMedia(`players/${pid}`, data); }
    catch (error) { console.error('[cs2] player photo upload failed:', error); toast(`Photo upload failed — ${error.message || 'Storage rejected the file'}`, true); return; }
  }
  const result = await saveRoster(next => {
    const target = next.teams.find(team => team.players.some(item => item.id === pid));
    const targetPlayer = target?.players.find(item => item.id === pid);
    if (!targetPlayer) return false;
    targetPlayer.photo = value;
  }, `Photo saved for ${player.name}`);
  if (storedOnline) { if (result?.ok) void removeMedia(previous); else void removeMedia(value); }
  renderMediaEditor();
}

async function removePlayerPhoto(pid) {
  const player = teamOf(pid)?.players.find(item => item.id === pid);
  if (!player?.photo || !confirm(`Remove the photo of ${player.name}?`)) return;
  const previous = player.photo;
  const result = await saveRoster(next => {
    const target = next.teams.find(team => team.players.some(item => item.id === pid));
    const targetPlayer = target?.players.find(item => item.id === pid);
    if (!targetPlayer) return false;
    targetPlayer.photo = null;
  }, 'Player photo removed');
  if (result?.ok) void removeMedia(previous);
  renderMediaEditor();
}

async function uploadTeamLogo(teamId) {
  const team = state.teams.find(item => item.id === teamId);
  if (!team) return;
  const file = await pickImage();
  if (!file) return;
  let data;
  try { data = await prepareImage(file, 'logo'); } catch (error) { toast(error.message || 'Could not process that image', true); return; }
  const previous = team.logo;
  let value = data;
  const storedOnline = isLive();
  if (storedOnline) {
    try { value = await uploadMedia(`teams/${teamId}`, data); }
    catch (error) { console.error('[cs2] team logo upload failed:', error); toast(`Logo upload failed — ${error.message || 'Storage rejected the file'}`, true); return; }
  }
  const result = await saveRoster(next => {
    const target = next.teams.find(item => item.id === teamId);
    if (!target) return false;
    target.logo = value;
  }, `Logo saved for ${team.name}`);
  if (storedOnline) { if (result?.ok) void removeMedia(previous); else void removeMedia(value); }
  renderMediaEditor();
}

async function removeTeamLogo(teamId) {
  const team = state.teams.find(item => item.id === teamId);
  if (!team?.logo || !confirm(`Remove the logo of ${team.name}?`)) return;
  const previous = team.logo;
  const result = await saveRoster(next => {
    const target = next.teams.find(item => item.id === teamId);
    if (!target) return false;
    target.logo = null;
  }, 'Team logo removed');
  if (result?.ok) void removeMedia(previous);
  renderMediaEditor();
}

function renderRulesLegend() {
  $('ptsLegend').innerHTML = `<li class="flex justify-between items-center"><span class="text-gold font-bold">Group / Lower BO1 win</span><span class="font-mono font-extrabold text-white">1 pt</span></li><li class="flex justify-between items-center"><span class="text-slate-300">Group / Lower BO1 loss</span><span class="font-mono font-extrabold text-white">0 pts</span></li><li class="flex justify-between items-center"><span class="text-slate-300">Final BO3 win</span><span class="font-mono font-extrabold text-white">3 pts</span></li><li class="flex justify-between items-center pt-2 mt-2 border-t border-line text-cyan"><span>Group Stage</span><span class="font-mono font-extrabold">15 BO1</span></li><li class="flex justify-between items-center text-cyan"><span>Lower Qualifier</span><span class="font-mono font-extrabold">2 BO1</span></li><li class="flex justify-between items-center text-gold"><span>Final Playoff</span><span class="font-mono font-extrabold">4 BO3</span></li><li class="flex justify-between items-center text-gold"><span>Placement</span><span class="font-mono font-extrabold">1st–4th</span></li>`;
}

function renderBoard() { renderMapChips(); renderFormatRules(); renderStageCards(); renderBracket(); renderStandings(); renderRosters(); renderMatchCards(); renderSavedAt(); }
function renderAdminAuth() {
  const loggedOut = $('adminLoggedOut');
  const loggedIn = $('adminLoggedIn');
  const editor = $('adminEditor');
  const signedIn = Boolean(authSession?.user);
  loggedOut.classList.toggle('hidden', signedIn);
  loggedIn.classList.toggle('hidden', !signedIn);
  editor.classList.toggle('hidden', !signedIn);
  if (signedIn) {
    $('adminUserEmail').textContent = authSession.user.email || 'Authenticated admin';
    $('adminAuthMessage').textContent = '';
  } else if (!isConfigured) {
    $('adminAuthMessage').textContent = 'Supabase is not configured, so admin login is unavailable.';
  }
}

function renderAdmin() { renderAdminAuth(); renderMatchTabs(); renderTeamCards(); renderRemoteNotice(); renderMediaEditor(); }
function renderAll() { renderSectionIcons(); renderBoard(); renderAdmin(); renderTeamEditor(); renderRulesLegend(); renderSyncBadge(); renderMediaEditor(); }

function setAdminPanel(panel = 'matches') {
  currentAdminPanel = panel === 'media' ? 'media' : 'matches';
  document.querySelectorAll('.admin-panel-tab').forEach(button => {
    const active = button.dataset.adminPanel === currentAdminPanel;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $('adminPanelMatches')?.classList.toggle('hidden', currentAdminPanel !== 'matches');
  $('adminPanelMedia')?.classList.toggle('hidden', currentAdminPanel !== 'media');
  if (currentAdminPanel === 'media') renderMediaEditor();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- actions ---------- */
$('adminLoginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const email = $('adminEmail').value.trim();
  const password = $('adminPassword').value;
  const button = $('btnAdminLogin');
  button.disabled = true;
  button.textContent = 'Signing in…';
  $('adminAuthMessage').textContent = '';
  try {
    await signIn(email, password);
    $('adminPassword').value = '';
    toast('✓ Admin access granted');
  } catch (error) {
    console.error('[ddam-cup] admin login failed:', error);
    $('adminAuthMessage').textContent = error.message || 'Sign in failed';
  } finally {
    button.disabled = false;
    button.textContent = 'Sign in';
  }
});

$('btnAdminLogout').onclick = async () => {
  try {
    await signOut();
    formDirty = false;
    pendingRemote = false;
    toast('✓ Signed out');
  } catch (error) {
    console.error('[ddam-cup] admin logout failed:', error);
    toast('Sign out failed', true);
  }
};

$('resultForm').addEventListener('submit', async event => {
  event.preventDefault();
  const activeTeams = activeTeamsForMatch();
  if (!activeTeams.length) return toast('⚠ This stage is not ready yet', true);
  const entry = {};
  let missing = false;
  const nameEdits = [];
  document.querySelectorAll('#teamCards .team-card').forEach(card => {
    const series = card.querySelector('.t-series').value;
    if (!series) { missing = true; return; }
    card.querySelectorAll('[data-player]').forEach(row => {
      const name = row.querySelector('.p-name').value.trim();
      if (name) nameEdits.push([row.dataset.player, name]);
    });
    const players = {};
    card.querySelectorAll('[data-performance-player]').forEach(input => {
      const value = input.value.trim();
      if (!value) return;
      const playerId = input.dataset.performancePlayer;
      const key = input.dataset.performanceKey;
      if (!players[playerId]) players[playerId] = {};
      players[playerId][key] = input.type === 'number' ? Number(value) : value;
    });
    entry[card.dataset.team] = { series, players };
  });
  if (missing) return toast('⚠ Select a BO result for every team', true);

  const next = structuredClone(state);
  nameEdits.forEach(([pid, name]) => {
    const team = next.teams.find(item => item.players.some(player => player.id === pid));
    const player = team?.players.find(item => item.id === pid);
    if (player) player.name = name;
  });
  next.results[currentMatch] = entry;
  formDirty = false;
  pendingRemote = false;
  const button = event.submitter || $('btnSave');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Publishing…';
  const result = await store.publish(next);
  lastSelfPublish = result.updated || null;
  button.disabled = false;
  button.textContent = label;
  toast(result.ok && !result.local ? `✓ ${matchTitle()} published live` : `${matchTitle()} saved on this device only`, !result.ok);
});

$('btnClearMatch').onclick = async () => {
  if (!state.results[currentMatch]) return toast('Nothing to clear', true);
  if (!confirm(`Clear ${matchTitle()}? Every viewer's board updates immediately.`)) return;
  const next = structuredClone(state);
  delete next.results[currentMatch];
  formDirty = false;
  const result = await store.publish(next);
  lastSelfPublish = result.updated || null;
  toast(`✓ ${matchTitle()} cleared`);
};

async function clearAllResults(confirmText) {
  if (!confirm(confirmText)) return;
  const next = structuredClone(state);
  next.results = {};
  currentMatch = 1;
  formDirty = false;
  pendingRemote = false;
  const result = await store.publish(next);
  lastSelfPublish = result.updated || null;
  toast(result.ok && !result.local ? '✓ All series cleared — teams kept' : 'All series cleared on this device only', !result.ok);
}

$('btnClearAll').onclick = () => clearAllResults(`Clear every CS2 series result across all ${NUM_MATCHES} games?\n\nTeam names, tags and player names are kept.`);
$('btnReset').onclick = () => clearAllResults(`Reset every CS2 series result across all ${NUM_MATCHES} games?\n\nTeam names, tags and player names are kept.`);

$('btnMore').onclick = () => { showAllPlayers = !showAllPlayers; renderRosters(); };
$('btnReload').onclick = () => { pendingRemote = false; formDirty = false; renderAll(); toast('✓ Loaded the latest results'); };

document.querySelectorAll('.tabbtn').forEach(button => {
  button.onclick = () => {
    document.querySelectorAll('.tabbtn').forEach(item => { item.classList.remove('active'); item.classList.add('text-slate-400'); });
    button.classList.add('active');
    button.classList.remove('text-slate-400');
    const view = button.dataset.view;
    $('view-board').classList.toggle('hidden', view !== 'board');
    $('view-admin').classList.toggle('hidden', view !== 'admin');
    $('view-rules').classList.toggle('hidden', view !== 'rules');
    if (view === 'board') renderBoard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
});

document.querySelectorAll('.admin-panel-tab').forEach(button => {
  button.addEventListener('click', () => setAdminPanel(button.dataset.adminPanel));
});

$('btnPng').onclick = async () => {
  const button = $('btnPng'), old = button.textContent;
  button.textContent = 'Rendering…'; button.disabled = true;
  document.body.classList.add('exporting');
  try {
    const canvas = await html2canvas($('capture'), { backgroundColor: '#080808', scale: Math.min(3, (window.devicePixelRatio || 1) * 2), useCORS: true, logging: false });
    const link = document.createElement('a');
    link.download = `ddam-cup-cs2-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('✓ PNG downloaded');
  } catch (error) { console.error(error); toast('PNG export failed', true); }
  document.body.classList.remove('exporting');
  button.textContent = old; button.disabled = false;
};

$('btnCopy').onclick = async () => {
  const teams = computeStandings(state), players = computePlayers(state).slice(0, 10);
  const text = ['🏆 DDAM ESPORT CUP — CS2', '', 'FORMAT: 6 TEAMS · GROUP BO1 ROUND ROBIN (15) → LOWER BO1 QUALIFIERS (2) → FINAL FOUR BO3 ROUND ROBIN (6)', '']
    .concat(teams.map(row => `${row.rank}. ${row.team.name} [${row.team.tag}] — ${row.total} pts (${row.wins}-${row.draws}-${row.losses}${row.qualified ? ', finalist' : ''})`))
    .concat(['', 'PLAYERS', ''])
    .concat(players.map(row => `${row.player.name} — ${row.team.name}`))
    .concat(['', `Updated: ${new Date().toLocaleString()}`]).join('\n');
  try { await navigator.clipboard.writeText(text); toast('✓ Copied to clipboard'); } catch { prompt('Copy the standings:', text); }
};

window.addEventListener('beforeunload', event => { if (formDirty) { event.preventDefault(); event.returnValue = ''; } });

let toastTimer;
function toast(message, bad) {
  const wrap = $('toast'), el = $('toastMsg');
  el.textContent = message;
  el.className = 'px-5 py-3 rounded-xl bg-panel2 border font-display font-bold text-xs uppercase tracking-widest toast-in ' + (bad ? 'border-rose-500/60 text-rose-300' : 'border-gold/50 shadow-gold text-gold');
  wrap.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => wrap.classList.add('hidden'), 2600);
}

subscribeAuth(session => {
  authSession = session;
  if (!session) {
    formDirty = false;
    pendingRemote = false;
  }
  renderAdminAuth();
});

getSession().then(session => {
  authSession = session;
  renderAdminAuth();
}).catch(error => {
  console.error('[ddam-cup] auth session check failed:', error);
  renderAdminAuth();
});

currentMatch = firstUnplayedMatch();
store.start();
subscribeSharedProfiles(profiles => {
  sharedProfiles = profiles;
  state = applySharedIdentity(state);
  writeCache(state);
  if (formDirty) renderBoard();
  else renderAll();
});
if (!isConfigured) console.warn('[ddam-cup] Supabase not configured — running local-only. Missing:', missingKeys.join(', '));
else if (!isLive()) console.warn('[ddam-cup] Supabase failed to initialise — running local-only.');
