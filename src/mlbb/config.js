/* ============================================================
   DDAM ESPORT CUP MOBILE LEGENDS — tournament configuration

   Six teams start in two editable zones. Each zone has three teams and
   plays a BO2 round robin. The bottom team is eliminated; the top two from
   each zone form a four-team BO3 elimination bracket for the final standings.
============================================================ */
export const ZONES = ['A', 'B'];
export const TEAMS_PER_ZONE = 3;
export const ZONE_MATCHES = 3;
export const FINAL_MATCHES = 4;
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
const FINAL_BRACKET = [
  { id: 7, bracket: 'semi', pair: [0, 3], label: 'Semifinal 1 · A1 vs B2' },
  { id: 8, bracket: 'semi', pair: [2, 1], label: 'Semifinal 2 · B1 vs A2' },
  { id: 9, bracket: 'grand', source: [7, 8], label: 'Grand Final · 1st / 2nd' },
  { id: 10, bracket: 'third', source: [7, 8], label: '3rd Place Final · 3rd / 4th' },
];

export const MATCHES = [
  ...ZONES.flatMap((zoneId, zoneIndex) => ROUND_ROBIN_PAIRS_3.map((pair, matchIndex) => ({
    id: zoneIndex * ZONE_MATCHES + matchIndex + 1,
    stage: 'zone',
    zoneId,
    pair,
    format: 'BO2',
    label: `Zone ${zoneId} · Round ${matchIndex + 1}`,
  }))),
  ...FINAL_BRACKET.map(match => ({
    id: match.id,
    stage: 'final',
    bracket: match.bracket,
    pair: match.pair,
    source: match.source,
    format: 'BO3',
    label: match.label,
  })),
];

export const NUM_MATCHES = MATCHES.length;
export const NUM_TEAMS = 6;

/* The six Mobile Legends teams and the requested initial A/B split. */
export const TEAM_SEED = [
  ['GG FUCKING EZ',          'CHR', 'A'],
  ['ЮМ Өгцөн2',              'BRV', 'A'],
  ['HANGALZ',                'DLT', 'A'],
  ['FRESH BERRIES',          'FOX', 'B'],
  ['AMAR',                   'ECH', 'B'],
  ['Ээжийн найзын хүүхдүүд', 'ALP', 'B'],
];

export const matchById = id => MATCHES.find(match => match.id === Number(id));
export const zoneMatches = zoneId => MATCHES.filter(match => match.stage === 'zone' && match.zoneId === zoneId);
export const finalMatches = () => MATCHES.filter(match => match.stage === 'final');

const ENV = import.meta.env || {};
export const TOURNAMENT_ID = ENV.VITE_MLBB_TOURNAMENT_ID || 'ddam-cup-mobile-legends-v1';
export const CACHE_KEY = `ddam-cup-cache:${TOURNAMENT_ID}`;
