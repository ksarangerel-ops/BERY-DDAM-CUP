/* ============================================================
   TEKKEN TAB — mounts the full Tekken board into the additional-games page.
   Supabase row → store → derive() → current view. Every screen with the
   tab open re-renders the moment an admin records a game.

   Usage (see src/additional-games.js):
     const app = mountTekken(hostElement, supabaseClient);
     app.unmount();   // when another game tab is opened
============================================================ */
import './styles/base.css';
import './styles/components.css';
import './styles/views.css';

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { BoardState } from './engine/types';
import { type Derived, derive } from './engine/tournament';
import { createStore, type Mode } from './store';
import { GAME_NAME, TEKKEN_BOARD_ID } from './config';
import { type Ctx, handler, type Route, type View } from './ui/app';
import { cx, esc, toast } from './ui/dom';
import { ICONS } from './ui/icons';
import { createStreamLayer } from './ui/streams';
import { arenaView } from './ui/views/arena';
import { groupsView } from './ui/views/groups';
import { bracketView } from './ui/views/bracket';
import { matchView, playersView, profileView } from './ui/views/players';
import { rulesView } from './ui/views/rules';
import { adminView } from './ui/views/admin';

const VIEWS: Record<string, View> = {
  arena: arenaView,
  groups: groupsView,
  playoffs: bracketView,
  players: playersView,
  player: profileView,
  match: matchView,
  rules: rulesView,
  admin: adminView,
};

const NAV: [view: string, label: string, icon: (c?: string) => string, also?: string[]][] = [
  ['arena', 'Arena', ICONS.arena],
  ['groups', 'Groups', ICONS.groups],
  ['playoffs', 'Playoffs', ICONS.bracket],
  ['players', 'Fighters', ICONS.fighters, ['player']],
  ['rules', 'Rules', ICONS.rules],
  ['admin', 'Admin', ICONS.lock],
];

export interface TekkenApp {
  unmount(): void;
}

export function mountTekken(host: HTMLElement, client: SupabaseClient | null): TekkenApp {
  host.innerHTML = `<div class="tk">
    <header class="tk-bar">
      <nav class="nav" aria-label="${GAME_NAME}"></nav>
      <span class="sync"></span>
    </header>
    <div class="page"></div>
  </div>`;
  const root = host.querySelector<HTMLElement>('.tk')!;
  const nav = root.querySelector<HTMLElement>('.nav')!;
  const sync = root.querySelector<HTMLElement>('.sync')!;
  const app = root.querySelector<HTMLElement>('.page')!;

  // Toasts sit on <body> so no transformed ancestor can trap position: fixed.
  const overlay = document.createElement('div');
  overlay.className = 'tk';
  overlay.innerHTML = '<div id="tk-toasts" aria-live="polite"></div>';
  document.body.append(overlay);

  const streams = createStreamLayer(root);
  const originalTitle = document.title;

  let state: BoardState | null = null;
  let derived: Derived | null = null;
  let session: Session | null = null;
  let lastRouteKey = '';
  let pendingRender = false;
  let blurTimer = 0;

  /* ---------- routing ---------- */
  function parseRoute(): Route {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const [view = 'arena', ...params] = parts;
    return VIEWS[view] ? { view, params } : { view: 'arena', params: [] };
  }

  /* ---------- rendering ---------- */
  function ctxFor(route: Route): Ctx | null {
    if (!state || !derived) return null;
    return {
      state, d: derived, route,
      admin: store.canEdit(),
      online: client !== null,
      email: session?.user.email ?? null,
      supabase: client,
      store,
      rerender: () => render(true),
    };
  }

  const isTyping = (el: Element | null): boolean =>
    !!el && app.contains(el) && el.matches('input:not([type=checkbox]):not([type=file]):not([type=color]), textarea');

  function render(force = false) {
    // Never replace the DOM under a half-typed field; catch up when it loses focus.
    if (!force && isTyping(document.activeElement)) { pendingRender = true; return; }
    pendingRender = false;

    const route = parseRoute();
    const ctx = ctxFor(route);
    if (!ctx) return;
    const key = `${route.view}/${route.params.join('/')}`;
    const routeChanged = key !== lastRouteKey;
    const view = VIEWS[route.view] ?? arenaView;

    const scrolls = new Map<string, [number, number]>();
    if (!routeChanged) {
      app.querySelectorAll<HTMLElement>('[data-keep-scroll]').forEach(el => scrolls.set(el.dataset.keepScroll ?? '', [el.scrollLeft, el.scrollTop]));
    }

    app.innerHTML = view.render(ctx);

    app.querySelectorAll<HTMLElement>('[data-keep-scroll]').forEach(el => {
      const s = scrolls.get(el.dataset.keepScroll ?? '');
      if (s) { el.scrollLeft = s[0]; el.scrollTop = s[1]; }
    });
    if (routeChanged) {
      app.classList.remove('page-enter');
      void app.offsetWidth;
      app.classList.add('page-enter');
      // Bring the top of the Tekken board into view, not the top of the whole page.
      if (lastRouteKey) {
        const top = root.getBoundingClientRect().top + window.scrollY - 8;
        if (window.scrollY > top) window.scrollTo({ top });
      }
      lastRouteKey = key;
    }
    view.after?.(app, ctx);
    streams.sync();

    const title = view.title?.(ctx) ?? '';
    document.title = `${title ? `${title} · ` : ''}${GAME_NAME} · DDAM ESPORT CUP`;
    renderNav(route, ctx);
  }

  function renderNav(route: Route, ctx: Ctx) {
    const liveCount = ctx.d.live.length;
    nav.innerHTML = NAV.map(([view, label, icon, also]) => {
      const active = route.view === view || also?.includes(route.view)
        || (route.view === 'match' && view === (ctx.d.byId[route.params[0] ?? '']?.kind === 'playoff' ? 'playoffs' : 'groups'));
      const iconHtml = view === 'admin' && ctx.admin && ctx.online ? ICONS.unlock() : icon();
      return `<a class="${cx('nav__link', active && 'is-active')}" href="#/${view === 'arena' ? '' : view}">${iconHtml}<span>${label}</span>${view === 'arena' && liveCount ? '<i class="nav__live"></i>' : ''}</a>`;
    }).join('');
  }

  function renderSync(mode: Mode) {
    const label = { live: 'Live', syncing: 'Sync', local: 'Local' }[mode];
    sync.className = `sync sync--${mode}`;
    sync.title = mode === 'live' ? `Live — Supabase realtime (${TEKKEN_BOARD_ID})`
      : mode === 'syncing' ? 'Connecting to Supabase…'
      : 'Supabase not configured — changes stay in this browser';
    sync.innerHTML = `<i></i>${esc(label)}`;
  }

  /* ---------- store ---------- */
  const store = createStore(client, {
    onState(next) {
      state = next;
      derived = derive(next);
      render();
    },
    onMode(mode) {
      renderSync(mode);
      if (lastRouteKey.startsWith('admin/settings')) render();
    },
    onAuth(next) {
      const changed = (next?.user.id ?? null) !== (session?.user.id ?? null);
      session = next;
      if (changed) render(true);
    },
  });

  /* ---------- event delegation ---------- */
  async function run(name: string | undefined, el: HTMLElement, ev: Event) {
    const fn = name ? handler(name) : undefined;
    const ctx = ctxFor(parseRoute());
    if (!fn || !ctx) return;
    try {
      await fn(el, ctx, ev);
    } catch (err) {
      console.error(`[tekken action ${name}]`, err);
      toast('Something went wrong — see console', 'bad');
    }
  }

  const onClick = (ev: Event) => {
    const el = (ev.target as Element | null)?.closest<HTMLElement>('[data-act]');
    if (!el || el.matches(':disabled')) return;
    void run(el.dataset.act, el, ev);
  };
  const onChange = (ev: Event) => {
    const el = (ev.target as Element | null)?.closest<HTMLElement>('[data-change]');
    if (el) void run(el.dataset.change, el, ev);
  };
  const onSubmit = (ev: Event) => {
    const el = (ev.target as Element | null)?.closest<HTMLElement>('[data-submit]');
    if (!el) return;
    ev.preventDefault();
    void run(el.dataset.submit, el, ev);
  };
  // A deferred render waits a beat after blur so a click that caused the blur still lands.
  const onFocusOut = () => {
    if (!pendingRender) return;
    clearTimeout(blurTimer);
    blurTimer = window.setTimeout(() => { if (!isTyping(document.activeElement)) render(); }, 250);
  };
  const onHashChange = () => render(true);

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('submit', onSubmit);
  app.addEventListener('focusout', onFocusOut);
  window.addEventListener('hashchange', onHashChange);

  store.start();

  return {
    unmount() {
      store.stop();
      clearTimeout(blurTimer);
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
      root.removeEventListener('submit', onSubmit);
      app.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('hashchange', onHashChange);
      streams.destroy();
      overlay.remove();
      document.title = originalTitle;
      // Drop the Tekken route from the URL so other game tabs don't carry it.
      if (location.hash.startsWith('#/')) history.replaceState(history.state, '', location.pathname + location.search);
      host.innerHTML = '';
    },
  };
}
