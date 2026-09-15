import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createStore } from '../src/tekken/store';

/* A tiny in-memory stand-in for the parts of supabase-js the Tekken store uses. */
function fakeSupabase(opts: { signedIn?: boolean; admin?: boolean } = {}) {
  const db: { row: { state: Record<string, unknown> } | null } = { row: null };
  let beforeUpdate: (() => void) | null = null;

  const builder = () => {
    let op: 'select' | 'update' | 'insert' = 'select';
    let payload: { state: Record<string, unknown> } | null = null;
    const filters: [string, string, string | null][] = [];
    const revMatches = () => {
      const rev = db.row?.state.rev;
      return filters.every(([kind, col, val]) =>
        kind === 'or' ? rev == null || rev === 0 : col !== 'state->>rev' || String(rev ?? '') === val);
    };
    const exec = async () => {
      if (op === 'insert') {
        if (!opts.admin) return { error: { code: '42501', message: 'new row violates row-level security policy' } };
        if (db.row) return { error: { code: '23505', message: 'duplicate key' } };
        db.row = { state: structuredClone(payload!.state) };
        return { error: null };
      }
      beforeUpdate?.();
      beforeUpdate = null;
      // RLS refusing an UPDATE is silent: zero rows, no error.
      if (!db.row || !revMatches() || !opts.admin) return { data: [], error: null };
      db.row = { state: structuredClone(payload!.state) };
      return { data: [{ id: 'row' }], error: null };
    };
    const b = {
      select: () => b,
      eq: (col: string, val: string) => { filters.push(['eq', col, val]); return b; },
      or: (expr: string) => { filters.push(['or', expr, null]); return b; },
      update: (p: { state: Record<string, unknown> }) => { op = 'update'; payload = p; return b; },
      insert: (p: { state: Record<string, unknown> }) => { op = 'insert'; payload = p; return exec(); },
      maybeSingle: async () => ({ data: db.row ? { state: structuredClone(db.row.state) } : null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => exec().then(resolve, reject),
    };
    return b;
  };

  const session = opts.signedIn ? { user: { id: 'u1', email: 'admin@ddam.mn' } } : null;
  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch; },
    removeChannel: async () => undefined,
    from: () => builder(),
  };
  return {
    client: client as unknown as SupabaseClient,
    db,
    /** Simulate another admin saving between our read and our write. */
    otherAdminSavesFirst(mutate: (state: Record<string, unknown>) => void) {
      beforeUpdate = () => {
        const s = db.row!.state;
        mutate(s);
        s.rev = Number(s.rev) + 1;
      };
    },
  };
}

const tick = () => new Promise(r => setTimeout(r, 0));
const hooks = () => ({ onState() {}, onMode() {}, onAuth() {} });

describe('tekken store (Supabase)', () => {
  it('creates the row on the first save and bumps the revision on each save', async () => {
    const fake = fakeSupabase({ signedIn: true, admin: true });
    const store = createStore(fake.client, hooks());
    store.start();
    await tick();

    expect((await store.patch({ 'players/p01/name': 'Bat' })).ok).toBe(true);
    expect(fake.db.row!.state.rev).toBe(1);
    expect((await store.patch({ 'players/p02/name': 'Nomin' })).ok).toBe(true);
    expect(fake.db.row!.state.rev).toBe(2);
    const players = fake.db.row!.state.players as Record<string, { name: string }>;
    expect([players.p01!.name, players.p02!.name]).toEqual(['Bat', 'Nomin']);
  });

  it('re-applies a change on top of another admin\'s save instead of overwriting it', async () => {
    const fake = fakeSupabase({ signedIn: true, admin: true });
    const store = createStore(fake.client, hooks());
    store.start();
    await tick();
    await store.patch({ 'meta/title': 'Cup' });

    fake.otherAdminSavesFirst(state => {
      (state.players as Record<string, { name: string }>).p05!.name = 'Saved by someone else';
    });
    const res = await store.patch({ 'players/p01/name': 'Mine' });

    expect(res.ok).toBe(true);
    const players = fake.db.row!.state.players as Record<string, { name: string }>;
    expect(players.p05!.name).toBe('Saved by someone else');
    expect(players.p01!.name).toBe('Mine');
    expect(fake.db.row!.state.rev).toBe(3);
    expect(store.get().players.p05!.name).toBe('Saved by someone else');
  });

  it('reports a signed-in account that is not a tournament admin, and undoes the edit on screen', async () => {
    const owner = fakeSupabase({ signedIn: true, admin: true });
    const seed = createStore(owner.client, hooks());
    seed.start();
    await tick();
    await seed.patch({ 'meta/title': 'Cup' });

    const visitor = fakeSupabase({ signedIn: true, admin: false });
    visitor.db.row = owner.db.row;
    const store = createStore(visitor.client, hooks());
    store.start();
    await tick();
    await tick();

    const res = await store.patch({ 'players/p01/name': 'Hacker' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not a tournament admin/);
    expect(store.get().players.p01!.name).not.toBe('Hacker');
    expect(owner.db.row!.state.rev).toBe(1);
  });

  it('refuses to save when nobody is signed in', async () => {
    const fake = fakeSupabase({ signedIn: false, admin: true });
    const store = createStore(fake.client, hooks());
    store.start();
    await tick();
    const res = await store.patch({ 'players/p01/name': 'Nope' });
    expect(res).toMatchObject({ ok: false });
    expect(res.error).toMatch(/Sign in/);
    expect(fake.db.row).toBeNull();
    expect(store.canEdit()).toBe(false);
  });

  it('works without Supabase in local mode', async () => {
    const store = createStore(null, hooks());
    store.start();
    expect(store.canEdit()).toBe(true);
    const res = await store.patch({ 'players/p01/name': 'Local' });
    expect(res).toMatchObject({ ok: true, local: true });
    expect(store.get().players.p01!.name).toBe('Local');
  });
});
