import type { SupabaseClient } from '@supabase/supabase-js';

/* A tiny in-memory stand-in for the parts of supabase-js the Tekken store uses. */
export function fakeSupabase(opts: { signedIn?: boolean; admin?: boolean } = {}) {
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
