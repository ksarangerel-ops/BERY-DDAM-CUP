import './additional-games.css';
import { createClient } from '@supabase/supabase-js';

const TOURNAMENT_ID = 'ddam-cup-additional-games-v1';
const CACHE_KEY = `ddam-cup-cache:${TOURNAMENT_ID}`;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
const client = isConfigured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const GAME_DEFS = {
  mlbb: { label: 'Mobile Legends', short: 'MLBB', format: '2 groups · BO2 → BO3 playoff', rules: './mobile-legends.html', logo: '/game-logos/mlbb-official.jpg', logoClass: 'wordmark', art: '/game-backdrops/mlbb-game.jpg' },
  mecha: { label: 'Meccha Chameleon', short: 'MECHA', format: '2 lobbies · 6 rounds/lobby · 4 players/team', rules: './games.html#mecha', logo: '/game-logos/mecha.webp', art: '/game-backdrops/mecha-chameleon-hero.jpg' },
  stumble: { label: 'Stumble Guys', short: 'STUMBLE', format: '30 players · Grand Prix', rules: './games.html#stumble', logo: '/game-logos/stumble.svg', logoClass: 'wordmark light', art: '/game-backdrops/stumble-game.png' },
  pubg: { label: 'PUBG Mobile', short: 'PUBG', format: '3 maps · placement + kills', rules: './games.html#pubg', logo: '/game-logos/pubg-mobile.svg', logoClass: 'wordmark light', art: '/game-backdrops/pubg-game.jpg' },
  tekken: { label: 'Tekken 7', short: 'TEKKEN 7', format: '18 players · BO3 / BO5 playoff', rules: './games.html#tekken', logo: '/game-logos/tekken7.png', logoClass: 'wordmark light', art: '/game-backdrops/tekken7.jpg' },
  tetris: { label: 'Tetris', short: 'TETRIS', format: '3 games · 2 zones · final 4', rules: './games.html#tetris', logo: '/game-logos/tetris-logo.jpg', logoClass: 'wordmark tetris-logo', art: '/game-backdrops/tetris-gamer.webp' },
};
const GAME_IDS = Object.keys(GAME_DEFS);
const REQUIRED_GAME_IDS = GAME_IDS.filter(id => id !== 'tetris');
const TEAM_NAMES = ['Team Gegeenee', 'Team Ganaa', 'Team Garidaa', 'Team Amaraa', 'Team Bery', 'Team Bagaa'];
const TAGS = ['ALP', 'BRV', 'CHR', 'DLT', 'ECH', 'FOX'];
const TEAM_NAME_VERSION = 'ganaa-team-names-v1';
const ML_SERIES = ['', '2-0', '1-1', '0-2'];
const BO3_SERIES = ['', '2-0', '2-1', '1-2', '0-2'];
const MAP_NAMES = ['Sanhok', 'Livik', 'Erangel'];

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const clone = value => structuredClone(value);
const parts = value => { const [wins, losses] = String(value || '0-0').split('-').map(Number); return { wins: Number.isFinite(wins) ? wins : 0, losses: Number.isFinite(losses) ? losses : 0 }; };
const seriesOptions = (values, selected) => values.map(value => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value || 'Not played'}</option>`).join('');
const teamById = (game, id) => game.teams.find(team => team.id === id);

function groupMatches() {
  return [
    { id: 'A-1', group: 'A', a: 'a1', b: 'a2' }, { id: 'A-2', group: 'A', a: 'a1', b: 'a3' }, { id: 'A-3', group: 'A', a: 'a2', b: 'a3' },
    { id: 'B-1', group: 'B', a: 'b1', b: 'b2' }, { id: 'B-2', group: 'B', a: 'b1', b: 'b3' }, { id: 'B-3', group: 'B', a: 'b2', b: 'b3' },
  ];
}

function defaultState() {
  const mlTeams = [
    ['a1', 'A', 0], ['a2', 'A', 1], ['a3', 'A', 2], ['b1', 'B', 3], ['b2', 'B', 4], ['b3', 'B', 5],
  ].map(([id, group, index]) => ({ id, group, name: TEAM_NAMES[index], tag: TAGS[index] }));
  const makeTeams = () => TEAM_NAMES.map((name, index) => ({ id: `t${index + 1}`, name, tag: TAGS[index] }));
  const makePlayers = (count, perTeam, prefix) => makeTeams().flatMap((team, teamIndex) => Array.from({ length: perTeam }, (_, playerIndex) => ({
    id: `${prefix}${teamIndex + 1}p${playerIndex + 1}`, teamId: team.id, name: `${team.tag} Player ${playerIndex + 1}`, points: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0,
  }))).slice(0, count);
  const tetrisTeams = makeTeams();
  const tetrisGames = Array.from({ length: 3 }, (_, index) => ({
    id: `game${index + 1}`,
    label: `Game ${index + 1}`,
    rows: tetrisTeams.map((team, teamIndex) => ({ teamId: team.id, zone: teamIndex < 3 ? 'A' : 'B', wins: 0, place: '' })),
  }));
  return {
    version: 1,
    teamNameVersion: TEAM_NAME_VERSION,
    updated: null,
    games: {
      mlbb: { teams: mlTeams, groupResults: groupMatches().map(match => ({ ...match, series: '' })), playoff: { sf1: '', sf2: '', final: '', third: '' } },
      mecha: { teams: makeTeams().map(team => ({ ...team, hider: 0, topMissedSpot: 0, seekersCaught: 0, cleanSweeps: 0 })) },
      stumble: { teams: makeTeams().map(team => ({ ...team, players: Array.from({ length: 5 }, (_, index) => ({ id: `${team.id}p${index + 1}`, name: `${team.tag} Player ${index + 1}`, points: 0 })) })) },
      pubg: { teams: makeTeams().map(team => ({ ...team, maps: MAP_NAMES.map(() => ({ placement: '', kills: '' })) })) },
      tekken: { teams: makeTeams(), players: makePlayers(18, 3, 'k') },
      tetris: { teams: tetrisTeams, games: tetrisGames },
    },
  };
}

function normalizeState(value) {
  if (!usable(value)) return null;
  if (!value.games.tetris?.teams || !Array.isArray(value.games.tetris.games) || value.games.tetris.games.length !== 3) {
    value.games.tetris = defaultState().games.tetris;
    const referenceTeams = value.games.tekken?.teams || value.games.mecha?.teams;
    if (Array.isArray(referenceTeams) && referenceTeams.length === 6) {
      value.games.tetris.teams = value.games.tetris.teams.map((team, index) => ({ ...team, name: referenceTeams[index]?.name || team.name, tag: referenceTeams[index]?.tag || team.tag }));
    }
  }
  if (!Array.isArray(value.games.tekken.teams) || value.games.tekken.teams.length !== 6) {
    value.games.tekken.teams = TEAM_NAMES.map((name, index) => ({ id: `t${index + 1}`, name, tag: TAGS[index] }));
  }
  value.games.mecha?.teams?.forEach(team => {
    if (team.hider == null) team.hider = 0;
    if (team.topMissedSpot == null) team.topMissedSpot = 0;
    if (team.seekersCaught == null) team.seekersCaught = Math.round(num(team.seeker) / 0.33);
    if (team.cleanSweeps == null) team.cleanSweeps = Math.round(num(team.bonus) / 2);
  });
  if (value.teamNameVersion !== TEAM_NAME_VERSION) {
    ['mecha', 'stumble', 'pubg', 'tekken', 'tetris'].forEach(id => {
      value.games[id]?.teams?.forEach((team, index) => { team.name = TEAM_NAMES[index] || team.name; });
    });
    value.games.mlbb?.teams?.forEach((team, index) => { team.name = TEAM_NAMES[index] || team.name; });
    value.teamNameVersion = TEAM_NAME_VERSION;
  }
  return value;
}
function usable(value) { return !!value && value.games && REQUIRED_GAME_IDS.every(id => value.games[id]); }
function readCache() { try { const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return normalizeState(value); } catch { return null; } }
function writeCache(value) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch { /* private mode */ } }

let state = readCache() || defaultState();
let activeGame = new URLSearchParams(location.search).get('game') || 'mlbb';
if (!GAME_DEFS[activeGame]) activeGame = 'mlbb';
let authSession = null;
let connection = false;
let channel = null;
let toastTimer = null;

function setMode(mode) {
  const badge = $('syncBadge');
  badge.className = `ag-sync ${mode === 'live' ? 'live' : mode === 'syncing' ? 'syncing' : ''}`;
  badge.textContent = mode === 'live' ? 'LIVE' : mode === 'syncing' ? 'SYNC' : 'LOCAL';
  badge.title = mode === 'live' ? `Supabase live sync · ${TOURNAMENT_ID}` : isConfigured ? 'Supabase connection is unavailable' : 'Missing Supabase environment variables';
}

async function loadRemote() {
  if (!client) return;
  const { data, error } = await client.from('tournaments').select('state').eq('id', TOURNAMENT_ID).maybeSingle();
  if (error) throw error;
  const remoteState = normalizeState(data?.state);
  if (remoteState) { state = remoteState; writeCache(state); render(); }
}

function startRealtime() {
  setMode(client ? 'syncing' : 'local');
  if (!client) return;
  client.auth.getSession().then(({ data }) => { authSession = data.session; renderAdmin(); }).catch(() => {});
  client.auth.onAuthStateChange((_event, session) => { authSession = session; renderAdmin(); });
  channel = client.channel(`tournament:${TOURNAMENT_ID}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${TOURNAMENT_ID}` }, payload => {
    if (payload.eventType !== 'DELETE' && usable(payload.new?.state)) { state = payload.new.state; writeCache(state); render(); }
  }).subscribe(status => { if (status === 'SUBSCRIBED') { connection = true; setMode('live'); } if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) { connection = false; setMode('syncing'); } });
  loadRemote().catch(error => { console.error('[additional-games] read failed', error); setMode('syncing'); });
}

async function signIn(email, password) { if (!client) throw new Error('Supabase is not configured'); const { data, error } = await client.auth.signInWithPassword({ email, password }); if (error) throw error; authSession = data.session; }
async function signOut() { if (client) { const { error } = await client.auth.signOut(); if (error) throw error; } authSession = null; }
async function publish(next) {
  state = { ...next, updated: new Date().toISOString() }; writeCache(state); render();
  if (!client) return { ok: true, local: true };
  const { error } = await client.from('tournaments').upsert({ id: TOURNAMENT_ID, state, updated: state.updated }, { onConflict: 'id' });
  if (error) { console.error('[additional-games] publish failed', error); return { ok: false, local: false, error }; }
  return { ok: true, local: false };
}

function showToast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800); }
function teamName(game, id, fallback = 'Waiting') { return teamById(game, id)?.name || fallback; }
function scoreForBo2(series) { const result = parts(series); return result.wins === result.losses ? [1, 1] : result.wins > result.losses ? [3, 0] : [0, 3]; }
function mechaStats(team) {
  const hider = Math.round(num(team.hider) * 10) / 10;
  const topMissedSpot = num(team.topMissedSpot);
  const seekersCaught = team.seekersCaught == null ? Math.round(num(team.seeker) / 0.33) : num(team.seekersCaught);
  const cleanSweeps = team.cleanSweeps == null ? Math.round(num(team.bonus) / 2) : num(team.cleanSweeps);
  const seeker = Math.round(seekersCaught * 0.33 * 10) / 10;
  const bonus = cleanSweeps * 2;
  return { hider, topMissedSpot, seekersCaught, cleanSweeps, seeker, bonus, points: Math.round((hider + seeker + bonus) * 10) / 10 };
}

function mlRows(game, group) {
  const rows = game.teams.filter(team => team.group === group).map(team => ({ team, points: 0, gamesWon: 0, gamesLost: 0, played: 0 }));
  game.groupResults.filter(match => match.group === group).forEach(match => {
    const result = parts(match.series); if (!match.series) return;
    const a = rows.find(row => row.team.id === match.a); const b = rows.find(row => row.team.id === match.b); if (!a || !b) return;
    const points = scoreForBo2(match.series); a.points += points[0]; b.points += points[1]; a.gamesWon += result.wins; a.gamesLost += result.losses; b.gamesWon += result.losses; b.gamesLost += result.wins; a.played += 1; b.played += 1;
  });
  return rows.sort((a, b) => b.points - a.points || b.gamesWon - a.gamesWon || a.gamesLost - b.gamesLost || a.team.name.localeCompare(b.team.name));
}
function mlPlayoff(game) {
  const a = mlRows(game, 'A'); const b = mlRows(game, 'B');
  const sf1 = { a: a[0]?.team, b: b[1]?.team, series: game.playoff.sf1, label: 'Semifinal 1 · A1 vs B2' };
  const sf2 = { a: b[0]?.team, b: a[1]?.team, series: game.playoff.sf2, label: 'Semifinal 2 · B1 vs A2' };
  const winner = match => { const result = parts(match.series); return !match.series || result.wins === result.losses ? null : result.wins > result.losses ? match.a : match.b; };
  const loser = match => { const win = winner(match); return !win ? null : win.id === match.a?.id ? match.b : match.a; };
  return { sf1, sf2, final: { a: winner(sf1), b: winner(sf2), series: game.playoff.final, label: 'Grand Final · 1st / 2nd' }, third: { a: loser(sf1), b: loser(sf2), series: game.playoff.third, label: '3rd Place Final · 3rd / 4th' } };
}

function rankingTable(rows, columns) {
  return `<div class="ag-table-wrap"><table class="ag-table"><thead><tr><th>#</th><th>Team / Player</th>${columns.map(column => `<th class="num">${column.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row, index) => `<tr><td><span class="ag-rank ${index < 3 ? 'top' : ''}">${index + 1}</span></td><td><span class="ag-team">${esc(row.name)}</span>${row.sub ? `<span class="ag-sub">${esc(row.sub)}</span>` : ''}</td>${columns.map(column => `<td class="num ${column.score ? 'score' : ''}">${esc(row[column.key] ?? 0)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function boardHead(def, subtitle, rules) { return `<div class="ag-card-head"><div class="ag-title-lockup"><div class="ag-game-logo ${def.logoClass || ''}"><img src="${def.logo}" alt="${esc(def.label)} logo"></div><div><h2>${def.label}</h2><p>${subtitle}</p></div></div><a class="ag-pill" href="${rules}">Official rules ↗</a></div>`; }

function dashSectionHead(eyebrow, title, action = '') { return `<div class="ag-dash-head"><div><span class="ag-dash-eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div>${action ? `<span class="ag-dash-action">${esc(action)}</span>` : ''}</div>`; }
function dashPanel(eyebrow, title, body, className = '', action = '') { return `<section class="ag-dash-panel ${className}">${dashSectionHead(eyebrow, title, action)}${body}</section>`; }
function dashAvatar(name, index = 0) { return `<span class="ag-dash-avatar avatar-${index % 6}" aria-hidden="true">${esc(String(name || '?').trim().charAt(0).toUpperCase())}</span>`; }
function dashRankList(rows, options = {}) {
  const cutoff = options.cutoff ?? 2;
  return `<div class="ag-dash-rank-list">${rows.map((row, index) => {
    const state = options.state ? options.state(row, index) : index < cutoff ? 'UPPER' : index === cutoff ? 'LOWER' : 'OUT';
    const value = options.value ? options.value(row) : row.points ?? row.score ?? 0;
    return `<div class="ag-dash-rank-row ${state === 'OUT' ? 'is-out' : ''}"><span class="ag-dash-place">${index + 1}</span>${dashAvatar(row.name, index)}<span class="ag-dash-name"><b>${esc(row.name)}</b><small>${esc(row.sub || '')}</small></span><strong>${esc(value)}</strong><em class="ag-dash-state state-${state.toLowerCase()}">${state}</em></div>`;
  }).join('')}</div>`;
}
function dashGroup(label, rows, options = {}) { return `<article class="ag-dash-group"><div class="ag-dash-group-head"><span class="ag-dash-group-letter">${esc(label)}</span><b>${esc(options.title || 'GROUP')}</b><span>${esc(options.meta || `${rows.length}/${rows.length}`)}</span></div>${dashRankList(rows, options)}</article>`; }
function dashMatchList(items, empty = 'No matches waiting.') {
  return items.length ? `<div class="ag-dash-match-list">${items.map(item => `<div class="ag-dash-match"><span class="ag-dash-match-code">${esc(item.code || 'NEXT')}</span><span class="ag-dash-match-team">${esc(item.left)}</span><b>${item.score ? esc(item.score) : 'VS'}</b><span class="ag-dash-match-team right">${esc(item.right)}</span><span class="ag-dash-match-meta">${esc(item.meta || '')}</span></div>`).join('')}</div>` : `<div class="ag-dash-empty">${esc(empty)}</div>`;
}
function dashPicked(rows, value) { return `<div class="ag-dash-picked">${rows.slice(0, 4).map((row, index) => `<div><span>${index + 1}</span>${dashAvatar(row.name, index)}<b>${esc(row.name)}</b><strong>${esc(value(row))}</strong></div>`).join('')}</div>`; }
function dashboardBoard(def, subtitle, rules, main, side, note) {
  return `${boardHead(def, subtitle, rules)}<div class="ag-dashboard-grid"><div class="ag-dashboard-main">${dashPanel('ON STAGE', 'NOW PLAYING', '<div class="ag-dash-empty"><span class="ag-dash-controller">⌁</span>No match on stage right now. Next fighters, get ready!</div>', 'ag-dash-panel--live')}${main}<p class="ag-dash-note">${note}</p></div><aside class="ag-dashboard-side">${side}</aside></div>`;
}

function renderMlbb(game) {
  const a = mlRows(game, 'A'); const b = mlRows(game, 'B'); const playoff = mlPlayoff(game); const played = game.groupResults.filter(match => match.series).length; const finalsPlayed = Object.values(game.playoff).filter(Boolean).length;
  const table = rows => rankingTable(rows.map(row => ({ name: row.team.name, sub: `${row.team.tag} · ${row.played}/2 series`, points: `${row.points} pts`, games: `${row.gamesWon}-${row.gamesLost}` })), [{ key: 'points', label: 'Points', score: true }, { key: 'games', label: 'Game W-L' }]);
  const match = item => `<div class="ag-match ${item.label.includes('Final') ? 'final' : ''}"><b>${esc(item.label)}</b><span>${esc(item.a?.name || 'Qualified team')}</span><span>${esc(item.b?.name || 'Waiting')}</span><small>${item.series ? `Saved · ${item.series}` : 'Open · BO3'}</small></div>`;
  return `${boardHead(GAME_DEFS.mlbb, '6 баг · A/B хэсэг · BO2 round-robin · 4 баг playoff', GAME_DEFS.mlbb.rules)}<div class="ag-pad"><div class="ag-status-grid"><div class="ag-status"><b>${played}/6</b><span>Group BO2 series</span></div><div class="ag-status"><b>${played === 6 ? '4' : '0'}/4</b><span>Qualified teams</span></div><div class="ag-status"><b>${finalsPlayed}/4</b><span>Playoff BO3</span></div></div><div class="ag-grid two" style="margin-top:16px"><div class="ag-form-section"><h3>Group A · top 2 advance</h3>${table(a)}</div><div class="ag-form-section"><h3>Group B · top 2 advance</h3>${table(b)}</div></div><div class="ag-form-section" style="margin-top:12px"><h3>Playoff bracket</h3><div class="ag-bracket">${match(playoff.sf1)}${match(playoff.sf2)}${match(playoff.final)}${match(playoff.third)}</div></div><p class="ag-help" style="margin:14px 0 0">Tie-break: head-to-head → нийт хожсон game → нийт хожигдсон game бага → нэмэлт BO1.</p></div>`;
}

function renderMecha(game) {
  const rows = game.teams.map(team => { const score = mechaStats(team); return { name: team.name, sub: team.tag, hider: score.hider, seeker: score.seeker, bonus: score.bonus, points: score.points }; }).sort((a, b) => b.points - a.points || b.hider - a.hider);
  return `${boardHead(GAME_DEFS.mecha, '6 баг · 2 lobby · 4 тоглогч/баг · lobby тус бүр 6 round', GAME_DEFS.mecha.rules)}<div class="ag-pad"><div class="ag-status-grid"><div class="ag-status"><b>12</b><span>Total rounds</span></div><div class="ag-status"><b>2 + 2</b><span>Women / men per team</span></div><div class="ag-status"><b>${rows.reduce((sum, row) => sum + row.points, 0).toFixed(1)}</b><span>Total points</span></div></div><div class="ag-form-section" style="margin-top:16px"><h3>Team ranking</h3>${rankingTable(rows, [{ key: 'hider', label: 'Hider pts' }, { key: 'seeker', label: 'Seeker pts' }, { key: 'bonus', label: 'Clean-sweep bonus' }, { key: 'points', label: 'Total', score: true }])}</div><p class="ag-help" style="margin:14px 0 0">Hider оноо Missed Spot Ranking-оос хувьчилна. Seeker оноо = барьсан Hider × 0.33; бүх 10 Hider баривал +2.0 bonus.</p></div>`;
}

function renderStumble(game) {
  const rows = game.teams.map(team => ({ name: team.name, sub: `${team.tag} · 5 players`, players: team.players.map(player => `${player.name}: ${num(player.points)}`).join(' · '), points: team.players.reduce((sum, player) => sum + num(player.points), 0) })).sort((a, b) => b.points - a.points);
  return `${boardHead(GAME_DEFS.stumble, '6 баг · 30 тоглогч · Grand Prix · 10 round', GAME_DEFS.stumble.rules)}<div class="ag-pad"><div class="ag-status-grid"><div class="ag-status"><b>30</b><span>Players</span></div><div class="ag-status"><b>10</b><span>Rounds</span></div><div class="ag-status"><b>${rows.reduce((sum, row) => sum + row.points, 0)}</b><span>Team points</span></div></div><div class="ag-form-section" style="margin-top:16px"><h3>Team leaderboard</h3>${rankingTable(rows, [{ key: 'points', label: 'Team total', score: true }, { key: 'players', label: 'Player points' }])}</div><p class="ag-help" style="margin:14px 0 0">Багийн оноо = 5 тоглогчийн Grand Prix онооны нийлбэр. Admin хэсгээс тоглогч бүрийн нийт оноог оруулна.</p></div>`;
}

function placementPoints(place) { return ({ 1: 10, 2: 6, 3: 5, 4: 4, 5: 2, 6: 1 })[place] || 0; }
function renderPubg(game) {
  const rows = game.teams.map(team => { const mapScores = team.maps.map(map => placementPoints(num(map.placement)) + num(map.kills) * 2); return { name: team.name, sub: `${team.tag} · ${mapScores.map((score, index) => `${MAP_NAMES[index]} ${score}`).join(' · ')}`, placement: team.maps.reduce((sum, map) => sum + placementPoints(num(map.placement)), 0), kills: team.maps.reduce((sum, map) => sum + num(map.kills), 0), points: mapScores.reduce((sum, score) => sum + score, 0) }; }).sort((a, b) => b.points - a.points || b.kills - a.kills);
  return `${boardHead(GAME_DEFS.pubg, '6 баг · Sanhok / Livik / Erangel · placement + kills', GAME_DEFS.pubg.rules)}<div class="ag-pad"><div class="ag-status-grid"><div class="ag-status"><b>3</b><span>Maps</span></div><div class="ag-status"><b>2</b><span>Points / kill</span></div><div class="ag-status"><b>${rows.reduce((sum, row) => sum + row.points, 0)}</b><span>Total points</span></div></div><div class="ag-form-section" style="margin-top:16px"><h3>Team ranking</h3>${rankingTable(rows, [{ key: 'placement', label: 'Placement' }, { key: 'kills', label: 'Kills' }, { key: 'points', label: 'Total', score: true }])}</div><p class="ag-help" style="margin:14px 0 0">Нийт оноо = placement points + kills × 2. Tie-break: WWCD → нийт kill → Erangel placement → Erangel kill.</p></div>`;
}

function renderTekken(game) {
  const teamsById = new Map((game.teams || TEAM_NAMES.map((name, index) => ({ id: `t${index + 1}`, name, tag: TAGS[index] })) ).map(team => [team.id, team]));
  const playerRows = game.players.map(player => ({ name: player.name, sub: teamsById.get(player.teamId)?.name || player.teamId, points: num(player.points), record: `${num(player.wins)}-${num(player.losses)}`, games: `${num(player.gamesWon)}-${num(player.gamesLost)}` })).sort((a, b) => b.points - a.points);
  const teamMap = new Map(); game.players.forEach(player => { const key = player.teamId; const row = teamMap.get(key) || { name: teamsById.get(key)?.name || `Team ${key.replace('t', '')}`, sub: teamsById.get(key)?.tag || 'Team total', points: 0, wins: 0, games: 0 }; row.points += num(player.points); row.wins += num(player.wins); row.games += num(player.gamesWon); teamMap.set(key, row); });
  const teams = [...teamMap.values()].sort((a, b) => b.points - a.points);
  return `${boardHead(GAME_DEFS.tekken, '6 баг · 18 тоглогч · player leaderboard · team total', GAME_DEFS.tekken.rules)}<div class="ag-pad"><div class="ag-status-grid"><div class="ag-status"><b>18</b><span>Players</span></div><div class="ag-status"><b>3</b><span>Players / team</span></div><div class="ag-status"><b>${playerRows.reduce((sum, row) => sum + row.points, 0)}</b><span>Player points</span></div></div><section class="ag-tekken-roster" aria-label="Tekken 7 roster"><div class="ag-tekken-roster-head"><span>TEKKEN 7 ROSTER</span><b>KAZUYA · JIN / LIVE LEADERBOARD</b></div><div class="ag-grid two"><div class="ag-form-section"><h3>Player leaderboard</h3>${rankingTable(playerRows, [{ key: 'points', label: 'Points', score: true }, { key: 'record', label: 'W-L' }, { key: 'games', label: 'Game W-L' }])}</div><div class="ag-form-section"><h3>Team total</h3>${rankingTable(teams, [{ key: 'points', label: 'Points', score: true }, { key: 'wins', label: 'Match wins' }, { key: 'games', label: 'Game wins' }])}</div></div></section><p class="ag-help" style="margin:14px 0 0">Tie-break: нийт оноо → head-to-head → game differential → нийт хожсон game → нэмэлт BO1.</p></div>`;
}

function tetrisPlacePoints(place) { return ({ 1: 10, 2: 7, 3: 5, 4: 3, 5: 1, 6: 0 })[num(place)] || 0; }
function tetrisAggregate(game) {
  return game.teams.map(team => {
    const records = game.games.flatMap(stage => stage.rows.filter(row => row.teamId === team.id));
    const wins = records.reduce((sum, row) => sum + num(row.wins), 0);
    const placePoints = records.reduce((sum, row) => sum + tetrisPlacePoints(row.place), 0);
    const places = records.filter(row => row.place).map(row => `G${game.games.findIndex(stage => stage.rows.includes(row)) + 1} #${row.place}`).join(' · ');
    return { name: team.name, sub: `${team.tag} · ${places || 'No final place yet'}`, wins, placePoints, points: wins * 3 + placePoints };
  }).sort((a, b) => b.points - a.points || b.wins - a.wins || b.placePoints - a.placePoints || a.name.localeCompare(b.name));
}
function tetrisZoneTable(game, stage, zone) {
  const rows = stage.rows.filter(row => row.zone === zone).map(row => ({ team: teamById(game, row.teamId), wins: num(row.wins), place: row.place || '—' }));
  return `<div class="ag-form-section ag-tetris-zone"><h3>Zone ${zone} · top 2 advance</h3><div class="ag-table-wrap"><table class="ag-table"><thead><tr><th>Team</th><th class="num">Wins</th><th class="num">Place</th></tr></thead><tbody>${rows.map(row => `<tr><td><span class="ag-team">${esc(row.team?.name || 'Waiting')}</span><span class="ag-sub">${esc(row.team?.tag || '')}</span></td><td class="num score">${row.wins}</td><td class="num">${esc(row.place)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function renderTetris(game) {
  const rows = tetrisAggregate(game);
  const entered = game.games.reduce((sum, stage) => sum + stage.rows.filter(row => row.wins || row.place).length, 0);
  const stages = game.games.map(stage => `<div class="ag-form-section ag-tetris-stage"><div class="ag-tetris-stage-head"><h3>${esc(stage.label)}</h3><span>ZONE A + ZONE B → FINAL 4</span></div><div class="ag-grid two">${tetrisZoneTable(game, stage, 'A')}${tetrisZoneTable(game, stage, 'B')}</div></div>`).join('');
  return `${boardHead(GAME_DEFS.tetris, '6 баг · 3 games · 2 zones / game · final 4', GAME_DEFS.tetris.rules)}<div class="ag-pad"><div class="ag-status-grid"><div class="ag-status"><b>3</b><span>Games</span></div><div class="ag-status"><b>2</b><span>Zones / game</span></div><div class="ag-status"><b>${entered}/18</b><span>Zone results entered</span></div></div><div class="ag-tetris-flow"><div><b>GAME 1</b><span>Zone A + B</span></div><i>→</i><div><b>GAME 2</b><span>Zone A + B</span></div><i>→</i><div><b>GAME 3</b><span>Zone A + B</span></div><i>→</i><div><b>FINAL 4</b><span>Top teams</span></div></div><div class="ag-form-section" style="margin-top:16px"><h3>Overall team ranking</h3>${rankingTable(rows, [{ key: 'wins', label: 'Wins' }, { key: 'placePoints', label: 'Place pts' }, { key: 'points', label: 'Total', score: true }])}</div><div class="ag-tetris-stages" style="margin-top:16px">${stages}</div><p class="ag-help" style="margin:14px 0 0">Game win = 3 оноо. Final place оноо: 1-р байр 10, 2-р байр 7, 3-р байр 5, 4-р байр 3, 5-р байр 1. Тэнцвэл нийт win → final place points дарааллаар шийднэ.</p></div>`;
}

function classicSection(eyebrow, title, body, action = '') { return `<section class="ag-classic-section"><div class="ag-classic-section-head"><div><span>${esc(eyebrow)}</span><h2>${esc(title)}</h2></div>${action ? `<b>${esc(action)}</b>` : ''}</div>${body}</section>`; }
function classicFacts(items) { return `<div class="ag-classic-facts">${items.map(item => `<div><b>${esc(item.value)}</b><span>${esc(item.label)}</span></div>`).join('')}</div>`; }
function classicMiniRank(rows, value, meta) { return `<div class="ag-classic-mini-rank">${rows.map((row, index) => `<div class="ag-classic-mini-row ${index > 1 ? 'is-muted' : ''}"><span class="ag-classic-mini-place">${index + 1}</span>${dashAvatar(row.name, index)}<span><b>${esc(row.name)}</b><small>${esc(meta(row))}</small></span><strong>${esc(value(row))}</strong></div>`).join('')}</div>`; }
function classicGroupCard(title, subtitle, rows, value, meta) { return `<article class="ag-classic-group"><div class="ag-classic-group-head"><span class="ag-classic-group-mark">${esc(title.replace(/[^A-Z0-9]/gi, '').slice(-1) || '#')}</span><div><b>${esc(title)}</b><small>${esc(subtitle)}</small></div><span>LIVE</span></div>${classicMiniRank(rows, value, meta)}</article>`; }
function classicTable(rows, columns) { return `<div class="ag-classic-table-wrap"><table class="ag-classic-table"><thead><tr><th>#</th><th>Team / Player</th>${columns.map(column => `<th>${esc(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row, index) => `<tr><td><span class="ag-classic-rank ${index < 3 ? 'top' : ''}">${index + 1}</span></td><td><b>${esc(row.name)}</b><small>${esc(row.sub || '')}</small></td>${columns.map(column => `<td>${esc(column.value ? column.value(row) : row[column.key] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
function classicMatch(title, meta, rows) { return `<article class="ag-classic-match"><div class="ag-classic-match-head"><b>${esc(title)}</b><span>${esc(meta)}</span></div>${rows.map(row => `<div class="ag-classic-match-row"><span>${esc(row.left)}</span><strong>${esc(row.score || '—')}</strong><span>${esc(row.right)}</span></div>`).join('')}</article>`; }
function classicBoard(def, subtitle, facts, formatCards, stage, standings, roster, breakdown, note) {
  return `<div class="ag-classic-board"><section class="ag-classic-banner"><div class="ag-classic-banner-lockup"><div class="ag-classic-logo ${def.logoClass || ''}"><img src="${def.logo}" alt="${esc(def.label)} logo"></div><div><span>DDAM CUP · OFFICIAL TOURNAMENT FORMAT</span><h1>DDAM ESPORT CUP <b>${esc(def.label)}</b></h1><p>${esc(subtitle)}</p></div></div><span class="ag-classic-live">LIVE BOARD</span></section>${classicFacts(facts)}${classicSection('TOURNAMENT FORMAT', 'FORMAT & RULES', `<div class="ag-classic-format-grid">${formatCards.map(card => `<article><b>${esc(card.title)}</b><p>${esc(card.body)}</p></article>`).join('')}</div>`)}${stage}${standings}${roster}${breakdown}<p class="ag-classic-note">${note}</p></div>`;
}
function dashSeriesItem(match, game, code) { return { code, left: teamName(game, match.a), right: teamName(game, match.b), score: match.series || 'VS', meta: `${match.group || 'PLAYOFF'} · ${match.series ? 'FINISHED' : 'NEXT'}` }; }

function renderMlbbClassic(game) {
  const a = mlRows(game, 'A'); const b = mlRows(game, 'B'); const playoff = mlPlayoff(game);
  const row = item => ({ name: item.team.name, sub: `${item.team.tag} · ${item.played}/2 series`, played: item.played, points: item.points, wins: item.gamesWon, losses: item.gamesLost });
  const overall = [...a, ...b].map(row).sort((x, y) => y.points - x.points || y.wins - x.wins);
  const brackets = [['SF1 · A1 vs B2', playoff.sf1], ['SF2 · B1 vs A2', playoff.sf2], ['GRAND FINAL', playoff.final], ['3RD PLACE FINAL', playoff.third]];
  const zoneStage = classicSection('ZONE ROUND-ROBIN', 'ZONE QUALIFICATION', `<div class="ag-classic-group-grid">${classicGroupCard('ZONE A', 'BO2 · TOP 2 ADVANCE', a.map(row), item => `${item.points}P`, item => `${item.wins}-${item.losses} games`)}${classicGroupCard('ZONE B', 'BO2 · TOP 2 ADVANCE', b.map(row), item => `${item.points}P`, item => `${item.wins}-${item.losses} games`)}</div>`);
  const bracketStage = classicSection('FINAL BO3 ELIMINATION', 'PLAYOFF BRACKET', `<div class="ag-classic-bracket-grid">${brackets.map(([title, item]) => classicMatch(title, item.series ? `SAVED · ${item.series}` : 'WAITING', [{ left: item.a?.name || 'Qualified team', right: item.b?.name || 'Waiting', score: item.series || '—' }])).join('')}</div>`);
  const stage = zoneStage + bracketStage;
  const standings = classicSection('LEADERBOARD', 'TEAM STANDINGS', classicTable(overall, [{ label: 'Series', value: item => `${item.played || 0}` }, { label: 'Game W-L', value: item => `${item.wins}-${item.losses}` }, { label: 'Zone Pts', key: 'points' }, { label: 'Total', key: 'points' }]));
  const roster = classicSection('TEAM ROSTERS', 'ROSTER', classicTable(game.teams.map(team => ({ name: team.name, sub: `${team.tag} · Group ${team.group}`, players: '6-player roster' })), [{ label: 'Group', value: item => item.sub.split('·').pop().trim() }, { label: 'Status', key: 'players' }]));
  const matches = [...game.groupResults.filter(item => item.series).slice(-6).map((item, index) => classicMatch(`${item.group} · MATCH ${index + 1}`, 'BO2', [{ left: teamName(game, item.a), right: teamName(game, item.b), score: item.series }])), ...brackets.slice(0, 2).map(([title, item]) => classicMatch(title, 'BO3', [{ left: item.a?.name || 'Qualified team', right: item.b?.name || 'Waiting', score: item.series || '—' }]))];
  const breakdown = classicSection('SERIES LOG', 'MATCH BREAKDOWN', `<div class="ag-classic-breakdown-grid">${matches.length ? matches.join('') : classicMatch('GROUP ROUND 1', 'BO2', [{ left: 'Waiting', right: 'Waiting', score: '—' }])}</div>`);
  return classicBoard(GAME_DEFS.mlbb, '6 баг · A/B хэсэг · BO2 round-robin · 4 баг playoff', [{ value: '6', label: 'Teams' }, { value: '2', label: 'Groups' }, { value: 'BO2', label: 'Group stage' }, { value: 'BO3', label: 'Playoff' }], [{ title: '1. Group stage', body: '6 багийг A/B хоёр хэсэгт 3-аар хувааж BO2 round-robin тоглоно.' }, { title: '2. Qualification', body: 'Хэсэг бүрийн top 2 баг Final BO3 bracket-д шалгарна.' }, { title: '3. Tie-break', body: 'Head-to-head → game differential → нэмэлт BO1.' }], stage, standings, roster, breakdown, 'Official rules · A1 vs B2, B1 vs A2 semifinals · Grand Final + 3rd Place Final.');
}

function renderMechaClassic(game) {
  const rows = game.teams.map(team => { const score = mechaStats(team); return { name: team.name, sub: `${team.tag} · Hider ${score.hider.toFixed(1)} · ${score.seekersCaught} caught`, hider: score.hider, caught: score.seekersCaught, bonus: score.bonus, points: score.points }; }).sort((a, b) => b.points - a.points || b.hider - a.hider);
  const lobbies = classicSection('LOBBY A · WOMEN · 6 ROUNDS', 'HIDER / SEEKER RACE', `<div class="ag-classic-group-grid">${classicGroupCard('LOBBY A', '2F / TEAM · BASIC · 6 ROUNDS', rows, item => `${item.points.toFixed(1)}P`, item => `Hider ${item.hider.toFixed(1)} · ${item.caught} caught`)}${classicGroupCard('LOBBY B', '2M / TEAM · BASIC · 6 ROUNDS', rows, item => `${item.points.toFixed(1)}P`, item => `Hider ${item.hider.toFixed(1)} · ${item.caught} caught`)}</div>`);
  const rotation = classicSection('ROUND ROTATION', 'SEEKER ORDER', `<div class="ag-classic-round-flow">${Array.from({ length: 6 }, (_, index) => `<div><b>ROUND ${index + 1}</b><span>Draft team ${index + 1} → 2 Seekers</span></div>`).join('')}</div>`);
  const stage = lobbies + rotation;
  const standings = classicSection('LEADERBOARD', 'TEAM STANDINGS', classicTable(rows, [{ label: 'Hider Pts', value: item => item.hider.toFixed(1) }, { label: 'Caught', key: 'caught' }, { label: 'Bonus', value: item => item.bonus.toFixed(1) }, { label: 'Total', value: item => item.points.toFixed(1) }]));
  const roster = classicSection('2 WOMEN + 2 MEN', 'TEAM ROSTERS', classicTable(game.teams.map(team => ({ name: team.name, sub: `${team.tag} · registered roster`, roster: '2F + 2M' })), [{ label: 'Roster', key: 'roster' }, { label: 'Lobby', value: () => 'A + B' }]));
  const breakdown = classicSection('BASIC MODE · PRIVATE LOBBY', 'ROUND BREAKDOWN', `<div class="ag-classic-breakdown-grid">${['Lobby A · Women', 'Lobby B · Men'].flatMap(lobby => Array.from({ length: 3 }, (_, index) => classicMatch(`${lobby} · R${index + 1}`, '90s paint · 3m hunt', [{ left: 'Seeker team', right: '10 Hiders', score: '—' }]))).join('')}</div>`);
  return classicBoard(GAME_DEFS.mecha, '6 баг · 2 lobby · 2F + 2M / баг · lobby тус бүр 6 round', [{ value: '6', label: 'Teams' }, { value: '2F + 2M', label: 'Roster' }, { value: '6 + 6', label: 'Rounds' }, { value: '0.33', label: 'Per catch' }], [{ title: '1. Lobby format', body: 'Lobby A — 2 эмэгтэй, Lobby B — 2 эрэгтэй тоглогч. Lobby бүр 6 раунд.' }, { title: '2. Game settings', body: 'Basic · 2 Seeker · 90s Paint · 3m Hunt · Ammo 20 · taunt 15 sec.' }, { title: '3. Scoring', body: 'Hider = Missed Spot хувь. Seeker = 0.33 × catch. 10/10 catch = +2.0.' }], stage, standings, roster, breakdown, 'Tie-break: нийт оноо → хамгийн өндөр Missed Spot авсан round → нийт барьсан Hider. Official maps, private 12-player lobby.');
}

function renderStumbleClassic(game) {
  const rows = game.teams.map(team => ({ name: team.name, sub: `${team.tag} · 5 players`, points: team.players.reduce((sum, player) => sum + num(player.points), 0), top: Math.max(...team.players.map(player => num(player.points)), 0) })).sort((a, b) => b.points - a.points || b.top - a.top);
  const stage = classicSection('GRAND PRIX · 10 ROUNDS', 'TEAM RACE', `<div class="ag-classic-group-grid">${classicGroupCard('GROUP A', 'SOLO · PRIVATE LOBBY', rows.slice(0, 3), item => `${item.points}P`, item => `${item.top} best player`)}${classicGroupCard('GROUP B', 'SOLO · PRIVATE LOBBY', rows.slice(3), item => `${item.points}P`, item => `${item.top} best player`)}</div>`);
  const standings = classicSection('LEADERBOARD', 'TEAM STANDINGS', classicTable(rows, [{ label: 'Players', value: () => '5' }, { label: 'Best player', key: 'top' }, { label: 'Total', key: 'points' }]));
  const rosterRows = game.teams.flatMap(team => team.players.map(player => ({ name: player.name, sub: team.name, points: player.points, tag: team.tag })));
  const roster = classicSection('30 PLAYERS · 5 / TEAM', 'TEAM ROSTERS', classicTable(rosterRows, [{ label: 'Team', key: 'sub' }, { label: 'Points', key: 'points' }, { label: 'Tag', key: 'tag' }]));
  const breakdown = classicSection('SOLO GRAND PRIX', 'ROUND BREAKDOWN', `<div class="ag-classic-breakdown-grid">${Array.from({ length: 10 }, (_, index) => classicMatch(`ROUND ${index + 1}`, 'PLACEMENT POINTS', [{ left: 'All players', right: 'Finish', score: '—' }])).join('')}</div>`);
  return classicBoard(GAME_DEFS.stumble, '6 баг · 30 тоглогч · Grand Prix solo · 10 round', [{ value: '6', label: 'Teams' }, { value: '30', label: 'Players' }, { value: '10', label: 'Rounds' }, { value: 'SOLO', label: 'Mode' }], [{ title: '1. Private lobby', body: '30 тоглогч нэг private lobby-д solo mode-оор тоглоно.' }, { title: '2. Grand Prix', body: '10 round, elimination байхгүй. Бүгд бүх round-д оролцоно.' }, { title: '3. Team score', body: '5 тоглогчийн leaderboard онооны нийлбэрээр багийн ranking гарна.' }], stage, standings, roster, breakdown, 'Abilities / Power-up, AI / NPC болон team mode ашиглахгүй. Tie-break: өндөр оноотой тоглогчдын дараалал → нэмэлт round.');
}

function renderPubgClassic(game) {
  const rows = game.teams.map(team => { const placement = team.maps.reduce((sum, map) => sum + placementPoints(num(map.placement)), 0); const kills = team.maps.reduce((sum, map) => sum + num(map.kills), 0); return { name: team.name, sub: `${team.tag} · ${kills} kills`, placement, kills, points: placement + kills * 2 }; }).sort((a, b) => b.points - a.points || b.kills - a.kills);
  const mapCard = (name, index) => classicGroupCard(name, 'PLACEMENT + KILLS', rows, item => { const team = game.teams.find(candidate => candidate.name === item.name); const map = team?.maps[index] || {}; return `${placementPoints(num(map.placement)) + num(map.kills) * 2}P`; }, item => { const team = game.teams.find(candidate => candidate.name === item.name); const map = team?.maps[index] || {}; return `Place ${map.placement || '—'} · ${num(map.kills)} kills`; });
  const stage = classicSection('BATTLE ROYALE · 3 MAPS', 'MAP QUALIFICATION', `<div class="ag-classic-group-grid ag-classic-map-grid">${mapCard('SANHOK', 0)}${mapCard('LIVIK', 1)}${mapCard('ERANGEL', 2)}</div>`);
  const standings = classicSection('LEADERBOARD', 'TEAM STANDINGS', classicTable(rows, [{ label: 'Placement', key: 'placement' }, { label: 'Kills', key: 'kills' }, { label: 'Total', key: 'points' }]));
  const roster = classicSection('3 MEN + 1 WOMAN', 'TEAM ROSTERS', classicTable(game.teams.map(team => ({ name: team.name, sub: `${team.tag} · field roster`, roster: '3M + 1F' })), [{ label: 'Field roster', key: 'roster' }, { label: 'Maps', value: () => '3' }]));
  const breakdown = classicSection('SANKHOK · LIVIK · ERANGEL', 'MAP BREAKDOWN', `<div class="ag-classic-breakdown-grid">${['Sanhok', 'Livik', 'Erangel'].map((map, index) => classicMatch(`MAP ${index + 1} · ${map}`, 'PLACEMENT + KILLS', [{ left: 'All teams', right: 'WWCD', score: '—' }])).join('')}</div>`);
  return classicBoard(GAME_DEFS.pubg, '6 баг · Sanhok / Livik / Erangel · placement + kills', [{ value: '6', label: 'Teams' }, { value: '3M + 1F', label: 'Field roster' }, { value: '3', label: 'Maps' }, { value: '×2', label: 'Kill points' }], [{ title: '1. Maps', body: 'Sanhok → Livik → Erangel дарааллаар 3 map тоглоно.' }, { title: '2. Field roster', body: 'Тоглолт бүрт 3 эрэгтэй + 1 эмэгтэй тоглогч талбайд орно.' }, { title: '3. Scoring', body: 'Нийт = placement points + kills × 2. Tie-break нь WWCD.' }], stage, standings, roster, breakdown, 'Room ID/password болон slot-оо зохион байгуулагч зарлана. Tie-break: WWCD → нийт Kill → Erangel placement → Erangel Kill.');
}

function renderTetrisClassic(game) {
  const rows = tetrisAggregate(game); const stages = game.games.map((stage, stageIndex) => { const zoneRows = zone => stage.rows.filter(item => item.zone === zone).map(item => { const team = teamById(game, item.teamId); return { name: team?.name || 'Waiting', sub: `${team?.tag || ''} · Wins ${num(item.wins)} · Place ${item.place || '—'}`, score: num(item.wins) * 3 + tetrisPlacePoints(item.place) }; }).sort((a, b) => b.score - a.score); return classicGroupCard(`GAME ${stageIndex + 1}`, 'ZONE A + ZONE B', zoneRows('A').concat(zoneRows('B')), item => `${item.score}P`, item => item.sub); });
  const stage = classicSection('ZONE A / ZONE B', 'THREE-GAME QUALIFICATION', `<div class="ag-classic-group-grid ag-classic-map-grid">${stages.join('')}</div>`);
  const standings = classicSection('LEADERBOARD', 'TEAM STANDINGS', classicTable(rows, [{ label: 'Wins', key: 'wins' }, { label: 'Place pts', key: 'placePoints' }, { label: 'Total', key: 'points' }]));
  const roster = classicSection('6 TEAMS · 3 GAMES', 'TEAM ROSTERS', classicTable(game.teams.map(team => ({ name: team.name, sub: `${team.tag} · Zone A/B`, roster: '6-player roster' })), [{ label: 'Zone', key: 'sub' }, { label: 'Format', key: 'roster' }]));
  const breakdown = classicSection('GAME 1 → GAME 2 → GAME 3', 'MATCH BREAKDOWN', `<div class="ag-classic-breakdown-grid">${game.games.map(stageItem => classicMatch(stageItem.label, 'ZONE A + ZONE B', [{ left: 'Zone A', right: 'Zone B', score: '—' }])).join('')}</div>`);
  return classicBoard(GAME_DEFS.tetris, '6 баг · 3 games · 2 zones / game · final 4', [{ value: '6', label: 'Teams' }, { value: '3', label: 'Games' }, { value: '2', label: 'Zones / game' }, { value: '4', label: 'Final teams' }], [{ title: '1. Zone progression', body: 'Game бүрт Zone A/B тусдаа тоглож, zone бүрийн top 2 Final 4-д орно.' }, { title: '2. Scoring', body: 'Game win = 3 оноо. Final place: 10 / 7 / 5 / 3 / 1.' }, { title: '3. Final ranking', body: '3 game-ийн нийт оноо → нийт win → final place points.' }], stage, standings, roster, breakdown, 'Zone A/B-ийн үр дүнг Game 1, Game 2, Game 3 дарааллаар бүртгэнэ. Final 4 bracket нь шилдэг багуудаар үргэлжилнэ.');
}

function renderPublic() { const game = state.games[activeGame]; const body = activeGame === 'mlbb' ? renderMlbbClassic(game) : activeGame === 'mecha' ? renderMechaClassic(game) : activeGame === 'stumble' ? renderStumbleClassic(game) : activeGame === 'pubg' ? renderPubgClassic(game) : activeGame === 'tetris' ? renderTetrisClassic(game) : renderTekken(game); $('publicBoard').innerHTML = body; }
function renderMlbbDashboard(game) {
  const a = mlRows(game, 'A'); const b = mlRows(game, 'B'); const playoff = mlPlayoff(game);
  const groupRows = rows => rows.map(row => ({ name: row.team.name, sub: `${row.team.tag} · ${row.played}/2 series · ${row.gamesWon}-${row.gamesLost}`, points: `${row.points} pts` }));
  const upcoming = game.groupResults.filter(match => !match.series).slice(0, 3).map((match, index) => dashSeriesItem(match, game, `G${index + 1}`));
  const recent = game.groupResults.filter(match => match.series).slice(-4).reverse().map((match, index) => dashSeriesItem(match, game, `R${index + 1}`));
  const playoffs = [['sf1', 'SF1'], ['sf2', 'SF2'], ['final', 'GF'], ['third', '3RD']].map(([key, code]) => ({ code, left: playoff[key].a?.name || 'Qualified team', right: playoff[key].b?.name || 'Waiting', score: playoff[key].series || 'VS', meta: playoff[key].label }));
  const all = [...groupRows(a), ...groupRows(b)].sort((x, y) => parseInt(y.points, 10) - parseInt(x.points, 10));
  const main = `${dashPanel('TOP TWO ADVANCE', 'GROUP RACE', `<div class="ag-dash-groups">${dashGroup('A', groupRows(a), { title: 'GROUP A', meta: '2/3' })}${dashGroup('B', groupRows(b), { title: 'GROUP B', meta: '2/3' })}</div>`, '', 'ALL GROUPS →')}${dashPanel('BO3 PLAYOFF', 'PLAYOFF BRACKET', dashMatchList(playoffs, 'Semifinal teams will appear after group play.'), 'ag-dash-panel--compact')}`;
  const side = `${dashPanel('GET READY', 'UP NEXT', dashMatchList(upcoming, 'No group matches waiting.'))}${dashPanel('JUST FINISHED', 'LATEST RESULTS', dashMatchList(recent, 'No results yet.'))}${dashPanel('TOP SCORE', 'MOST PICKED', dashPicked(all, row => row.points))}`;
  return dashboardBoard(GAME_DEFS.mlbb, '6 баг · A/B хэсэг · BO2 round-robin · 4 баг playoff', GAME_DEFS.mlbb.rules, main, side, 'Tie-break: head-to-head → нийт хожсон game → нийт хожигдсон game бага → нэмэлт BO1.');
}
function renderMechaDashboard(game) {
  const rows = game.teams.map(team => { const score = mechaStats(team); return { name: team.name, sub: `${team.tag} · Hider ${score.hider.toFixed(1)} · Seeker ${score.seekersCaught} caught · +${score.bonus.toFixed(1)}`, points: `${score.points.toFixed(1)} pts`, raw: score.points, topMissedSpot: score.topMissedSpot }; }).sort((a, b) => b.raw - a.raw || b.topMissedSpot - a.topMissedSpot || a.name.localeCompare(b.name));
  const main = dashPanel('TWO LOBBIES · 6 ROUNDS EACH', 'GROUP RACE', `<div class="ag-dash-groups">${dashGroup('A', rows.slice(0, 3), { title: 'LOBBY A · WOMEN', meta: '6 ROUNDS' })}${dashGroup('B', rows.slice(3), { title: 'LOBBY B · MEN', meta: '6 ROUNDS' })}</div>`, '', 'ALL LOBBIES →');
  const side = `${dashPanel('GET READY', 'UP NEXT', dashMatchList([{ code: 'R1', left: rows[0]?.name || 'Team A', right: rows[3]?.name || 'Team D', meta: 'HIDER / SEEKER' }, { code: 'R2', left: rows[1]?.name || 'Team B', right: rows[4]?.name || 'Team E', meta: 'LOBBY A · NEXT ROUND' }, { code: 'R3', left: rows[2]?.name || 'Team C', right: rows[5]?.name || 'Team F', meta: 'LOBBY B · NEXT ROUND' }]))}${dashPanel('JUST FINISHED', 'LATEST RESULTS', dashMatchList([], 'No round results yet.'))}${dashPanel('TOP SCORE', 'MOST PICKED', dashPicked(rows, row => row.points))}`;
  return dashboardBoard(GAME_DEFS.mecha, '6 баг · 2 lobby · 4 тоглогч/баг · lobby тус бүр 6 round', GAME_DEFS.mecha.rules, main, side, 'Hider = 10 × (тоглогчийн Missed Spot / раундын нийт Missed Spot). Seeker = барьсан Hider × 0.33; бүх 10 Hider баривал +2.0. Tie-break: нийт оноо → хамгийн өндөр Missed Spot авсан round → нийт барьсан Hider.');
}
function renderStumbleDashboard(game) {
  const rows = game.teams.map(team => ({ name: team.name, sub: `${team.tag} · 5 players`, points: `${team.players.reduce((sum, player) => sum + num(player.points), 0)} pts`, raw: team.players.reduce((sum, player) => sum + num(player.points), 0) })).sort((a, b) => b.raw - a.raw);
  const main = dashPanel('TOP TWO ADVANCE', 'GROUP RACE', `<div class="ag-dash-groups">${dashGroup('A', rows.slice(0, 3), { title: 'GROUP A', meta: '15/15' })}${dashGroup('B', rows.slice(3), { title: 'GROUP B', meta: '15/15' })}</div>`, '', 'ALL GROUPS →');
  const side = `${dashPanel('GET READY', 'UP NEXT', dashMatchList([{ code: 'R1', left: rows[0]?.name || 'Team A', right: rows[1]?.name || 'Team B', meta: 'GRAND PRIX · ROUND 1' }, { code: 'R2', left: rows[2]?.name || 'Team C', right: rows[3]?.name || 'Team D', meta: 'GRAND PRIX · ROUND 1' }, { code: 'R3', left: rows[4]?.name || 'Team E', right: rows[5]?.name || 'Team F', meta: 'GRAND PRIX · ROUND 1' }]))}${dashPanel('JUST FINISHED', 'LATEST RESULTS', dashMatchList([], 'No round results yet.'))}${dashPanel('TOP SCORE', 'MOST PICKED', dashPicked(rows, row => row.points))}`;
  return dashboardBoard(GAME_DEFS.stumble, '6 баг · 30 тоглогч · Grand Prix · 10 round', GAME_DEFS.stumble.rules, main, side, 'Багийн оноо = 5 тоглогчийн Grand Prix онооны нийлбэр. Admin хэсгээс тоглогч бүрийн нийт оноог оруулна.');
}
function renderPubgDashboard(game) {
  const rows = game.teams.map(team => { const placement = team.maps.reduce((sum, map) => sum + placementPoints(num(map.placement)), 0); const kills = team.maps.reduce((sum, map) => sum + num(map.kills), 0); return { name: team.name, sub: `${team.tag} · ${kills} kills · ${placement} placement`, points: `${placement + kills * 2} pts`, raw: placement + kills * 2 }; }).sort((a, b) => b.raw - a.raw || a.name.localeCompare(b.name));
  const main = dashPanel('TOP TWO ADVANCE', 'GROUP RACE', `<div class="ag-dash-groups">${dashGroup('A', rows.slice(0, 3), { title: 'GROUP A', meta: '3 MAPS' })}${dashGroup('B', rows.slice(3), { title: 'GROUP B', meta: '3 MAPS' })}</div>`, '', 'ALL GROUPS →');
  const side = `${dashPanel('GET READY', 'UP NEXT', dashMatchList([{ code: 'MAP1', left: 'Sanhok', right: 'All teams', meta: 'PLACEMENT + KILLS' }, { code: 'MAP2', left: 'Livik', right: 'All teams', meta: 'PLACEMENT + KILLS' }, { code: 'MAP3', left: 'Erangel', right: 'All teams', meta: 'PLACEMENT + KILLS' }]))}${dashPanel('JUST FINISHED', 'LATEST RESULTS', dashMatchList([], 'No map results yet.'))}${dashPanel('TOP SCORE', 'MOST PICKED', dashPicked(rows, row => row.points))}`;
  return dashboardBoard(GAME_DEFS.pubg, '6 баг · Sanhok / Livik / Erangel · placement + kills', GAME_DEFS.pubg.rules, main, side, 'Нийт оноо = placement points + kills × 2. Tie-break: WWCD → нийт kill → Erangel placement → Erangel kill.');
}
function renderTetrisDashboard(game) {
  const rows = tetrisAggregate(game).map(row => ({ ...row, points: `${row.points} pts`, raw: row.points })); const firstGame = game.games[0];
  const zoneRows = zone => firstGame.rows.filter(row => row.zone === zone).map(row => { const total = rows.find(item => item.name === teamById(game, row.teamId)?.name); return total ? { ...total, sub: `${total.sub} · Zone ${zone}` } : null; }).filter(Boolean).sort((a, b) => b.raw - a.raw);
  const entered = game.games.reduce((sum, stage) => sum + stage.rows.filter(row => row.wins || row.place).length, 0);
  const main = `${dashPanel('TOP TWO ADVANCE', 'GROUP RACE', `<div class="ag-dash-groups">${dashGroup('A', zoneRows('A'), { title: 'ZONE A', meta: 'GAME 1' })}${dashGroup('B', zoneRows('B'), { title: 'ZONE B', meta: 'GAME 1' })}</div>`, '', 'ALL ZONES →')}${dashPanel('ZONE FLOW', 'TOURNAMENT PATH', '<div class="ag-tetris-flow ag-dash-tetris-flow"><div><b>GAME 1</b><span>ZONE A + B</span></div><i>→</i><div><b>GAME 2</b><span>ZONE A + B</span></div><i>→</i><div><b>GAME 3</b><span>ZONE A + B</span></div><i>→</i><div><b>FINAL 4</b><span>TOP TEAMS</span></div></div>', 'ag-dash-panel--compact')}`;
  const side = `${dashPanel('GET READY', 'UP NEXT', dashMatchList([{ code: 'G1', left: 'Game 1 · Zone A', right: 'Zone B', meta: '6 teams · 2 zones' }, { code: 'G2', left: 'Game 2 · Zone A', right: 'Zone B', meta: '6 teams · 2 zones' }, { code: 'G3', left: 'Game 3 · Zone A', right: 'Zone B', meta: '6 teams · 2 zones' }]))}${dashPanel('JUST FINISHED', 'LATEST RESULTS', dashMatchList([], entered ? `${entered} zone results entered.` : 'No results yet.'))}${dashPanel('TOP SCORE', 'MOST PICKED', dashPicked(rows, row => row.points))}`;
  return dashboardBoard(GAME_DEFS.tetris, '6 баг · 3 games · 2 zones / game · final 4', GAME_DEFS.tetris.rules, main, side, 'Game win = 3 оноо. Final place оноо: 1-р байр 10, 2-р байр 7, 3-р байр 5, 4-р байр 3, 5-р байр 1.');
}

function renderTabs() { $('gameTabs').innerHTML = GAME_IDS.map(id => `<button class="ag-tab ${id === activeGame ? 'active' : ''}" data-game="${id}" type="button"><img src="${GAME_DEFS[id].logo}" alt="">${GAME_DEFS[id].short}</button>`).join(''); document.querySelectorAll('.ag-tab').forEach(button => { button.onclick = () => { activeGame = button.dataset.game; const url = new URL(location.href); url.searchParams.set('game', activeGame); history.replaceState({}, '', url); render(); }; }); }

function inputTeamNames(game) { return `<div class="ag-form-section"><h3>Team setup</h3><div class="ag-form-grid">${game.teams.map(team => `<label class="ag-label">${esc(team.tag || team.id)}<input class="ag-input" data-team-name="${team.id}" value="${esc(team.name)}"></label>`).join('')}</div></div>`; }
function renderMlEditor(game) { const name = id => teamName(game, id); return `${inputTeamNames(game)}<div class="ag-form-section"><h3>Group BO2 results</h3><div class="ag-form-grid">${game.groupResults.map(match => `<label class="ag-label">${match.group} · ${esc(name(match.a))} vs ${esc(name(match.b))}<select class="ag-select" data-ml-group="${match.id}">${seriesOptions(ML_SERIES, match.series)}</select></label>`).join('')}</div></div><div class="ag-form-section"><h3>Playoff BO3 results</h3><div class="ag-form-grid">${[['sf1','Semifinal 1'],['sf2','Semifinal 2'],['final','Grand Final'],['third','3rd Place Final']].map(([id, label]) => `<label class="ag-label">${label}<select class="ag-select" data-ml-playoff="${id}">${seriesOptions(BO3_SERIES, game.playoff[id])}</select></label>`).join('')}</div></div>`; }
function renderMechaEditor(game) { return `${inputTeamNames(game)}<div class="ag-form-section"><h3>Official Meccha scoring input</h3><p class="ag-help">Hider points-ийг Missed Spot Ranking-ийн эцсийн дэлгэцээс 0.1 нарийвчлалтайгаар нийлбэрлэн оруулна. Seeker оноо автоматаар бодогдоно.</p><div class="ag-grid">${game.teams.map(team => { const score = mechaStats(team); return `<div class="ag-form-section"><h3>${esc(team.name)} · ${esc(team.tag)}</h3><div class="ag-form-grid three"><label class="ag-label">Hider points<input class="ag-input" type="number" min="0" step="0.1" data-mecha="${team.id}" data-field="hider" value="${score.hider}"></label><label class="ag-label">Highest Missed Spot rounds<input class="ag-input" type="number" min="0" max="12" step="1" data-mecha="${team.id}" data-field="topMissedSpot" value="${score.topMissedSpot}"></label><label class="ag-label">Hiders caught<input class="ag-input" type="number" min="0" max="20" step="1" data-mecha="${team.id}" data-field="seekersCaught" value="${score.seekersCaught}"></label><label class="ag-label">10/10 clean-sweep rounds<input class="ag-input" type="number" min="0" max="2" step="1" data-mecha="${team.id}" data-field="cleanSweeps" value="${score.cleanSweeps}"></label><div class="ag-mecha-total">Seeker ${score.seeker.toFixed(1)} + bonus ${score.bonus.toFixed(1)} = <b>${score.points.toFixed(1)} total</b></div></div></div>`; }).join('')}</div></div>`; }
function renderStumbleEditor(game) { return `<div class="ag-form-section"><h3>Player points</h3><div class="ag-grid">${game.teams.map(team => `<div class="ag-form-section"><h3>${esc(team.name)}</h3><div class="ag-form-grid">${team.players.map(player => `<label class="ag-label">${esc(player.name)}<input class="ag-input" data-stumble-name="${player.id}" value="${esc(player.name)}"><input class="ag-input" type="number" min="0" data-stumble-points="${player.id}" value="${num(player.points)}"></label>`).join('')}</div></div>`).join('')}</div></div>`; }
function renderPubgEditor(game) { return `${inputTeamNames(game)}<div class="ag-grid">${game.teams.map(team => `<div class="ag-form-section"><h3>${esc(team.name)}</h3><div class="ag-form-grid three">${team.maps.map((map, index) => `<div><label class="ag-label">${MAP_NAMES[index]} · Place<select class="ag-select" data-pubg="${team.id}" data-map="${index}" data-field="placement"><option value="">—</option>${[1,2,3,4,5,6].map(place => `<option value="${place}" ${String(place) === String(map.placement) ? 'selected' : ''}>${place}</option>`).join('')}</select></label><label class="ag-label" style="margin-top:8px">Kills<input class="ag-input" type="number" min="0" data-pubg="${team.id}" data-map="${index}" data-field="kills" value="${esc(map.kills)}"></label></div>`).join('')}</div></div>`).join('')}</div>`; }
function renderTekkenEditor(game) { return `<div class="ag-form-section"><h3>Player results</h3><div class="ag-grid">${game.players.map(player => `<div class="ag-form-grid five"><label class="ag-label">Player<input class="ag-input" data-tekken="${player.id}" data-field="name" value="${esc(player.name)}"></label><label class="ag-label">Points<input class="ag-input" type="number" min="0" data-tekken="${player.id}" data-field="points" value="${num(player.points)}"></label><label class="ag-label">W<input class="ag-input" type="number" min="0" data-tekken="${player.id}" data-field="wins" value="${num(player.wins)}"></label><label class="ag-label">L<input class="ag-input" type="number" min="0" data-tekken="${player.id}" data-field="losses" value="${num(player.losses)}"></label><label class="ag-label">Game W/L<input class="ag-input" data-tekken="${player.id}" data-field="games" value="${num(player.gamesWon)}-${num(player.gamesLost)}"></label></div>`).join('')}</div></div>`; }
function renderTetrisEditor(game) { return `${inputTeamNames(game)}${game.games.map(stage => `<div class="ag-form-section"><h3>${esc(stage.label)} · zone results</h3><div class="ag-grid two">${['A', 'B'].map(zone => `<div><h3>Zone ${zone}</h3>${stage.rows.filter(row => row.zone === zone).map(row => { const team = teamById(game, row.teamId); return `<div class="ag-tetris-edit-row"><b>${esc(team?.name || row.teamId)}</b><label class="ag-label">Wins<input class="ag-input" type="number" min="0" data-tetris-game="${stage.id}" data-tetris-team="${row.teamId}" data-field="wins" value="${num(row.wins)}"></label><label class="ag-label">Place<input class="ag-input" type="number" min="1" max="6" data-tetris-game="${stage.id}" data-tetris-team="${row.teamId}" data-field="place" value="${esc(row.place)}"></label></div>`; }).join('')}</div>`).join('')}</div></div>`).join('')}`; }
function renderEditor() { const game = state.games[activeGame]; return activeGame === 'mlbb' ? renderMlEditor(game) : activeGame === 'mecha' ? renderMechaEditor(game) : activeGame === 'stumble' ? renderStumbleEditor(game) : activeGame === 'pubg' ? renderPubgEditor(game) : activeGame === 'tetris' ? renderTetrisEditor(game) : renderTekkenEditor(game); }

function renderAdmin() { const logged = Boolean(authSession?.user); $('loggedOut').classList.toggle('ag-hidden', logged); $('loggedIn').classList.toggle('ag-hidden', !logged); if (logged) { $('userEmail').textContent = authSession.user.email || 'admin'; $('adminEditor').innerHTML = renderEditor(); } }
function render() {
  document.body.dataset.game = activeGame;
  document.body.style.setProperty('--ag-art', `url("${GAME_DEFS[activeGame].art}")`);
  renderTabs();
  renderPublic();
  renderAdmin();
}

function saveFromEditor() {
  const next = clone(state); const game = next.games[activeGame];
  document.querySelectorAll('[data-team-name]').forEach(input => { const team = game.teams.find(item => item.id === input.dataset.teamName); if (team) team.name = input.value.trim() || team.name; });
  if (activeGame === 'mlbb') { game.groupResults.forEach(match => { const input = document.querySelector(`[data-ml-group="${match.id}"]`); if (input) match.series = input.value; }); Object.keys(game.playoff).forEach(id => { const input = document.querySelector(`[data-ml-playoff="${id}"]`); if (input) game.playoff[id] = input.value; }); }
  if (activeGame === 'mecha') document.querySelectorAll('[data-mecha]').forEach(input => { const team = game.teams.find(item => item.id === input.dataset.mecha); if (team) team[input.dataset.field] = num(input.value); });
  if (activeGame === 'stumble') game.teams.forEach(team => team.players.forEach(player => { const name = document.querySelector(`[data-stumble-name="${player.id}"]`); const points = document.querySelector(`[data-stumble-points="${player.id}"]`); if (name) player.name = name.value.trim() || player.name; if (points) player.points = num(points.value); }));
  if (activeGame === 'pubg') document.querySelectorAll('[data-pubg]').forEach(input => { const team = game.teams.find(item => item.id === input.dataset.pubg); const map = team?.maps[Number(input.dataset.map)]; if (map) map[input.dataset.field] = input.value; });
  if (activeGame === 'tetris') document.querySelectorAll('[data-tetris-game]').forEach(input => { const stage = game.games.find(item => item.id === input.dataset.tetrisGame); const row = stage?.rows.find(item => item.teamId === input.dataset.tetrisTeam); if (row) row[input.dataset.field] = input.dataset.field === 'wins' ? num(input.value) : input.value; });
  if (activeGame === 'tekken') game.players.forEach(player => { document.querySelectorAll(`[data-tekken="${player.id}"]`).forEach(input => { if (input.dataset.field === 'name') player.name = input.value.trim() || player.name; else if (input.dataset.field === 'games') { const [won, lost] = input.value.split('-').map(num); player.gamesWon = won; player.gamesLost = lost; } else player[input.dataset.field] = num(input.value); }); });
  return next;
}

$('loginForm').addEventListener('submit', async event => { event.preventDefault(); if (!client) { $('authNote').textContent = 'Supabase environment тохируулагдаагүй байна.'; return; } const button = $('loginBtn'); button.disabled = true; button.textContent = 'Signing in…'; $('authNote').textContent = ''; try { await signIn($('email').value.trim(), $('password').value); $('password').value = ''; showToast('✓ Admin access granted'); renderAdmin(); } catch (error) { $('authNote').textContent = error.message || 'Sign in failed'; } finally { button.disabled = false; button.textContent = 'Sign in'; } });
$('logoutBtn').onclick = async () => { try { await signOut(); showToast('✓ Signed out'); renderAdmin(); } catch (error) { showToast(error.message || 'Sign out failed'); } };
$('saveBtn').onclick = async () => { if (!authSession?.user) return; const button = $('saveBtn'); button.disabled = true; button.textContent = 'Publishing…'; $('saveNote').textContent = ''; const result = await publish(saveFromEditor()); button.disabled = false; button.textContent = 'Save current game'; if (result.ok && !result.local) { showToast(`✓ ${GAME_DEFS[activeGame].label} published live`); $('saveNote').textContent = 'Saved to Supabase — every public viewer will update.'; } else if (result.ok) { showToast('Saved on this device only'); } else { $('saveNote').textContent = result.error?.message || 'Publish failed'; } };

render();
startRealtime();
