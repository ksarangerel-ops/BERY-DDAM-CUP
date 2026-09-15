/* ============================================================
   PLAYOFFS — 8-player double elimination with a bracket reset.

   GSL-style crossover. Groups A+B form one pod and C+D the other:
     Upper  WSF1  A1 vs B1        WSF2  C1 vs D1
     Lower  LR1A  C2 vs D2        LR1B  A2 vs B2
   A WSF loser drops into the OTHER pod's lower-bracket winner
   (LR2A = loser WSF1 vs winner LR1A), so nobody meets a player
   from their own group before Losers Round 3.
============================================================ */
import type { BoardState, SeedSlot } from './types';
import { BEST_OF } from './format';
import { type Fixture, readScore, statusOf } from './match';
import { type GroupResult, qualifier } from './groups';

export type PlayoffSlot = 'WSF1' | 'WSF2' | 'LR1A' | 'LR1B' | 'LR2A' | 'LR2B' | 'WF' | 'LR3' | 'LF' | 'GF' | 'GF2';

type Source = { seed: SeedSlot } | { winner: PlayoffSlot } | { loser: PlayoffSlot };

interface SlotDef {
  slot: PlayoffSlot;
  label: string;
  bracket: 'upper' | 'lower' | 'final';
  bestOf: number;
  a: Source;
  b: Source;
}

export const SEED_SLOTS: readonly SeedSlot[] = ['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2'];

/** Listed in the order they are normally played. */
export const PLAYOFF_SLOTS: readonly SlotDef[] = [
  { slot: 'WSF1', label: 'Winners Semifinal 1', bracket: 'upper', bestOf: BEST_OF.playoff, a: { seed: 'A1' }, b: { seed: 'B1' } },
  { slot: 'WSF2', label: 'Winners Semifinal 2', bracket: 'upper', bestOf: BEST_OF.playoff, a: { seed: 'C1' }, b: { seed: 'D1' } },
  { slot: 'LR1A', label: 'Losers Round 1 · A', bracket: 'lower', bestOf: BEST_OF.playoff, a: { seed: 'C2' }, b: { seed: 'D2' } },
  { slot: 'LR1B', label: 'Losers Round 1 · B', bracket: 'lower', bestOf: BEST_OF.playoff, a: { seed: 'A2' }, b: { seed: 'B2' } },
  { slot: 'LR2A', label: 'Losers Round 2 · A', bracket: 'lower', bestOf: BEST_OF.playoff, a: { loser: 'WSF1' }, b: { winner: 'LR1A' } },
  { slot: 'LR2B', label: 'Losers Round 2 · B', bracket: 'lower', bestOf: BEST_OF.playoff, a: { loser: 'WSF2' }, b: { winner: 'LR1B' } },
  { slot: 'WF', label: 'Winners Final', bracket: 'upper', bestOf: BEST_OF.playoff, a: { winner: 'WSF1' }, b: { winner: 'WSF2' } },
  { slot: 'LR3', label: 'Losers Round 3', bracket: 'lower', bestOf: BEST_OF.playoff, a: { winner: 'LR2A' }, b: { winner: 'LR2B' } },
  { slot: 'LF', label: 'Losers Final', bracket: 'lower', bestOf: BEST_OF.playoff, a: { loser: 'WF' }, b: { winner: 'LR3' } },
  { slot: 'GF', label: 'Grand Final', bracket: 'final', bestOf: BEST_OF.grandFinal, a: { winner: 'WF' }, b: { winner: 'LF' } },
  { slot: 'GF2', label: 'Grand Final · Reset', bracket: 'final', bestOf: BEST_OF.grandFinal, a: { winner: 'WF' }, b: { winner: 'LF' } },
];

export const playoffMatchId = (slot: PlayoffSlot): string => `po-${slot}`;

export const seedHint = (s: SeedSlot): string => `Group ${s[0]} #${s[1]}`;

export interface Placement { place: string; id: string }

export interface Bracket {
  fixtures: Record<PlayoffSlot, Fixture>;
  seeds: Record<SeedSlot, string | null>;
  seedSource: Record<SeedSlot, 'auto' | 'manual' | 'pending'>;
  resetNeeded: boolean;
  champion: string | null;
  placements: Placement[];
  started: boolean;
}

export function computeBracket(state: BoardState, groups: Record<string, GroupResult>): Bracket {
  const seeds = {} as Record<SeedSlot, string | null>;
  const seedSource = {} as Record<SeedSlot, 'auto' | 'manual' | 'pending'>;
  for (const s of SEED_SLOTS) {
    const manual = state.seeds[s];
    const g = groups[s[0] as string];
    const auto = g ? qualifier(g, Number(s[1]) as 1 | 2) : null;
    seeds[s] = manual ?? auto;
    seedSource[s] = manual ? 'manual' : auto ? 'auto' : 'pending';
  }

  const fixtures = {} as Record<PlayoffSlot, Fixture>;
  const resolve = (src: Source): { id: string | null; hint: string } => {
    if ('seed' in src) return { id: seeds[src.seed], hint: seedHint(src.seed) };
    if ('winner' in src) return { id: fixtures[src.winner]?.score.winner ?? null, hint: `Winner ${src.winner}` };
    return { id: fixtures[src.loser]?.score.loser ?? null, hint: `Loser ${src.loser}` };
  };

  PLAYOFF_SLOTS.forEach((def, i) => {
    const a = resolve(def.a), b = resolve(def.b);
    const id = playoffMatchId(def.slot);
    const score = readScore(state, state.matches[id], a.id, b.id, def.bestOf);
    fixtures[def.slot] = {
      id, kind: 'playoff', label: def.label, short: def.slot, bestOf: def.bestOf,
      a: a.id, b: b.id, aHint: a.hint, bHint: b.hint, order: 2000 + i,
      score, status: statusOf(a.id, b.id, score),
    };
  });

  const gf = fixtures.GF, gf2 = fixtures.GF2;
  // The reset is only played when the lower-bracket finalist (side b) wins GF.
  const resetNeeded = gf.score.done && gf.score.winner !== null && gf.score.winner === gf.b;
  if (gf.score.done && !resetNeeded) gf2.status = 'skipped';
  if (!gf.score.done) gf2.status = 'waiting';

  const champion = !gf.score.done ? null : resetNeeded ? (gf2.score.done ? gf2.score.winner : null) : gf.score.winner;
  const runnerUp = champion ? (champion === gf.a ? gf.b : gf.a) : null;

  const placements: Placement[] = [];
  const push = (place: string, id: string | null) => { if (id) placements.push({ place, id }); };
  push('1', champion);
  push('2', runnerUp);
  push('3', fixtures.LF.score.loser);
  push('4', fixtures.LR3.score.loser);
  push('5–6', fixtures.LR2A.score.loser);
  push('5–6', fixtures.LR2B.score.loser);
  push('7–8', fixtures.LR1A.score.loser);
  push('7–8', fixtures.LR1B.score.loser);

  const started = PLAYOFF_SLOTS.some(d => {
    const f = fixtures[d.slot];
    return f.score.live || f.score.games.length > 0 || (f.score.done && !f.score.auto);
  });

  return { fixtures, seeds, seedSource, resetNeeded, champion, placements, started };
}
