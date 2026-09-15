/* ============================================================
   TEKKEN BOARD CONFIG
============================================================ */

/** Row id in public.tournaments. Change VITE_TEKKEN_TOURNAMENT_ID for a rehearsal board. */
export const TEKKEN_BOARD_ID: string = import.meta.env.VITE_TEKKEN_TOURNAMENT_ID || 'ddam-cup-tekken-2026';

/** Warm cache so the board paints before the first Supabase response. */
export const CACHE_KEY = `ddam-cup-cache:${TEKKEN_BOARD_ID}`;

/** Supabase Storage bucket for player photos (see supabase/schema.sql). */
export const PHOTO_BUCKET = 'tekken-photos';

export const GAME_NAME = 'Tekken 7';
