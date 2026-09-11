/* ============================================================
   DDAM CUP CS2 — single group BO1 → lower qualifier → BO3 final round robin

   Six teams play one BO1 against every other team (15 matches). Group seeds
   1 and 2 wait in the upper slot. Seeds 3–6 play two BO1 lower qualifiers;
   the two winners join seeds 1 and 2 for a six-match BO3 final round robin.
============================================================ */
export const GROUP_MATCHES = 15;
export const LOWER_MATCHES = 2;
export const FINAL_MATCHES = 6;
export const FINALISTS = 4;
export const SQUAD_SIZE = 5;

export const BO1_POINTS = { '1-0': 1, '0-1': 0 };
export const BO3_POINTS = { '2-0': 3, '2-1': 3, '1-2': 0, '0-2': 0 };
export const SERIES_POINTS = { ...BO1_POINTS, ...BO3_POINTS };
export const SERIES_RESULTS = {
  group: Object.keys(BO1_POINTS),
  lower: Object.keys(BO1_POINTS),
  final: Object.keys(BO3_POINTS),
};
export const pointsForSeries = (stage, series) => (
  (stage === 'final' ? BO3_POINTS : BO1_POINTS)[series] ?? 0
);

const ROUND_ROBIN_PAIRS_6 = [];
for (let a = 0; a < 6; a += 1) {
  for (let b = a + 1; b < 6; b += 1) ROUND_ROBIN_PAIRS_6.push([a, b]);
}

export const MATCHES = [
  ...ROUND_ROBIN_PAIRS_6.map((pair, index) => ({
    id: index + 1,
    stage: 'group',
    pair,
    format: 'BO1',
    label: `Group Stage · Match ${index + 1}`,
  })),
  { id: 16, stage: 'lower', bracket: 'lower', seedPair: [3, 6], format: 'BO1', label: 'Lower Qualifier 1 · Seed 3 vs Seed 6' },
  { id: 17, stage: 'lower', bracket: 'lower', seedPair: [4, 5], format: 'BO1', label: 'Lower Qualifier 2 · Seed 4 vs Seed 5' },
  ...[[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]].map((pair, index) => ({
    id: index + 18,
    stage: 'final',
    bracket: 'round-robin',
    pair,
    format: 'BO3',
    label: `Final Round Robin · Match ${index + 1}`,
  })),
];

export const NUM_MATCHES = MATCHES.length;
export const NUM_TEAMS = 6;

export const TEAM_SEED = [
  ['Team Alpha',   'ALP', null],
  ['Team Bravo',   'BRV', null],
  ['Team Charlie', 'CHR', null],
  ['Team Delta',   'DLT', null],
  ['Team Echo',    'ECH', null],
  ['Team Foxtrot', 'FOX', null],
];

export const matchById = id => MATCHES.find(match => match.id === Number(id));
export const groupMatches = () => MATCHES.filter(match => match.stage === 'group');
export const lowerMatches = () => MATCHES.filter(match => match.stage === 'lower');
export const finalMatches = () => MATCHES.filter(match => match.stage === 'final');

const ENV = import.meta.env || {};
export const TOURNAMENT_ID = ENV.VITE_TOURNAMENT_ID || 'ddam-cup-cs2-group-final-v1';
export const CACHE_KEY = `ddam-cup-cache:${TOURNAMENT_ID}`;
