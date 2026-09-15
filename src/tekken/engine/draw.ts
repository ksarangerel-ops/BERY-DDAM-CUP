/* ============================================================
   GROUP DRAW
   Rule §2: every group gets exactly one player from each team.
   Organiser decision: Groups A and B are women, C and D are men.

   So each team's two women are dealt across A/B and its two men across
   C/D. Swapping two players of the same team AND the same gender keeps
   both rules true, which is the only swap the admin editor allows.
============================================================ */
import type { BoardState, Gender, GroupId } from './types';
import { GENDER_LABEL, GROUP_GENDER, GROUP_SIZE, GROUPS } from './format';

export type Rng = () => number;

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

const groupsFor = (gender: Gender) => GROUPS.filter(g => GROUP_GENDER[g] === gender);

export function teamRoster(state: BoardState): { teamId: string; players: string[] }[] {
  return Object.entries(state.teams)
    .sort(([, x], [, y]) => x.order - y.order)
    .map(([teamId]) => ({
      teamId,
      players: Object.keys(state.players).filter(pid => state.players[pid]?.team === teamId).sort(),
    }));
}

/**
 * Deal one team: women into the women's groups, men into the men's groups.
 * A team with the wrong mix (e.g. 3 women) spills into the other groups, and
 * genderIssues() reports it instead of the draw silently failing.
 */
function dealTeam(state: BoardState, players: string[], order: (groups: GroupId[]) => GroupId[]): [string, GroupId][] {
  const women = players.filter(pid => state.players[pid]?.gender === 'F');
  const men = players.filter(pid => state.players[pid]?.gender !== 'F');
  const out: [string, GroupId][] = [];
  const free = new Set<GroupId>(GROUPS);
  for (const [list, gender] of [[women, 'F'], [men, 'M']] as const) {
    for (const pid of list) {
      const g = order(groupsFor(gender).filter(x => free.has(x)))[0] ?? order([...free])[0];
      if (!g) continue;
      free.delete(g);
      out.push([pid, g]);
    }
  }
  return out;
}

export function drawGroups(state: BoardState, rng: Rng = Math.random): Record<string, GroupId> {
  const result: Record<string, GroupId> = {};
  for (const { players } of teamRoster(state)) {
    for (const [pid, g] of dealTeam(state, players, gs => shuffle(gs, rng))) result[pid] = g;
  }
  return result;
}

/** Non-random fill: each team's women go to A then B, its men to C then D, in roster order. */
export function orderedGroups(state: BoardState): Record<string, GroupId> {
  const result: Record<string, GroupId> = {};
  for (const { players } of teamRoster(state)) {
    for (const [pid, g] of dealTeam(state, players, gs => gs)) result[pid] = g;
  }
  return result;
}

/** Structural problems: without these fixed there are no valid round robins. */
export function drawIssues(state: BoardState): string[] {
  const issues: string[] = [];
  const unassigned = Object.values(state.players).filter(p => !p.group).length;
  if (unassigned) issues.push(`${unassigned} player${unassigned > 1 ? 's are' : ' is'} not in a group yet`);
  for (const g of GROUPS) {
    const inGroup = Object.values(state.players).filter(p => p.group === g);
    if (unassigned === 0 && inGroup.length !== GROUP_SIZE) issues.push(`Group ${g} has ${inGroup.length} players (needs ${GROUP_SIZE})`);
    const teams = new Set<string>();
    for (const p of inGroup) {
      if (teams.has(p.team)) issues.push(`Group ${g} has two players from ${state.teams[p.team]?.name ?? p.team}`);
      teams.add(p.team);
    }
  }
  return issues;
}

/**
 * Women/men group mismatches. Shown to the organiser as warnings, but they do not
 * hide the groups: a mis-clicked gender toggle mid-tournament must not blank the board.
 */
export function genderIssues(state: BoardState): string[] {
  const issues: string[] = [];
  for (const { teamId, players } of teamRoster(state)) {
    const women = players.filter(pid => state.players[pid]?.gender === 'F').length;
    if (women !== 2 || players.length - women !== 2) {
      issues.push(`${state.teams[teamId]?.name ?? teamId} has ${women} women and ${players.length - women} men (needs 2 + 2)`);
    }
  }
  for (const [, p] of Object.entries(state.players)) {
    if (p.group && GROUP_GENDER[p.group] !== p.gender) {
      issues.push(`${p.name} is in Group ${p.group} (${GENDER_LABEL[GROUP_GENDER[p.group]].toLowerCase()}) but is marked ${p.gender === 'F' ? 'woman' : 'man'}`);
    }
  }
  return issues;
}
