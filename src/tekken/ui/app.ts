/* ============================================================
   APP CONTEXT + ACTION REGISTRY
   Views are plain functions `render(ctx) → html`. Interactive elements
   carry `data-act="name"` (click), `data-change="name"` (change) or
   `data-submit="name"` (form submit); main.ts delegates those events
   to the handlers registered here.
============================================================ */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BoardState } from '../engine/types';
import type { Derived } from '../engine/tournament';
import type { Store, Updates } from '../store';
import { toast } from './dom';

export interface Route {
  view: string;
  params: string[];
}

export interface Ctx {
  state: BoardState;
  d: Derived;
  route: Route;
  /** May edit: signed in as an admin, or running locally without Supabase. */
  admin: boolean;
  /** Supabase is configured (false = local mode, data stays in this browser). */
  online: boolean;
  email: string | null;
  supabase: SupabaseClient | null;
  store: Store;
  rerender(): void;
}

/** Save a change and report the outcome — success only after the database accepted it. */
export async function save(ctx: Ctx, updates: Updates, success?: string, tone: 'ok' | 'info' = 'ok'): Promise<boolean> {
  const res = await ctx.store.patch(updates);
  if (!res.ok) toast(res.error ?? 'Not saved', 'bad');
  else if (success) toast(success, tone);
  return res.ok;
}

export interface View {
  render(ctx: Ctx): string;
  /** Runs after the HTML is in the DOM (measurements, focus, connectors). */
  after?(root: HTMLElement, ctx: Ctx): void;
  title?(ctx: Ctx): string;
}

export type Handler = (el: HTMLElement, ctx: Ctx, ev: Event) => void | Promise<void>;

const handlers = new Map<string, Handler>();

export function actions(map: Record<string, Handler>): void {
  for (const [name, fn] of Object.entries(map)) handlers.set(name, fn);
}

export function handler(name: string): Handler | undefined {
  return handlers.get(name);
}
