/* ============================================================
   FIGHTERS — roster grid, player profile, match detail.
============================================================ */
import { GROUPS, groupLabel } from '../../engine/format';
import { scoreFor } from '../../engine/match';
import type { Ctx, View } from '../app';
import { actions } from '../app';
import { empty, finishBadge, fixtureLine, panelHead, pips, playerName, portrait, stateChip, teamTag, vsCard } from '../components';
import { cx, esc, plural, signed } from '../dom';
import { ICONS } from '../icons';

let groupBy: 'team' | 'group' | null = null;   // null → pick based on whether groups are drawn

function card(ctx: Ctx, pid: string): string {
  const p = ctx.state.players[pid];
  const s = ctx.d.players[pid];
  if (!p || !s) return '';
  const team = ctx.state.teams[p.team];
  const main = s.chars[0]?.name || p.main;
  return `<a class="${cx('fcard', !s.alive && s.fixtures.some(f => f.status === 'done') && 'is-out')}" href="#/player/${pid}" style="--team:${team?.color ?? '#555'}">
    <div class="fcard__art">
      ${portrait(ctx, pid, 'lg')}
      ${p.group ? `<span class="fcard__group">${p.group}</span>` : ''}
    </div>
    <div class="fcard__body">
      <span class="fcard__name">${esc(p.name)}</span>
      <span class="fcard__meta">${teamTag(ctx, pid)}<span>${main ? esc(main) : '<span class="muted">No main yet</span>'}</span></span>
      <span class="fcard__rec"><b>${s.w}</b>W <b>${s.l}</b>L <span class="muted">· ${signed(s.gw - s.gl)} games</span></span>
      ${finishBadge(s.finish)}
    </div>
  </a>`;
}

export const playersView: View = {
  title: () => 'Fighters',
  render(ctx) {
    const mode = groupBy ?? (ctx.d.drawn ? 'group' : 'team');
    const sections = mode === 'group' && ctx.d.drawn
      ? GROUPS.map(g => ({ title: groupLabel(g), color: '', ids: ctx.d.groups[g].rows.map(r => r.id) }))
      : Object.entries(ctx.state.teams).sort(([, a], [, b]) => a.order - b.order).map(([tid, t]) => ({
        title: t.name, color: t.color,
        ids: Object.keys(ctx.state.players).filter(pid => ctx.state.players[pid]?.team === tid).sort(),
      }));
    return `
    <header class="page-head">
      <div><p class="page-head__kicker">24 fighters · 6 teams</p><h1 class="page-head__title">Fighters</h1></div>
      <div class="seg">
        <button class="${cx('seg__btn', mode === 'team' && 'is-active')}" data-act="players-by" data-by="team">By team</button>
        <button class="${cx('seg__btn', mode === 'group' && 'is-active')}" data-act="players-by" data-by="group" ${ctx.d.drawn ? '' : 'disabled title="Groups not drawn yet"'}>By group</button>
      </div>
    </header>
    ${sections.map(sec => `<section class="roster-sec" ${sec.color ? `style="--team:${sec.color}"` : ''}>
      <h2 class="roster-sec__title">${esc(sec.title)}</h2>
      <div class="fgrid">${sec.ids.map(pid => card(ctx, pid)).join('')}</div>
    </section>`).join('')}`;
  },
};

actions({
  'players-by': (el, ctx) => { groupBy = el.dataset.by === 'group' ? 'group' : 'team'; ctx.rerender(); },
});

/* ---------- profile ---------- */
export const profileView: View = {
  title: ctx => ctx.state.players[ctx.route.params[0] ?? '']?.name ?? 'Fighter',
  render(ctx) {
    const pid = ctx.route.params[0] ?? '';
    const p = ctx.state.players[pid];
    const s = ctx.d.players[pid];
    if (!p || !s) return `<section class="panel">${empty('Fighter not found.')}</section>`;
    const team = ctx.state.teams[p.team];
    const played = s.w + s.l;
    const winRate = played ? Math.round((s.w / played) * 100) : 0;
    const row = s.groupRow;
    const done = s.fixtures.filter(f => f.status === 'done' || f.status === 'live');
    const upcoming = s.fixtures.filter(f => f.status === 'ready' || f.status === 'waiting');
    const maxChar = s.chars[0]?.games ?? 1;

    return `
    <a class="back" href="#/players">${ICONS.arrowRight('flip')} All fighters</a>
    <section class="profile" style="--team:${team?.color ?? '#555'}">
      <div class="profile__art">${portrait(ctx, pid, 'xl')}</div>
      <div class="profile__copy">
        <span class="profile__kicker">${team ? esc(team.name) : ''}${p.group ? ` · ${groupLabel(p.group)}` : ''}</span>
        <h1 class="profile__name">${esc(p.name)}</h1>
        <div class="profile__badges">${finishBadge(s.finish)}${(s.chars[0]?.name || p.main) ? `<span class="finish finish--neutral">${ICONS.fist()} ${esc(s.chars[0]?.name || p.main || '')}</span>` : ''}${ctx.admin
          ? `<button class="btn btn--ghost btn--sm" data-act="photo-upload" data-pid="${pid}">${ICONS.camera()} ${p.photo ? 'Change photo' : 'Upload photo'}</button>` : ''}</div>
        <div class="tiles">
          <div class="tile"><b>${s.w}–${s.l}</b><span>Matches</span></div>
          <div class="tile"><b>${s.gw}–${s.gl}</b><span>Games</span></div>
          <div class="tile"><b class="${s.gw - s.gl > 0 ? 'pos' : s.gw - s.gl < 0 ? 'neg' : ''}">${signed(s.gw - s.gl)}</b><span>Game diff</span></div>
          <div class="tile"><b>${played ? `${winRate}%` : '—'}</b><span>Win rate</span></div>
        </div>
        ${row ? `<a class="profile__group" href="#/groups/${p.group}">Group ${p.group}: <b>${row.tied && p.group && ctx.d.groups[p.group].played ? '=' : ''}${row.place}${['st', 'nd', 'rd'][row.place - 1] ?? 'th'}</b> · ${plural(row.pts, 'pt')} · ${signed(row.diff)} diff ${ICONS.arrowRight()}</a>` : ''}
      </div>
    </section>
    <div class="split">
      <section class="panel">
        ${panelHead('Match History', `${ICONS.list()} ${plural(done.length, 'match', 'matches')}`)}
        ${done.length ? `<div class="history">${done.map(f => {
          const r = scoreFor(f, pid);
          const chars = [...new Set(f.score.games.map(g => (f.a === pid ? g.ca : g.cb)).filter(Boolean))];
          return `<a class="${cx('hist', r.won === true && 'is-win', r.won === false && 'is-loss')}" href="#/match/${f.id}">
            <span class="hist__res">${r.won === null ? stateChip(f) : r.won ? 'W' : 'L'}</span>
            <span class="hist__body">
              <span class="hist__label">${esc(f.label)}${f.score.wo ? ' · walkover' : ''}</span>
              <span class="hist__vs">vs ${portrait(ctx, r.opp, 'xs')} ${playerName(ctx, r.opp)}</span>
              ${chars.length ? `<span class="hist__chars">${chars.map(c => esc(c)).join(' → ')}</span>` : ''}
            </span>
            <span class="hist__score">${r.mine}<i>–</i>${r.theirs}</span>
          </a>`;
        }).join('')}</div>` : empty('No matches played yet.')}
      </section>
      <div class="stack">
        <section class="panel">
          ${panelHead('Characters', `${ICONS.fist()} Picks per game`)}
          ${s.chars.length ? `<ol class="bars">${s.chars.map(c => `<li class="bar">
            <span class="bar__name">${esc(c.name)}</span>
            <span class="bar__track"><i style="width:${Math.max(8, (c.games / maxChar) * 100)}%"></i></span>
            <span class="bar__val">${c.games}<small> · ${c.wins}W</small></span>
          </li>`).join('')}</ol>` : empty('No characters recorded yet.')}
        </section>
        <section class="panel">
          ${panelHead('Upcoming', `${ICONS.clock()} Schedule`)}
          ${upcoming.length ? `<div class="fx-list">${upcoming.slice(0, 6).map(f => fixtureLine(ctx, f)).join('')}</div>` : empty('Nothing scheduled.')}
        </section>
      </div>
    </div>`;
  },
};

/* ---------- match detail ---------- */
export const matchView: View = {
  title: ctx => ctx.d.byId[ctx.route.params[0] ?? '']?.label ?? 'Match',
  render(ctx) {
    const f = ctx.d.byId[ctx.route.params[0] ?? ''];
    if (!f) return `<section class="panel">${empty('Match not found.')}</section>`;
    const back = f.kind === 'playoff' ? ['#/playoffs', 'Playoffs'] : [`#/groups/${f.group ?? ''}`, `Group ${f.group ?? ''}`];
    return `
    <a class="back" href="${back[0]}">${ICONS.arrowRight('flip')} ${back[1]}</a>
    ${vsCard(ctx, f, { size: 'lg' })}
    <section class="panel">
      ${panelHead('Games', `BO${f.bestOf} · first to ${Math.floor(f.bestOf / 2) + 1}`)}
      ${f.score.wo ? empty(f.score.auto ? 'Decided by walkover — a player withdrew from the tournament.' : 'Decided by walkover.', ICONS.flag())
        : f.score.games.length ? `<ol class="games">${f.score.games.map((g, i) => {
          const winner = g.w === 'a' ? f.a : f.b;
          return `<li class="game">
            <span class="game__no">Game ${i + 1}</span>
            <span class="${cx('game__side', g.w === 'a' && 'is-win')}">${pips(g.w === 'a' ? 1 : 0, 1)} ${esc(g.ca || '—')}</span>
            <span class="game__vs">vs</span>
            <span class="${cx('game__side game__side--b', g.w === 'b' && 'is-win')}">${esc(g.cb || '—')} ${pips(g.w === 'b' ? 1 : 0, 1, 'b')}</span>
            <span class="game__winner">${playerName(ctx, winner)} wins</span>
          </li>`;
        }).join('')}</ol>` : empty(f.status === 'waiting' ? 'Waiting for earlier results to decide the fighters.' : 'Not started yet.')}
    </section>`;
  },
};
