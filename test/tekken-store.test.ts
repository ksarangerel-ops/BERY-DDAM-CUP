import { describe, expect, it } from 'vitest';
import { createStore } from '../src/tekken/store';
import { fakeSupabase } from './fake-supabase';

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
