import './additional-games.css';
import { supabase as client, isConfigured } from './shared/supabase-client.ts';
import { saveRow } from './shared/save-row.ts';
import { assetUrl, pickImage, prepareImage, uploadMedia, removeMedia } from './shared/media.js';
import { applySharedProfiles, saveSharedProfile, saveSharedProfiles, subscribeSharedProfiles } from './shared/team-profiles.js';

const TOURNAMENT_ID = 'ddam-cup-additional-games-v1';
const CACHE_KEY = `ddam-cup-cache:${TOURNAMENT_ID}`;

const GAME_DEFS = {
  mlbb: { label: 'Mobile Legends', short: 'MLBB', format: '2 groups · BO2 → BO3 playoff', rules: './mobile-legends.html', logo: '/game-logos/mlbb-official.jpg', logoClass: 'wordmark', art: '/game-backdrops/mlbb-game.jpg' },
  mecha: { label: 'Meccha Chameleon', short: 'MECHA', format: '2 lobbies · 6 rounds/lobby · 4 players/team', rules: './games.html#mecha', logo: '/game-logos/mecha.webp', art: '/game-backdrops/mecha-chameleon-hero.jpg' },
  stumble: { label: 'Stumble Guys', short: 'STUMBLE', format: '30 players · Grand Prix', rules: './games.html#stumble', logo: '/game-logos/stumble.svg', logoClass: 'wordmark light', art: '/game-backdrops/stumble-game.png' },
  pubg: { label: 'PUBG Mobile', short: 'PUBG', format: '3 maps · placement + kills', rules: './games.html#pubg', logo: '/game-logos/pubg-mobile.svg', logoClass: 'wordmark light', art: '/game-backdrops/pubg-game.jpg' },
  tekken: { label: 'Tekken 7', short: 'TEKKEN 7', format: '24 players · 4 groups → double elimination', rules: './games.html#tekken', logo: '/game-logos/tekken7.png', logoClass: 'wordmark light', art: '/game-backdrops/tekken7-game.jpg' },
  tetris: { label: 'Tetris', short: 'TETRIS', format: '36 players · 6 groups · BO5 → double elimination', rules: './games.html#tetris', logo: '/game-logos/tetris-logo.jpg', logoClass: 'wordmark tetris-logo', art: '/game-backdrops/tetris-gamer.webp' },
};
const GAME_IDS = Object.keys(GAME_DEFS);
// Tekken keeps its own Supabase row and full app (src/tekken); it is not part of this shared state.
const REQUIRED_GAME_IDS = GAME_IDS.filter(id => id !== 'tetris' && id !== 'tekken');
const TEAM_NAMES = ['Team Gegeenee', 'Team Ganaa', 'Team Garidaa', 'Team Amaraa', 'Team Bery', 'Team Bagaa'];
const TAGS = ['ALP', 'BRV', 'CHR', 'DLT', 'ECH', 'FOX'];
const TEAM_NAME_VERSION = 'ganaa-team-names-v1';
const ROSTER_SIZES = { mlbb: 5, mecha: 4, stumble: 5, pubg: 4, tetris: 6 };
const MECHA_LOBBIES = ['A', 'B'];
const MECHA_ROUNDS = [1, 2, 3, 4, 5, 6];
const ML_SERIES = ['', '2-0', '1-1', '0-2'];
const BO3_SERIES = ['', '2-0', '2-1', '1-2', '0-2'];
const TETRIS_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F'];
const TETRIS_SERIES = ['', '3-0', '3-1', '3-2', '2-3', '1-3', '0-3'];
const MAP_NAMES = ['Sanhok', 'Livik', 'Erangel'];
const BOARD_NAV = [
  ['arena', 'Arena', '⌂'],
  ['groups', 'Groups', '▦'],
  ['playoffs', 'Playoffs', '⚑'],
  ['players', 'Fighters', '♙'],
  ['rules', 'Rules', '▤'],
  ['admin', 'Admin', '▣'],
];
const BOARD_ROUTES = {
  arena: '',
  groups: 'groups',
  playoffs: 'playoffs',
  players: 'players',
  admin: 'admin',
};

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const clone = value => structuredClone(value);
const parts = value => { const [wins, losses] = String(value || '0-0').split('-').map(Number); return { wins: Number.isFinite(wins) ? wins : 0, losses: Number.isFinite(losses) ? losses : 0 }; };
const seriesOptions = (values, selected) => values.map(value => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value || 'Not played'}</option>`).join('');
const teamById = (game, id) => game.teams.find(team => team.id === id);

function makeTetrisPlayers(teams) {
  return teams.flatMap(team => [
    ...Array.from({ length: 4 }, (_, index) => ({ id: `${team.id}-m${index + 1}`, teamId: team.id, name: `${team.tag} Player ${index + 1}`, gender: 'MEN', group: TETRIS_GROUPS[index], photo: null })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `${team.id}-f${index + 1}`, teamId: team.id, name: `${team.tag} Player ${index + 5}`, gender: 'WOMEN', group: TETRIS_GROUPS[index + 4], photo: null })),
  ]);
}
function makePlayers(teamId, tag, count) {
  return Array.from({ length: count }, (_, index) => ({ id: `${teamId}p${index + 1}`, name: `${tag} Player ${index + 1}`, photo: null }));
}
function makeMechaLobbies() {
  return Object.fromEntries(MECHA_LOBBIES.map(lobby => [lobby, {
    rounds: Object.fromEntries(MECHA_ROUNDS.map(round => [String(round), { scores: {}, catches: '' }]))
  }]));
}
function makeTetrisMatches(players) {
  return TETRIS_GROUPS.flatMap(group => {
    const groupPlayers = players.filter(player => player.group === group);
    return groupPlayers.flatMap((a, index) => groupPlayers.slice(index + 1).map(b => ({ id: `${group}-${a.id}-${b.id}`, group, a: a.id, b: b.id, score: '' })));
  });
}

function groupMatches() {
  return [
    { id: 'A-1', group: 'A', a: 'a1', b: 'a2' }, { id: 'A-2', group: 'A', a: 'a1', b: 'a3' }, { id: 'A-3', group: 'A', a: 'a2', b: 'a3' },
    { id: 'B-1', group: 'B', a: 'b1', b: 'b2' }, { id: 'B-2', group: 'B', a: 'b1', b: 'b3' }, { id: 'B-3', group: 'B', a: 'b2', b: 'b3' },
  ];
}

function defaultState() {
  const mlTeams = [
    ['a1', 'A', 0], ['a2', 'A', 1], ['a3', 'A', 2], ['b1', 'B', 3], ['b2', 'B', 4], ['b3', 'B', 5],
  ].map(([id, group, index]) => ({ id, group, name: TEAM_NAMES[index], tag: TAGS[index], logo: null, players: makePlayers(id, TAGS[index], ROSTER_SIZES.mlbb) }));
  const makeTeams = (gameId = null) => TEAM_NAMES.map((name, index) => ({ id: `t${index + 1}`, name, tag: TAGS[index], logo: null, ...(gameId ? { players: makePlayers(`t${index + 1}`, TAGS[index], ROSTER_SIZES[gameId]) } : {}) }));
  const tetrisTeams = makeTeams();
  const tetrisGames = Array.from({ length: 3 }, (_, index) => ({
    id: `game${index + 1}`,
    label: `Game ${index + 1}`,
    rows: tetrisTeams.map((team, teamIndex) => ({ teamId: team.id, zone: teamIndex < 3 ? 'A' : 'B', wins: 0, place: '' })),
  }));
  const tetrisPlayers = makeTetrisPlayers(tetrisTeams);
  return {
    version: 1,
    teamNameVersion: TEAM_NAME_VERSION,
    updated: null,
    games: {
      mlbb: { teams: mlTeams, groupResults: groupMatches().map(match => ({ ...match, series: '' })), playoff: { sf1: '', sf2: '', final: '', third: '' } },
      mecha: { teams: makeTeams('mecha').map(team => ({ ...team, hider: 0, topMissedSpot: 0, seekersCaught: 0, cleanSweeps: 0 })), lobbies: makeMechaLobbies() },
      stumble: { teams: makeTeams('stumble').map(team => ({ ...team, players: team.players.map(player => ({ ...player, points: 0 })) })) },
      pubg: { teams: makeTeams('pubg').map(team => ({ ...team, maps: MAP_NAMES.map(() => ({ placement: '', kills: '' })) })) },
      tetris: { teams: tetrisTeams, games: tetrisGames, players: tetrisPlayers, matches: makeTetrisMatches(tetrisPlayers) },
    },
  };
}

function ensureMediaState(value) {
  if (!value?.games) return value;
  Object.entries(ROSTER_SIZES).forEach(([gameId, count]) => {
    const game = value.games[gameId];
    if (!game?.teams) return;
    game.teams.forEach(team => {
      team.logo = team.logo || null;
      if (gameId === 'tetris') return;
      const players = Array.isArray(team.players) ? team.players : [];
      team.players = Array.from({ length: count }, (_, index) => ({
        id: players[index]?.id || `${team.id}p${index + 1}`,
        name: players[index]?.name || `${team.tag} Player ${index + 1}`,
        photo: players[index]?.photo || null,
        ...(players[index]?.points != null ? { points: players[index].points } : {}),
      }));
    });
    if (gameId === 'tetris') game.players = (game.players || []).map(player => ({ ...player, photo: player.photo || null }));
  });
  return value;
}

function ensureMechaScorebook(game) {
  if (!game?.teams) return;
  if (!game.lobbies || typeof game.lobbies !== 'object') game.lobbies = makeMechaLobbies();
  MECHA_LOBBIES.forEach(lobby => {
    if (!game.lobbies[lobby] || typeof game.lobbies[lobby] !== 'object') game.lobbies[lobby] = { rounds: {} };
    if (!game.lobbies[lobby].rounds || typeof game.lobbies[lobby].rounds !== 'object') game.lobbies[lobby].rounds = {};
    MECHA_ROUNDS.forEach(round => {
      const current = game.lobbies[lobby].rounds[String(round)];
      game.lobbies[lobby].rounds[String(round)] = {
        scores: current?.scores && typeof current.scores === 'object' ? current.scores : {},
        catches: current?.catches == null ? '' : current.catches,
      };
    });
  });
}

function normalizeState(value) {
  if (!usable(value)) return null;
  ensureMediaState(value);
  ensureMechaScorebook(value.games.mecha);
  if (!value.games.tetris?.teams || !Array.isArray(value.games.tetris.games) || value.games.tetris.games.length !== 3) {
    value.games.tetris = defaultState().games.tetris;
    const referenceTeams = value.games.tekken?.teams || value.games.mecha?.teams;
    if (Array.isArray(referenceTeams) && referenceTeams.length === 6) {
      value.games.tetris.teams = value.games.tetris.teams.map((team, index) => ({ ...team, name: referenceTeams[index]?.name || team.name, tag: referenceTeams[index]?.tag || team.tag }));
    }
  }
  if (!Array.isArray(value.games.tetris.players) || value.games.tetris.players.length !== 36) value.games.tetris.players = makeTetrisPlayers(value.games.tetris.teams);
  if (!Array.isArray(value.games.tetris.matches) || value.games.tetris.matches.length !== 90) value.games.tetris.matches = makeTetrisMatches(value.games.tetris.players);
  value.games.mecha?.teams?.forEach(team => {
    if (team.hider == null) team.hider = 0;
    if (team.topMissedSpot == null) team.topMissedSpot = 0;
    if (team.seekersCaught == null) team.seekersCaught = Math.round(num(team.seeker) / 0.33);
    if (team.cleanSweeps == null) team.cleanSweeps = Math.round(num(team.bonus) / 2);
  });
  if (value.teamNameVersion !== TEAM_NAME_VERSION) {
    ['mecha', 'stumble', 'pubg', 'tetris'].forEach(id => {
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
let activeBoardView = 'arena';
let activeAdminPanel = 'matches';
if (!GAME_DEFS[activeGame]) activeGame = 'mlbb';
let authSession = null;
let connection = false;
let channel = null;
let toastTimer = null;
let sharedProfiles = {};
let mechaAdminLobby = 'A';
let mechaAdminRound = 1;
const mechaDrafts = {};
const mechaNameDrafts = {};

function applySharedIdentity(value) {
  if (!value?.games) return value;
  ['mlbb', 'mecha', 'stumble', 'pubg', 'tetris'].forEach(gameId => {
    if (value.games[gameId]?.teams) value.games[gameId].teams = applySharedProfiles(value.games[gameId].teams, sharedProfiles);
  });
  return value;
}

async function syncSharedIdentity(game) {
  if (activeGame === 'tekken' || !client || !authSession?.user || !game?.teams?.length) return;
  const changes = {};
  game.teams.forEach(team => { changes[team.tag] = { tag: team.tag, name: team.name, logo: team.logo || null }; });
  sharedProfiles = await saveSharedProfiles(changes);
}

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
  if (remoteState) { state = applySharedIdentity(remoteState); writeCache(state); render(); }
}

function startRealtime() {
  setMode(client ? 'syncing' : 'local');
  if (!client) return;
  client.auth.getSession().then(({ data }) => { authSession = data.session; renderAdmin(); }).catch(() => {});
  client.auth.onAuthStateChange((_event, session) => { authSession = session; renderAdmin(); });
  channel = client.channel(`tournament:${TOURNAMENT_ID}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${TOURNAMENT_ID}` }, payload => {
    if (payload.eventType !== 'DELETE' && usable(payload.new?.state)) { state = applySharedIdentity(normalizeState(payload.new.state)); writeCache(state); render(); }
  }).subscribe(status => { if (status === 'SUBSCRIBED') { connection = true; setMode('live'); } if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) { connection = false; setMode('syncing'); } });
  loadRemote().catch(error => { console.error('[additional-games] read failed', error); setMode('syncing'); });
}

async function signIn(email, password) { if (!client) throw new Error('Supabase is not configured'); const { data, error } = await client.auth.signInWithPassword({ email, password }); if (error) throw error; authSession = data.session; }
async function signOut() { if (client) { const { error } = await client.auth.signOut(); if (error) throw error; } authSession = null; }
/* Saves one game. The board row holds every game, so the change is merged into
   the freshest row instead of replacing it: saving PUBG can never wipe an MLBB
   edit somebody made a second earlier. */
async function publish(gameId, game) {
  state = { ...state, games: { ...state.games, [gameId]: game }, updated: new Date().toISOString() };
  writeCache(state); render();
  if (!client) return { ok: true, local: true };
  const result = await saveRow(client, 'tournaments', TOURNAMENT_ID, current => {
    const board = normalizeState(current) || defaultState();
    board.games[gameId] = game;
    board.updated = new Date().toISOString();
    return board;
  });
  if (!result.ok) {
    console.error('[additional-games] publish failed', result.error);
    await loadRemote().catch(() => {});   // drop the unsaved edit from the screen
    return { ok: false, local: false, error: result.error };
  }
  const saved = normalizeState(result.state);
  if (saved) { state = saved; writeCache(state); render(); }
  return { ok: true, local: false };
}

function showToast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800); }
function teamName(game, id, fallback = 'Waiting') { return teamById(game, id)?.name || fallback; }
function scoreForBo2(series) { const result = parts(series); return result.wins === result.losses ? [1, 1] : result.wins > result.losses ? [3, 0] : [0, 3]; }
function mechaLobbyPlayers(game, lobby) {
  const offset = lobby === 'B' ? 2 : 0;
  return game.teams.flatMap(team => (team.players || []).slice(offset, offset + 2).map(player => ({ ...player, teamId: team.id, team })));
}
function mechaRoundRecord(game, lobby, round) {
  const record = game?.lobbies?.[lobby]?.rounds?.[String(round)];
  return { scores: { ...(record?.scores || {}) }, catches: record?.catches == null ? '' : record.catches };
}
function mechaSeekerTeam(game, round) {
  return game?.teams?.[(Number(round) - 1) % (game?.teams?.length || 1)] || null;
}
function mechaRoundPreview(game, lobby, round, record = mechaRoundRecord(game, lobby, round)) {
  const seekerTeam = mechaSeekerTeam(game, round);
  const players = mechaLobbyPlayers(game, lobby);
  const hiders = players.filter(player => player.teamId !== seekerTeam?.id);
  const scoreFor = player => record.scores?.[player.id] === '' || record.scores?.[player.id] == null ? null : num(record.scores[player.id]);
  const entered = hiders.filter(player => scoreFor(player) !== null);
  const total = entered.reduce((sum, player) => sum + scoreFor(player), 0);
  const sorted = [...entered].sort((a, b) => scoreFor(b) - scoreFor(a) || a.id.localeCompare(b.id));
  const rankFor = player => {
    const score = scoreFor(player);
    return score === null ? null : 1 + sorted.filter(other => scoreFor(other) > score).length;
  };
  const catches = record.catches === '' || record.catches == null ? null : num(record.catches);
  const seekerPoints = catches === null ? 0 : Math.round(catches * 0.33 * 10) / 10;
  const bonus = catches === 10 ? 2 : 0;
  return {
    seekerTeam,
    hiders,
    rows: hiders.map(player => ({ player, score: scoreFor(player), points: total > 0 && scoreFor(player) !== null ? Math.round((scoreFor(player) / total) * 10 * 10) / 10 : 0, rank: rankFor(player) })),
    entered: entered.length,
    total,
    catches,
    seekerPoints,
    bonus,
    valid: entered.length === 10 && total > 0 && catches !== null && catches >= 0 && catches <= 10,
  };
}
function mechaHasSavedRounds(game) {
  return MECHA_LOBBIES.some(lobby => MECHA_ROUNDS.some(round => mechaRoundPreview(game, lobby, round).valid));
}
function mechaDraftKey(lobby = mechaAdminLobby, round = mechaAdminRound) { return `${lobby}-${round}`; }
function mechaEditorRecord(game, lobby = mechaAdminLobby, round = mechaAdminRound) {
  return mechaDrafts[mechaDraftKey(lobby, round)] || mechaRoundRecord(game, lobby, round);
}
function mechaPlayerDisplayName(player) { return mechaNameDrafts[player.id] ?? player.name; }
function mechaRoundSaved(game, lobby, round) { return mechaRoundPreview(game, lobby, round).valid; }
function mechaSavedRoundCount(game, lobby) { return MECHA_ROUNDS.filter(round => mechaRoundSaved(game, lobby, round)).length; }
function captureMechaDraft(game) {
  if (activeGame !== 'mecha' || !document.querySelector('#adminEditor [data-mecha-score]')) return null;
  const key = mechaDraftKey();
  const record = mechaEditorRecord(game);
  record.scores = {};
  document.querySelectorAll('#adminEditor [data-mecha-score]').forEach(input => {
    record.scores[input.dataset.mechaScore] = input.value.trim();
  });
  const catches = document.querySelector('#adminEditor [data-mecha-catches]');
  record.catches = catches ? catches.value.trim() : '';
  document.querySelectorAll('#adminEditor [data-mecha-player]').forEach(input => {
    mechaNameDrafts[input.dataset.mechaPlayer] = input.value.trim();
  });
  mechaDrafts[key] = record;
  return record;
}
function applyMechaNames(game) {
  game.teams.forEach(team => (team.players || []).forEach(player => {
    if (mechaNameDrafts[player.id]?.trim()) player.name = mechaNameDrafts[player.id].trim();
  }));
}
function mechaRoundValidation(preview) {
  if (preview.entered < 10) return `${preview.entered}/10 hider scores entered`;
  if (preview.total <= 0) return 'At least one Missed Spot score must be above zero';
  if (preview.catches === null) return 'Enter the caught Hider count';
  if (preview.catches < 0 || preview.catches > 10) return 'Caught Hiders must be between 0 and 10';
  return '';
}
function mechaStats(team, game) {
  if (game && mechaHasSavedRounds(game)) {
    let hider = 0; let topMissedSpot = 0; let seekersCaught = 0; let cleanSweeps = 0; let seeker = 0; let bonus = 0;
    MECHA_LOBBIES.forEach(lobby => MECHA_ROUNDS.forEach(round => {
      const preview = mechaRoundPreview(game, lobby, round);
      if (!preview.valid) return;
      if (preview.seekerTeam?.id === team.id) {
        seekersCaught += preview.catches;
        seeker += preview.seekerPoints;
        bonus += preview.bonus;
        if (preview.catches === 10) cleanSweeps += 1;
      } else {
        hider += preview.rows.filter(row => row.player.teamId === team.id).reduce((sum, row) => sum + row.points, 0);
        const maxScore = Math.max(...preview.rows.map(row => row.score ?? 0));
        if (preview.rows.some(row => row.player.teamId === team.id && row.score === maxScore)) topMissedSpot += 1;
      }
    }));
    return { hider: Math.round(hider * 10) / 10, topMissedSpot, seekersCaught, cleanSweeps, seeker: Math.round(seeker * 10) / 10, bonus: Math.round(bonus * 10) / 10, points: Math.round((hider + seeker + bonus) * 10) / 10 };
  }
  const hider = Math.round(num(team.hider) * 10) / 10;
  const legacyTop = num(team.topMissedSpot);
  const seekersCaught = team.seekersCaught == null ? Math.round(num(team.seeker) / 0.33) : num(team.seekersCaught);
  const cleanSweeps = team.cleanSweeps == null ? Math.round(num(team.bonus) / 2) : num(team.cleanSweeps);
  const seeker = Math.round(seekersCaught * 0.33 * 10) / 10;
  const bonus = cleanSweeps * 2;
  return { hider, topMissedSpot: legacyTop, seekersCaught, cleanSweeps, seeker, bonus, points: Math.round((hider + seeker + bonus) * 10) / 10 };
}
function tetrisGroupRows(game, group) {
  const players = (game.players || []).filter(player => player.group === group).map(player => ({ player, points: 0, wins: 0, played: 0, gamesWon: 0, gamesLost: 0 }));
  const byId = new Map(players.map(row => [row.player.id, row]));
  (game.matches || []).filter(match => match.group === group && match.score).forEach(match => {
    const result = parts(match.score); const a = byId.get(match.a); const b = byId.get(match.b);
    if (!a || !b || result.wins === result.losses) return;
    a.played += 1; b.played += 1; a.gamesWon += result.wins; a.gamesLost += result.losses; b.gamesWon += result.losses; b.gamesLost += result.wins;
    if (result.wins > result.losses) { a.points += 3; a.wins += 1; b.points += result.losses; } else { b.points += 3; b.wins += 1; a.points += result.wins; }
  });
  return players.map(row => ({ name: row.player.name, sub: `${row.player.gender} · ${row.played}/5 matches`, points: row.points, wins: row.wins, played: row.played, games: `${row.gamesWon}-${row.gamesLost}`, gamesWon: row.gamesWon })).sort((a, b) => b.points - a.points || b.wins - a.wins || b.gamesWon - a.gamesWon || a.name.localeCompare(b.name));
}

function rowMedia(row) {
  const game = state.games[activeGame];
  const teams = game?.teams || [];
  let team = row.team || teams.find(candidate => candidate.name === row.name || candidate.name === row.sub);
  let player = null;
  if (activeGame === 'tetris') player = (game.players || []).find(item => item.name === row.name || item.id === row.playerId);
  else if (team) player = (team.players || []).find(item => item.name === row.name || item.id === row.playerId);
  if (!team && player) team = teams.find(candidate => candidate.id === player.teamId);
  return { teamLogo: assetUrl(row.logo || team?.logo), photo: assetUrl(row.photo || player?.photo) };
}
function rowMediaMark(row) {
  const media = rowMedia(row);
  const source = media.photo || media.teamLogo;
  return source ? `<span class="ag-row-media"><img src="${esc(source)}" alt=""></span>` : '';
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
  return `<div class="ag-table-wrap"><table class="ag-table"><thead><tr><th>#</th><th>Team / Player</th>${columns.map(column => `<th class="num">${column.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row, index) => `<tr><td><span class="ag-rank ${index < 3 ? 'top' : ''}">${index + 1}</span></td><td><span class="ag-team ag-team-with-media">${rowMediaMark(row)}<span>${esc(row.name)}</span></span>${row.sub ? `<span class="ag-sub">${esc(row.sub)}</span>` : ''}</td>${columns.map(column => `<td class="num ${column.score ? 'score' : ''}">${esc(row[column.key] ?? 0)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
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
  const rows = game.teams.map(team => { const score = mechaStats(team, game); return { name: team.name, sub: team.tag, hider: score.hider, seeker: score.seeker, bonus: score.bonus, points: score.points }; }).sort((a, b) => b.points - a.points || b.hider - a.hider);
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

function renderTetris(game) { return renderTetrisClassic(game); }

function sectionTargetId(title) {
  const normalized = String(title).toUpperCase();
  if (/GROUP STAGE|ZONE QUALIFICATION|HIDER \/ SEEKER RACE|TEAM RACE|MAP QUALIFICATION/.test(normalized)) return 'board-groups';
  if (/PLAYOFF BRACKET|PLAYOFF PATH/.test(normalized)) return 'board-playoffs';
  if (/ROSTER/.test(normalized)) return 'board-players';
  return '';
}
function classicSection(eyebrow, title, body, action = '') { const target = sectionTargetId(title); return `<section${target ? ` id="${target}"` : ''} class="ag-classic-section"><div class="ag-classic-section-head"><div><span>${esc(eyebrow)}</span><h2>${esc(title)}</h2></div>${action ? `<b>${esc(action)}</b>` : ''}</div>${body}</section>`; }
function classicFacts(items) { return `<div class="ag-classic-facts">${items.map(item => `<div><b>${esc(item.value)}</b><span>${esc(item.label)}</span></div>`).join('')}</div>`; }
function classicMiniRank(rows, value, meta) { return `<div class="ag-classic-mini-rank">${rows.map((row, index) => `<div class="ag-classic-mini-row ${index > 1 ? 'is-muted' : ''}"><span class="ag-classic-mini-place">${index + 1}</span>${dashAvatar(row.name, index)}<span><b>${esc(row.name)}</b><small>${esc(meta(row))}</small></span><strong>${esc(value(row))}</strong></div>`).join('')}</div>`; }
function classicGroupCard(title, subtitle, rows, value, meta) { return `<article class="ag-classic-group"><div class="ag-classic-group-head"><span class="ag-classic-group-mark">${esc(title.replace(/[^A-Z0-9]/gi, '').slice(-1) || '#')}</span><div><b>${esc(title)}</b><small>${esc(subtitle)}</small></div><span>LIVE</span></div>${classicMiniRank(rows, value, meta)}</article>`; }
function classicTable(rows, columns) { return `<div class="ag-classic-table-wrap"><table class="ag-classic-table"><thead><tr><th>#</th><th>Team / Player</th>${columns.map(column => `<th>${esc(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row, index) => `<tr><td><span class="ag-classic-rank ${index < 3 ? 'top' : ''}">${index + 1}</span></td><td><b class="ag-team-with-media">${rowMediaMark(row)}<span>${esc(row.name)}</span></b><small>${esc(row.sub || '')}</small></td>${columns.map(column => `<td>${esc(column.value ? column.value(row) : row[column.key] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
function classicMatch(title, meta, rows) { return `<article class="ag-classic-match"><div class="ag-classic-match-head"><b>${esc(title)}</b><span>${esc(meta)}</span></div>${rows.map(row => `<div class="ag-classic-match-row"><span>${esc(row.left)}</span><strong>${esc(row.score || '—')}</strong><span>${esc(row.right)}</span></div>`).join('')}</article>`; }
function classicBoard(def, subtitle, facts, formatCards, stage, standings, roster, breakdown, note) {
  return `<div id="board-arena" class="ag-classic-board"><section class="ag-classic-banner"><div class="ag-classic-banner-lockup"><div class="ag-classic-logo ${def.logoClass || ''}"><img src="${def.logo}" alt="${esc(def.label)} logo"></div><div><span>DDAM CUP · OFFICIAL TOURNAMENT FORMAT</span><h1>DDAM ESPORT CUP <b>${esc(def.label)}</b></h1><p>${esc(subtitle)}</p></div></div><span class="ag-classic-live">LIVE BOARD</span></section>${classicFacts(facts)}${classicSection('TOURNAMENT FORMAT', 'FORMAT & RULES', `<div class="ag-classic-format-grid">${formatCards.map(card => `<article><b>${esc(card.title)}</b><p>${esc(card.body)}</p></article>`).join('')}</div>`)}${stage}${standings}${roster}${breakdown}<p class="ag-classic-note">${note}</p></div>`;
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
  const rows = game.teams.map(team => { const score = mechaStats(team, game); return { name: team.name, sub: `${team.tag} · Hider ${score.hider.toFixed(1)} · ${score.seekersCaught} caught`, hider: score.hider, caught: score.seekersCaught, bonus: score.bonus, points: score.points }; }).sort((a, b) => b.points - a.points || b.hider - a.hider);
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

function tetrisGroupFormat(group, division) {
  return `<article class="ag-tetris-group-card"><div class="ag-tetris-group-mark">${esc(group)}</div><div><b>GROUP ${esc(group)}</b><span>${esc(division)} · 6 players</span></div><strong>BO5</strong><p>1st → UPPER · 2nd → LOWER · 3–6 OUT</p></article>`;
}

function tetrisBracketCard(title, format, body) {
  return `<article class="ag-tetris-bracket-card"><span>${esc(title)}</span><h3>${esc(format)}</h3>${body}</article>`;
}

function renderTetrisClassic(game) {
  const groups = `<div class="ag-tetris-group-grid">${['A', 'B', 'C', 'D'].map(group => tetrisGroupFormat(group, 'MEN')).join('')}${['E', 'F'].map(group => tetrisGroupFormat(group, 'WOMEN')).join('')}</div>`;
  const stage = classicSection('36 PLAYERS · 6 GROUPS', 'GROUP STAGE', `${groups}<div class="ag-tetris-callout"><b>1v1 ROUND-ROBIN · BEST OF 5</b><span>Group A–D: men · Group E–F: women. Нэг group-д 6 багийн тус бүрээс яг 1 тоглогч орно. Нэг багийн 2 тоглогч нэг group-д орохгүй.</span></div>`);
  const liveGroups = classicSection('BO5 RESULTS · LIVE', 'GROUP STANDINGS', `<div class="ag-classic-group-grid">${TETRIS_GROUPS.map(group => classicGroupCard(`GROUP ${group}`, `${group < 'E' ? 'MEN' : 'WOMEN'} · 15 MATCHES`, tetrisGroupRows(game, group), item => `${item.points}P`, item => `${item.wins}W · ${item.played}/5`)).join('')}</div>`);
  const playoff = classicSection('DOUBLE ELIMINATION', 'PLAYOFF PATH', `<div class="ag-tetris-bracket-grid">${tetrisBracketCard('MEN · 8 PLAYERS', '4 UPPER + 4 LOWER', '<ul><li>Upper: WSF 4 → 2 → WF 2 → 1</li><li>Lower: LR1 → LR2 → LR3 → LF</li><li>Grand Final · BO5 · bracket reset боломжтой</li><li>3rd = LF loser · 4th = LR3 loser</li></ul>')}${tetrisBracketCard('WOMEN · 4 PLAYERS', '2 UPPER + 2 LOWER', '<ul><li>Upper-ээс эхний ялагдлаар Lower руу орно</li><li>Lower-ийн ялагдал шууд хасагдана</li><li>Grand Final · BO5 · bracket reset боломжтой</li></ul>')}</div>`);
  const scoring = classicSection('MATCH & CUP POINTS', 'SCORING SYSTEM', `<div class="ag-tetris-rule-grid"><article><b>GROUP MATCH</b><p>BO5-д хожсон тоглогч 3 оноо авна. Хожигдсон тоглогч авсан game-ийн тоогоор point авна. Жишээ: 3:1 бол winner 3, loser 1.</p></article><article><b>GROUP TIE-BREAK</b><ol><li>Нийт хожил</li><li>Нийт оноо</li><li>Зохион байгуулагчийн tie-break match</li></ol></article><article><b>CUP POINT</b><p>Эрэгтэй/эмэгтэй ангилал тус бүр: 1-р байр 5, 2-р байр 3, 3-р байр 2, 4-р байр 1 point. Багийн нийт point-оор нэгдсэн байр гарна.</p></article><article><b>TEAM TIE-BREAK</b><p>Point тэнцвэл өндөр байр эзэлсэн баг давуу. Байр мөн тэнцвэл харгалзах тоглогчид BO5-аар багийн ялагч тодортол тоглоно.</p></article></div>`);
  const roster = classicSection('6 TEAMS · 36 PLAYERS', 'ROSTER & CATEGORY', classicTable(game.teams.map(team => ({ name: team.name, sub: `${team.tag} · 4 men + 2 women`, roster: '6 players', groups: 'A–F' })), [{ label: 'Roster', key: 'roster' }, { label: 'Groups', key: 'groups' }]));
  const conduct = classicSection('OFFICIAL NOTICE', 'PLAYER RESPONSIBILITIES', `<div class="ag-tetris-notice-grid"><article><b>BEFORE MATCH</b><p>Компьютер, тохиргоо, keyboard болон хуваарьт байраа тоглолтоос өмнө бэлэн болгоно. Өөрийн keyboard ашиглаж болно.</p></article><article><b>NO COACHING</b><p>Match эхэлсний дараа гаднаас зөвлөгөө, тоглолтын мэдээлэл, spectator тусламж дамжуулахыг хориглоно.</p></article><article><b>TECHNICAL ISSUES</b><p>Хувийн keyboard, төхөөрөмж, internet-ийн асуудлаар rematch автоматаар хийхгүй. Host, console, venue-ийн алдааг зохион байгуулагч шийднэ.</p></article><article><b>DISCIPLINE</b><p>Cheat/hack, account sharing, match fixing, саад учруулах, доромжлол болон дүрмийн цоорхой ашиглахыг хориглоно. Анхааруулгаас шууд хасалт хүртэл арга хэмжээ авна.</p></article></div>`);
  const breakdown = classicSection('PLAYOFF SEEDING', 'MEN & WOMEN ADVANCEMENT', `<div class="ag-tetris-seeding"><div><b>MEN · GROUP A–D</b><span>4 × 1st → Upper · 4 × 2nd → Lower · 3–6 → out</span></div><div><b>WOMEN · GROUP E–F</b><span>2 × 1st → Upper · 2 × 2nd → Lower · 3–6 → out</span></div></div>`);
  return classicBoard(GAME_DEFS.tetris, '6 баг · 36 тоглогч · 6 group · BO5 round-robin → men/women double elimination', [{ value: '6', label: 'Teams' }, { value: '36', label: 'Players' }, { value: '6', label: 'Groups' }, { value: 'BO5', label: 'Match format' }], [{ title: '1. Roster', body: 'Баг бүр 6 тоглогчтой: 4 эрэгтэй + 2 эмэгтэй. Тэмцээн 1v1 хэлбэртэй.' }, { title: '2. Group stage', body: 'A–F group тус бүр 6 тоглогчтой, бүгд round-robin BO5 тоглоно.' }, { title: '3. Playoff', body: 'Upper/Lower Double Elimination. Эрэгтэй 8, эмэгтэй 4 тоглогч playoff-д орно.' }], stage + liveGroups + playoff + scoring, roster, breakdown, conduct, 'Official Tetris format · Group A–D men, Group E–F women · 1st Upper, 2nd Lower, 3–6 eliminated. Шийдвэр, маргаан болон rematch-ийг зөвхөн зохион байгуулагч/шүүгч эцэслэнэ.');
}

function renderPublic() {
  if (activeGame === 'tekken') { mountTekkenTab(); return; }
  unmountTekkenTab();
  const game = state.games[activeGame]; const body = activeGame === 'mecha' ? renderMechaClassic(game) : activeGame === 'stumble' ? renderStumbleClassic(game) : activeGame === 'pubg' ? renderPubgClassic(game) : activeGame === 'tetris' ? renderTetrisClassic(game) : renderMlbbClassic(game); $('publicBoard').innerHTML = body;
}

/* Tekken is a full app of its own (src/tekken): groups, tie-breakers, double-elimination
   bracket, live scoring, photos and streams, stored in its own Supabase row. It is loaded
   on first use and mounted once, so updates to the shared board above never wipe it. */
let tekkenApp = null;
let tekkenLoading = null;
function mountTekkenTab() {
  if (tekkenApp || tekkenLoading) return;
  const host = $('publicBoard');
  host.innerHTML = '<div class="ag-dash-empty">Loading Tekken…</div>';
  tekkenLoading = import('./tekken/mount.ts')
    .then(({ mountTekken }) => { if (activeGame === 'tekken') tekkenApp = mountTekken(host, client); })
    .catch(error => { console.error('[tekken] failed to load', error); if (activeGame === 'tekken') host.innerHTML = '<div class="ag-dash-empty">Tekken board failed to load. Refresh the page.</div>'; })
    .finally(() => { tekkenLoading = null; });
}
function unmountTekkenTab() { if (tekkenApp) { tekkenApp.unmount(); tekkenApp = null; } }
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
  const rows = game.teams.map(team => { const score = mechaStats(team, game); return { name: team.name, sub: `${team.tag} · Hider ${score.hider.toFixed(1)} · Seeker ${score.seekersCaught} caught · +${score.bonus.toFixed(1)}`, points: `${score.points.toFixed(1)} pts`, raw: score.points, topMissedSpot: score.topMissedSpot }; }).sort((a, b) => b.raw - a.raw || b.topMissedSpot - a.topMissedSpot || a.name.localeCompare(b.name));
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
function renderTetrisDashboard(game) { return renderTetrisClassic(game); }

function boardViewFromHash() {
  const route = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)[0] || 'arena';
  return BOARD_NAV.find(([key]) => BOARD_ROUTES[key] === route)?.[0] || 'arena';
}

function renderBoardNav() {
  const nav = $('boardNav');
  if (!nav) return;
  nav.innerHTML = BOARD_NAV.map(([key, label, glyph]) => {
    const href = key === 'rules' ? GAME_DEFS[activeGame].rules : `#/${BOARD_ROUTES[key]}`;
    const active = key === activeBoardView;
    return `<a class="${active ? 'is-active' : ''}" href="${href}" data-board-view="${key}" aria-current="${active ? 'page' : 'false'}"><span class="ag-board-nav-glyph" aria-hidden="true">${glyph}</span><span>${label}</span></a>`;
  }).join('');
  nav.querySelectorAll('[data-board-view]').forEach(link => {
    link.addEventListener('click', () => {
      activeBoardView = link.dataset.boardView || 'arena';
      requestAnimationFrame(renderBoardNav);
    });
  });
}

function renderTabs() { $('gameTabs').innerHTML = GAME_IDS.map(id => `<button class="ag-tab ${id === activeGame ? 'active' : ''}" data-game="${id}" type="button"><img src="${GAME_DEFS[id].logo}" alt="">${GAME_DEFS[id].short}</button>`).join(''); document.querySelectorAll('.ag-tab').forEach(button => { button.onclick = () => { activeGame = button.dataset.game; activeAdminPanel = 'matches'; const url = new URL(location.href); url.searchParams.set('game', activeGame); history.replaceState({}, '', url); render(); }; }); }

function inputTeamNames(game) { return `<div class="ag-form-section"><h3>Team setup</h3><div class="ag-form-grid">${game.teams.map(team => `<label class="ag-label">${esc(team.tag || team.id)}<input class="ag-input" data-team-name="${team.id}" value="${esc(team.name)}"></label>`).join('')}</div></div>`; }
function renderMlEditor(game) { const name = id => teamName(game, id); return `${inputTeamNames(game)}<div class="ag-form-section"><h3>Group BO2 results</h3><div class="ag-form-grid">${game.groupResults.map(match => `<label class="ag-label">${match.group} · ${esc(name(match.a))} vs ${esc(name(match.b))}<select class="ag-select" data-ml-group="${match.id}">${seriesOptions(ML_SERIES, match.series)}</select></label>`).join('')}</div></div><div class="ag-form-section"><h3>Playoff BO3 results</h3><div class="ag-form-grid">${[['sf1','Semifinal 1'],['sf2','Semifinal 2'],['final','Grand Final'],['third','3rd Place Final']].map(([id, label]) => `<label class="ag-label">${label}<select class="ag-select" data-ml-playoff="${id}">${seriesOptions(BO3_SERIES, game.playoff[id])}</select></label>`).join('')}</div></div>`; }
function mechaSeekerHint(preview) {
  if (preview.catches === null) return 'Enter the catch count to calculate Seeker points.';
  if (preview.catches === 10) return 'Clean sweep — the +2.0 bonus is in.';
  if (preview.catches < 6) return `${6 - preview.catches} more catches to beat hiding (2.0).`;
  return `Beats the 2.0 a hiding round would have paid (${preview.seekerPoints.toFixed(1)} Seeker points).`;
}
function renderMechaEditor(game) {
  const lobby = MECHA_LOBBIES.includes(mechaAdminLobby) ? mechaAdminLobby : 'A';
  const round = MECHA_ROUNDS.includes(Number(mechaAdminRound)) ? Number(mechaAdminRound) : 1;
  const record = mechaEditorRecord(game, lobby, round);
  const preview = mechaRoundPreview(game, lobby, round, record);
  const seeker = preview.seekerTeam;
  const lobbyPlayers = mechaLobbyPlayers(game, lobby);
  const seekerNames = lobbyPlayers.filter(player => player.teamId === seeker?.id).map(player => mechaPlayerDisplayName(player)).join(' · ');
  const hiderTeams = game.teams.filter(team => team.id !== seeker?.id);
  const status = mechaRoundSaved(game, lobby, round) ? 'SAVED' : preview.valid ? 'READY TO SAVE' : 'INPUT REQUIRED';
  const savedCount = mechaSavedRoundCount(game, lobby);
  const roster = game.teams.map(team => {
    const players = lobbyPlayers.filter(player => player.teamId === team.id);
    return `<div class="ag-mecha-roster-team"><b>${esc(team.name)}</b><small>${esc(team.tag)}</small>${players.map(player => `<label class="ag-label"><span>Player</span><input class="ag-input" data-mecha-player="${esc(player.id)}" value="${esc(mechaPlayerDisplayName(player))}" maxlength="24"></label>`).join('')}</div>`;
  }).join('');
  const scoreCards = hiderTeams.map(team => `<section class="ag-mecha-score-team"><header><b>${esc(team.name)}</b><small>${esc(team.tag)} · HIDER</small></header>${lobbyPlayers.filter(player => player.teamId === team.id).map(player => {
    const row = preview.rows.find(item => item.player.id === player.id);
    const raw = record.scores?.[player.id] ?? '';
    return `<div class="ag-mecha-score-row"><span class="ag-mecha-player-name">${esc(mechaPlayerDisplayName(player))}</span><input class="ag-input ag-mecha-score-input" type="number" min="0" step="any" inputmode="decimal" data-mecha-score="${esc(player.id)}" value="${esc(raw)}" aria-label="Missed Spot points for ${esc(mechaPlayerDisplayName(player))}"><span class="ag-mecha-derived" data-mecha-points="${esc(player.id)}">${row?.score === null ? '—' : `${row?.points.toFixed(1)} pts`}</span><span class="ag-mecha-derived ag-mecha-rank" data-mecha-rank="${esc(player.id)}">${row?.rank ? `#${row.rank}` : '—'}</span></div>`;
  }).join('')}</section>`).join('');
  return `${inputTeamNames(game)}<div class="ag-mecha-desk" data-mecha-desk>
    <div class="ag-mecha-desk-head"><div><span>LIVE SCORE DESK</span><h3>MECCHA CHAMELEON · ENTER A ROUND</h3></div><b data-mecha-round-status>${status}</b></div>
    <p class="ag-help">Зөвхөн тоглоомын results screen дээр харагдах 10 Missed Spot тоо болон seeker-ийн catch count-ыг оруулна. Байр, хувь оноо, багийн нийт оноог систем автоматаар бодно.</p>
    <div class="ag-mecha-lobby-tabs">${MECHA_LOBBIES.map(id => `<button type="button" class="ag-mecha-tab ${id === lobby ? 'is-active' : ''}" data-mecha-lobby="${id}">LOBBY ${id}<small>${id === 'A' ? 'WOMEN' : 'MEN'} · ${mechaSavedRoundCount(game, id)}/6 SAVED</small></button>`).join('')}</div>
    <div class="ag-mecha-round-tabs">${MECHA_ROUNDS.map(id => `<button type="button" class="ag-mecha-round ${id === round ? 'is-active' : ''} ${mechaRoundSaved(game, lobby, id) ? 'is-saved' : ''}" data-mecha-round="${id}">${id}<small>${mechaRoundSaved(game, lobby, id) ? 'SAVED' : 'OPEN'}</small></button>`).join('')}</div>
    <div class="ag-mecha-roster-strip"><div class="ag-mecha-strip-head"><b>${esc(lobby === 'A' ? 'WOMEN LOBBY' : 'MEN LOBBY')} · PLAYER NAMES</b><span>12 players · names belong to this lobby</span></div><div class="ag-mecha-roster-grid">${roster}</div></div>
    <div class="ag-mecha-seeker"><div><span>ROUND ${round} · FIXED ROTATION</span><h4>${esc(seeker?.name || 'Seeker team not configured')} <small>SEEKS THIS ROUND</small></h4><p>${esc(seekerNames || 'Enter the two seeker names above.')}</p></div><label class="ag-label"><span>HIDERS CAUGHT · 0–10</span><input class="ag-input" type="number" min="0" max="10" step="1" data-mecha-catches value="${esc(record.catches)}"></label><strong data-mecha-seeker-points>${preview.catches === null ? '—' : `${preview.seekerPoints.toFixed(1)} PTS`}</strong><p class="ag-mecha-seeker-hint" data-mecha-seeker-hint>${esc(mechaSeekerHint(preview))}</p></div>
    <div class="ag-mecha-score-head"><div><span>MISSED SPOT POINTS</span><h4>Ten hider scores</h4></div><b data-mecha-count>${preview.entered}/10 entered · total ${preview.total.toLocaleString()}</b></div>
    <div class="ag-mecha-score-grid">${scoreCards}</div>
    <p class="ag-mecha-score-note">Each round shares 10 Hider points by Missed Spot. Position and points are derived from the raw scores, not typed.</p>
    <div class="ag-mecha-actions"><button type="button" class="ag-button" data-mecha-save-round ${preview.valid ? '' : 'disabled'}>Save round ${round}</button><button type="button" class="ag-button secondary" data-mecha-clear-round>Clear</button><button type="button" class="ag-button secondary" data-mecha-reset-cup>Reset Mecha scores</button><span data-mecha-validation>${esc(mechaRoundValidation(preview))}</span></div>
  </div>`;
}
function renderStumbleEditor(game) { return `<div class="ag-form-section"><h3>Player points</h3><div class="ag-grid">${game.teams.map(team => `<div class="ag-form-section"><h3>${esc(team.name)}</h3><div class="ag-form-grid">${team.players.map(player => `<label class="ag-label">${esc(player.name)}<input class="ag-input" data-stumble-name="${player.id}" value="${esc(player.name)}"><input class="ag-input" type="number" min="0" data-stumble-points="${player.id}" value="${num(player.points)}"></label>`).join('')}</div></div>`).join('')}</div></div>`; }
function renderPubgEditor(game) { return `${inputTeamNames(game)}<div class="ag-grid">${game.teams.map(team => `<div class="ag-form-section"><h3>${esc(team.name)}</h3><div class="ag-form-grid three">${team.maps.map((map, index) => `<div><label class="ag-label">${MAP_NAMES[index]} · Place<select class="ag-select" data-pubg="${team.id}" data-map="${index}" data-field="placement"><option value="">—</option>${[1,2,3,4,5,6].map(place => `<option value="${place}" ${String(place) === String(map.placement) ? 'selected' : ''}>${place}</option>`).join('')}</select></label><label class="ag-label" style="margin-top:8px">Kills<input class="ag-input" type="number" min="0" data-pubg="${team.id}" data-map="${index}" data-field="kills" value="${esc(map.kills)}"></label></div>`).join('')}</div></div>`).join('')}</div>`; }
function tetrisRosterEditor(game) { return `<div class="ag-tetris-admin-roster">${TETRIS_GROUPS.map(group => `<div class="ag-form-section"><h3>GROUP ${group} · ${group < 'E' ? 'MEN' : 'WOMEN'} · 6 PLAYERS</h3><div class="ag-form-grid three">${(game.players || []).filter(player => player.group === group).map(player => `<label class="ag-label">${esc(player.gender)} · ${esc(player.teamId)}<input class="ag-input" data-tetris-player="${player.id}" value="${esc(player.name)}"></label>`).join('')}</div></div>`).join('')}</div>`; }
function tetrisMatchEditor(game) { return `<div class="ag-tetris-admin-matches">${TETRIS_GROUPS.map(group => `<div class="ag-form-section"><h3>GROUP ${group} · 15 MATCHES</h3><div class="ag-tetris-match-list">${(game.matches || []).filter(match => match.group === group).map(match => { const a = (game.players || []).find(player => player.id === match.a); const b = (game.players || []).find(player => player.id === match.b); return `<label class="ag-tetris-match-row"><span>${esc(a?.name || match.a)} <b>VS</b> ${esc(b?.name || match.b)}</span><select class="ag-select" data-tetris-match="${match.id}">${seriesOptions(TETRIS_SERIES, match.score)}</select></label>`; }).join('')}</div></div>`).join('')}</div>`; }
function renderTetrisEditor(game) { return `${inputTeamNames(game)}<div class="ag-form-section"><h3>Official Tetris match control</h3><p class="ag-help">36 тоглогчийг Group A–F-д тус бүр 6-аар байршуулж, group stage-ийн BO5 үр дүнг энд хадгална. Winner = 3 point, loser = авсан game-ийн тоо.</p>${tetrisRosterEditor(game)}${tetrisMatchEditor(game)}</div>`; }
function renderEditor() { const game = state.games[activeGame]; return activeGame === 'tekken' ? '' : activeGame === 'mecha' ? renderMechaEditor(game) : activeGame === 'stumble' ? renderStumbleEditor(game) : activeGame === 'pubg' ? renderPubgEditor(game) : activeGame === 'tetris' ? renderTetrisEditor(game) : renderMlEditor(game); }

function adminQueueItem(code, left, right, status, meta) { return `<div class="ag-admin-queue-row"><span class="ag-admin-queue-code">${esc(code)}</span><div class="ag-admin-queue-match"><b>${esc(left)}</b><span>VS</span><b>${esc(right)}</b></div><em class="ag-admin-status ${status === 'SAVED' ? 'is-saved' : ''}">${esc(status)}</em><small>${esc(meta)}</small></div>`; }
function adminQueue(game) {
  let items = [];
  if (activeGame === 'mlbb') {
    items = game.groupResults.map((match, index) => { const round = game.groupResults.slice(0, index + 1).filter(item => item.group === match.group).length; return adminQueueItem(`${match.group} · R${round}`, teamName(game, match.a), teamName(game, match.b), match.series ? 'SAVED' : 'READY', `BO2 · ${match.series || 'score pending'}`); });
    items.push(...[['SF1', 'Semifinal 1'], ['SF2', 'Semifinal 2'], ['GF', 'Grand Final'], ['3RD', '3rd Place Final']].map(([code, label], index) => adminQueueItem(code, label, 'Waiting', game.playoff[['sf1', 'sf2', 'final', 'third'][index]] ? 'SAVED' : 'READY', 'BO3 playoff')));
  } else if (activeGame === 'mecha') {
    items = MECHA_LOBBIES.flatMap(lobby => MECHA_ROUNDS.map(round => {
      const seeker = mechaSeekerTeam(game, round);
      const saved = mechaRoundSaved(game, lobby, round);
      return adminQueueItem(`L${lobby} · R${round}`, seeker?.name || 'Seeker team', '10 HIDERS', saved ? 'SAVED' : 'READY', `${lobby === 'A' ? 'Women' : 'Men'} · ${saved ? 'round complete' : 'Missed Spot · catch'}`);
    }));
  } else if (activeGame === 'stumble') {
    items = game.teams.map((team, index) => adminQueueItem(`TEAM ${index + 1}`, team.name, 'Grand Prix', team.players.some(player => num(player.points)) ? 'SAVED' : 'READY', '5 player points'));
  } else if (activeGame === 'pubg') {
    items = MAP_NAMES.map((map, index) => adminQueueItem(`MAP ${index + 1}`, map, 'All teams', game.teams.some(team => team.maps[index]?.placement || num(team.maps[index]?.kills)) ? 'SAVED' : 'READY', 'placement + kills'));
  } else {
    const matches = game.matches || [];
    items = TETRIS_GROUPS.map(group => { const done = matches.filter(match => match.group === group && match.score).length; return adminQueueItem(`GROUP ${group}`, group <= 'D' ? 'MEN' : 'WOMEN', 'Round-robin', done ? 'SAVED' : 'READY', `BO5 · ${done}/15 matches`); });
  }
  return `<div class="ag-admin-queue"><div class="ag-admin-queue-head"><div><span>ORGANISER QUEUE</span><h3>${esc(GAME_DEFS[activeGame].short)} MATCHES</h3></div><b>${items.length}</b></div><div class="ag-admin-queue-list">${items.join('')}</div></div>`;
}
function adminGuide() {
  const guides = {
    mlbb: [['GROUP BO2', 'Winner 3 points, loser 0. Group ranking uses points, game differential and the official tie-break.'], ['PLAYOFF BO3', 'A1 vs B2 and B1 vs A2. Record semifinal, grand final and 3rd place series separately.']],
    mecha: [['ROUND INPUT', 'Lobby болон round сонгоод 10 Hider-ийн raw Missed Spot оноо, seeker-ийн caught count-ыг оруулна.'], ['AUTO SCORE', 'Hider-ийн 10 онооны хувь, байр, Seeker 0.33 × catch, clean-sweep +2.0 болон team total автоматаар бодогдоно.']],
    stumble: [['GRAND PRIX', 'Тоглогч бүрийн round оноог тусад нь оруулна. Багийн нийт = 5 тоглогчийн нийлбэр.'], ['LEADERBOARD', 'Нийт оноо өндөр баг түрүүлнэ. Tie-break-ийг зохион байгуулагч шийднэ.']],
    pubg: [['MAP SCORE', 'Placement points + kills × 2. Sanhok, Livik, Erangel map тус бүрийн үр дүнг тусад нь хадгална.'], ['TIE-BREAK', 'WWCD → нийт kill → Erangel placement → Erangel kill.']],
    tetris: [['GROUP BO5', '6 group, 1v1 round-robin. Хожсон тоглогч 3 point, хожигдсон тоглогч BO5-д авсан game-ийн тоогоор point авна.'], ['CUP POINT', 'Ангилал тус бүр 1-р байр 5, 2-р байр 3, 3-р байр 2, 4-р байр 1 point авна.']],
  }[activeGame] || [];
  return `<div class="ag-admin-system"><div class="ag-admin-work-head"><div><span>SCORING ENGINE</span><h3>${esc(GAME_DEFS[activeGame].label)} · SCORE SYSTEM</h3></div><b>RULES LOCKED</b></div><div class="ag-admin-rule-grid">${guides.map(([title, body]) => `<article><b>${esc(title)}</b><p>${esc(body)}</p></article>`).join('')}</div><div class="ag-admin-callout"><b>SEPARATE GAME LOGIC</b><span>Энэ panel зөвхөн ${esc(GAME_DEFS[activeGame].label)}-ийн онооны системийг ажиллуулна. Бусад тоглоомын оноо, ranking болон дүрэм тусдаа хадгалагдана.</span></div></div>`;
}
function mediaPlayersForTeam(game, team) {
  return activeGame === 'tetris'
    ? (game.players || []).filter(player => player.teamId === team.id)
    : (team.players || []);
}
function mediaRosterEditor(game) {
  if (activeGame === 'tekken') return '';
  return `<div class="ag-form-section ag-media-editor"><div class="ag-media-editor-head"><div><span>TEAM ASSETS</span><h3>LOGOS &amp; PLAYER PHOTOS</h3></div><b>${game.teams.length} TEAMS · ${game.teams.reduce((sum, team) => sum + mediaPlayersForTeam(game, team).length, 0)} PLAYERS</b></div><p class="ag-help">Багийн лого болон тоглогч бүрийн зургийг эндээс оруулна. Зураг автоматаар шахагдаж хадгалагдана.</p><div class="ag-media-teams">${game.teams.map(team => {
    const logo = assetUrl(team.logo);
    const players = mediaPlayersForTeam(game, team);
    return `<section class="ag-media-team"><div class="ag-media-team-head"><span class="ag-media-logo">${logo ? `<img src="${esc(logo)}" alt="${esc(team.name)} logo">` : esc(String(team.name || '?').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase())}</span><div class="ag-media-team-copy"><b>${esc(team.name)}</b><small>${esc(team.tag)} · ${players.length} players</small></div><div class="ag-media-actions"><button class="ag-button ag-media-logo-upload" type="button" data-media-team="${team.id}">${logo ? 'Change logo' : 'Upload logo'}</button>${logo ? `<button class="ag-button secondary ag-media-logo-remove" type="button" data-media-team="${team.id}">Remove</button>` : ''}</div></div><div class="ag-media-players">${players.map(player => {
      const photo = assetUrl(player.photo);
      return `<div class="ag-media-player-row"><span class="ag-media-player">${photo ? `<img src="${esc(photo)}" alt="${esc(player.name)}">` : esc(String(player.name || '?').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase())}</span><input class="ag-input ag-media-name" data-media-player="${player.id}" value="${esc(player.name)}" maxlength="24"><button class="ag-button ag-media-photo-upload" type="button" data-media-player="${player.id}">${photo ? 'Change photo' : 'Upload photo'}</button>${photo ? `<button class="ag-button secondary ag-media-photo-remove" type="button" data-media-player="${player.id}">Remove</button>` : ''}</div>`;
    }).join('')}</div></section>`;
  }).join('')}</div></div>`;
}
function adminRosterEditor(game) {
  let body;
  if (activeGame === 'stumble') body = `${inputTeamNames(game)}<div class="ag-form-section"><h3>Player roster</h3><div class="ag-admin-roster-grid">${game.teams.flatMap(team => team.players.map(player => `<label class="ag-label">${esc(team.name)} · Player<input class="ag-input" data-stumble-name="${player.id}" value="${esc(player.name)}"></label>`)).join('')}</div></div>`;
  else if (activeGame === 'tetris') body = `${inputTeamNames(game)}${tetrisRosterEditor(game)}`;
  else {
    const copy = 'Team names are shared with this game only and do not change another tournament board.';
    body = `${inputTeamNames(game)}<div class="ag-admin-callout"><b>ROSTER CONTROL</b><span>${copy}</span></div>`;
  }
  return `${body}${mediaRosterEditor(game)}`;
}
function mediaPlayerOf(game, playerId) {
  if (activeGame === 'tetris') return (game.players || []).find(player => player.id === playerId);
  for (const team of game.teams || []) {
    const player = (team.players || []).find(item => item.id === playerId);
    if (player) return player;
  }
  return null;
}
async function saveMediaPlayerName(playerId, input) {
  const game = state.games[activeGame];
  const player = mediaPlayerOf(game, playerId);
  const value = input.value.trim();
  if (!player) return;
  if (!value) { input.value = player.name; return; }
  if (value === player.name) return;
  const next = clone(game);
  const target = mediaPlayerOf(next, playerId);
  if (!target) return;
  target.name = value;
  await publish(activeGame, next);
}
async function uploadGamePlayerPhoto(playerId) {
  const game = state.games[activeGame];
  const player = mediaPlayerOf(game, playerId);
  if (!player) return;
  const file = await pickImage();
  if (!file) return;
  let data;
  try { data = await prepareImage(file, 'photo'); } catch (error) { showToast(error.message || 'Could not process that image'); return; }
  const previous = player.photo;
  let value = data;
  const storedOnline = Boolean(client && authSession?.user);
  if (storedOnline) {
    try { value = await uploadMedia(activeGame, `players/${playerId}`, data); }
    catch (error) { console.error('[additional-games] player photo upload failed:', error); showToast(`Photo upload failed — ${error.message || 'Storage rejected the file'}`); return; }
  }
  const next = clone(game);
  const target = mediaPlayerOf(next, playerId);
  if (!target) return;
  target.photo = value;
  const result = await publish(activeGame, next);
  if (storedOnline) { if (result.ok) void removeMedia(previous); else void removeMedia(value); }
}
async function removeGamePlayerPhoto(playerId) {
  const game = state.games[activeGame];
  const player = mediaPlayerOf(game, playerId);
  if (!player?.photo || !confirm(`Remove the photo of ${player.name}?`)) return;
  const previous = player.photo;
  const next = clone(game);
  const target = mediaPlayerOf(next, playerId);
  if (!target) return;
  target.photo = null;
  const result = await publish(activeGame, next);
  if (result.ok) void removeMedia(previous);
}
async function uploadGameTeamLogo(teamId) {
  const game = state.games[activeGame];
  const team = teamById(game, teamId);
  if (!team) return;
  const file = await pickImage();
  if (!file) return;
  let data;
  try { data = await prepareImage(file, 'logo'); } catch (error) { showToast(error.message || 'Could not process that image'); return; }
  const previous = team.logo;
  let value = data;
  const storedOnline = Boolean(client && authSession?.user);
  if (storedOnline) {
    try { value = await uploadMedia(activeGame, `teams/${teamId}`, data); }
    catch (error) { console.error('[additional-games] team logo upload failed:', error); showToast(`Logo upload failed — ${error.message || 'Storage rejected the file'}`); return; }
  }
  const next = clone(game);
  const target = teamById(next, teamId);
  if (!target) return;
  target.logo = value;
  const result = await publish(activeGame, next);
  if (result.ok && storedOnline) {
    try { sharedProfiles = await saveSharedProfile({ tag: target.tag, name: target.name, logo: value }); }
    catch (error) { console.error('[shared-profiles] team logo sync failed:', error); showToast(`Logo saved here, but shared sync failed — ${error.message || 'run the shared SQL setup'}`); }
  }
  if (storedOnline) { if (result.ok) void removeMedia(previous); else void removeMedia(value); }
}
async function removeGameTeamLogo(teamId) {
  const game = state.games[activeGame];
  const team = teamById(game, teamId);
  if (!team?.logo || !confirm(`Remove the logo of ${team.name}?`)) return;
  const previous = team.logo;
  const next = clone(game);
  const target = teamById(next, teamId);
  if (!target) return;
  target.logo = null;
  const result = await publish(activeGame, next);
  if (result.ok) {
    void removeMedia(previous);
    if (client && authSession?.user) {
      try { sharedProfiles = await saveSharedProfile({ tag: team.tag, name: team.name, logo: null }); }
      catch (error) { console.error('[shared-profiles] team logo remove sync failed:', error); showToast(`Removed here, but shared sync failed — ${error.message || 'run the shared SQL setup'}`); }
    }
  }
}
function adminSettings() { return `<div class="ag-admin-system"><div class="ag-admin-work-head"><div><span>BOARD SETTINGS</span><h3>${esc(GAME_DEFS[activeGame].label)} · SETTINGS</h3></div><b>PUBLIC BOARD</b></div><div class="ag-admin-setting-grid"><article><b>LIVE SOURCE</b><span>Supabase realtime publish</span></article><article><b>ACTIVE FORMAT</b><span>${esc(GAME_DEFS[activeGame].format)}</span></article><article><b>EDIT SCOPE</b><span>Only signed-in organiser can save</span></article><article><b>PUBLIC RESULT</b><span>Every saved update appears on the live board</span></article></div></div>`; }
function adminWorkbench(game) {
  const body = activeAdminPanel === 'scoring' ? adminGuide() : activeAdminPanel === 'roster' ? adminRosterEditor(game) : activeAdminPanel === 'settings' ? adminSettings() : `<div class="ag-admin-scoreboard"><div class="ag-admin-work-head"><div><span>ON STAGE · RECORD RESULT</span><h3>${esc(GAME_DEFS[activeGame].label)} · LIVE CONTROL</h3></div><b>${esc(GAME_DEFS[activeGame].format)}</b></div>${renderEditor(game)}</div>`;
  return `<section class="ag-admin-workbench">${body}</section>`;
}
function readMechaEditorDraft(game) {
  const next = clone(game);
  ensureMechaScorebook(next);
  document.querySelectorAll('#adminEditor [data-team-name]').forEach(input => {
    const team = next.teams.find(item => item.id === input.dataset.teamName);
    if (team) team.name = input.value.trim() || team.name;
  });
  const record = captureMechaDraft(game) || mechaEditorRecord(game);
  applyMechaNames(next);
  const preview = mechaRoundPreview(next, mechaAdminLobby, mechaAdminRound, record);
  return { next, record: clone(record), preview };
}
async function saveMechaRound() {
  const game = state.games.mecha;
  const { next, record, preview } = readMechaEditorDraft(game);
  const message = mechaRoundValidation(preview);
  if (message) { showToast(message); return; }
  next.lobbies[mechaAdminLobby].rounds[String(mechaAdminRound)] = record;
  const result = await publish('mecha', next);
  if (!result.ok) { showToast(result.error || 'Could not save this round'); return; }
  delete mechaDrafts[mechaDraftKey()];
  if (client && authSession?.user) {
    try { await syncSharedIdentity(next); } catch (error) { console.error('[shared-profiles] name sync failed:', error); }
  }
  showToast(`✓ Lobby ${mechaAdminLobby} round ${mechaAdminRound} saved`);
}
function updateMechaLivePreview() {
  if (activeGame !== 'mecha' || !document.querySelector('#adminEditor [data-mecha-score]')) return;
  const game = state.games.mecha;
  const record = captureMechaDraft(game) || mechaEditorRecord(game);
  const preview = mechaRoundPreview(game, mechaAdminLobby, mechaAdminRound, record);
  preview.rows.forEach(row => {
    const points = document.querySelector(`#adminEditor [data-mecha-points="${CSS.escape(row.player.id)}"]`);
    const rank = document.querySelector(`#adminEditor [data-mecha-rank="${CSS.escape(row.player.id)}"]`);
    if (points) points.textContent = row.score === null ? '—' : `${row.points.toFixed(1)} pts`;
    if (rank) rank.textContent = row.rank ? `#${row.rank}` : '—';
  });
  const count = document.querySelector('#adminEditor [data-mecha-count]');
  const seekerPoints = document.querySelector('#adminEditor [data-mecha-seeker-points]');
  const hint = document.querySelector('#adminEditor [data-mecha-seeker-hint]');
  const status = document.querySelector('#adminEditor [data-mecha-round-status]');
  const validation = document.querySelector('#adminEditor [data-mecha-validation]');
  const save = document.querySelector('#adminEditor [data-mecha-save-round]');
  if (count) count.textContent = `${preview.entered}/10 entered · total ${preview.total.toLocaleString()}`;
  if (seekerPoints) seekerPoints.textContent = preview.catches === null ? '—' : `${preview.seekerPoints.toFixed(1)} PTS`;
  if (hint) hint.textContent = mechaSeekerHint(preview);
  if (status) status.textContent = preview.valid ? 'READY TO SAVE' : 'INPUT REQUIRED';
  if (validation) validation.textContent = mechaRoundValidation(preview);
  if (save) save.disabled = !preview.valid;
}
async function resetMechaScores() {
  if (!confirm('Reset every Meccha Chameleon round? Team names and player names will be kept.')) return;
  const next = clone(state.games.mecha);
  next.lobbies = makeMechaLobbies();
  next.teams.forEach(team => { team.hider = 0; team.topMissedSpot = 0; team.seekersCaught = 0; team.cleanSweeps = 0; });
  const result = await publish('mecha', next);
  if (result.ok) { Object.keys(mechaDrafts).forEach(key => delete mechaDrafts[key]); showToast('✓ Meccha scores reset'); }
}
function renderAdminConsole(game) {
  if (activeGame === 'tekken') return `<div class="ag-admin-callout"><b>TEKKEN 7 SEPARATE BOARD</b><span>Tekken-ийн roster, зураг болон admin систем тусдаа хуудсанд ажиллана. Энэ shared board дээр Tekken media өөрчлөгдөхгүй.</span></div>`;
  return `<div class="ag-admin-console"><div class="ag-admin-console-head"><div><span>ORGANISER CONTROL</span><h2>ADMIN</h2></div><div class="ag-admin-current"><img src="${GAME_DEFS[activeGame].logo}" alt=""><b>${esc(GAME_DEFS[activeGame].label)}</b><small>${esc(GAME_DEFS[activeGame].format)}</small></div></div><nav class="ag-admin-nav" aria-label="Admin sections">${[['matches', 'Matches'], ['scoring', 'Scoring'], ['roster', 'Roster'], ['settings', 'Settings']].map(([key, label]) => `<button class="${key === activeAdminPanel ? 'is-active' : ''}" type="button" data-admin-panel="${key}">${label}</button>`).join('')}</nav><div class="ag-admin-layout">${adminQueue(game)}${adminWorkbench(game)}</div></div>`;
}
function bindAdminConsole() {
  document.querySelectorAll('#adminEditor [data-admin-panel]').forEach(button => { button.onclick = () => { activeAdminPanel = button.dataset.adminPanel || 'matches'; renderAdmin(); }; });
  if (activeGame === 'mecha' && activeAdminPanel === 'matches') {
    document.querySelectorAll('#adminEditor [data-mecha-lobby]').forEach(button => { button.onclick = () => { captureMechaDraft(state.games.mecha); mechaAdminLobby = button.dataset.mechaLobby; mechaAdminRound = 1; renderAdmin(); }; });
    document.querySelectorAll('#adminEditor [data-mecha-round]').forEach(button => { button.onclick = () => { captureMechaDraft(state.games.mecha); mechaAdminRound = Number(button.dataset.mechaRound) || 1; renderAdmin(); }; });
    document.querySelectorAll('#adminEditor [data-mecha-score], #adminEditor [data-mecha-catches]').forEach(input => { input.addEventListener('input', updateMechaLivePreview); });
    document.querySelectorAll('#adminEditor [data-mecha-player]').forEach(input => { input.addEventListener('input', () => { mechaNameDrafts[input.dataset.mechaPlayer] = input.value; }); });
    document.querySelectorAll('#adminEditor [data-mecha-save-round]').forEach(button => { button.onclick = saveMechaRound; });
    document.querySelectorAll('#adminEditor [data-mecha-clear-round]').forEach(button => { button.onclick = () => { mechaDrafts[mechaDraftKey()] = { scores: {}, catches: '' }; renderAdmin(); }; });
    document.querySelectorAll('#adminEditor [data-mecha-reset-cup]').forEach(button => { button.onclick = resetMechaScores; });
  }
  document.querySelectorAll('#adminEditor .ag-media-logo-upload').forEach(button => { button.onclick = () => uploadGameTeamLogo(button.dataset.mediaTeam); });
  document.querySelectorAll('#adminEditor .ag-media-logo-remove').forEach(button => { button.onclick = () => removeGameTeamLogo(button.dataset.mediaTeam); });
  document.querySelectorAll('#adminEditor .ag-media-photo-upload').forEach(button => { button.onclick = () => uploadGamePlayerPhoto(button.dataset.mediaPlayer); });
  document.querySelectorAll('#adminEditor .ag-media-photo-remove').forEach(button => { button.onclick = () => removeGamePlayerPhoto(button.dataset.mediaPlayer); });
  document.querySelectorAll('#adminEditor .ag-media-name').forEach(input => { input.addEventListener('change', () => saveMediaPlayerName(input.dataset.mediaPlayer, input)); });
}
function renderAdmin() { const logged = Boolean(authSession?.user); $('loggedOut').classList.toggle('ag-hidden', logged); $('loggedIn').classList.toggle('ag-hidden', !logged); if (logged) { $('userEmail').textContent = authSession.user.email || 'admin'; $('adminEditor').innerHTML = renderAdminConsole(state.games[activeGame]); bindAdminConsole(); } }
function focusBoardView() {
  const targets = { arena: '#board-arena', groups: '#board-groups', playoffs: '#board-playoffs', players: '#board-players', admin: '#adminPanel' };
  const target = targets[activeBoardView];
  if (target) requestAnimationFrame(() => document.querySelector(target)?.scrollIntoView({ behavior: 'auto', block: 'start' }));
}
function render() {
  document.body.dataset.game = activeGame;
  document.body.style.setProperty('--ag-art', `url("${GAME_DEFS[activeGame].art}")`);
  if (activeGame !== 'tekken') activeBoardView = boardViewFromHash();
  document.body.dataset.boardView = activeBoardView;
  renderBoardNav();
  renderTabs();
  renderPublic();
  renderAdmin();
  if (activeGame !== 'tekken') focusBoardView();
}

/* Reads the admin form and returns just the game being edited. */
function saveFromEditor() {
  const game = clone(state.games[activeGame]);
  document.querySelectorAll('[data-team-name]').forEach(input => { const team = game.teams.find(item => item.id === input.dataset.teamName); if (team) team.name = input.value.trim() || team.name; });
  if (activeGame === 'mlbb') { game.groupResults.forEach(match => { const input = document.querySelector(`[data-ml-group="${match.id}"]`); if (input) match.series = input.value; }); Object.keys(game.playoff).forEach(id => { const input = document.querySelector(`[data-ml-playoff="${id}"]`); if (input) game.playoff[id] = input.value; }); }
  if (activeGame === 'mecha') {
    const draft = readMechaEditorDraft(game);
    game.teams = draft.next.teams;
    game.lobbies = draft.next.lobbies;
    if (draft.preview.valid) game.lobbies[mechaAdminLobby].rounds[String(mechaAdminRound)] = draft.record;
  }
  if (activeGame === 'stumble') game.teams.forEach(team => team.players.forEach(player => { const name = document.querySelector(`[data-stumble-name="${player.id}"]`); const points = document.querySelector(`[data-stumble-points="${player.id}"]`); if (name) player.name = name.value.trim() || player.name; if (points) player.points = num(points.value); }));
  if (activeGame === 'pubg') document.querySelectorAll('[data-pubg]').forEach(input => { const team = game.teams.find(item => item.id === input.dataset.pubg); const map = team?.maps[Number(input.dataset.map)]; if (map) map[input.dataset.field] = input.value; });
  if (activeGame === 'tetris') { game.players?.forEach(player => { const input = document.querySelector(`[data-tetris-player="${player.id}"]`); if (input) player.name = input.value.trim() || player.name; }); game.matches?.forEach(match => { const input = document.querySelector(`[data-tetris-match="${match.id}"]`); if (input) match.score = input.value; }); }
  return game;
}

$('loginForm').addEventListener('submit', async event => { event.preventDefault(); if (!client) { $('authNote').textContent = 'Supabase environment тохируулагдаагүй байна.'; return; } const button = $('loginBtn'); button.disabled = true; button.textContent = 'Signing in…'; $('authNote').textContent = ''; try { await signIn($('email').value.trim(), $('password').value); $('password').value = ''; showToast('✓ Admin access granted'); renderAdmin(); } catch (error) { $('authNote').textContent = error.message || 'Sign in failed'; } finally { button.disabled = false; button.textContent = 'Sign in'; } });
$('logoutBtn').onclick = async () => { try { await signOut(); showToast('✓ Signed out'); renderAdmin(); } catch (error) { showToast(error.message || 'Sign out failed'); } };
$('saveBtn').onclick = async () => { if (!authSession?.user) return; const button = $('saveBtn'); button.disabled = true; button.textContent = 'Publishing…'; $('saveNote').textContent = ''; const editedGame = saveFromEditor(); const result = await publish(activeGame, editedGame); if (result.ok && client && activeGame !== 'tekken') { try { await syncSharedIdentity(editedGame); } catch (error) { console.error('[shared-profiles] name sync failed:', error); $('saveNote').textContent = `Game saved, but shared team identity sync failed — ${error.message || 'run the shared SQL setup'}`; } } button.disabled = false; button.textContent = 'Save current game'; if (result.ok && !result.local) { showToast(`✓ ${GAME_DEFS[activeGame].label} published live`); if (!$('saveNote').textContent) $('saveNote').textContent = 'Saved to Supabase — every public viewer will update.'; } else if (result.ok) { showToast('Saved on this device only'); } else { $('saveNote').textContent = result.error || 'Publish failed'; } };

render();
window.addEventListener('hashchange', () => { activeBoardView = boardViewFromHash(); render(); });
subscribeSharedProfiles(profiles => {
  sharedProfiles = profiles;
  state = applySharedIdentity(normalizeState(state) || state);
  writeCache(state);
  render();
});
startRealtime();
