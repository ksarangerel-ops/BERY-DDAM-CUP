/* ============================================================
   DDAM CUP DOTA 2 — tournament configuration

   Six teams start in two editable zones. Each zone has three teams and
   plays a BO2 round robin. The bottom team is eliminated; the top two from
   each zone form a four-team BO3 round robin for the final standings.
============================================================ */
export const ZONES = ['A', 'B'];
export const TEAMS_PER_ZONE = 3;
export const ZONE_MATCHES = 3;
export const FINAL_MATCHES = 6;
export const QUALIFIERS_PER_ZONE = 2;
export const SQUAD_SIZE = 5;

export const BO2_POINTS = {
  '2-0': 3,
  '1-1': 1,
  '0-2': 0,
};

export const BO3_POINTS = {
  '2-0': 3,
  '2-1': 3,
  '1-2': 0,
  '0-2': 0,
};

export const SERIES_POINTS = { ...BO2_POINTS, ...BO3_POINTS };
export const SERIES_RESULTS = {
  zone: Object.keys(BO2_POINTS),
  final: Object.keys(BO3_POINTS),
};
export const pointsForSeries = (stage, series) => (
  (stage === 'final' ? BO3_POINTS : BO2_POINTS)[series] ?? 0
);

const ROUND_ROBIN_PAIRS_3 = [[0, 1], [0, 2], [1, 2]];
const ROUND_ROBIN_PAIRS_4 = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

export const MATCHES = [
  ...ZONES.flatMap((zoneId, zoneIndex) => ROUND_ROBIN_PAIRS_3.map((pair, matchIndex) => ({
    id: zoneIndex * ZONE_MATCHES + matchIndex + 1,
    stage: 'zone',
    zoneId,
    pair,
    format: 'BO2',
    label: `Zone ${zoneId} · Round ${matchIndex + 1}`,
  }))),
  ...ROUND_ROBIN_PAIRS_4.map((pair, matchIndex) => ({
    id: ZONES.length * ZONE_MATCHES + matchIndex + 1,
    stage: 'final',
    pair,
    format: 'BO3',
    label: `Final Round Robin · Match ${matchIndex + 1}`,
  })),
];

export const NUM_MATCHES = MATCHES.length;
export const NUM_TEAMS = 6;

/* The six seed names and the initial A/B split are editable from Admin. */
export const TEAM_SEED = [
  ['Team Gegeenee', 'ALP', 'A'],
  ['Team Ganaa',    'BRV', 'A'],
  ['Team Garidaa',  'CHR', 'A'],
  ['Team Amaraa',   'DLT', 'B'],
  ['Team Bery',     'ECH', 'B'],
  ['Team Bagaa',    'FOX', 'B'],
];

export const matchById = id => MATCHES.find(match => match.id === Number(id));
export const zoneMatches = zoneId => MATCHES.filter(match => match.stage === 'zone' && match.zoneId === zoneId);
export const finalMatches = () => MATCHES.filter(match => match.stage === 'final');

export const TOURNAMENT_ID = import.meta.env.VITE_TOURNAMENT_ID || 'ddam-cup-dota2-ab-roundrobin';
export const CACHE_KEY = `ddam-cup-cache:${TOURNAMENT_ID}`;
