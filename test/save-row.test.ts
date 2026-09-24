import { describe, expect, it } from 'vitest';
import { saveRow } from '../src/shared/save-row';
import { fakeSupabase } from './fake-supabase';

/** Save one game into the shared additional-games board, the way the page does. */
const saveGame = (client: Parameters<typeof saveRow>[0], id: string, game: string, value: unknown) =>
  saveRow(client, 'tournaments', id, current => {
    const board = (current ?? { games: {} }) as { games: Record<string, unknown> };
    board.games = { ...board.games, [game]: value };
    return board;
  });

const ROW = 'ddam-cup-additional-games-v1';

describe('saveRow', () => {
  it('creates the row when it does not exist yet', async () => {
    const fake = fakeSupabase({ admin: true });
    const res = await saveGame(fake.client, ROW, 'pubg', { points: 7 });
    expect(res.ok).toBe(true);
    expect(fake.db.row!.state).toMatchObject({ games: { pubg: { points: 7 } }, rev: 1 });
  });

  it('keeps another admin\'s edit to a different game instead of overwriting it', async () => {
    const fake = fakeSupabase({ admin: true });
    await saveGame(fake.client, ROW, 'pubg', { points: 1 });
    await saveGame(fake.client, ROW, 'mlbb', { points: 1 });

    // Another admin saves Tetris between our read and our write.
    fake.otherAdminSavesFirst(state => {
      (state.games as Record<string, unknown>).tetris = { points: 99 };
    });
    const res = await saveGame(fake.client, ROW, 'pubg', { points: 42 });

    expect(res.ok).toBe(true);
    const games = fake.db.row!.state.games as Record<string, { points: number }>;
    expect(games.pubg!.points).toBe(42);      // our change
    expect(games.tetris!.points).toBe(99);    // theirs survived
    expect(games.mlbb!.points).toBe(1);       // untouched game still there
    expect(fake.db.row!.state.rev).toBe(4);
  });

  it('reports a signed-in account that is not a tournament admin and changes nothing', async () => {
    const owner = fakeSupabase({ admin: true });
    await saveGame(owner.client, ROW, 'pubg', { points: 5 });

    const visitor = fakeSupabase({ admin: false });
    visitor.db.row = owner.db.row;
    const res = await saveGame(visitor.client, ROW, 'pubg', { points: 999 });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not a tournament admin/);
    expect((owner.db.row!.state.games as Record<string, { points: number }>).pubg!.points).toBe(5);
    expect(owner.db.row!.state.rev).toBe(1);
  });

  it('refuses to create the row when the account may not write', async () => {
    const fake = fakeSupabase({ admin: false });
    const res = await saveGame(fake.client, ROW, 'pubg', { points: 1 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not a tournament admin/);
    expect(fake.db.row).toBeNull();
  });
});
