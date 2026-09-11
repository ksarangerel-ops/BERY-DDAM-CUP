/* ============================================================
   CS2 scoring — 6-team BO1 group → BO1 lower qualifiers → BO3 final four
============================================================ */
import {
  MATCHES, groupMatches, lowerMatches, finalMatches, pointsForSeries,
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

function participants(state) {
  return state.teams.slice(0, 6);
}

function hasResult(state, match, teams = matchTeams(state, match)) {
  const result = state.results[match.id];
  return teams.length === 2 && !!result && teams.every(team => !!result[team.id]?.series);
}

export function matchTeams(state, matchNoOrConfig) {
  const match = typeof matchNoOrConfig === 'object' ? matchNoOrConfig : matchConfig(matchNoOrConfig);
  if (!match) return [];
  if (match.stage === 'group') {
    const teams = participants(state);
    return (match.pair || []).map(index => teams[index]).filter(Boolean);
  }
  if (match.stage === 'lower') {
    if (!completedGroupStage(state)) return [];
    const rows = computeGroupStandings(state);
    return (match.seedPair || []).map(seed => rows[seed - 1]?.team).filter(Boolean);
  }
  if (match.stage === 'final') {
    const finalists = qualifiedTeams(state);
    return (match.pair || []).map(index => finalists[index]).filter(Boolean);
  }
  return [];
}

export function matchesForTeam(state, team, stage = null) {
  return MATCHES.filter(match =>
    (!stage || match.stage === stage) && matchTeams(state, match).some(candidate => candidate.id === team.id)
  );
}

export function matchComplete(state, matchNoOrConfig) {
  const match = typeof matchNoOrConfig === 'object' ? matchNoOrConfig : matchConfig(matchNoOrConfig);
  return !!match && hasResult(state, match);
}

export function matchWinner(state, matchNo) {
  const match = typeof matchNo === 'object' ? matchNo : matchConfig(matchNo);
  const teams = matchTeams(state, match);
  const result = match && state.results[match.id];
  if (teams.length !== 2 || !result || !teams.every(team => result[team.id]?.series)) return null;
  const first = scoreParts(result[teams[0].id].series);
  if (first.wins === first.losses) return null;
  return first.wins > first.losses ? teams[0] : teams[1];
}

export function matchLoser(state, matchNo) {
  const winner = matchWinner(state, matchNo);
  if (!winner) return null;
  return matchTeams(state, matchNo).find(team => team.id !== winner.id) || null;
}

export function seriesStats(state, matchNo, teamId) {
  const match = matchConfig(matchNo);
  const result = state.results[matchNo] && state.results[matchNo][teamId];
  if (!match || !result) return null;
  const { wins, losses } = scoreParts(result.series);
  return {
    series: result.series,
    wins: wins > losses ? 1 : 0,
    losses: losses > wins ? 1 : 0,
    draws: wins === losses ? 1 : 0,
    gamesWon: wins,
    gamesPlayed: wins + losses,
    roundsWon: Number(result.roundsFor || 0),
    roundsLost: Number(result.roundsAgainst || 0),
    points: pointsForSeries(match.stage, result.series),
  };
}

function aggregate(state, team, matches) {
  let series = 0, wins = 0, draws = 0, losses = 0, gamesWon = 0, gamesPlayed = 0;
  let points = 0, roundsWon = 0, roundsLost = 0;
  for (const match of matches) {
    const stats = seriesStats(state, match.id, team.id);
    if (!stats) continue;
    series += 1;
    wins += stats.wins;
    draws += stats.draws;
    losses += stats.losses;
    gamesWon += stats.gamesWon;
    gamesPlayed += stats.gamesPlayed;
    roundsWon += stats.roundsWon;
    roundsLost += stats.roundsLost;
    points += stats.points;
  }
  return { series, wins, draws, losses, gamesWon, gamesPlayed, roundsWon, roundsLost, points };
}

function h2hPoints(state, row, tiedIds, matches) {
  return matches.reduce((points, match) => {
    const teams = matchTeams(state, match);
    if (!teams.some(team => team.id === row.team.id)
      || !teams.some(team => tiedIds.has(team.id) && team.id !== row.team.id)) return points;
    return points + (seriesStats(state, match.id, row.team.id)?.points || 0);
  }, 0);
}

function sortRows(rows, state, matches) {
  const tied = new Map();
  rows.forEach(row => {
    if (!tied.has(row.total)) tied.set(row.total, new Set());
    tied.get(row.total).add(row.team.id);
  });
  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const tiedIds = tied.get(a.total);
    if (tiedIds.size > 1) {
      const h2h = h2hPoints(state, b, tiedIds, matches) - h2hPoints(state, a, tiedIds, matches);
      if (h2h) return h2h;
    }
    return (b.roundsWon - b.roundsLost) - (a.roundsWon - a.roundsLost)
      || b.gamesWon - a.gamesWon
      || a.team.name.localeCompare(b.team.name);
  });
  rows.forEach((row, index) => { row.rank = index + 1; });
  return rows;
}

export function computeGroupStandings(state) {
  return sortRows(state.teams.slice(0, 6).map(team => {
    const stats = aggregate(state, team, groupMatches());
    return { team, ...stats, total: stats.points, stage: 'group' };
  }), state, groupMatches());
}

export function completedGroupStage(state) {
  return state.teams.length === 6 && groupMatches().every(match => matchComplete(state, match));
}

export function completedLowerStage(state) {
  return completedGroupStage(state) && lowerMatches().every(match => matchComplete(state, match));
}

export function lowerWinners(state) {
  if (!completedGroupStage(state)) return [];
  return lowerMatches().map(match => matchWinner(state, match)).filter(Boolean);
}

export function qualifiedTeams(state) {
  if (!completedLowerStage(state)) return [];
  return [...computeGroupStandings(state).slice(0, 2).map(row => row.team), ...lowerWinners(state)];
}

export function isFinalist(state, teamId) {
  return qualifiedTeams(state).some(team => team.id === teamId);
}

export function computeStandings(state) {
  const groupRows = computeGroupStandings(state);
  const finalists = qualifiedTeams(state);
  const finalistIds = new Set(finalists.map(team => team.id));
  const finalRows = finalists.map(team => {
    const group = groupRows.find(row => row.team.id === team.id);
    const final = aggregate(state, team, finalMatches());
    return {
      team,
      ...final,
      groupPoints: group?.points || 0,
      finalPoints: final.points,
      qualified: true,
      total: final.series ? final.points : (group?.points || 0),
    };
  });
  const orderedFinal = finalRows.length ? sortRows(finalRows, state, finalMatches()) : [];
  const nonFinal = groupRows.filter(row => !finalistIds.has(row.team.id)).map(row => ({
    ...row,
    groupPoints: row.points,
    finalPoints: 0,
    qualified: false,
    total: row.points,
  }));
  const rows = finalists.length ? [...orderedFinal, ...nonFinal] : groupRows.map(row => ({
    ...row,
    groupPoints: row.points,
    finalPoints: 0,
    qualified: false,
    total: row.points,
  }));
  rows.forEach((row, index) => { row.rank = index + 1; });
  return rows;
}

export function computePlayers(state) {
  const rows = [];
  state.teams.forEach(team => team.players.forEach(player => rows.push({ player, team })));
  rows.sort((a, b) => a.team.name.localeCompare(b.team.name) || a.player.name.localeCompare(b.player.name));
  rows.forEach((row, index) => { row.rank = index + 1; });
  return rows;
}
