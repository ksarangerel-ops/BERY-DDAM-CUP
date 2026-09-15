/* ============================================================
   MATCH SCORING — turns a stored record into a score.
============================================================ */
import type { BoardState, Game, MatchRecord, Side } from './types';
import { winsNeeded } from './format';

export type FixtureKind = 'group' | 'tiebreak' | 'playoff';
export type FixtureStatus = 'waiting' | 'ready' | 'live' | 'done' | 'skipped';

export interface MatchScore {
  sa: number;
  sb: number;
  games: Game[];               // only the games that counted
  done: boolean;
  winner: string | null;
  loser: string | null;
  wo: Side | null;             // walkover winner (recorded or automatic)
  auto: boolean;               // walkover was produced by a withdrawal, not typed in
  live: boolean;
  station: number | null;
  updatedAt: string | null;
  stale: boolean;              // a record exists but for different players
}

export interface Fixture {
  id: string;
  kind: FixtureKind;
  label: string;               // "Group A · Round 2", "Winners Semifinal 1"
  short: string;               // "A·R2", "WSF1"
  bestOf: number;
  a: string | null;
  b: string | null;
  aHint: string;               // shown while a player is still unknown
  bHint: string;
  order: number;
  group?: string;
  round?: number;
  score: MatchScore;
  status: FixtureStatus;
}

const EMPTY: Omit<MatchScore, 'stale'> = {
  sa: 0, sb: 0, games: [], done: false, winner: null, loser: null,
  wo: null, auto: false, live: false, station: null, updatedAt: null,
};

export const groupMatchId = (x: string, y: string): string =>
  (x < y ? `g-${x}-${y}` : `g-${y}-${x}`);

/** Group fixtures always store the lower id as side `a`, so a pair maps to exactly one record. */
export const orderedPair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

export function readScore(
  state: BoardState,
  rec: MatchRecord | undefined,
  a: string | null,
  b: string | null,
  bestOf: number,
): MatchScore {
  const need = winsNeeded(bestOf);
  if (!a || !b) return { ...EMPTY, stale: !!rec };

  const matches = !!rec && rec.a === a && rec.b === b;
  const stale = !!rec && !matches;
  const r = matches ? rec : undefined;

  const side = (w: Side) => (w === 'a' ? { winner: a, loser: b } : { winner: b, loser: a });

  if (r?.wo) {
    return {
      ...EMPTY, ...side(r.wo), stale,
      sa: r.wo === 'a' ? need : 0, sb: r.wo === 'b' ? need : 0,
      done: true, wo: r.wo, updatedAt: r.updatedAt ?? null,
    };
  }

  let sa = 0, sb = 0;
  const games: Game[] = [];
  for (const g of r?.games ?? []) {
    if (sa >= need || sb >= need) break;
    games.push(g);
    if (g.w === 'a') sa++; else sb++;
  }
  const done = sa >= need || sb >= need;

  // Rule 1: a withdrawn player loses every match they have not finished.
  if (!done) {
    const wa = state.players[a]?.withdrawn === true;
    const wb = state.players[b]?.withdrawn === true;
    if (wa !== wb) {
      const wo: Side = wa ? 'b' : 'a';
      return {
        ...EMPTY, ...side(wo), stale,
        sa: wo === 'a' ? need : 0, sb: wo === 'b' ? need : 0,
        done: true, wo, auto: true,
      };
    }
    if (wa && wb) return { ...EMPTY, stale, done: true, auto: true };
  }

  return {
    sa, sb, games, done, stale,
    ...(done ? side(sa > sb ? 'a' : 'b') : { winner: null, loser: null }),
    wo: null, auto: false,
    live: !done && r?.live === true,
    station: r?.station ?? null,
    updatedAt: r?.updatedAt ?? null,
  };
}

export function statusOf(a: string | null, b: string | null, score: MatchScore): FixtureStatus {
  if (score.done) return 'done';
  if (!a || !b) return 'waiting';
  return score.live ? 'live' : 'ready';
}

/** Score from one player's point of view. */
export function scoreFor(f: Fixture, pid: string): { mine: number; theirs: number; opp: string | null; won: boolean | null } {
  const isA = f.a === pid;
  return {
    mine: isA ? f.score.sa : f.score.sb,
    theirs: isA ? f.score.sb : f.score.sa,
    opp: isA ? f.b : f.a,
    won: f.score.done && f.score.winner ? f.score.winner === pid : null,
  };
}
