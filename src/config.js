/* ============================================================
   DDAM ESPORT CUP CS2 — single group BO1 → lower qualifiers → BO3 playoff bracket

   Six teams play one BO1 against every other team (15 matches). Group seeds
   1 and 2 wait in the upper slot. Seeds 3–6 play two BO1 lower qualifiers;
   the two winners join seeds 1 and 2 for two BO3 semifinals. The semifinal
   winners play the Grand Final and the semifinal losers play for 3rd place.
============================================================ */
export const GROUP_MATCHES = 15;
export const LOWER_MATCHES = 2;
export const FINAL_MATCHES = 4;
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
  { id: 18, stage: 'final', bracket: 'semi', semi: 1, format: 'BO3', label: 'Semifinal 1 · Seed 1 vs Lower Q1' },
  { id: 19, stage: 'final', bracket: 'semi', semi: 2, format: 'BO3', label: 'Semifinal 2 · Seed 2 vs Lower Q2' },
  { id: 20, stage: 'final', bracket: 'grand', source: [18, 19], format: 'BO3', label: 'Grand Final · 1st / 2nd' },
  { id: 21, stage: 'final', bracket: 'third', source: [18, 19], format: 'BO3', label: '3rd Place Final · 3rd / 4th' },
];

export const NUM_MATCHES = MATCHES.length;
export const NUM_TEAMS = 6;

export const TEAM_SEED = [
  ['Team Gegeenee', 'ALP', null],
  ['Team Babi',     'BRV', null],
  ['Team Ganaa',    'CHR', null],
  ['Team Hangai',   'DLT', null],
  ['Team Amara',    'ECH', null],
  ['Team Bery',     'FOX', null],
];

export const matchById = id => MATCHES.find(match => match.id === Number(id));
export const groupMatches = () => MATCHES.filter(match => match.stage === 'group');
export const lowerMatches = () => MATCHES.filter(match => match.stage === 'lower');
export const finalMatches = () => MATCHES.filter(match => match.stage === 'final');

const ENV = import.meta.env || {};
export const TOURNAMENT_ID = ENV.VITE_CS2_TOURNAMENT_ID || 'ddam-cup-cs2-group-final-v1';
export const CACHE_KEY = `ddam-cup-cache:${TOURNAMENT_ID}`;
