/* ============================================================
   SAFE BOARD SAVE
   A board row holds several games at once, and saving used to write the
   whole row: whoever pressed Save last silently replaced the other
   admin's edits.

   saveRow() instead re-reads the freshest row, lets the caller merge its
   own change into it, and writes only if nobody saved in the meantime
   (compare-and-swap on `state.rev`). If somebody did, the change is
   re-applied on top of their version rather than replacing it.
============================================================ */
import type { SupabaseClient } from '@supabase/supabase-js';

export type BoardState = Record<string, unknown>;

export interface SaveResult {
  ok: boolean;
  /** What the database holds after a successful save. */
  state?: BoardState;
  error?: string;
}

const NOT_ADMIN = 'Not saved — this account is not a tournament admin.';
const revOf = (state: unknown): number => Number((state as { rev?: unknown } | null)?.rev) || 0;

/**
 * `apply` receives the current state from the database (null when the row does
 * not exist yet) and returns the state to write. It may be called more than
 * once, so it must not depend on anything outside its argument.
 */
export async function saveRow(
  client: SupabaseClient,
  table: string,
  id: string,
  apply: (current: BoardState | null) => BoardState,
  attempts = 4,
): Promise<SaveResult> {
  try {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const { data, error } = await client.from(table).select('state').eq('id', id).maybeSingle();
      if (error) return { ok: false, error: error.message };

      const current = (data?.state ?? null) as BoardState | null;
      const rev = revOf(current);
      const next: BoardState = { ...apply(current ? structuredClone(current) : null), rev: rev + 1 };
      const updated = new Date().toISOString();

      if (!current) {
        const { error: insertError } = await client.from(table).insert({ id, state: next, updated });
        if (!insertError) return { ok: true, state: next };
        if (insertError.code === '42501') return { ok: false, error: NOT_ADMIN };
        // 23505 = someone created the row first; loop and merge on top of theirs.
        if (insertError.code !== '23505') return { ok: false, error: insertError.message };
        continue;
      }

      let write = client.from(table).update({ state: next, updated }).eq('id', id);
      write = rev === 0
        ? write.or('state->>rev.is.null,state->>rev.eq.0')
        : write.eq('state->>rev', String(rev));
      const { data: rows, error: writeError } = await write.select('id');
      if (writeError) return { ok: false, error: writeError.message };
      if (rows?.length) return { ok: true, state: next };

      // Nothing was written: either another admin saved first (retry on their
      // version) or RLS refused the update, which is silent — the revision
      // standing still tells the two apart.
      const { data: after } = await client.from(table).select('state').eq('id', id).maybeSingle();
      if (revOf(after?.state) === rev) return { ok: false, error: NOT_ADMIN };
    }
    return { ok: false, error: 'Not saved — the board kept changing. Try again.' };
  } catch (err) {
    console.error('[save-row] write failed', err);
    return { ok: false, error: 'Not saved — could not reach Supabase.' };
  }
}
