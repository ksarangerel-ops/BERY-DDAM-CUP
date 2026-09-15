/* ============================================================
   REHEARSAL — fill every match that could be played right now with a
   random result, so the organiser can walk through the whole cup
   (groups → tie-breakers → playoffs → reset) before the real day.
============================================================ */
import type { BoardState, Game, MatchRecord, Side } from './types';
import { CHARACTERS } from './characters';
import { winsNeeded } from './format';
import type { Derived } from './tournament';
import type { Rng } from './draw';

const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)] as T;

export function simulateStep(state: BoardState, d: Derived, rng: Rng = Math.random): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const now = Date.now();
  let n = 0;

  for (const f of d.fixtures) {
    if (f.status !== 'ready' && f.status !== 'live') continue;
    if (!f.a || !f.b) continue;
    const need = winsNeeded(f.bestOf);
    let ca = state.players[f.a]?.main || pick(CHARACTERS, rng);
    let cb = state.players[f.b]?.main || pick(CHARACTERS, rng);
    const games: Game[] = [];
    let sa = 0, sb = 0;
    while (sa < need && sb < need) {
      const w: Side = rng() < 0.5 ? 'a' : 'b';
      games.push({ w, ca, cb });
      if (w === 'a') sa++; else sb++;
      // Rule §3: the loser may switch character; sometimes they do.
      if (rng() < 0.3) { if (w === 'a') cb = pick(CHARACTERS, rng); else ca = pick(CHARACTERS, rng); }
    }
    const rec: MatchRecord = { a: f.a, b: f.b, games, live: false, station: null, updatedAt: new Date(now + n++).toISOString() };
    updates[`matches/${f.id}`] = rec;
  }

  // Ties that survived the tie-breaker matches get a random organiser order.
  if (n === 0) {
    for (const g of Object.values(d.groups)) {
      for (const t of g.openTies) {
        if (t.stage === 'decision') updates[`decisions/${t.key}`] = [...t.ids].sort(() => rng() - 0.5);
      }
    }
  }
  return updates;
}
