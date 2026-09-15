/* ============================================================
   GROUP STAGE — round-robin fixtures, standings and tie-breakers.

   Placement order (rules §5–7):
     1. Points (match win = 1)
     2. Head-to-head — only when exactly 2 players are level on points
     3. Game differential
     4. Games won
     5. Tie-breaker matches (BO1; round-robin when 3+ are level)
        → most TB wins → TB game differential
     6. Organiser decision (their extra BO1), entered in Admin

   Tie-breaker matches are only demanded once the group is complete and
   only when the tie decides a playoff spot (1st → Upper, 2nd → Lower).
   A tie among 3rd–6th changes nothing, so it is shown as shared.
============================================================ */
import type { BoardState, GroupId } from './types';
import { BEST_OF, GROUPS } from './format';
import { type Fixture, groupMatchId, orderedPair, readScore, statusOf } from './match';

export type QualStatus = 'upper' | 'lower' | 'out';

export interface StandingRow {
  id: string;
  place: number;
  tied: boolean;
  played: number;
  w: number;
  l: number;
  pts: number;
  gw: number;
  gl: number;
  diff: number;
  status: QualStatus | null;
  decidedBy: string | null;
}

export type TieStage = 'tiebreak' | 'decision';

export interface OpenTie {
  key: string;
  group: GroupId;
  ids: string[];
  place: number;
  stage: TieStage;
}

export interface GroupResult {
  id: GroupId;
  members: string[];
  rows: StandingRow[];
  fixtures: Fixture[];
  tiebreaks: Fixture[];
  openTies: OpenTie[];
  played: number;
  total: number;
  complete: boolean;
  settled: boolean;
}

export function groupMembers(state: BoardState, g: GroupId): string[] {
  return Object.entries(state.players)
    .filter(([, p]) => p.group === g)
    .sort(([ia, pa], [ib, pb]) =>
      (state.teams[pa.team]?.order ?? 0) - (state.teams[pb.team]?.order ?? 0) || ia.localeCompare(ib))
    .map(([id]) => id);
}

/** Circle-method round robin: everyone plays once per round. */
export function roundRobin<T>(items: readonly T[]): [T, T][][] {
  const list: (T | null)[] = [...items];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds: [T, T][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [T, T][] = [];
    for (let i = 0; i < n / 2; i++) {
      const x = list[i] ?? null;
      const y = list[n - 1 - i] ?? null;
      if (x !== null && y !== null) pairs.push([x, y]);
    }
    rounds.push(pairs);
    const moved = list.pop();
    list.splice(1, 0, moved ?? null);
  }
  return rounds;
}

/** Stable key for a set of tied players; used for tie-breaker ids and organiser decisions. */
export const tieKey = (g: GroupId, ids: readonly string[]): string => `${g}-${[...ids].sort().join('_')}`;

const groupBy = <T>(items: T[], key: (t: T) => string | number): T[][] => {
  const out: T[][] = [];
  let lastKey: string | number | undefined;
  for (const it of items) {
    const k = key(it);
    const tail = out[out.length - 1];
    if (tail && k === lastKey) tail.push(it);
    else out.push([it]);
    lastKey = k;
  }
  return out;
};

function makeFixture(
  state: BoardState, id: string, x: string, y: string, bestOf: number,
  meta: Pick<Fixture, 'kind' | 'label' | 'short' | 'order' | 'group' | 'round'>,
): Fixture {
  const [a, b] = orderedPair(x, y);
  const score = readScore(state, state.matches[id], a, b, bestOf);
  return { id, ...meta, bestOf, a, b, aHint: '', bHint: '', score, status: statusOf(a, b, score) };
}

interface Tally { played: number; w: number; l: number; gw: number; gl: number }

function tally(ids: readonly string[], fixtures: readonly Fixture[]): Map<string, Tally> {
  const t = new Map<string, Tally>(ids.map(id => [id, { played: 0, w: 0, l: 0, gw: 0, gl: 0 }]));
  for (const f of fixtures) {
    if (!f.score.done || !f.a || !f.b) continue;
    const ta = t.get(f.a), tb = t.get(f.b);
    if (!ta || !tb) continue;
    ta.played++; tb.played++;
    ta.gw += f.score.sa; ta.gl += f.score.sb;
    tb.gw += f.score.sb; tb.gl += f.score.sa;
    if (f.score.winner === f.a) { ta.w++; tb.l++; }
    else if (f.score.winner === f.b) { tb.w++; ta.l++; }
  }
  return t;
}

interface Block { ids: string[]; by: string | null; open?: TieStage; key?: string }

export function computeGroup(state: BoardState, g: GroupId): GroupResult {
  const gi = GROUPS.indexOf(g);
  const members = groupMembers(state, g);
  const seat = new Map(members.map((id, i) => [id, i]));
  const bySeat = (x: string, y: string) => (seat.get(x) ?? 0) - (seat.get(y) ?? 0);

  const fixtures: Fixture[] = [];
  roundRobin(members).forEach((pairs, r) => pairs.forEach(([x, y], i) => {
    fixtures.push(makeFixture(state, groupMatchId(x, y), x, y, BEST_OF.group, {
      kind: 'group', label: `Group ${g} · Round ${r + 1}`, short: `${g} · R${r + 1}`,
      order: r * 100 + gi * 10 + i, group: g, round: r + 1,
    }));
  }));

  const played = fixtures.filter(f => f.score.done).length;
  const complete = fixtures.length > 0 && played === fixtures.length;
  const stats = tally(members, fixtures);
  const st = (id: string): Tally => stats.get(id) ?? { played: 0, w: 0, l: 0, gw: 0, gl: 0 };
  const diff = (id: string) => st(id).gw - st(id).gl;

  const tiebreaks: Fixture[] = [];
  const openTies: OpenTie[] = [];

  const h2h = (x: string, y: string): string | null => {
    const f = fixtures.find(fx => fx.id === groupMatchId(x, y));
    return f?.score.done ? f.score.winner : null;
  };

  const decide = (ids: string[], place: number): Block[] => {
    const key = tieKey(g, ids);
    const d = state.decisions[key];
    if (d && d.length === ids.length && ids.every(id => d.includes(id))) {
      return d.map(id => ({ ids: [id], by: 'Organiser decision' }));
    }
    openTies.push({ key, group: g, ids, place, stage: 'decision' });
    return [{ ids, by: null, open: 'decision', key }];
  };

  const tiebreak = (ids: string[], place: number): Block[] => {
    // Only a tie that decides a playoff spot needs to be played off.
    if (!complete || place > 2) return [{ ids, by: null }];
    const key = tieKey(g, ids);
    const tb = roundRobin([...ids].sort(bySeat)).flat().map(([x, y], i) =>
      makeFixture(state, `tb-${key}-${orderedPair(x, y).join('-')}`, x, y, BEST_OF.tiebreak, {
        kind: 'tiebreak', label: `Group ${g} · Tie-breaker`, short: `${g} · TB`,
        order: 1000 + gi * 50 + tiebreaks.length + i, group: g,
      }));
    tiebreaks.push(...tb);
    if (!tb.every(f => f.score.done)) {
      openTies.push({ key, group: g, ids, place, stage: 'tiebreak' });
      return [{ ids, by: null, open: 'tiebreak', key }];
    }
    const tt = tally(ids, tb);
    const tbw = (id: string) => tt.get(id)?.w ?? 0;
    const tbd = (id: string) => (tt.get(id)?.gw ?? 0) - (tt.get(id)?.gl ?? 0);
    const sorted = [...ids].sort((x, y) => tbw(y) - tbw(x) || tbd(y) - tbd(x) || bySeat(x, y));
    const out: Block[] = [];
    let p = place;
    for (const sub of groupBy(sorted, id => `${tbw(id)}|${tbd(id)}`)) {
      out.push(...(sub.length === 1 ? [{ ids: sub, by: 'Tie-breaker match' }] : decide(sub, p)));
      p += sub.length;
    }
    return out;
  };

  const byGames = (ids: string[], place: number): Block[] => {
    const sorted = [...ids].sort((x, y) => diff(y) - diff(x) || st(y).gw - st(x).gw || bySeat(x, y));
    const out: Block[] = [];
    let p = place;
    for (const sub of groupBy(sorted, id => `${diff(id)}|${st(id).gw}`)) {
      if (sub.length === 1) {
        const [only] = sub as [string];
        const sharedDiff = ids.some(o => o !== only && diff(o) === diff(only));
        out.push({ ids: sub, by: sharedDiff ? 'Games won' : 'Game differential' });
      } else {
        out.push(...tiebreak(sub, p));
      }
      p += sub.length;
    }
    return out;
  };

  const byPoints = (ids: string[], place: number): Block[] => {
    if (ids.length === 1) return [{ ids, by: null }];
    if (ids.length === 2) {
      const [x, y] = ids as [string, string];
      const w = h2h(x, y);
      if (w) return [{ ids: [w], by: 'Head-to-head' }, { ids: [w === x ? y : x], by: 'Head-to-head' }];
    }
    return byGames(ids, place);
  };

  const ranked = [...members].sort((x, y) => st(y).w - st(x).w || bySeat(x, y));
  const blocks: Block[] = [];
  let place = 1;
  for (const cluster of groupBy(ranked, id => st(id).w)) {
    blocks.push(...byPoints(cluster, place));
    place += cluster.length;
  }

  const rows: StandingRow[] = [];
  place = 1;
  for (const block of blocks) {
    for (const id of block.ids) {
      const s = st(id);
      const tied = block.ids.length > 1;
      let status: QualStatus | null = null;
      if (complete && !block.open) status = place === 1 && !tied ? 'upper' : place === 2 && !tied ? 'lower' : place >= 3 ? 'out' : null;
      rows.push({
        id, place, tied, played: s.played, w: s.w, l: s.l, pts: s.w, gw: s.gw, gl: s.gl,
        diff: s.gw - s.gl, status, decidedBy: block.by,
      });
    }
    place += block.ids.length;
  }

  return {
    id: g, members, rows, fixtures, tiebreaks, openTies,
    played, total: fixtures.length, complete, settled: complete && openTies.length === 0,
  };
}

/** Player id finishing at `place` (1 or 2) in a group, once that spot is certain. */
export function qualifier(res: GroupResult, place: 1 | 2): string | null {
  const want: QualStatus = place === 1 ? 'upper' : 'lower';
  return res.rows.find(r => r.status === want)?.id ?? null;
}
