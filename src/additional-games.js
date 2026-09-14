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
  mecha: { label: 'Meccha Chameleon', short: 'MECHA', format: 'Seeker / Hider · 12 rounds', rules: './games.html#mecha', logo: '/game-logos/mecha.webp', art: '/game-backdrops/mecha-chameleon-hero.jpg' },
  stumble: { label: 'Stumble Guys', short: 'STUMBLE', format: '30 players · Grand Prix', rules: './games.html#stumble', logo: '/game-logos/stumble.svg', logoClass: 'wordmark light', art: '/game-backdrops/stumble-game.png' },
  pubg: { label: 'PUBG Mobile', short: 'PUBG', format: '3 maps · placement + kills', rules: './games.html#pubg', logo: '/game-logos/pubg-mobile.svg', logoClass: 'wordmark light', art: '/game-backdrops/pubg-game.jpg' },
  tekken: { label: 'Tekken 8', short: 'TEKKEN', format: '18 players · BO3 / BO5 playoff', rules: './games.html#tekken', logo: '/game-logos/tekken8.svg', logoClass: 'wordmark light', art: '/game-backdrops/tekken-game.jpeg' },
};
const GAME_IDS = Object.keys(GAME_DEFS);
const TEAM_NAMES = ['Team Alpha', 'Team Bravo', 'Team Charlie', 'Team Delta', 'Team Echo', 'Team Foxtrot'];
const TAGS = ['ALP', 'BRV', 'CHR', 'DLT', 'ECH', 'FOX'];
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
  return {
    version: 1,
    updated: null,
    games: {
      mlbb: { teams: mlTeams, groupResults: groupMatches().map(match => ({ ...match, series: '' })), playoff: { sf1: '', sf2: '', final: '', third: '' } },
      mecha: { teams: makeTeams().map(team => ({ ...team, hider: 0, seeker: 0, bonus: 0 })) },
      stumble: { teams: makeTeams().map(team => ({ ...team, players: Array.from({ length: 5 }, (_, index) => ({ id: `${team.id}p${index + 1}`, name: `${team.tag} Player ${index + 1}`, points: 0 })) })) },
      pubg: { teams: makeTeams().map(team => ({ ...team, maps: MAP_NAMES.map(() => ({ placement: '', kills: '' })) })) },
      tekken: { teams: makeTeams(), players: makePlayers(18, 3, 'k') },
    },
  };
}

function normalizeState(value) {
  if (!usable(value)) return null;
  if (!Array.isArray(value.games.tekken.teams) || value.games.tekken.teams.length !== 6) {
    value.games.tekken.teams = TEAM_NAMES.map((name, index) => ({ id: `t${index + 1}`, name, tag: TAGS[index] }));
  }
  return value;
}
function usable(value) { return !!value && value.games && GAME_IDS.every(id => value.games[id]); }
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

function renderMlbb(game) {
  const a = mlRows(game, 'A'); const b = mlRows(game, 'B'); const playoff = mlPlayoff(game); const played = game.groupResults.filter(match => match.series).length; const finalsPlayed = Object.values(game.playoff).filter(Boolean).length;
  const table = rows => rankingTable(rows.map(row => ({ name: row.team.name, sub: `${row.team.tag} · ${row.played}/2 series`, points: `${row.points} pts`, games: `${row.gamesWon}-${row.gamesLost}` })), [{ key: 'points', label: 'Points', score: true }, { key: 'games', label: 'Game W-L' }]);
  const match = item => `<div class="ag-match ${item.label.includes('Final') ? 'final' : ''}"><b>${esc(item.label)}</b><span>${esc(item.a?.name || 'Qualified team')}</span><span>${esc(item.b?.name || 'Waiting')}</span><small>${item.series ? `Saved · ${item.series}` : 'Open · BO3'}</small></div>`;
  return `${boardHead(GAME_DEFS.mlbb, '6 баг · A/B хэсэг · BO2 round-robin · 4 баг playoff', GAME_DEFS.mlbb.rules)}<div class="ag-pad"><div class="ag-status-grid"><div class="ag-status"><b>${played}/6</b><span>Group BO2 series</span></div><div class="ag-status"><b>${played === 6 ? '4' : '0'}/4</b><span>Qualified teams</span></div><div class="ag-status"><b>${finalsPlayed}/4</b><span>Playoff BO3</span></div></div><div class="ag-grid two" style="margin-top:16px"><div class="ag-form-section"><h3>Group A · top 2 advance</h3>${table(a)}</div><div class="ag-form-section"><h3>Group B · top 2 advance</h3>${table(b)}</div></div><div class="ag-form-section" style="margin-top:12px"><h3>Playoff bracket</h3><div class="ag-bracket">${match(playoff.sf1)}${match(playoff.sf2)}${match(playoff.final)}${match(playoff.third)}</div></div><p class="ag-help" style="margin:14px 0 0">Tie-break: head-to-head → нийт хожсон game → нийт хожигдсон game бага → нэмэлт BO1.</p></div>`;
}

function renderMecha(game) {
  const rows = game.teams.map(team => ({ name: team.name, sub: team.tag, hider: num(team.hider), seeker: num(team.seeker), bonus: num(team.bonus), points: num(team.hider) + num(team.seeker) + num(team.bonus) })).sort((a, b) => b.points - a.points || b.hider - a.hider);
  return `${boardHead(GAME_DEFS.mecha, '6 баг · Hider / Seeker · Lobby A/B · 12 rounds', GAME_DEFS.mecha.rules)}<div class="ag-pad"><div class="ag-status-grid"><div class="ag-status"><b>12</b><span>Total rounds</span></div><div class="ag-status"><b>2</b><span>Players as Seeker</span></div><div class="ag-status"><b>${rows.reduce((sum, row) => sum + row.points, 0)}</b><span>Total points</span></div></div><div class="ag-form-section" style="margin-top:16px"><h3>Team ranking</h3>${rankingTable(rows, [{ key: 'hider', label: 'Hider pts' }, { key: 'seeker', label: 'Seeker pts' }, { key: 'bonus', label: 'Bonus' }, { key: 'points', label: 'Total', score: true }])}</div><p class="ag-help" style="margin:14px 0 0">Hider rank оноо + барьсан Hider бүрийн 2 оноо + бүх 10 Hider барьсан bonus 10 оноо.</p></div>`;
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
  return `${boardHead(GAME_DEFS.tekken, '6 баг · 18 тоглогч · player leaderboard · team total', GAME_DEFS.tekken.rules)}<div class="ag-pad"><div class="ag-status-grid"><div class="ag-status"><b>18</b><span>Players</span></div><div class="ag-status"><b>3</b><span>Players / team</span></div><div class="ag-status"><b>${playerRows.reduce((sum, row) => sum + row.points, 0)}</b><span>Player points</span></div></div><div class="ag-grid two" style="margin-top:16px"><div class="ag-form-section"><h3>Player leaderboard</h3>${rankingTable(playerRows, [{ key: 'points', label: 'Points', score: true }, { key: 'record', label: 'W-L' }, { key: 'games', label: 'Game W-L' }])}</div><div class="ag-form-section"><h3>Team total</h3>${rankingTable(teams, [{ key: 'points', label: 'Points', score: true }, { key: 'wins', label: 'Match wins' }, { key: 'games', label: 'Game wins' }])}</div></div><p class="ag-help" style="margin:14px 0 0">Tie-break: нийт оноо → head-to-head → game differential → нийт хожсон game → нэмэлт BO1.</p></div>`;
}

function renderPublic() { const game = state.games[activeGame]; const body = activeGame === 'mlbb' ? renderMlbb(game) : activeGame === 'mecha' ? renderMecha(game) : activeGame === 'stumble' ? renderStumble(game) : activeGame === 'pubg' ? renderPubg(game) : renderTekken(game); $('publicBoard').innerHTML = body; }
function renderTabs() { $('gameTabs').innerHTML = GAME_IDS.map(id => `<button class="ag-tab ${id === activeGame ? 'active' : ''}" data-game="${id}" type="button"><img src="${GAME_DEFS[id].logo}" alt="">${GAME_DEFS[id].short}</button>`).join(''); document.querySelectorAll('.ag-tab').forEach(button => { button.onclick = () => { activeGame = button.dataset.game; const url = new URL(location.href); url.searchParams.set('game', activeGame); history.replaceState({}, '', url); render(); }; }); }

function inputTeamNames(game) { return `<div class="ag-form-section"><h3>Team setup</h3><div class="ag-form-grid">${game.teams.map(team => `<label class="ag-label">${esc(team.tag || team.id)}<input class="ag-input" data-team-name="${team.id}" value="${esc(team.name)}"></label>`).join('')}</div></div>`; }
function renderMlEditor(game) { const name = id => teamName(game, id); return `${inputTeamNames(game)}<div class="ag-form-section"><h3>Group BO2 results</h3><div class="ag-form-grid">${game.groupResults.map(match => `<label class="ag-label">${match.group} · ${esc(name(match.a))} vs ${esc(name(match.b))}<select class="ag-select" data-ml-group="${match.id}">${seriesOptions(ML_SERIES, match.series)}</select></label>`).join('')}</div></div><div class="ag-form-section"><h3>Playoff BO3 results</h3><div class="ag-form-grid">${[['sf1','Semifinal 1'],['sf2','Semifinal 2'],['final','Grand Final'],['third','3rd Place Final']].map(([id, label]) => `<label class="ag-label">${label}<select class="ag-select" data-ml-playoff="${id}">${seriesOptions(BO3_SERIES, game.playoff[id])}</select></label>`).join('')}</div></div>`; }
function renderMechaEditor(game) { return `${inputTeamNames(game)}<div class="ag-form-section"><h3>Team points</h3><div class="ag-grid">${game.teams.map(team => `<div class="ag-form-grid three"><label class="ag-label">${esc(team.name)} · Hider<input class="ag-input" type="number" min="0" data-mecha="${team.id}" data-field="hider" value="${num(team.hider)}"></label><label class="ag-label">Seeker<input class="ag-input" type="number" min="0" data-mecha="${team.id}" data-field="seeker" value="${num(team.seeker)}"></label><label class="ag-label">Bonus<input class="ag-input" type="number" min="0" data-mecha="${team.id}" data-field="bonus" value="${num(team.bonus)}"></label></div>`).join('')}</div></div>`; }
function renderStumbleEditor(game) { return `<div class="ag-form-section"><h3>Player points</h3><div class="ag-grid">${game.teams.map(team => `<div class="ag-form-section"><h3>${esc(team.name)}</h3><div class="ag-form-grid">${team.players.map(player => `<label class="ag-label">${esc(player.name)}<input class="ag-input" data-stumble-name="${player.id}" value="${esc(player.name)}"><input class="ag-input" type="number" min="0" data-stumble-points="${player.id}" value="${num(player.points)}"></label>`).join('')}</div></div>`).join('')}</div></div>`; }
function renderPubgEditor(game) { return `${inputTeamNames(game)}<div class="ag-grid">${game.teams.map(team => `<div class="ag-form-section"><h3>${esc(team.name)}</h3><div class="ag-form-grid three">${team.maps.map((map, index) => `<div><label class="ag-label">${MAP_NAMES[index]} · Place<select class="ag-select" data-pubg="${team.id}" data-map="${index}" data-field="placement"><option value="">—</option>${[1,2,3,4,5,6].map(place => `<option value="${place}" ${String(place) === String(map.placement) ? 'selected' : ''}>${place}</option>`).join('')}</select></label><label class="ag-label" style="margin-top:8px">Kills<input class="ag-input" type="number" min="0" data-pubg="${team.id}" data-map="${index}" data-field="kills" value="${esc(map.kills)}"></label></div>`).join('')}</div></div>`).join('')}</div>`; }
function renderTekkenEditor(game) { return `<div class="ag-form-section"><h3>Player results</h3><div class="ag-grid">${game.players.map(player => `<div class="ag-form-grid five"><label class="ag-label">Player<input class="ag-input" data-tekken="${player.id}" data-field="name" value="${esc(player.name)}"></label><label class="ag-label">Points<input class="ag-input" type="number" min="0" data-tekken="${player.id}" data-field="points" value="${num(player.points)}"></label><label class="ag-label">W<input class="ag-input" type="number" min="0" data-tekken="${player.id}" data-field="wins" value="${num(player.wins)}"></label><label class="ag-label">L<input class="ag-input" type="number" min="0" data-tekken="${player.id}" data-field="losses" value="${num(player.losses)}"></label><label class="ag-label">Game W/L<input class="ag-input" data-tekken="${player.id}" data-field="games" value="${num(player.gamesWon)}-${num(player.gamesLost)}"></label></div>`).join('')}</div></div>`; }
function renderEditor() { const game = state.games[activeGame]; return activeGame === 'mlbb' ? renderMlEditor(game) : activeGame === 'mecha' ? renderMechaEditor(game) : activeGame === 'stumble' ? renderStumbleEditor(game) : activeGame === 'pubg' ? renderPubgEditor(game) : renderTekkenEditor(game); }

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
  if (activeGame === 'tekken') game.players.forEach(player => { document.querySelectorAll(`[data-tekken="${player.id}"]`).forEach(input => { if (input.dataset.field === 'name') player.name = input.value.trim() || player.name; else if (input.dataset.field === 'games') { const [won, lost] = input.value.split('-').map(num); player.gamesWon = won; player.gamesLost = lost; } else player[input.dataset.field] = num(input.value); }); });
  return next;
}

$('loginForm').addEventListener('submit', async event => { event.preventDefault(); if (!client) { $('authNote').textContent = 'Supabase environment тохируулагдаагүй байна.'; return; } const button = $('loginBtn'); button.disabled = true; button.textContent = 'Signing in…'; $('authNote').textContent = ''; try { await signIn($('email').value.trim(), $('password').value); $('password').value = ''; showToast('✓ Admin access granted'); renderAdmin(); } catch (error) { $('authNote').textContent = error.message || 'Sign in failed'; } finally { button.disabled = false; button.textContent = 'Sign in'; } });
$('logoutBtn').onclick = async () => { try { await signOut(); showToast('✓ Signed out'); renderAdmin(); } catch (error) { showToast(error.message || 'Sign out failed'); } };
$('saveBtn').onclick = async () => { if (!authSession?.user) return; const button = $('saveBtn'); button.disabled = true; button.textContent = 'Publishing…'; $('saveNote').textContent = ''; const result = await publish(saveFromEditor()); button.disabled = false; button.textContent = 'Save current game'; if (result.ok && !result.local) { showToast(`✓ ${GAME_DEFS[activeGame].label} published live`); $('saveNote').textContent = 'Saved to Supabase — every public viewer will update.'; } else if (result.ok) { showToast('Saved on this device only'); } else { $('saveNote').textContent = result.error?.message || 'Publish failed'; } };

render();
startRealtime();
