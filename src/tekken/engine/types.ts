/* ============================================================
   DATA MODEL
   BoardState is exactly what is stored in the Supabase tournaments row.
   Everything else (standings, bracket, queue, stats) is DERIVED from it
   by the pure functions in this folder, so there is one source of truth
   and nothing to keep in sync by hand.
============================================================ */

export type GroupId = 'A' | 'B' | 'C' | 'D';
export type Gender = 'M' | 'F';
export type Side = 'a' | 'b';

export interface Team {
  name: string;
  color: string;
  order: number;
}

export interface Player {
  team: string;              // team id
  name: string;
  gender: Gender;
  main?: string;             // preferred Tekken character (optional)
  group?: GroupId | null;    // assigned by the group draw
  withdrawn?: boolean;       // remaining matches count as losses (rule 1)
  photo?: string;            // Supabase Storage URL, or an inline data: URL in local mode (see ui/photos.ts)
}

/** One game inside a match. `w` is the side that won it. Characters are optional. */
export interface Game {
  w: Side;
  ca?: string;
  cb?: string;
}

/**
 * A stored match result. `a`/`b` are the player ids the result was recorded for:
 * if the fixture's players change later (a re-draw, an edited earlier result),
 * the record no longer matches and is treated as stale instead of being applied
 * to the wrong people.
 */
export interface MatchRecord {
  a: string;
  b: string;
  games?: Game[];
  wo?: Side | null;          // walkover winner
  live?: boolean;
  station?: number | null;
  updatedAt?: string;
}

export interface Meta {
  title: string;
  stations: number;
  /** YouTube link per station, keyed `s1`…`s8`. */
  streams: Record<string, string>;
  updated: string | null;
}

/** Playoff entry slots, named after where the player qualified from. */
export type SeedSlot = 'A1' | 'B1' | 'C1' | 'D1' | 'A2' | 'B2' | 'C2' | 'D2';

export interface BoardState {
  meta: Meta;
  teams: Record<string, Team>;
  players: Record<string, Player>;
  matches: Record<string, MatchRecord>;
  /** Organiser's final order for a tie that survived every tie-breaker (rule 7). */
  decisions: Record<string, string[]>;
  /** Manual playoff slot overrides. Missing slots follow the group results. */
  seeds: Partial<Record<SeedSlot, string>>;
}
