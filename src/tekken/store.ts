/* ============================================================
   TEKKEN STORE — Supabase row + optimistic local edits
   The whole Tekken board is one row in public.tournaments (its own row,
   separate from the other games). Every write is a compare-and-swap on
   `state.rev`: if another admin saved first, the change is re-applied on
   top of their version instead of overwriting it.

   What the screen shows = last confirmed database state
                         + edits still on their way to the database.
   A write that fails is dropped again and reported, so the board never
   pretends something was saved when it wasn't.
============================================================ */
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { BoardState } from './engine/types';
import { applyPatch, blankState, normalize } from './engine/state';
import { CACHE_KEY, TEKKEN_BOARD_ID } from './config';

export type Mode = 'live' | 'syncing' | 'local';

export interface WriteResult { ok: boolean; local: boolean; error?: string }

export type Updates = Record<string, unknown>;

export interface Store {
  start(): void;
  stop(): void;
  get(): BoardState;
  mode(): Mode;
  session(): Session | null;
  /** Local mode (no Supabase configured) is always editable; otherwise a signed-in account is required. */
  canEdit(): boolean;
  patch(updates: Updates): Promise<WriteResult>;
  replace(next: BoardState): Promise<WriteResult>;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
}

const TABLE = 'tournaments';
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const revOf = (raw: unknown): number => Number((raw as { rev?: unknown } | null)?.rev) || 0;

function readCache(): { state: BoardState; rev: number } | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    const state = normalize((raw as { state?: unknown } | null)?.state);
    return state ? { state, rev: revOf(raw) } : null;
  } catch {
    return null;
  }
}

export function createStore(
  client: SupabaseClient | null,
  hooks: { onState(s: BoardState): void; onMode(m: Mode): void; onAuth(s: Session | null): void },
): Store {
  const cached = readCache();
  let server: BoardState = cached?.state ?? blankState();
  let rev = cached?.rev ?? 0;
  let rowExists = false;
  let loaded = false;
  const pending: Updates[] = [];
  let mode: Mode = client ? 'syncing' : 'local';
  let session: Session | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const cleanups: (() => void)[] = [];

  const view = () => pending.reduce((s, u) => applyPatch(s, u), server);
  const emit = () => hooks.onState(view());
  const setMode = (m: Mode) => { if (m !== mode) { mode = m; hooks.onMode(m); } };
  const cache = () => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ rev, state: server })); } catch { /* quota / private mode */ }
  };

  function acceptRemote(raw: unknown) {
    const next = normalize(raw);
    if (!next) { console.warn('[tekken] ignoring unusable board state'); return; }
    const incoming = revOf(raw);
    if (loaded && rowExists && incoming < rev) return;   // an older event arriving late
    server = next;
    rev = incoming;
    rowExists = true;
    loaded = true;
    cache();
    emit();
  }

  async function fetchRow() {
    if (!client) return;
    const { data, error } = await client.from(TABLE).select('state').eq('id', TEKKEN_BOARD_ID).maybeSingle();
    if (error) throw error;
    if (data?.state) {
      acceptRemote(data.state);
    } else {
      // No row yet: the first admin save creates it.
      rowExists = false;
      loaded = true;
      server = blankState();
      rev = 0;
      emit();
    }
  }

  const fail = (error: string): WriteResult => ({ ok: false, local: false, error });

  async function commit(build: (base: BoardState) => BoardState): Promise<WriteResult> {
    if (!client) {
      server = build(server);
      rev++;
      cache();
      return { ok: true, local: true };
    }
    if (!session) return fail('Sign in as a tournament admin to make changes.');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        if (!loaded) await fetchRow();
        const next = plain(build(server));
        next.meta.updated = new Date().toISOString();
        const body = { ...next, rev: rev + 1 };

        let written: boolean;
        if (rowExists) {
          let q = client.from(TABLE).update({ state: body, updated: next.meta.updated }).eq('id', TEKKEN_BOARD_ID);
          q = rev === 0 ? q.or('state->>rev.is.null,state->>rev.eq.0') : q.eq('state->>rev', String(rev));
          const { data, error } = await q.select('id');
          if (error) return fail(error.message);
          written = (data?.length ?? 0) > 0;
        } else {
          const { error } = await client.from(TABLE).insert({ id: TEKKEN_BOARD_ID, state: body, updated: next.meta.updated });
          if (error && error.code !== '23505') return fail(error.code === '42501' ? 'Not saved — this account is not a tournament admin.' : error.message);
          written = !error;
        }

        if (written) {
          server = normalize(body) ?? next;
          rev = body.rev;
          rowExists = true;
          cache();
          return { ok: true, local: false };
        }
        // Nothing was written. Either another admin saved first (retry on top of
        // their version) or RLS silently refused the update (the revision didn't move).
        const before = rev;
        await fetchRow();
        if (rowExists && rev === before) return fail('Not saved — this account is not a tournament admin.');
      }
      return fail('Not saved — the board kept changing underneath. Try again.');
    } catch (err) {
      console.error('[tekken] write failed', err);
      return fail('Not saved — could not reach Supabase.');
    }
  }

  function enqueue(build: (base: BoardState) => BoardState, optimistic: Updates | null): Promise<WriteResult> {
    if (optimistic) pending.push(optimistic);
    emit();
    const run = queue.then(async () => {
      const res = await commit(build);
      if (optimistic) pending.splice(pending.indexOf(optimistic), 1);
      emit();
      return res;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    start() {
      emit();
      hooks.onMode(mode);
      if (!client) return;

      void client.auth.getSession().then(({ data }) => { session = data.session; hooks.onAuth(session); });
      const { data: auth } = client.auth.onAuthStateChange((_event, s) => { session = s; hooks.onAuth(s); });
      cleanups.push(() => auth.subscription.unsubscribe());

      const channel = client
        .channel(`tournament:${TEKKEN_BOARD_ID}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `id=eq.${TEKKEN_BOARD_ID}` }, payload => {
          if (payload.eventType === 'DELETE') return;
          acceptRemote((payload.new as { state?: unknown }).state);
        })
        .subscribe(status => {
          if (status === 'SUBSCRIBED') {
            setMode('live');
            // Catch up on anything saved while the socket was connecting.
            fetchRow().catch(err => console.error('[tekken] read failed', err));
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setMode('syncing');
          }
        });
      cleanups.push(() => { void client.removeChannel(channel); });

      fetchRow().catch(err => { console.error('[tekken] read failed', err); setMode('syncing'); });
    },

    stop() { cleanups.splice(0).forEach(fn => fn()); },

    get: view,
    mode: () => mode,
    session: () => session,
    canEdit: () => !client || session !== null,

    /** Paths relative to the board, e.g. `{ 'players/p01/name': 'Bat' }`; null deletes. */
    patch(updates) {
      const u = plain(updates);
      return enqueue(base => applyPatch(base, u), u);
    },

    replace(next) {
      const full = plain(next);
      return enqueue(() => full, null);
    },

    async signIn(email, password) {
      if (!client) return 'Supabase is not configured.';
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) return error.message;
      session = data.session;
      hooks.onAuth(session);
      return null;
    },

    async signOut() {
      if (client) await client.auth.signOut();
      session = null;
      hooks.onAuth(null);
    },
  };
}
