/* ============================================================
   PLAYOFFS — double-elimination bracket drawn GSL-style.
   Match boxes sit in a CSS grid; connector wires are an SVG overlay
   measured from the real box positions after render (and on resize).
============================================================ */
import type { SeedSlot } from '../../engine/types';
import type { Fixture } from '../../engine/match';
import { type PlayoffSlot, SEED_SLOTS, seedHint } from '../../engine/playoffs';
import type { Ctx, View } from '../app';
import { finishBadge, panelHead, playerName, portrait, stateChip, teamTag } from '../components';
import { cx, esc } from '../dom';
import { ICONS } from '../icons';

/** Seed label shown next to a player in the first round of each bracket. */
const ENTRY: Partial<Record<PlayoffSlot, [SeedSlot, SeedSlot]>> = {
  WSF1: ['A1', 'B1'], WSF2: ['C1', 'D1'], LR1A: ['C2', 'D2'], LR1B: ['A2', 'B2'],
};

function box(ctx: Ctx, f: Fixture, slot: PlayoffSlot): string {
  const row = (s: 'a' | 'b') => {
    const pid = s === 'a' ? f.a : f.b;
    const score = s === 'a' ? f.score.sa : f.score.sb;
    const win = f.score.done && !!pid && f.score.winner === pid;
    const lose = f.score.done && !!f.score.winner && f.score.winner !== pid;
    const seed = ENTRY[slot]?.[s === 'a' ? 0 : 1];
    const hint = s === 'a' ? f.aHint : f.bHint;
    const drop = !pid && hint.startsWith('Loser');
    return `<div class="${cx('bm__row', win && 'is-win', lose && 'is-lose', !pid && 'is-tbd')}" style="--team:${pid ? (ctx.state.teams[ctx.state.players[pid]?.team ?? '']?.color ?? '#555') : 'transparent'}">
      ${seed ? `<span class="bm__seed">${seed}</span>` : drop ? `<span class="bm__seed bm__seed--drop" title="${esc(hint)}">${ICONS.arrowDown()}</span>` : '<span class="bm__seed bm__seed--none"></span>'}
      ${pid ? portrait(ctx, pid, 'xs') : '<span class="bm__ph"></span>'}
      <span class="bm__name">${pid ? playerName(ctx, pid) : `<span class="muted">${esc(hint)}</span>`}</span>
      <span class="bm__score">${f.status === 'done' || f.status === 'live' ? score : ''}</span>
    </div>`;
  };
  return `<a class="${cx('bm', `is-${f.status}`)}" id="bm-${slot}" href="#/match/${f.id}" data-slot="${slot}">
    <div class="bm__head"><span class="bm__code">${slot === 'GF2' ? 'RESET' : slot}</span><span class="bm__bo">BO${f.bestOf}</span>${f.status === 'live' || f.status === 'skipped' ? stateChip(f) : ''}</div>
    ${row('a')}${row('b')}
  </a>`;
}

function round(title: string, sub: string, slots: PlayoffSlot[], ctx: Ctx, cls = ''): string {
  return `<div class="${cx('bcol', cls)}">
    <div class="bcol__head"><b>${title}</b><span>${sub}</span></div>
    <div class="bcol__body">${slots.map(s => box(ctx, ctx.d.bracket.fixtures[s], s)).join('')}</div>
  </div>`;
}

function seedsStrip(ctx: Ctx): string {
  const { seeds, seedSource } = ctx.d.bracket;
  const chip = (s: SeedSlot) => {
    const pid = seeds[s];
    return `<div class="${cx('seed', `seed--${s[1] === '1' ? 'upper' : 'lower'}`, !pid && 'is-tbd')}">
      <span class="seed__slot">${s}</span>
      ${pid ? portrait(ctx, pid, 'xs') : ''}
      <span class="seed__name">${pid ? playerName(ctx, pid) : `<span class="muted">${seedHint(s)}</span>`}</span>
      ${seedSource[s] === 'manual' ? '<span class="seed__manual" title="Placed manually by the organiser">M</span>' : ''}
    </div>`;
  };
  return `<div class="seeds">
    <div class="seeds__group"><span class="seeds__label t-upper">${ICONS.arrowUp()} Upper bracket · group winners</span>
      <div class="seeds__row">${SEED_SLOTS.filter(s => s[1] === '1').map(chip).join('')}</div></div>
    <div class="seeds__group"><span class="seeds__label t-lower">${ICONS.arrowDown()} Lower bracket · runners-up</span>
      <div class="seeds__row">${SEED_SLOTS.filter(s => s[1] === '2').map(chip).join('')}</div></div>
  </div>`;
}

function podium(ctx: Ctx): string {
  const { placements, champion } = ctx.d.bracket;
  if (!champion) return '';
  const at = (place: string) => placements.filter(p => p.place === place);
  const step = (place: string, cls: string) => at(place).map(p => `<a class="${cx('podium__step', cls)}" href="#/player/${p.id}">
      ${portrait(ctx, p.id, place === '1' ? 'lg' : 'md')}
      <span class="podium__name">${playerName(ctx, p.id)}</span>
      ${teamTag(ctx, p.id)}
      <span class="podium__block"><b>${place}</b></span>
    </a>`).join('');
  return `<section class="panel panel--gold">
    ${panelHead('Final Standings', `${ICONS.trophy()} Tournament complete`)}
    <div class="podium">${step('2', 'is-2')}${step('1', 'is-1')}${step('3', 'is-3')}</div>
    <ol class="placings placings--rest">
      ${placements.filter(p => !['1', '2', '3'].includes(p.place)).map(p => `<li class="placing">
        <span class="placing__pos">${p.place}</span>${portrait(ctx, p.id, 'sm')}
        <a class="placing__name" href="#/player/${p.id}">${playerName(ctx, p.id)}</a>${teamTag(ctx, p.id)}
        ${finishBadge(ctx.d.players[p.id]?.finish ?? '')}
      </li>`).join('')}
    </ol>
  </section>`;
}

/* ---------- connector wires ---------- */
const WIRES: [from: PlayoffSlot, to: PlayoffSlot, side: 'a' | 'b'][] = [
  ['WSF1', 'WF', 'a'], ['WSF2', 'WF', 'b'], ['WF', 'GF', 'a'],
  ['LR1A', 'LR2A', 'b'], ['LR1B', 'LR2B', 'b'], ['LR2A', 'LR3', 'a'], ['LR2B', 'LR3', 'b'],
  ['LR3', 'LF', 'b'], ['LF', 'GF', 'b'],
];

function drawWires(root: HTMLElement, ctx: Ctx) {
  const wrap = root.querySelector<HTMLElement>('.bracket');
  const svg = root.querySelector<SVGSVGElement>('.bracket__wires');
  if (!wrap || !svg) return;
  const base = wrap.getBoundingClientRect();
  svg.setAttribute('width', String(wrap.scrollWidth));
  svg.setAttribute('height', String(wrap.scrollHeight));
  const paths = WIRES.map(([from, to, side]) => {
    const rows = wrap.querySelectorAll<HTMLElement>(`#bm-${from} .bm__row`);
    const b = wrap.querySelectorAll<HTMLElement>(`#bm-${to} .bm__row`)[side === 'a' ? 0 : 1];
    const first = rows[0], last = rows[rows.length - 1];
    if (!first || !last || !b) return '';
    const ra = first.getBoundingClientRect(), rl = last.getBoundingClientRect(), rb = b.getBoundingClientRect();
    // leave from the seam between the two player rows, arrive at the middle of the target row
    const x1 = ra.right - base.left, y1 = (ra.top + rl.bottom) / 2 - base.top;
    const x2 = rb.left - base.left, y2 = rb.top + rb.height / 2 - base.top;
    const xm = x2 - 22;
    const hot = ctx.d.bracket.fixtures[from].status === 'done';
    return `<path class="${cx('wire', hot && 'is-hot')}" d="M${x1} ${y1} H${xm} V${y2} H${x2}"/>`;
  });
  svg.innerHTML = paths.join('');
}

let resizeObs: ResizeObserver | null = null;

export const bracketView: View = {
  title: () => 'Playoffs',
  render(ctx) {
    const { bracket } = ctx.d;
    return `
    <header class="page-head">
      <div><p class="page-head__kicker">Round 2 · 8 fighters</p><h1 class="page-head__title">Playoffs</h1></div>
      <div class="legend">
        <span><i class="legend__sw legend__sw--upper"></i>Upper: first loss drops you</span>
        <span><i class="legend__sw legend__sw--lower"></i>Lower: one loss and you're out</span>
      </div>
    </header>
    ${podium(ctx)}
    <section class="panel">
      ${panelHead('Qualified', `${ICONS.users()} GSL crossover · A ↔ B, C ↔ D`)}
      ${seedsStrip(ctx)}
      <p class="fineprint">Upper-bracket losers drop into the <b>other</b> pod’s lower bracket, so nobody meets a player from their own group before Losers Round 3. All matches BO3 — Grand Final BO5. If the lower-bracket player wins the Grand Final, the bracket resets for one more BO5.</p>
    </section>
    <section class="panel panel--flush">
      <div class="bracket-scroll" data-keep-scroll="bracket">
        <div class="bracket">
          <svg class="bracket__wires" aria-hidden="true"></svg>
          <div class="bracket__lane bracket__lane--upper"><span>${ICONS.arrowUp()} Upper Bracket</span></div>
          ${round('Winners Semis', 'BO3', ['WSF1', 'WSF2'], ctx, 'bcol--wsf')}
          ${round('Winners Final', 'BO3', ['WF'], ctx, 'bcol--wf')}
          <div class="bracket__lane bracket__lane--lower"><span>${ICONS.arrowDown()} Lower Bracket</span></div>
          ${round('Losers R1', 'BO3', ['LR1A', 'LR1B'], ctx, 'bcol--lr1')}
          ${round('Losers R2', 'BO3 · drop-ins', ['LR2A', 'LR2B'], ctx, 'bcol--lr2')}
          ${round('Losers R3', 'BO3', ['LR3'], ctx, 'bcol--lr3')}
          ${round('Losers Final', 'BO3 · drop-in', ['LF'], ctx, 'bcol--lf')}
          <div class="bcol bcol--gf">
            <div class="bcol__head"><b>Grand Final</b><span>BO5</span></div>
            <div class="bcol__body">
              ${box(ctx, bracket.fixtures.GF, 'GF')}
              <div class="${cx('reset-note', bracket.resetNeeded && 'is-on')}">${ICONS.undo()} ${bracket.resetNeeded ? 'Bracket reset!' : 'Reset only if the lower-bracket player wins'}</div>
              ${box(ctx, bracket.fixtures.GF2, 'GF2')}
            </div>
          </div>
        </div>
      </div>
    </section>`;
  },
  after(root, ctx) {
    const run = () => drawWires(root, ctx);
    requestAnimationFrame(run);
    // Fonts landing late shift the boxes; redraw once they are ready.
    void document.fonts?.ready.then(run);
    resizeObs?.disconnect();
    const target = root.querySelector('.bracket');
    if (target) { resizeObs = new ResizeObserver(run); resizeObs.observe(target); }
  },
};
