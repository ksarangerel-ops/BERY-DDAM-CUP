/* ============================================================
   STORE
   Supabase is the source of truth. localStorage is
   kept only as (a) a warm cache so the board paints instantly on load
   and (b) an offline fallback when Supabase is unconfigured/unreachable,
   so an organiser is never locked out mid-tournament.

   state = {
     teams:   [{ id, name, tag, zoneId, logo?, players:[{id,name,photo?} x5] }],
     results: { 1:{ teamId:{ series: '2-0' } }, ... },
     updated: ISO string
   }
   A match key that is absent = that match has not been played.
============================================================ */
import { TEAM_SEED, SQUAD_SIZE, NUM_TEAMS, ZONES, CACHE_KEY, MATCHES } from './config.js';
import * as realtime from './supabase.js';

const TEAM_NAME_VERSION = 'ddam-team-names-v4';

function migrateTeamNames(state) {
  if (!state?.teams) return state;
  const teams = state.teams.map((team, index) => ({
    ...team,
    name: TEAM_SEED[index]?.[0] || team.name,
    tag: TEAM_SEED[index]?.[1] || team.tag,
    zoneId: TEAM_SEED[index]?.[2] || team.zoneId || null,
  }));
  const namesAreCanonical = teams.every((team, index) => (
    team.name === state.teams[index]?.name
      && team.tag === state.teams[index]?.tag
      && team.zoneId === (state.teams[index]?.zoneId || null)
  ));
  if (state.teamNameVersion === TEAM_NAME_VERSION && namesAreCanonical) return state;
  return {
    ...state,
    teamNameVersion: TEAM_NAME_VERSION,
    teams,
  };
}

export function blankState() {
  return {
    teamNameVersion: TEAM_NAME_VERSION,
    teams: TEAM_SEED.map(([name, tag, zoneId], i) => ({
      id: 't' + (i + 1), name, tag, zoneId: zoneId || null, logo: null,
      players: Array.from({ length: SQUAD_SIZE }, (_, p) => ({
        id: `t${i + 1}p${p + 1}`, name: `${tag} Player ${p + 1}`, photo: null,
      })),
    })),
    results: {}, updated: null,
  };
}

function fromLegacyAdditionalState(value) {
  const legacy = value?.games?.mlbb;
  if (!legacy?.teams || !Array.isArray(legacy.groupResults)) return value;

  const legacyByTag = new Map(legacy.teams.map(team => [String(team.tag || '').toUpperCase(), team]));
  const teams = TEAM_SEED.map(([name, tag, zoneId], index) => {
    const source = legacyByTag.get(tag) || legacy.teams[index] || {};
    const players = Array.isArray(source.players) ? source.players : [];
    return {
      id: source.id || `t${index + 1}`,
      name,
      tag,
      zoneId,
      logo: source.logo || null,
      players: Array.from({ length: SQUAD_SIZE }, (_, playerIndex) => ({
        id: players[playerIndex]?.id || `t${index + 1}p${playerIndex + 1}`,
        name: players[playerIndex]?.name || `${tag} Player ${playerIndex + 1}`,
        photo: players[playerIndex]?.photo || null,
      })),
    };
  });
  const legacyById = new Map(legacy.teams.map(team => [team.id, team]));
  const legacyResults = new Map();
  legacy.groupResults.forEach(match => {
    const a = legacyById.get(match.a)?.tag?.toUpperCase();
    const b = legacyById.get(match.b)?.tag?.toUpperCase();
    if (a && b) legacyResults.set([a, b].sort().join('|'), match);
  });
  const results = {};
  MATCHES.filter(match => match.stage === 'zone').forEach(match => {
    const pool = teams.filter(team => team.zoneId === match.zoneId);
    const sourceA = pool[match.pair[0]];
    const sourceB = pool[match.pair[1]];
    const legacyMatch = legacyResults.get([sourceA?.tag, sourceB?.tag].sort().join('|'));
    if (!legacyMatch?.series || !sourceA || !sourceB) return;
    results[match.id] = { [sourceA.id]: { series: legacyMatch.series }, [sourceB.id]: { series: legacyMatch.series } };
  });
  return { teamNameVersion: 'ddam-mlbb-team-names-v1', teams, results, updated: value.updated || null };
}

function normaliseState(value) {
  return migrateTeamNames(fromLegacyAdditionalState(value));
}

/* Never trust a remote payload blindly — a half-written board (or a board from
   an older schema) must not take the whole page down. */
export function isUsable(s) {
  return !!s
    && Array.isArray(s.teams)
    && s.teams.length === NUM_TEAMS
    && s.teams.every(t => t
      && (t.zoneId == null || ZONES.includes(t.zoneId))
      && Array.isArray(t.players)
      && t.players.length === SQUAD_SIZE);
}

export function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return isUsable(s) ? s : null;
  } catch { return null; }
}

export function writeCache(state) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

/* Mode reported to the UI badge:
   'live'    – connected to Supabase
   'syncing' – configured, waiting for the socket
   'local'   – no Supabase config, or the connection failed: local-only        */
export const MODE = { LIVE: 'live', SYNCING: 'syncing', LOCAL: 'local' };

export function createStore({ onState, onMode }) {
  let state = normaliseState(readCache() || blankState());
  let mode = realtime.isLive() ? MODE.SYNCING : MODE.LOCAL;
  let unsubData = () => {};
  let unsubConn = () => {};

  const setMode = m => { if (m !== mode) { mode = m; onMode(mode); } };

  function start() {
    onState(state, { fromRemote: false });
    onMode(mode);
    if (!realtime.isLive()) return;

    unsubConn = realtime.subscribeConnection(connected => {
      setMode(connected ? MODE.LIVE : MODE.SYNCING);
    });

    unsubData = realtime.subscribe(
      remote => {
        // Do not seed a blank board anonymously. The first write is made by
        // the authenticated admin after signing in; public visitors remain
        // read-only.
        if (!remote) return;
        const next = normaliseState(remote);
        if (!isUsable(next)) {
          console.warn('[store] ignoring unusable remote snapshot');
          return;
        }
        state = next;
        writeCache(state);
        onState(state, { fromRemote: true });
      },
      () => setMode(MODE.LOCAL)   // permission denied / bad URL → keep working locally
    );
  }

  /* Write-through: cache immediately so the organiser's own screen never
   appears to lose an edit, then push to Supabase. Returns the `updated`
   stamp that was written so a caller can recognise its own echo coming
   back through the subscription and not mistake it for another organiser. */
  async function publish(next) {
    state = { ...next, updated: new Date().toISOString() };
    const updated = state.updated;
    writeCache(state);
    onState(state, { fromRemote: false });
    if (!realtime.isLive()) return { ok: true, local: true, updated };
    try {
      await realtime.publish(state);
      setMode(MODE.LIVE);
      return { ok: true, local: false, updated };
    } catch (err) {
      console.error('[store] publish failed:', err);
      setMode(MODE.LOCAL);
      return { ok: false, local: true, updated, error: err };
    }
  }

  return {
    start,
    publish,
    get: () => state,
    getMode: () => mode,
    stop() { unsubData(); unsubConn(); },
  };
}
