/* ============================================================
   BOARD STATE — seed, normalisation and path patches (pure).
============================================================ */
import type { BoardState, Game, GroupId, MatchRecord, Player, Team } from './types';
import { GROUPS, MAX_STATIONS, NUM_TEAMS, TEAM_SIZE } from './format';

const TEAM_SEED: [name: string, color: string][] = [
  ['Team Gegeenee', '#e8322f'],
  ['Team Ganaa', '#3563f0'],
  ['Team Garidaa', '#0e9f6e'],
  ['Team Amaraa', '#ef8a12'],
  ['Team Bery', '#7f3af0'],
  ['Team Bagaa', '#e0307a'],
];

export const STREAM_KEY = /^s[1-8]$/;

/** Inline photos (local mode) are data: URLs up to this size; online they are Supabase Storage URLs. */
export const MAX_PHOTO_CHARS = 150_000;
const isPhoto = (v: unknown): v is string =>
  typeof v === 'string' && (
    (v.length <= MAX_PHOTO_CHARS && /^data:image\/(webp|jpeg|png);base64,/.test(v))
    || (v.length <= 600 && /^https:\/\/[^\s"'<>]+$/.test(v)));

export const teamId = (i: number): string => `t${i + 1}`;
export const playerId = (team: number, slot: number): string =>
  `p${String(team * TEAM_SIZE + slot + 1).padStart(2, '0')}`;

export function blankState(): BoardState {
  const teams: Record<string, Team> = {};
  const players: Record<string, Player> = {};
  TEAM_SEED.forEach(([name, color], t) => {
    teams[teamId(t)] = { name, color, order: t };
    for (let s = 0; s < TEAM_SIZE; s++) {
      const gender = s < TEAM_SIZE / 2 ? 'M' : 'F';
      players[playerId(t, s)] = {
        team: teamId(t), name: `${name.replace(/^Team\s+/, '')} Player ${s + 1}`, gender, main: '', group: null, withdrawn: false,
      };
    }
  });
  return {
    meta: { title: 'DDAM Esport Cup · Tekken 7', stations: 2, streams: {}, updated: null },
    teams, players, matches: {}, decisions: {}, seeds: {},
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Arrays may arrive as index-keyed objects (e.g. from older backups). Accept both. */
export function toArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v.filter(x => x != null) as T[];
  if (isObj(v)) {
    return Object.keys(v)
      .sort((x, y) => Number(x) - Number(y))
      .map(k => v[k])
      .filter(x => x != null) as T[];
  }
  return [];
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/**
 * Turn an untrusted snapshot into a BoardState, or null when it is not a usable
 * board. Never trust a remote payload blindly — a half-written board must not
 * take the whole page down.
 */
export function normalize(raw: unknown): BoardState | null {
  if (!isObj(raw) || !isObj(raw.teams) || !isObj(raw.players)) return null;
  const base = blankState();

  const teams: Record<string, Team> = {};
  for (const [id, t] of Object.entries(raw.teams)) {
    if (!isObj(t)) continue;
    const seed = base.teams[id];
    teams[id] = {
      name: str(t.name, seed?.name ?? id),
      color: str(t.color, seed?.color ?? '#888'),
      order: typeof t.order === 'number' ? t.order : (seed?.order ?? 99),
    };
  }

  const players: Record<string, Player> = {};
  for (const [id, p] of Object.entries(raw.players)) {
    if (!isObj(p) || !teams[str(p.team)]) continue;
    const group = GROUPS.includes(p.group as GroupId) ? (p.group as GroupId) : null;
    players[id] = {
      team: str(p.team),
      name: str(p.name, id),
      gender: p.gender === 'F' ? 'F' : 'M',
      main: str(p.main),
      group,
      withdrawn: p.withdrawn === true,
      ...(isPhoto(p.photo) ? { photo: p.photo } : {}),
    };
  }
  if (Object.keys(teams).length !== NUM_TEAMS || Object.keys(players).length !== NUM_TEAMS * TEAM_SIZE) return null;

  const matches: Record<string, MatchRecord> = {};
  if (isObj(raw.matches)) {
    for (const [id, m] of Object.entries(raw.matches)) {
      if (!isObj(m) || typeof m.a !== 'string' || typeof m.b !== 'string') continue;
      const games = toArray<Game>(m.games).filter(g => isObj(g) && (g.w === 'a' || g.w === 'b'));
      matches[id] = {
        a: m.a, b: m.b, games,
        wo: m.wo === 'a' || m.wo === 'b' ? m.wo : null,
        live: m.live === true,
        station: typeof m.station === 'number' ? m.station : null,
        updatedAt: str(m.updatedAt) || undefined,
      };
    }
  }

  const decisions: Record<string, string[]> = {};
  if (isObj(raw.decisions)) {
    for (const [k, v] of Object.entries(raw.decisions)) decisions[k] = toArray<string>(v);
  }

  const seeds: BoardState['seeds'] = {};
  if (isObj(raw.seeds)) {
    for (const [k, v] of Object.entries(raw.seeds)) {
      if (/^[ABCD][12]$/.test(k) && typeof v === 'string' && players[v]) seeds[k as keyof BoardState['seeds']] = v;
    }
  }

  const meta = isObj(raw.meta) ? raw.meta : {};
  const stations = typeof meta.stations === 'number' ? Math.min(MAX_STATIONS, Math.max(1, Math.round(meta.stations))) : base.meta.stations;
  const streams: Record<string, string> = {};
  if (isObj(meta.streams)) {
    for (const [k, v] of Object.entries(meta.streams)) if (STREAM_KEY.test(k) && typeof v === 'string' && v.trim()) streams[k] = v.trim();
  }
  return {
    meta: { title: str(meta.title, base.meta.title), stations, streams, updated: str(meta.updated) || null },
    teams, players, matches, decisions, seeds,
  };
}

/**
 * Apply a multi-path update (`{ 'players/p01/name': 'Bat' }`) to a plain
 * object copy. `null` deletes the key.
 */
export function applyPatch<T extends object>(state: T, updates: Record<string, unknown>): T {
  const next = structuredClone(state) as Record<string, unknown>;
  for (const [path, value] of Object.entries(updates)) {
    const keys = path.split('/').filter(Boolean);
    const last = keys.pop();
    if (!last) continue;
    let node: Record<string, unknown> = next;
    for (const k of keys) {
      if (!isObj(node[k])) node[k] = {};
      node = node[k] as Record<string, unknown>;
    }
    if (value === null || value === undefined) delete node[last];
    else node[last] = structuredClone(value);
  }
  return next as T;
}
