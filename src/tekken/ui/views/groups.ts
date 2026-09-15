/* ============================================================
   GROUPS — standings boards, head-to-head grid, rounds, tie-breakers.
============================================================ */
import type { GroupId } from '../../engine/types';
import type { GroupResult } from '../../engine/groups';
import { GENDER_LABEL, GROUP_GENDER, GROUPS } from '../../engine/format';
import { groupMatchId } from '../../engine/match';
import type { Ctx, View } from '../app';
import { empty, fixtureLine, panelHead, playerName, portrait, statusTag, teamColor, teamTag } from '../components';
import { cx, esc, signed } from '../dom';
import { ICONS } from '../icons';

function standings(ctx: Ctx, res: GroupResult, compact: boolean): string {
  const anyPlayed = res.played > 0;
  return `<div class="table-wrap">
  <table class="${cx('standings', compact && 'standings--compact')}">
    <thead><tr>
      <th class="c-place">#</th><th class="c-name">Fighter</th>
      ${compact ? '' : '<th class="c-num" title="Matches played">MP</th>'}
      <th class="c-num" title="Match wins – losses">W–L</th>
      <th class="c-num hide-sm" title="Games won – lost">Games</th>
      <th class="c-num" title="Game differential">Diff</th>
      <th class="c-pts">Pts</th>
      <th class="c-status"></th>
    </tr></thead>
    <tbody>
      ${res.rows.map((r, i) => {
        const projected = !res.complete && anyPlayed ? (r.place === 1 ? 'upper' : r.place === 2 ? 'lower' : '') : '';
        return `<tr class="${cx(`row--${r.status ?? projected ?? ''}`, projected && 'is-projected', i === 1 && 'is-cut', r.status === 'out' && 'is-out')}">
          <td class="c-place"><span class="place">${r.tied && anyPlayed ? '=' : ''}${r.place}</span></td>
          <td class="c-name">
            <a class="who" href="#/player/${r.id}">
              ${portrait(ctx, r.id, 'sm')}
              <span class="who__text">
                <span class="who__name">${playerName(ctx, r.id)}</span>
                <span class="who__sub">${teamTag(ctx, r.id)}${r.decidedBy && res.complete ? `<span class="decided" title="Separated by ${esc(r.decidedBy)}">${esc(r.decidedBy)}</span>` : ''}${ctx.state.players[r.id]?.withdrawn ? '<span class="decided decided--bad">Withdrawn</span>' : ''}</span>
              </span>
            </a>
          </td>
          ${compact ? '' : `<td class="c-num">${r.played}</td>`}
          <td class="c-num"><b>${r.w}</b>–${r.l}</td>
          <td class="c-num hide-sm">${r.gw}–${r.gl}</td>
          <td class="${cx('c-num', r.diff > 0 && 'pos', r.diff < 0 && 'neg')}">${signed(r.diff)}</td>
          <td class="c-pts">${r.pts}</td>
          <td class="c-status">${statusTag(r.status)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

function tieNotice(ctx: Ctx, res: GroupResult): string {
  if (!res.openTies.length && !res.tiebreaks.length) return '';
  const names = (ids: string[]) => ids.map(id => playerName(ctx, id)).join(', ');
  return `<div class="tie-box">
    ${res.openTies.map(t => `<div class="tie-box__msg">
      ${ICONS.alert()}
      <span>${t.stage === 'tiebreak'
        ? `<b>Tie-breaker needed</b> for place ${t.place}: ${names(t.ids)} — BO1 ${t.ids.length > 2 ? 'round robin' : 'match'}.`
        : `<b>Organiser decision</b> for place ${t.place}: ${names(t.ids)} are still level after the tie-breakers.`}</span>
    </div>`).join('')}
    ${res.tiebreaks.length ? `<div class="fx-list">${res.tiebreaks.map(f => fixtureLine(ctx, f)).join('')}</div>` : ''}
  </div>`;
}

function matrix(ctx: Ctx, res: GroupResult): string {
  const m = res.members;
  const byId = new Map(res.fixtures.map(f => [f.id, f]));
  return `<div class="table-wrap" data-keep-scroll="matrix-${res.id}">
  <table class="matrix">
    <thead><tr><th></th>${m.map((id, i) => `<th class="matrix__col" title="${esc(ctx.state.players[id]?.name)}" style="--team:${teamColor(ctx, id)}">${i + 1}</th>`).join('')}</tr></thead>
    <tbody>
      ${m.map((row, i) => `<tr>
        <th class="matrix__row"><span class="matrix__no" style="--team:${teamColor(ctx, row)}">${i + 1}</span><span class="matrix__name">${playerName(ctx, row)}</span></th>
        ${m.map(col => {
          if (row === col) return '<td class="matrix__self"></td>';
          const f = byId.get(groupMatchId(row, col));
          if (!f) return '<td></td>';
          const isA = f.a === row;
          const mine = isA ? f.score.sa : f.score.sb;
          const theirs = isA ? f.score.sb : f.score.sa;
          const tone = f.status === 'done' ? (f.score.winner === row ? 'win' : f.score.winner ? 'loss' : '') : f.status;
          return `<td class="matrix__cell is-${tone}"><a href="#/match/${f.id}">${f.status === 'done' || f.status === 'live' ? `${mine}–${theirs}` : '·'}</a></td>`;
        }).join('')}
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function rounds(ctx: Ctx, res: GroupResult): string {
  const byRound = new Map<number, typeof res.fixtures>();
  for (const f of res.fixtures) byRound.set(f.round ?? 0, [...(byRound.get(f.round ?? 0) ?? []), f]);
  return `<div class="rounds">
    ${[...byRound.entries()].map(([r, list]) => `<div class="round">
      <div class="round__head">Round ${r}</div>
      <div class="fx-list">${list.map(f => fixtureLine(ctx, f, { label: false })).join('')}</div>
    </div>`).join('')}
  </div>`;
}

function board(ctx: Ctx, res: GroupResult): string {
  const pct = res.total ? Math.round((res.played / res.total) * 100) : 0;
  return `<section class="panel group-board" style="--pct:${pct}%">
    ${panelHead(`Group ${res.id}`, `${GENDER_LABEL[GROUP_GENDER[res.id]]} · ${res.played}/${res.total} matches${res.complete ? ' · complete' : ''}`,
      `<a class="link" href="#/groups/${res.id}">Details ${ICONS.arrowRight()}</a>`)}
    <div class="group-board__progress"><i></i></div>
    ${standings(ctx, res, true)}
    ${tieNotice(ctx, res)}
  </section>`;
}

function detail(ctx: Ctx, g: GroupId): string {
  const res = ctx.d.groups[g];
  return `
    <section class="panel">
      ${panelHead(`Group ${g} Standings`, `${ICONS.groups()} ${GENDER_LABEL[GROUP_GENDER[g]]} · Round robin · BO3`, `<span class="muted">${res.played}/${res.total} played</span>`)}
      ${standings(ctx, res, false)}
      ${tieNotice(ctx, res)}
      <p class="fineprint">Win = 1 pt. Level on points → head-to-head (only when exactly 2 are level) → game differential → games won → BO1 tie-breaker. 1st starts in the <b class="t-upper">Upper Bracket</b>, 2nd in the <b class="t-lower">Lower Bracket</b>.</p>
    </section>
    <div class="split">
      <section class="panel">
        ${panelHead('Head-to-Head', 'Score of the row player vs the numbered column')}
        ${matrix(ctx, res)}
      </section>
      <section class="panel">
        ${panelHead('Fixtures', `${ICONS.list()} 5 rounds`)}
        ${rounds(ctx, res)}
      </section>
    </div>`;
}

export const groupsView: View = {
  title: ctx => (ctx.route.params[0] ? `Group ${ctx.route.params[0]}` : 'Groups'),
  render(ctx) {
    const sel = GROUPS.find(g => g === ctx.route.params[0]?.toUpperCase());
    const tabs = `<nav class="seg" aria-label="Groups">
      <a class="${cx('seg__btn', !sel && 'is-active')}" href="#/groups">All</a>
      ${GROUPS.map(g => `<a class="${cx('seg__btn', sel === g && 'is-active')}" href="#/groups/${g}">Group ${g}</a>`).join('')}
    </nav>`;
    const head = `<header class="page-head">
      <div><p class="page-head__kicker">Round 1 · A &amp; B women · C &amp; D men</p><h1 class="page-head__title">Group Stage</h1></div>
      ${tabs}
    </header>`;
    if (!ctx.d.drawn) {
      return `${head}<section class="panel">${empty('Groups have not been drawn yet. Groups A and B are for women, C and D for men, with one fighter from every team in each group.', ICONS.shuffle())}</section>`;
    }
    return `${head}${sel ? detail(ctx, sel) : `<div class="group-grid">${GROUPS.map(g => board(ctx, ctx.d.groups[g])).join('')}</div>`}`;
  },
};
