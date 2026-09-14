/* ============================================================
   DOTA 2 scoring — zone BO2 round robin → four-team BO3 elimination bracket
============================================================ */
import {
  MATCHES, ZONES, TEAMS_PER_ZONE, pointsForSeries,
  zoneMatches, finalMatches, QUALIFIERS_PER_ZONE,
} from './config.js';

export function matchConfig(matchNo) {
  return MATCHES.find(match => match.id === Number(matchNo)) || null;
}

function scoreParts(series) {
  const [wins, losses] = String(series || '0-0').split('-').map(Number);
  return {
    wins: Number.isFinite(wins) ? wins : 0,
    losses: Number.isFinite(losses) ? losses : 0,
  };
}

/* Resolve the two slots in a match. Zone slots are the current A/B order;
   semifinal slots are A1 vs B2 and B1 vs A2. Final slots are fed by the
   winners and losers of those semifinal matches. */
export function matchTeams(state, matchNoOrConfig) {
  const match = typeof matchNoOrConfig === 'object' ? matchNoOrConfig : matchConfig(matchNoOrConfig);
  if (!match) return [];
  if (match.stage === 'zone') {
    const pool = state.teams.filter(team => team.zoneId === match.zoneId).slice(0, TEAMS_PER_ZONE);
    return (match.pair || []).map(index => pool[index]).filter(Boolean);
  }
  if (match.bracket === 'semi') {
    const finalists = qualifiedTeams(state);
    return (match.pair || []).map(index => finalists[index]).filter(Boolean);
  }
  if (match.bracket === 'grand') return (match.source || []).map(id => matchWinner(state, id)).filter(Boolean);
  if (match.bracket === 'third') return (match.source || []).map(id => matchLoser(state, id)).filter(Boolean);
  return [];
}

export function matchesForTeam(state, team, stage = null) {
  return MATCHES.filter(match =>
    (!stage || match.stage === stage) && matchTeams(state, match).some(candidate => candidate.id === team.id)
  );
}

export function matchComplete(state, matchNoOrConfig) {
  const match = typeof matchNoOrConfig === 'object' ? matchNoOrConfig : matchConfig(matchNoOrConfig);
  const teams = matchTeams(state, match);
  const result = match && state.results[match.id];
  return teams.length === 2 && !!result && teams.every(team => !!result[team.id]?.series);
}

export function matchWinner(state, matchNo) {
  const match = matchConfig(matchNo);
  const teams = matchTeams(state, match);
  const result = match && state.results[match.id];
  if (teams.length !== 2 || !result || !teams.every(team => result[team.id]?.series)) return null;
  const { wins, losses } = scoreParts(result[teams[0].id].series);
  if (wins === losses) return null;
  return wins > losses ? teams[0] : teams[1];
}

export function matchLoser(state, matchNo) {
  const winner = matchWinner(state, matchNo);
  if (!winner) return null;
  const match = matchConfig(matchNo);
  return matchTeams(state, match).find(team => team.id !== winner.id) || null;
}

export function seriesStats(state, matchNo, teamId) {
  const match = matchConfig(matchNo);
  const result = state.results[matchNo] && state.results[matchNo][teamId];
  if (!match || !result) return null;

  const { wins, losses } = scoreParts(result.series);
  const draws = wins === losses ? 1 : 0;
  return {
    series: result.series,
    wins,
    losses,
    draws,
    gamesWon: wins,
    gamesPlayed: wins + losses,
    points: pointsForSeries(match.stage, result.series),
  };
}

function aggregate(state, team, matches) {
  let series = 0, wins = 0, draws = 0, losses = 0, gamesWon = 0, gamesPlayed = 0, points = 0;
  for (const match of matches) {
    const stats = seriesStats(state, match.id, team.id);
    if (!stats) continue;
    series++;
    wins += stats.wins > stats.losses ? 1 : 0;
    draws += stats.draws;
    losses += stats.losses > stats.wins ? 1 : 0;
    gamesWon += stats.gamesWon;
    gamesPlayed += stats.gamesPlayed;
    points += stats.points;
  }
  return { series, wins, draws, losses, gamesWon, gamesPlayed, points };
}

function recordRatio(wins, losses) {
  const games = wins + losses;
  return games ? wins / games : 0;
}

function headToHeadPoints(state, row, tiedIds, matches) {
  return matches.reduce((points, match) => {
    const participants = matchTeams(state, match);
    if (!participants.some(team => team.id === row.team.id)
      || !participants.some(team => tiedIds.has(team.id) && team.id !== row.team.id)) return points;
    return points + (seriesStats(state, match.id, row.team.id)?.points || 0);
  }, 0);
}

function sortRows(rows, state, matches) {
  const tiedIdsByTotal = new Map();
  rows.forEach(row => {
    if (!tiedIdsByTotal.has(row.total)) tiedIdsByTotal.set(row.total, new Set());
    tiedIdsByTotal.get(row.total).add(row.team.id);
  });
  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const tiedIds = tiedIdsByTotal.get(a.total);
    if (tiedIds.size > 1) {
      const h2h = headToHeadPoints(state, b, tiedIds, matches) - headToHeadPoints(state, a, tiedIds, matches);
      if (h2h) return h2h;
    }
    return recordRatio(b.wins, b.losses) - recordRatio(a.wins, a.losses)
      || recordRatio(b.gamesWon, b.gamesPlayed - b.gamesWon) - recordRatio(a.gamesWon, a.gamesPlayed - a.gamesWon)
      || a.team.name.localeCompare(b.team.name);
  });
  rows.forEach((row, index) => { row.rank = index + 1; });
  return rows;
}

export function computeZoneStandings(state, zoneId) {
  const teams = state.teams.filter(team => team.zoneId === zoneId).slice(0, TEAMS_PER_ZONE);
  return sortRows(teams.map(team => {
    const stats = aggregate(state, team, zoneMatches(zoneId));
    return { team, ...stats, total: stats.points, stage: 'zone' };
  }), state, zoneMatches(zoneId));
}

export function completedZone(state, zoneId) {
  const teams = state.teams.filter(team => team.zoneId === zoneId).slice(0, TEAMS_PER_ZONE);
  if (teams.length !== TEAMS_PER_ZONE) return false;
  return zoneMatches(zoneId).every(match => {
    const result = state.results[match.id];
    const participants = matchTeams(state, match);
    return result && participants.length === 2 && participants.every(team => result[team.id]?.series);
  });
}

export function qualifiedTeams(state) {
  if (!ZONES.every(zoneId => completedZone(state, zoneId))) return [];
  return ZONES.flatMap(zoneId => computeZoneStandings(state, zoneId)
    .slice(0, QUALIFIERS_PER_ZONE)
    .map(row => row.team));
}

export function isFinalist(state, teamId) {
  return qualifiedTeams(state).some(team => team.id === teamId);
}

export function computeStandings(state) {
  const finalistIds = new Set(qualifiedTeams(state).map(team => team.id));
  if (finalistIds.size < 4) {
    return sortRows(state.teams.map(team => {
      const zone = aggregate(state, team, matchesForTeam(state, team, 'zone'));
      return {
        team,
        ...zone,
        zonePoints: zone.points,
        finalPoints: 0,
        qualified: false,
        total: zone.points,
      };
    }), state, MATCHES);
  }

  const finalOrder = [];
  const addFinalist = team => {
    if (team && !finalOrder.some(item => item.id === team.id)) finalOrder.push(team);
  };
  if (matchComplete(state, 9)) {
    addFinalist(matchWinner(state, 9));
    addFinalist(matchLoser(state, 9));
  }
  if (!matchComplete(state, 9)) {
    addFinalist(matchWinner(state, 7));
    addFinalist(matchWinner(state, 8));
  }
  if (matchComplete(state, 10)) {
    addFinalist(matchWinner(state, 10));
    addFinalist(matchLoser(state, 10));
  }
  if (!matchComplete(state, 10)) {
    addFinalist(matchLoser(state, 7));
    addFinalist(matchLoser(state, 8));
  }
  qualifiedTeams(state).forEach(addFinalist);

  const finalists = finalOrder.map(team => {
    const zone = aggregate(state, team, matchesForTeam(state, team, 'zone'));
    const final = aggregate(state, team, finalMatches());
    return {
      team,
      series: final.series,
      wins: final.wins,
      draws: final.draws,
      losses: final.losses,
      gamesWon: final.gamesWon,
      gamesPlayed: final.gamesPlayed,
      zonePoints: zone.points,
      finalPoints: final.points,
      qualified: true,
      total: final.points,
    };
  });

  const eliminated = sortRows(state.teams.filter(team => !finalistIds.has(team.id)).map(team => {
    const zone = aggregate(state, team, matchesForTeam(state, team, 'zone'));
    return {
      team,
      ...zone,
      zonePoints: zone.points,
      finalPoints: 0,
      qualified: false,
      total: zone.points,
    };
  }), state, MATCHES);

  return [...finalists, ...eliminated].map((row, index) => ({ ...row, rank: index + 1 }));
}

export function computePlayers(state) {
  const rows = [];
  state.teams.forEach(team => team.players.forEach(player => {
    rows.push({ player, team, zoneId: team.zoneId });
  }));
  rows.sort((a, b) =>
    a.team.name.localeCompare(b.team.name) || a.player.name.localeCompare(b.player.name)
  );
  rows.forEach((row, index) => { row.rank = index + 1; });
  return rows;
}
