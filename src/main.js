/* ============================================================
   DDAM CUP DOTA 2 — entry point
============================================================ */
import './style.css';
import html2canvas from 'html2canvas';
import {
  ZONES, MATCHES, NUM_MATCHES, TEAMS_PER_ZONE,
  SERIES_RESULTS, pointsForSeries, TOURNAMENT_ID,
} from './config.js';
import { createStore, blankState, MODE } from './store.js';
import {
  computeStandings, computePlayers, computeZoneStandings, completedZone,
  qualifiedTeams, seriesStats, matchTeams, matchComplete,
} from './scoring.js';
import { ICONS } from './icons.js';
import { enhanceSelects, setSelectState, syncSelect } from './select.js';
import {
  isConfigured, missingKeys, isLive,
  getSession, subscribeAuth, signIn, signOut,
} from './supabase.js';

let state = blankState();
let currentMatch = 1;
let showAllPlayers = false;
let formDirty = false;
let pendingRemote = false;
let rosterSaving = false;
let lastSelfPublish = null;
let authSession = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const num = n => (n || 0).toLocaleString('en-US');
const teamOf = pid => state.teams.find(team => team.players.some(player => player.id === pid));
const matchConfig = matchNo => MATCHES.find(match => match.id === Number(matchNo));
const firstUnplayedMatch = () => MATCHES.find(match => !matchComplete(state, match))?.id || 1;
const activeTeamsForMatch = (matchNo = currentMatch) => matchTeams(state, matchNo);
const matchTitle = (matchNo = currentMatch) => {
  const match = matchConfig(matchNo);
  return match ? match.label : 'Series';
};
const gameNumber = match => match.id;

function resultOptions(match) {
  const values = SERIES_RESULTS[match.stage === 'final' ? 'final' : 'zone'];
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
    : { '2-0': '0-2', '0-2': '2-0', '1-1': '1-1', '': '' })[series] || '';
}

/* ---------- store wiring ---------- */
const store = createStore({
  onState(next, { fromRemote }) {
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
    const group = match.stage === 'final' ? 'FINAL BO3' : `ZONE ${match.zoneId}`;
    return `<div class="clip-tag px-3 sm:px-4 py-2 border ${played ? 'border-gold/60 bg-gold/15' : 'border-line bg-ink/40'}">
      <div class="text-[9px] uppercase tracking-[.2em] font-display font-bold ${played ? 'text-gold' : 'text-slate-500'}">${group} · M${gameNumber(match)}</div>
      <div class="text-xs sm:text-sm font-bold ${played ? 'text-white' : 'text-slate-500'}">${match.format}</div>
    </div>`;
  }).join('');
}

function renderFormatRules() {
  const assigned = state.teams.filter(team => team.zoneId).length;
  const finalists = qualifiedTeams(state);
  const [zoneA, zoneB] = ZONES;
  $('formatRules').innerHTML = `
    <div class="rounded-2xl glass p-5 border border-cyan/20">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-[.3em] font-display font-black text-cyan">DOTA 2 TOURNAMENT FORMAT</div>
          <h3 class="font-display font-black text-lg sm:text-xl text-white mt-1">DDAM CUP — 6 Team BO3 Bracket</h3>
        </div>
        <span class="text-[10px] uppercase tracking-widest font-display font-black px-2 py-1 rounded border ${assigned === 6 ? 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10' : 'text-gold border-gold/40 bg-gold/10'}">${assigned}/6 teams assigned</span>
      </div>
      <div class="grid gap-3 md:grid-cols-3 mt-4 text-sm">
        <div class="rounded-xl bg-ink/50 border border-line p-3"><b class="text-gold">1. Zone stage</b><br><span class="text-slate-400">6 teams are divided into Zone ${zoneA} and Zone ${zoneB}, three teams per zone. Each zone plays a BO2 round robin.</span></div>
        <div class="rounded-xl bg-ink/50 border border-line p-3"><b class="text-cyan">2. Qualification</b><br><span class="text-slate-400">The bottom team from each zone is eliminated. The top 2 from each zone advance.</span></div>
        <div class="rounded-xl bg-ink/50 border border-line p-3"><b class="text-white">3. Final BO3 bracket</b><br><span class="text-slate-400">The qualified 4 teams play two semifinals. Winners play for 1st/2nd; losers play for 3rd/4th.</span></div>
      </div>
      <p class="text-xs text-slate-500 mt-4">Current status: ${finalists.length ? `${finalists.length} finalists qualified.` : 'Zone assignment or zone results are not complete yet.'} Zone assignment can be changed from Admin → Team Setup.</p>
    </div>`;
}

function renderZoneCards() {
  const finalists = new Set(qualifiedTeams(state).map(team => team.id));
  $('zoneCards').innerHTML = ZONES.map(zoneId => {
    const rows = computeZoneStandings(state, zoneId);
    const teams = state.teams.filter(team => team.zoneId === zoneId);
    const complete = completedZone(state, zoneId);
    return `<div class="rounded-2xl glass overflow-hidden">
      <div class="px-4 py-3 glass-2 border-b border-cyan/20 flex items-center justify-between">
        <span class="font-display font-black text-xs uppercase tracking-[.2em] text-white">Zone ${zoneId} · Round Robin</span>
        <span class="text-[9px] uppercase tracking-widest font-display font-bold ${complete ? 'text-gold' : 'text-slate-500'}">${complete ? 'Complete' : `${teams.length}/3 teams`}</span>
      </div>
      <div class="divide-y divide-line/50">
        ${rows.length ? rows.map(row => `<div class="flex items-center gap-2 px-4 py-2.5 text-sm ${finalists.has(row.team.id) ? 'bg-gold/10' : ''}">
          <span class="w-5 font-mono font-extrabold ${row.rank <= 2 ? 'text-gold' : 'text-slate-500'}">#${row.rank}</span>
          <span class="flex-1 font-semibold truncate ${finalists.has(row.team.id) ? 'text-white' : 'text-slate-300'}">${esc(row.team.name)}</span>
          ${finalists.has(row.team.id) ? `<span class="text-[8px] uppercase tracking-widest font-display font-black text-gold">FINAL</span>` : ''}
          <span class="font-mono text-xs font-extrabold text-white">${row.total}P</span>
        </div>`).join('') : `<div class="px-4 py-6 text-center text-sm text-slate-600 font-semibold">Assign 3 teams to Zone ${zoneId} in Admin</div>`}
      </div>
    </div>`;
  }).join('');
}

function renderBracket() {
  const finalists = qualifiedTeams(state);
  const ready = finalists.length === 4;
  const finalMatches = MATCHES.filter(match => match.stage === 'final');
  const matchCard = match => {
    const teams = matchTeams(state, match);
    const fallback = match.bracket === 'semi'
      ? (match.id === 7 ? ['Zone A #1', 'Zone B #2'] : ['Zone B #1', 'Zone A #2'])
      : match.bracket === 'grand' ? ['Semi 1 winner', 'Semi 2 winner'] : ['Semi 1 loser', 'Semi 2 loser'];
    const names = teams.length === 2 ? teams.map(team => esc(team.name)) : fallback;
    const complete = matchComplete(state, match);
    const status = complete ? 'Saved' : (teams.length === 2 ? 'Open' : 'Locked');
    return `<div class="bracket-match ${complete ? 'is-saved' : ''}"><div class="px-3 py-2 border-b border-gold/20 flex items-center justify-between"><span class="bracket-round-title">M${match.id} · ${esc(match.label.split(' · ')[0])}</span><span class="text-[9px] uppercase tracking-widest ${complete ? 'text-gold' : 'text-slate-500'}">${status}</span></div><span>${names[0]}</span><span>${names[1]}</span><div class="px-3 py-2 text-[9px] uppercase tracking-widest text-slate-500">${match.bracket === 'grand' ? '1st / 2nd place' : match.bracket === 'third' ? '3rd / 4th place' : 'BO3 semifinal'}</div></div>`;
  };
  $('bracket').innerHTML = `<div class="rounded-2xl glass overflow-hidden border border-gold/25">
    <div class="px-4 sm:px-5 py-3 glass-2 border-b border-gold/20 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2.5"><span class="w-1.5 h-5 rounded-full bg-gold"></span><h3 class="font-display font-black text-xs sm:text-sm uppercase tracking-[.2em] text-white">Final BO3 Elimination · 4 Teams</h3></div>
      <span class="text-[9px] uppercase tracking-widest font-display font-black ${ready ? 'text-gold' : 'text-slate-500'}">${ready ? '4 finalists ready' : 'Awaiting zone results'}</span>
    </div>
    <div class="grid gap-4 lg:grid-cols-2 p-4 sm:p-5">
      <div class="rounded-xl border border-line bg-ink/30 p-3 lg:flex lg:min-h-[390px] lg:flex-col"><div class="text-[10px] uppercase tracking-[.2em] font-display font-black text-cyan mb-3">Semifinals · BO3</div><div class="grid gap-3 sm:grid-cols-2">${finalMatches.filter(match => match.bracket === 'semi').map(matchCard).join('')}</div><div class="bracket-rail mt-7 lg:mt-auto"><div class="flex items-center gap-2 text-[9px] uppercase tracking-[.25em] font-display font-black text-slate-500"><span class="text-gold">${ICONS.trophy('ico w-4 h-4')}</span>Road to the podium</div><div class="relative grid grid-cols-4 gap-2 mt-4"><div class="absolute left-[12%] right-[12%] top-4 h-px bg-gradient-to-r from-cyan/10 via-gold/60 to-gold/10"></div><div class="relative z-10 text-center"><span class="bracket-rail-node">01</span><b>A1 vs B2</b><small>SEMIFINAL</small></div><div class="relative z-10 text-center"><span class="bracket-rail-node">02</span><b>B1 vs A2</b><small>SEMIFINAL</small></div><div class="relative z-10 text-center"><span class="bracket-rail-node is-gold">W</span><b>1st / 2nd</b><small>GRAND FINAL</small></div><div class="relative z-10 text-center"><span class="bracket-rail-node">L</span><b>3rd / 4th</b><small>PLACEMENT</small></div></div></div></div>
      <div class="rounded-xl border border-gold/30 bg-gold/5 p-3"><div class="text-[10px] uppercase tracking-[.2em] font-display font-black text-gold mb-3">Placement Finals · BO3</div><div class="grid gap-3">${finalMatches.filter(match => match.bracket !== 'semi').map(matchCard).join('')}</div></div>
    </div>
    <p class="px-4 pb-4 text-[11px] text-slate-500">Zone A #1 plays Zone B #2. Zone B #1 plays Zone A #2. Semifinal winners play for 1st/2nd; semifinal losers play for 3rd/4th.</p>
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
        <span class="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-ink/70 border border-line text-cyan">${esc(row.team.tag)}</span>
        <span class="font-display font-bold text-sm sm:text-base whitespace-nowrap ${row.rank === 1 && active ? 'champ-name' : 'text-white'}">${esc(row.team.name)}</span>
        <span class="text-[9px] uppercase tracking-widest font-bold ${row.team.zoneId ? 'text-slate-500' : 'text-rose-300'}">${row.team.zoneId ? `Zone ${esc(row.team.zoneId)}` : 'Unassigned'}</span>
        ${row.qualified ? `<span class="text-[8px] uppercase tracking-widest font-display font-black px-1.5 py-0.5 rounded bg-gold/15 text-gold border border-gold/30">Qualified</span>` : ''}
      </div></td>
      <td class="py-3.5 px-2 text-center font-mono font-bold text-slate-300">${row.series}</td>
      <td class="py-3.5 px-2 text-center font-mono font-bold text-slate-300">${row.wins}-${row.draws}-${row.losses}</td>
      <td class="py-3.5 px-2 text-center font-mono font-bold text-cyan">${row.gamesWon}</td>
      <td class="py-3.5 px-2 text-center font-mono font-bold text-gold">${row.zonePoints}</td>
      <td class="py-3.5 px-2 text-center font-mono font-bold text-cyan">${row.finalPoints}</td>
      <td class="py-3.5 pr-4 pl-2 text-right font-display font-black text-lg sm:text-xl ${row.rank === 1 && active ? 'text-gold' : 'text-white'}">${row.total}</td>
    </tr>`;
  }).join('');
  $('genAt').textContent = new Date().toLocaleString();
}

function renderRosters() {
  const rows = computePlayers(state);
  const list = showAllPlayers ? rows : rows.slice(0, 10);
  const assigned = state.teams.filter(team => team.zoneId).length;
  const champion = matchComplete(state, 9)
    ? computeStandings(state).find(row => row.rank === 1 && row.qualified)
    : null;
  $('mvpCard').innerHTML = champion
    ? `<div class="mvp-card h-full rounded-2xl border border-gold/60 bg-gradient-to-br from-gold/20 via-panel/85 to-ink/90 backdrop-blur-md p-5 flex flex-col justify-center text-center">
        <img src="/ddam-logo.svg" alt="DDAM CUP" class="champion-logo mx-auto mb-3">
        <div class="text-[10px] uppercase tracking-[.35em] font-display font-black text-gold">CHAMPION · 1ST PLACE</div>
        <div class="font-display font-black text-2xl sm:text-3xl mt-2 text-white champ-name">${esc(champion.team.name)}</div>
        <div class="text-sm text-slate-300 mt-1"><span class="font-mono text-cyan">${esc(champion.team.tag)}</span> · Grand Final winner</div>
        <div class="mt-4 inline-flex self-center items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] uppercase tracking-[.2em] font-display font-black text-gold">${champion.finalPoints} final points</div>
      </div>`
    : `<div class="h-full rounded-2xl border border-cyan/40 bg-gradient-to-br from-cyan/10 via-panel/80 to-ink/90 backdrop-blur-md p-5 flex flex-col justify-center text-center">
        <img src="/ddam-logo.svg" alt="DDAM CUP" class="champion-logo mx-auto mb-2 opacity-80">
        <div class="text-[10px] uppercase tracking-[.3em] font-display font-black text-cyan">DOTA 2 CUP STATUS</div>
        <div class="font-display font-black text-xl sm:text-2xl mt-2 text-white">${state.teams.length} Teams</div>
        <div class="text-sm text-slate-400 mt-1">${assigned}/6 zone assignments complete</div>
        <div class="grid grid-cols-2 gap-2 mt-4">
          <div class="rounded-xl bg-ink/70 border border-line py-2.5"><div class="font-display font-black text-2xl text-gold">3×2</div><div class="text-[9px] uppercase tracking-[.2em] font-bold text-slate-500">Each zone</div></div>
          <div class="rounded-xl bg-ink/70 border border-line py-2.5"><div class="font-display font-black text-2xl text-cyan">4</div><div class="text-[9px] uppercase tracking-[.2em] font-bold text-slate-500">Final matches</div></div>
        </div>
      </div>`;
  $('mvpTable').innerHTML = list.map(row => `<tr class="hover:bg-white/[.04] transition">
    <td class="py-2.5 pl-4 pr-2"><span class="font-display font-black text-xs text-slate-500">${row.rank}</span></td>
    <td class="py-2.5 px-2"><span class="font-display font-bold text-sm text-white">${esc(row.player.name)}</span></td>
    <td class="py-2.5 px-2"><span class="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-ink/70 border border-line text-cyan">${esc(row.team.tag)}</span><span class="text-xs font-semibold text-slate-400 ml-1 hidden sm:inline">${esc(row.team.name)}</span></td>
    <td class="py-2.5 px-2 text-center font-mono font-bold ${row.zoneId ? 'text-gold' : 'text-slate-600'}">${row.zoneId ? `Zone ${esc(row.zoneId)}` : '—'}</td>
  </tr>`).join('');
  $('btnMore').textContent = showAllPlayers ? 'Show top 10' : `Show all ${rows.length}`;
}

function renderMatchCards() {
  $('matchCards').innerHTML = MATCHES.map(match => {
    const teams = activeTeamsForMatch(match.id);
    if (!teams.length) {
      const text = match.stage === 'final'
        ? (match.bracket === 'semi' ? 'Finish both zone round robins first' : 'Finish both semifinals first')
        : `Assign 3 teams to Zone ${match.zoneId}`;
      return `<div class="rounded-xl border border-dashed border-line bg-ink/40 p-5 text-center"><div class="font-display font-bold text-xs uppercase tracking-[.2em] text-slate-500">${match.label}</div><div class="text-sm text-slate-600 mt-2 font-semibold">${text}</div></div>`;
    }
    if (!matchComplete(state, match)) {
      return `<div class="rounded-xl border border-dashed border-line bg-ink/40 p-5 text-center"><div class="font-display font-bold text-xs uppercase tracking-[.2em] text-slate-500">${match.label}</div><div class="text-xs text-slate-600 mt-1 font-semibold">${teams.length} teams · waiting for result</div></div>`;
    }
    const list = teams.map(team => ({ team, stats: seriesStats(state, match.id, team.id) })).filter(row => row.stats).sort((a, b) => b.stats.points - a.stats.points || b.stats.wins - a.stats.wins);
    return `<div class="rounded-xl glass overflow-hidden"><div class="px-4 py-3 glass-2 border-b border-gold/20 flex items-center justify-between"><span class="font-display font-bold text-xs uppercase tracking-[.2em] text-white">${match.label}</span><span class="font-display font-bold text-xs uppercase tracking-[.2em] text-gold">${match.format}</span></div><div class="divide-y divide-line/50">${list.map(row => `<div class="flex items-center gap-2 px-4 py-2.5 text-sm"><span class="w-6 font-mono font-extrabold text-slate-500">${row.stats.series}</span><span class="flex-1 font-semibold truncate text-slate-200">${esc(row.team.name)}</span><span class="font-mono text-xs font-extrabold text-cyan">${row.stats.points}P</span></div>`).join('')}</div></div>`;
  }).join('');
}

function renderSavedAt() {
  $('savedAt').textContent = state.updated ? 'Last updated: ' + new Date(state.updated).toLocaleString() : 'No results saved yet';
}

/* ---------- admin ---------- */
function renderMatchTabs() {
  const zoneTabs = ZONES.map(zoneId => `<div class="w-full mt-1 first:mt-0"><div class="text-[10px] uppercase tracking-[.2em] font-display font-black text-cyan mb-2">Zone ${zoneId} · Round Robin</div><div class="flex flex-wrap gap-2">${MATCHES.filter(match => match.stage === 'zone' && match.zoneId === zoneId).map(renderMatchTab).join('')}</div></div>`).join('');
  const finalTabs = `<div class="w-full mt-3 pt-3 border-t border-line/70"><div class="text-[10px] uppercase tracking-[.2em] font-display font-black text-gold mb-2">Final BO3 Bracket · 4 teams · 4 matches</div><div class="flex flex-wrap gap-2">${MATCHES.filter(match => match.stage === 'final').map(renderMatchTab).join('')}</div></div>`;
  $('matchTabs').innerHTML = zoneTabs + finalTabs;
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

function renderTeamCards() {
  const match = matchConfig(currentMatch);
  const teams = activeTeamsForMatch();
  const result = state.results[currentMatch] || {};
  if (!teams.length) {
    const message = match.stage === 'final'
      ? (match.bracket === 'semi'
        ? 'Complete both zone round robins first. The top 2 from each zone will appear here.'
        : 'Complete both semifinals first. Their winners/losers will appear here.')
      : `Assign exactly 3 teams to Zone ${match.zoneId} from the Team Setup panel first.`;
    $('teamCards').innerHTML = `<div class="xl:col-span-2 rounded-2xl border border-dashed border-gold/40 bg-gold/5 p-6 text-center"><div class="font-display font-black text-sm uppercase tracking-[.2em] text-gold">${match.stage === 'final' ? 'Final round is locked' : `Zone ${match.zoneId} is not ready`}</div><div class="text-sm text-slate-300 mt-2 font-semibold">${message}</div></div>`;
    $('rankWarn').textContent = '';
    return;
  }
  $('teamCards').innerHTML = teams.map(team => {
    const current = result[team.id]?.series || '';
    const players = team.players.map(player => `<div class="grid grid-cols-[1fr] gap-2 items-center" data-player="${player.id}"><input type="text" value="${esc(player.name)}" maxlength="24" placeholder="Player name" class="p-name bg-ink/60 border border-line rounded-lg px-2.5 py-2 text-sm font-bold text-white focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold min-w-0"></div>`).join('');
    return `<div class="team-card rounded-2xl glass overflow-hidden" data-team="${team.id}"><div class="px-4 py-3 glass-2 border-b border-gold/20 flex items-center gap-2.5 flex-wrap"><span class="tc-tag font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-ink/70 border border-line text-cyan">${esc(team.tag)}</span><span class="tc-name font-display font-bold text-sm text-white">${esc(team.name)}</span><span class="tc-zone text-[9px] uppercase tracking-widest font-bold text-gold">Zone ${esc(team.zoneId)}</span><div class="sel ml-auto"><select class="t-series select-esports" aria-label="BO result for ${esc(team.name)}"><option value="">Result —</option>${resultOptions(match)}</select></div></div><div class="px-4 pt-3 pb-2 text-[9px] uppercase tracking-[.18em] font-display font-bold text-slate-500">Roster · 5 players</div><div class="px-4 pb-3 space-y-2">${players}</div><div class="px-4 py-2.5 bg-ink/60 border-t border-line/70 flex items-center gap-4 text-xs"><span class="uppercase tracking-[.15em] font-display font-bold text-slate-500">Series result</span><span class="t-series-label font-mono font-extrabold text-cyan text-base">${current || '—'}</span><span class="uppercase tracking-[.15em] font-display font-bold text-slate-500 ml-auto">Points</span><span class="t-pts font-display font-black text-white text-base">${current ? `${previewResult(match, current).points}` : '—'}</span></div></div>`;
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
  document.querySelectorAll('#teamCards .team-card').forEach(card => {
    const team = state.teams.find(item => item.id === card.dataset.team);
    if (!team) return;
    card.querySelector('.tc-tag').textContent = team.tag;
    card.querySelector('.tc-name').textContent = team.name;
    card.querySelector('.tc-zone').textContent = `Zone ${team.zoneId || '—'}`;
  });
}

/* ---------- roster saves ---------- */
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
  $('teamEditor').innerHTML = state.teams.map((team, index) => `<div class="flex items-center gap-2"><select class="zone-select select-esports w-24" data-i="${index}" aria-label="Zone for ${esc(team.name)}"><option value="">No zone</option>${ZONES.map(zone => `<option value="${zone}" ${team.zoneId === zone ? 'selected' : ''}>Zone ${zone}</option>`).join('')}</select><input value="${esc(team.tag)}" data-i="${index}" data-f="tag" maxlength="4" class="tin w-14 bg-ink/60 border border-line rounded px-2 py-1.5 text-[11px] font-mono font-extrabold text-cyan uppercase focus:outline-none focus:border-cyan"><input value="${esc(team.name)}" data-i="${index}" data-f="name" maxlength="28" class="tin flex-1 min-w-0 bg-ink/60 border border-line rounded px-2 py-1.5 text-sm font-bold text-white focus:outline-none focus:border-gold"></div>`).join('');
  document.querySelectorAll('.zone-select').forEach(select => {
    select.addEventListener('change', async () => {
      const index = +select.dataset.i;
      if (formDirty && !confirm('You have unsaved series results. Change the zone assignment anyway?')) { select.value = state.teams[index].zoneId || ''; return; }
      const requestedZone = select.value || null;
      let blocked = false;
      const result = await saveRoster(next => {
        if (requestedZone && next.teams.filter((team, teamIndex) => teamIndex !== index && team.zoneId === requestedZone).length >= TEAMS_PER_ZONE) {
          blocked = true;
          return false;
        }
        next.teams[index].zoneId = requestedZone;
      }, 'Zone assignment saved');
      if (result) { formDirty = false; renderAdmin(); }
      else if (blocked) {
        select.value = state.teams[index].zoneId || '';
        toast(`Zone ${requestedZone} already has ${TEAMS_PER_ZONE} teams. Move one team first.`, true);
      }
    });
  });
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
  document.querySelectorAll('#teamEditor .zone-select').forEach(select => {
    const team = state.teams[+select.dataset.i];
    if (team && document.activeElement !== select) select.value = team.zoneId || '';
  });
}

function renderRulesLegend() {
  $('ptsLegend').innerHTML = `<li class="flex justify-between items-center"><span class="text-gold font-bold">Zone BO2 2–0 Win</span><span class="font-mono font-extrabold text-white">3 pts</span></li><li class="flex justify-between items-center"><span class="text-slate-300">Zone BO2 1–1 Draw</span><span class="font-mono font-extrabold text-white">1 pt</span></li><li class="flex justify-between items-center"><span class="text-slate-300">Zone BO2 0–2 Loss</span><span class="font-mono font-extrabold text-white">0 pts</span></li><li class="flex justify-between items-center pt-2 mt-2 border-t border-line text-cyan"><span>Zone stage</span><span class="font-mono font-extrabold">6 matches</span></li><li class="flex justify-between items-center text-gold"><span>Final BO3 bracket</span><span class="font-mono font-extrabold">4 matches</span></li><li class="flex justify-between items-center text-gold"><span>Placement</span><span class="font-mono font-extrabold">1st–4th</span></li>`;
}

function renderBoard() { renderMapChips(); renderFormatRules(); renderZoneCards(); renderBracket(); renderStandings(); renderRosters(); renderMatchCards(); renderSavedAt(); }
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

function renderAdmin() { renderAdminAuth(); renderMatchTabs(); renderTeamCards(); renderRemoteNotice(); }
function renderAll() { renderSectionIcons(); renderBoard(); renderAdmin(); renderTeamEditor(); renderRulesLegend(); renderSyncBadge(); }

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
    entry[card.dataset.team] = { series };
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

$('btnClearAll').onclick = () => clearAllResults(`Clear every DOTA 2 series result across all ${NUM_MATCHES} games?\n\nTeam names, tags, zone assignments and player names are kept.`);
$('btnReset').onclick = () => clearAllResults(`Reset every DOTA 2 series result across all ${NUM_MATCHES} games?\n\nTeam names, tags, zone assignments and player names are kept.`);

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

$('btnPng').onclick = async () => {
  const button = $('btnPng'), old = button.textContent;
  button.textContent = 'Rendering…'; button.disabled = true;
  document.body.classList.add('exporting');
  try {
    const canvas = await html2canvas($('capture'), { backgroundColor: '#080808', scale: Math.min(3, (window.devicePixelRatio || 1) * 2), useCORS: true, logging: false });
    const link = document.createElement('a');
    link.download = `ddam-cup-dota2-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('✓ PNG downloaded');
  } catch (error) { console.error(error); toast('PNG export failed', true); }
  document.body.classList.remove('exporting');
  button.textContent = old; button.disabled = false;
};

$('btnCopy').onclick = async () => {
  const teams = computeStandings(state), players = computePlayers(state).slice(0, 10);
  const text = ['🏆 DDAM CUP — DOTA 2', '', 'FORMAT: 2 ZONES × 3 TEAMS · ZONE BO2 → A1 vs B2 / B1 vs A2 → BO3 PLACEMENT FINALS', '']
    .concat(teams.map(row => `${row.rank}. ${row.team.name} [${row.team.tag}] — ${row.total} pts (${row.wins}-${row.draws}-${row.losses}, ${row.team.zoneId ? `Zone ${row.team.zoneId}` : 'Unassigned'}${row.qualified ? ', finalist' : ''})`))
    .concat(['', 'PLAYERS', ''])
    .concat(players.map(row => `${row.player.name} — ${row.team.name}${row.zoneId ? ` [Zone ${row.zoneId}]` : ''}`))
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
if (!isConfigured) console.warn('[ddam-cup] Supabase not configured — running local-only. Missing:', missingKeys.join(', '));
else if (!isLive()) console.warn('[ddam-cup] Supabase failed to initialise — running local-only.');
