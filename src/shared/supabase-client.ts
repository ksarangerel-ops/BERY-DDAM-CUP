/* ============================================================
   SHARED SUPABASE CLIENT
   One client per page. The additional-games page and the Tekken board
   run on the same page and share this instance, so they share the
   admin login and don't open duplicate auth sessions.
============================================================ */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const key: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = isConfigured && url && key ? createClient(url, key) : null;
