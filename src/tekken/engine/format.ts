/* ============================================================
   TOURNAMENT FORMAT — the numbers from the official rules doc.
============================================================ */
import type { Gender, GroupId } from './types';

export const GROUPS: readonly GroupId[] = ['A', 'B', 'C', 'D'];

/** Organiser decision: Groups A and B are the women's groups, C and D the men's. */
export const GROUP_GENDER: Record<GroupId, Gender> = { A: 'F', B: 'F', C: 'M', D: 'M' };
export const GENDER_LABEL: Record<Gender, string> = { F: 'Women', M: 'Men' };
export const groupLabel = (g: GroupId): string => `Group ${g} · ${GENDER_LABEL[GROUP_GENDER[g]]}`;
export const NUM_TEAMS = 6;
export const TEAM_SIZE = 4;          // 2 men + 2 women
export const GROUP_SIZE = 6;         // one player from every team

export const BEST_OF = {
  group: 3,
  tiebreak: 1,
  playoff: 3,
  grandFinal: 5,
} as const;

/** Games needed to take a match: BO1 → 1, BO3 → 2, BO5 → 3. */
export const winsNeeded = (bestOf: number): number => Math.floor(bestOf / 2) + 1;

export const MAX_STATIONS = 8;
