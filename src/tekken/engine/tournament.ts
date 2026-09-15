/* ============================================================
   DERIVE — one pass from BoardState to everything the UI shows.
============================================================ */
import type { BoardState, GroupId, SeedSlot } from './types';
import { GROUPS } from './format';
import type { Fixture } from './match';
import { type GroupResult, type StandingRow, computeGroup } from './groups';
import { type Bracket, computeBracket, SEED_SLOTS } from './playoffs';
import { drawIssues } from './draw';

export type StageKey = 'setup' | 'groups' | 'tiebreaks' | 'playoffs' | 'finished';

export interface Stage {
  key: StageKey;
  label: string;
  done: number;
  total: number;
}

export interface CharUse { name: string; games: number; wins: number }

export interface PlayerSummary {
  id: string;
  fixtures: Fixture[];          // every fixture this player is in, schedule order
  w: number;
  l: number;
  gw: number;
  gl: number;
  groupRow: StandingRow | null;
  chars: CharUse[];
  finish: string;
  alive: boolean;
}

export interface Derived {
  groups: Record<GroupId, GroupResult>;
  issues: string[];
  drawn: boolean;
  groupsSettled: boolean;
  fixtures: Fixture[];
  byId: Record<string, Fixture>;
  bracket: Bracket;
  live: Fixture[];
  upNext: Fixture[];
  recent: Fixture[];
  stage: Stage;
  players: Record<string, PlayerSummary>;
  characters: CharUse[];
}

const PLACE_NAME: Record<string, string> = {
  '1': 'Champion', '2': 'Runner-up', '3': '3rd place', '4': '4th place', '5–6': '5th–6th place', '7–8': '7th–8th place',
};

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

function bump(map: Map<string, CharUse>, name: string | undefined, won: boolean) {
  if (!name) return;
  const c = map.get(name) ?? { name, games: 0, wins: 0 };
  c.games++;
  if (won) c.wins++;
  map.set(name, c);
}

const sortChars = (m: Map<string, CharUse>) =>
  [...m.values()].sort((x, y) => y.games - x.games || y.wins - x.wins || x.name.localeCompare(y.name));

export function derive(state: BoardState): Derived {
  const issues = drawIssues(state);
  const drawn = issues.length === 0;

  const groups = {} as Record<GroupId, GroupResult>;
  for (const g of GROUPS) groups[g] = computeGroup(state, g);
  const groupsSettled = drawn && GROUPS.every(g => groups[g].settled);

  const bracket = computeBracket(state, groups);

  const fixtures = [
    ...GROUPS.flatMap(g => groups[g].fixtures),
    ...GROUPS.flatMap(g => groups[g].tiebreaks),
    ...Object.values(bracket.fixtures),
  ].sort((x, y) => x.order - y.order);
  const byId = Object.fromEntries(fixtures.map(f => [f.id, f]));

  const live = fixtures.filter(f => f.status === 'live')
    .sort((x, y) => (x.score.station ?? 99) - (y.score.station ?? 99));

  // "Up next" suggests matches that could start right now, with no player twice.
  const busy = new Set(live.flatMap(f => [f.a, f.b]));
  const upNext: Fixture[] = [];
  for (const f of fixtures) {
    if (upNext.length >= 6) break;
    if (f.status !== 'ready' || busy.has(f.a) || busy.has(f.b)) continue;
    upNext.push(f);
    busy.add(f.a); busy.add(f.b);
  }

  const recent = fixtures
    .filter(f => f.status === 'done' && !f.score.auto && f.score.updatedAt)
    .sort((x, y) => (y.score.updatedAt ?? '').localeCompare(x.score.updatedAt ?? ''))
    .slice(0, 8);

  // ---------- stage ----------
  const groupFx = GROUPS.flatMap(g => groups[g].fixtures);
  const tbFx = GROUPS.flatMap(g => groups[g].tiebreaks);
  const poFx = Object.values(bracket.fixtures).filter(f => f.short !== 'GF2' || bracket.resetNeeded);
  const count = (list: Fixture[]) => list.filter(f => f.score.done).length;
  let stage: Stage;
  if (!drawn) stage = { key: 'setup', label: 'Group draw pending', done: 0, total: 1 };
  else if (!GROUPS.every(g => groups[g].complete)) stage = { key: 'groups', label: 'Group stage', done: count(groupFx), total: groupFx.length };
  else if (!groupsSettled) stage = { key: 'tiebreaks', label: 'Tie-breakers', done: count(tbFx), total: Math.max(tbFx.length, 1) };
  else if (!bracket.champion) stage = { key: 'playoffs', label: 'Playoffs', done: count(poFx), total: poFx.length };
  else stage = { key: 'finished', label: 'Champion crowned', done: 1, total: 1 };

  // ---------- players ----------
  const allChars = new Map<string, CharUse>();
  const players: Record<string, PlayerSummary> = {};
  const seedOf = new Map<string, SeedSlot>();
  for (const s of SEED_SLOTS) { const id = bracket.seeds[s]; if (id) seedOf.set(id, s); }
  const placement = new Map(bracket.placements.map(p => [p.id, p.place]));

  for (const [pid, p] of Object.entries(state.players)) {
    const mine = fixtures.filter(f => f.a === pid || f.b === pid);
    const chars = new Map<string, CharUse>();
    let w = 0, l = 0, gw = 0, gl = 0, poLosses = 0;
    for (const f of mine) {
      const isA = f.a === pid;
      if (f.score.done && f.score.winner) {
        if (f.score.winner === pid) w++; else { l++; if (f.kind === 'playoff') poLosses++; }
      }
      gw += isA ? f.score.sa : f.score.sb;
      gl += isA ? f.score.sb : f.score.sa;
      for (const g of f.score.games) {
        const name = isA ? g.ca : g.cb;
        const won = g.w === (isA ? 'a' : 'b');
        bump(chars, name, won);
        bump(allChars, name, won);
      }
    }

    const groupRow = p.group ? groups[p.group].rows.find(r => r.id === pid) ?? null : null;
    const place = placement.get(pid);
    const seed = seedOf.get(pid);
    let finish = 'Group stage';
    let alive = true;
    if (place) { finish = PLACE_NAME[place] ?? place; alive = place === '1'; }
    else if (seed) {
      const upper = seed[1] === '1' && poLosses === 0;
      finish = upper ? 'Upper bracket' : 'Lower bracket';
    } else if (groupRow?.status === 'out') { finish = `Group ${p.group} · ${ordinal(groupRow.place)}`; alive = false; }
    if (p.withdrawn) { finish = 'Withdrawn'; alive = false; }

    players[pid] = { id: pid, fixtures: mine, w, l, gw, gl, groupRow, chars: sortChars(chars), finish, alive };
  }

  return {
    groups, issues, drawn, groupsSettled, fixtures, byId, bracket,
    live, upNext, recent, stage, players, characters: sortChars(allChars),
  };
}
