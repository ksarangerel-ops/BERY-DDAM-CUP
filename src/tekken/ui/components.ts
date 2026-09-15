/* ============================================================
   SHARED COMPONENTS — small HTML builders used across views.
============================================================ */
import type { Fixture } from '../engine/match';
import type { QualStatus } from '../engine/groups';
import { winsNeeded } from '../engine/format';
import type { Ctx } from './app';
import { cx, esc } from './dom';
import { ICONS } from './icons';
import { photoUrl } from './photos';

export type PortraitSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const teamColor = (ctx: Ctx, pid: string | null): string => {
  const p = pid ? ctx.state.players[pid] : undefined;
  return (p && ctx.state.teams[p.team]?.color) || '#5d5d74';
};

/** Placeholder until player photos exist: a fighter silhouette on the team colour. */
const SILHOUETTE = '<svg class="portrait__sil" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="14.5" r="7.5"/><path d="M4 41c1.2-9.8 7.6-15.5 16-15.5S34.8 31.2 36 41z"/></svg>';

/** Fighter portrait: the uploaded photo in the slanted frame, or a silhouette on the team colour. */
export function portrait(ctx: Ctx, pid: string | null, size: PortraitSize = 'sm', extra = ''): string {
  const src = pid ? photoUrl(pid, ctx.state.players[pid]?.photo) : null;
  return `<span class="portrait portrait--${size}${src ? ' has-photo' : ''} ${extra}" style="--team:${teamColor(ctx, pid)}"${pid ? ` data-pid="${esc(pid)}"` : ''}>${src
    ? `<img class="portrait__img" src="${src}" alt="" draggable="false">`
    : SILHOUETTE}</span>`;
}

export const playerName = (ctx: Ctx, pid: string | null, hint = 'TBD'): string =>
  pid && ctx.state.players[pid] ? esc(ctx.state.players[pid].name) : `<span class="muted">${esc(hint)}</span>`;

export function teamTag(ctx: Ctx, pid: string | null): string {
  const p = pid ? ctx.state.players[pid] : undefined;
  const t = p ? ctx.state.teams[p.team] : undefined;
  if (!t) return '';
  return `<span class="tag" style="--team:${t.color}">${esc(t.name)}</span>`;
}

export function pips(won: number, bestOf: number, side: 'a' | 'b' = 'a'): string {
  const need = winsNeeded(bestOf);
  return `<span class="pips pips--${side}" aria-label="${won} of ${need} games">${Array.from({ length: need },
    (_, i) => `<i class="pip${i < won ? ' is-on' : ''}"></i>`).join('')}</span>`;
}

export function statusTag(status: QualStatus | null): string {
  if (!status) return '';
  const label = { upper: 'Upper', lower: 'Lower', out: 'Out' }[status];
  return `<span class="qual qual--${status}">${label}</span>`;
}

export function finishBadge(finish: string): string {
  const tone = finish === 'Champion' ? 'gold'
    : /Upper/.test(finish) ? 'upper'
    : /Lower/.test(finish) ? 'lower'
    : /Runner|3rd|4th/.test(finish) ? 'podium'
    : /Withdrawn|·|5th|7th/.test(finish) ? 'out' : 'neutral';
  return `<span class="finish finish--${tone}">${finish === 'Champion' ? ICONS.crown() : ''}${esc(finish)}</span>`;
}

export function panelHead(title: string, kicker = '', right = ''): string {
  return `<div class="ph">
    <div class="ph__titles">${kicker ? `<span class="ph__kicker">${kicker}</span>` : ''}<h2 class="ph__title">${title}</h2></div>
    ${right ? `<div class="ph__right">${right}</div>` : ''}
  </div>`;
}

export function stateChip(f: Fixture): string {
  switch (f.status) {
    case 'live': return `<span class="chip chip--live"><i class="dot"></i>Live${f.score.station ? ` · S${f.score.station}` : ''}</span>`;
    case 'done': return `<span class="chip chip--done">${f.score.wo ? 'W/O' : 'Final'}</span>`;
    case 'ready': return '<span class="chip chip--ready">Ready</span>';
    case 'skipped': return '<span class="chip chip--skip">Not needed</span>';
    default: return '<span class="chip chip--wait">TBD</span>';
  }
}

/** The character a side is currently on (last game played), for live cards. */
function currentChar(ctx: Ctx, f: Fixture, side: 'a' | 'b'): string {
  const games = f.score.games;
  const last = games[games.length - 1];
  const name = last ? (side === 'a' ? last.ca : last.cb) : '';
  const pid = side === 'a' ? f.a : f.b;
  return name || (pid ? ctx.state.players[pid]?.main ?? '' : '');
}

/** Compact one-line fixture used in lists. */
export function fixtureLine(ctx: Ctx, f: Fixture, opts: { href?: string; label?: boolean; state?: boolean; active?: boolean } = {}): string {
  const started = f.status === 'done' || f.status === 'live';
  const side = (s: 'a' | 'b') => {
    const pid = s === 'a' ? f.a : f.b;
    const win = f.score.done && f.score.winner && f.score.winner === pid;
    const lose = f.score.done && f.score.winner && f.score.winner !== pid;
    return `<span class="${cx('fx__p', `fx__p--${s}`, win && 'is-win', lose && 'is-lose')}">
      ${portrait(ctx, pid, 'xs')}<span class="fx__name">${playerName(ctx, pid, s === 'a' ? f.aHint : f.bHint)}</span>
    </span>`;
  };
  const href = opts.href ?? `#/match/${f.id}`;
  return `<a class="${cx('fx', `fx--${f.status}`, opts.label === false && 'fx--nolabel', opts.state === false && 'fx--nostate', opts.active && 'is-active')}" href="${href}">
    ${opts.label === false ? '' : `<span class="fx__label">${esc(f.short)}</span>`}
    ${side('a')}
    <span class="fx__score">${started
      ? `<b class="${f.score.winner === f.a ? 'is-win' : ''}">${f.score.sa}</b><i>:</i><b class="${f.score.winner === f.b ? 'is-win' : ''}">${f.score.sb}</b>`
      : '<em>vs</em>'}</span>
    ${side('b')}
    ${opts.state === false ? '' : `<span class="fx__state">${stateChip(f)}</span>`}
  </a>`;
}

/** Big versus card — Now Playing, match pages and the admin console. */
export function vsCard(ctx: Ctx, f: Fixture, opts: { link?: boolean; size?: 'md' | 'lg' } = {}): string {
  const size = opts.size ?? 'md';
  const side = (s: 'a' | 'b') => {
    const pid = s === 'a' ? f.a : f.b;
    const won = s === 'a' ? f.score.sa : f.score.sb;
    const isWin = f.score.done && f.score.winner === pid && !!pid;
    const isLose = f.score.done && !!f.score.winner && f.score.winner !== pid;
    const char = currentChar(ctx, f, s);
    const tag = opts.link !== false && pid ? 'a' : 'div';
    const p = pid ? ctx.state.players[pid] : undefined;
    const team = p ? ctx.state.teams[p.team] : undefined;
    return `<${tag} class="${cx('vs__side', `vs__side--${s}`, isWin && 'is-win', isLose && 'is-lose')}"${tag === 'a' ? ` href="#/player/${pid}"` : ''} style="--team:${teamColor(ctx, pid)}">
      ${portrait(ctx, pid, size === 'lg' ? 'lg' : 'md')}
      <span class="vs__info">
        <span class="vs__name">${playerName(ctx, pid, s === 'a' ? f.aHint : f.bHint)}</span>
        <span class="vs__team">${team ? esc(team.name) : '&nbsp;'}</span>
        <span class="vs__row">${pips(won, f.bestOf, s)}${char ? `<span class="vs__char">${esc(char)}</span>` : ''}</span>
      </span>
    </${tag}>`;
  };
  return `<article class="${cx('vs', `vs--${size}`, `is-${f.status}`)}">
    <header class="vs__head">
      ${f.score.station && f.status === 'live' ? `<span class="vs__station">${ICONS.controller()} Station ${f.score.station}</span>` : ''}
      <span class="vs__label">${esc(f.label)}</span>
      <span class="vs__bo">BO${f.bestOf}</span>
      ${stateChip(f)}
    </header>
    <div class="vs__body">
      ${side('a')}
      <div class="vs__mid">
        <span class="vs__score ${f.score.winner && f.score.winner === f.a ? 'is-win' : ''}">${f.score.sa}</span>
        <span class="vs__x">VS</span>
        <span class="vs__score ${f.score.winner && f.score.winner === f.b ? 'is-win' : ''}">${f.score.sb}</span>
      </div>
      ${side('b')}
    </div>
  </article>`;
}

export const empty = (text: string, icon = ICONS.info()): string =>
  `<div class="empty">${icon}<span>${text}</span></div>`;
