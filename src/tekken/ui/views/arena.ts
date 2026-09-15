/* ============================================================
   ARENA — the home / big-screen view: stage, now playing, up next.
============================================================ */
import { GENDER_LABEL, GROUP_GENDER, GROUPS } from '../../engine/format';
import type { Ctx, View } from '../app';
import { empty, finishBadge, fixtureLine, panelHead, playerName, portrait, statusTag, teamTag, vsCard } from '../components';
import { cx, esc, plural, signed } from '../dom';
import { ICONS } from '../icons';
import { youtubeEmbed } from '../streams';

function hero(ctx: Ctx): string {
  const { stage } = ctx.d;
  const pct = stage.total ? Math.round((stage.done / stage.total) * 100) : 0;
  const segs = 20;
  const lit = Math.round((pct / 100) * segs);
  return `<section class="hero">
    <div class="hero__kanji" aria-hidden="true">鉄拳</div>
    <div class="hero__copy">
      <img class="hero__logo" src="/game-logos/tekken7.png" alt="Tekken 7" width="900" height="154">
      <p class="hero__kicker">${ICONS.bolt()} DDAM Esport Cup · Official tournament</p>
      <h1 class="hero__title">${esc(ctx.state.meta.title)}</h1>
      <ul class="hero__facts">
        <li><b>24</b> fighters</li><li><b>4</b> groups</li><li><b>BO3</b> matches</li><li><b>Double</b> elimination</li><li><b>BO5</b> grand final</li>
      </ul>
    </div>
    <div class="hero__stage">
      <div class="stagebar__top">
        <span class="stagebar__label">${esc(stage.label)}</span>
        <span class="stagebar__count">${stage.key === 'setup' || stage.key === 'finished' ? '' : `${stage.done}<i>/</i>${stage.total}`}</span>
      </div>
      <div class="stagebar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        ${Array.from({ length: segs }, (_, i) => `<i class="${i < lit ? 'is-on' : ''}"></i>`).join('')}
      </div>
      <ol class="stagebar__steps">
        ${(['groups', 'tiebreaks', 'playoffs', 'finished'] as const).map(k => {
          const order = ['setup', 'groups', 'tiebreaks', 'playoffs', 'finished'];
          const now = order.indexOf(stage.key), me = order.indexOf(k);
          return `<li class="${cx(me < now && 'is-past', me === now && 'is-now')}">${{ groups: 'Groups', tiebreaks: 'Tie-breaks', playoffs: 'Playoffs', finished: 'Champion' }[k]}</li>`;
        }).join('')}
      </ol>
    </div>
  </section>`;
}

function champion(ctx: Ctx): string {
  const { bracket } = ctx.d;
  if (!bracket.champion) return '';
  const id = bracket.champion;
  const p = ctx.state.players[id];
  const team = p ? ctx.state.teams[p.team] : undefined;
  const main = ctx.d.players[id]?.chars[0]?.name ?? p?.main ?? '';
  return `<a class="champ" href="#/player/${id}">
    <div class="champ__rays" aria-hidden="true"></div>
    ${portrait(ctx, id, 'xl')}
    <div class="champ__copy">
      <span class="champ__kicker">${ICONS.crown()} King of Iron Fist · Champion</span>
      <span class="champ__name">${playerName(ctx, id)}</span>
      <span class="champ__meta">${team ? esc(team.name) : ''}${main ? ` · ${esc(main)}` : ''}</span>
    </div>
  </a>`;
}

const streamOf = (ctx: Ctx, station: number) => youtubeEmbed(ctx.state.meta.streams[`s${station}`]);
const allStations = (ctx: Ctx) => Array.from({ length: ctx.state.meta.stations }, (_, i) => i + 1);
const streamedStations = (ctx: Ctx) => allStations(ctx).filter(s => streamOf(ctx, s));

function nowPlaying(ctx: Ctx): string {
  const { live, upNext } = ctx.d;
  const streamed = streamedStations(ctx);

  let body: string;
  if (streamed.length) {
    // One block per station that has a stream or a live match: video on top, match card below.
    const shown = new Set<number>();
    const blocks = allStations(ctx)
      .filter(s => streamOf(ctx, s) || live.some(f => f.score.station === s))
      .map(s => {
        shown.add(s);
        const f = live.find(x => x.score.station === s);
        const src = streamOf(ctx, s);
        return `<div class="station">
          ${src ? `<div class="stream-slot" data-stream="s${s}" data-src="${esc(src)}"><span>${ICONS.play()} Station ${s} · loading stream…</span></div>` : ''}
          ${f ? vsCard(ctx, f) : `<div class="station__idle">${ICONS.controller()} Station ${s} · waiting for the next match</div>`}
        </div>`;
      });
    const others = live.filter(f => !shown.has(f.score.station ?? 0)).map(f => `<div class="station">${vsCard(ctx, f)}</div>`);
    const all = [...blocks, ...others];
    // A single stream sits next to its match card so the score stays visible without scrolling.
    body = `<div class="stations stations--stream${all.length === 1 ? ' stations--solo' : ''}">${all.join('')}</div>`;
  } else if (live.length) {
    body = `<div class="stations">${live.map(f => vsCard(ctx, f)).join('')}</div>`;
  } else {
    body = empty(ctx.d.stage.key === 'setup'
      ? 'The group draw has not happened yet — fighters will appear here once it does.'
      : upNext.length ? 'No match on stage right now. Next fighters, get ready!' : 'Nothing on stage.', ICONS.controller());
  }
  const chips = [
    streamed.length ? `<span class="chip chip--stream">${ICONS.play()} Streaming</span>` : '',
    live.length ? `<span class="chip chip--live"><i class="dot"></i>${plural(live.length, 'station')} live</span>` : '',
  ].join('');
  return `<section class="panel panel--red">
    ${panelHead('Now Playing', `${ICONS.bolt()} On stage`, chips)}
    ${body}
  </section>`;
}

function upNextPanel(ctx: Ctx): string {
  const { upNext } = ctx.d;
  return `<section class="panel">
    ${panelHead('Up Next', `${ICONS.clock()} Get ready`)}
    ${upNext.length ? `<div class="fx-list">${upNext.map(f => fixtureLine(ctx, f, { state: false })).join('')}</div>` : empty('No matches waiting.')}
  </section>`;
}

function recentPanel(ctx: Ctx): string {
  const { recent } = ctx.d;
  return `<section class="panel">
    ${panelHead('Latest Results', `${ICONS.flag()} Just finished`)}
    ${recent.length ? `<div class="fx-list">${recent.map(f => fixtureLine(ctx, f, { state: false })).join('')}</div>` : empty('No results yet.')}
  </section>`;
}

function groupsSnapshot(ctx: Ctx): string {
  if (!ctx.d.drawn) return '';
  return `<section class="panel">
    ${panelHead('Group Race', `${ICONS.groups()} Top two advance`, `<a class="link" href="#/groups">All groups ${ICONS.arrowRight()}</a>`)}
    <div class="mini-groups">
      ${GROUPS.map(g => {
        const res = ctx.d.groups[g];
        return `<a class="mini-group" href="#/groups/${g}">
          <div class="mini-group__head"><span class="gletter">${g}</span><span class="mini-group__gender">${GENDER_LABEL[GROUP_GENDER[g]]}</span><span>${res.played}/${res.total}</span></div>
          ${res.rows.map(r => `<div class="${cx('mini-row', r.place <= 2 && !r.tied && 'is-top', r.status === 'out' && 'is-out')}">
            <span class="mini-row__place">${r.tied && res.played ? '=' : ''}${r.place}</span>
            ${portrait(ctx, r.id, 'xs')}
            <span class="mini-row__name">${playerName(ctx, r.id)}</span>
            <span class="mini-row__pts">${r.pts}</span>
            <span class="mini-row__diff">${signed(r.diff)}</span>
            ${statusTag(r.status)}
          </div>`).join('')}
        </a>`;
      }).join('')}
    </div>
  </section>`;
}

function charactersPanel(ctx: Ctx): string {
  const top = ctx.d.characters.slice(0, 8);
  if (!top.length) return '';
  const max = top[0]?.games ?? 1;
  return `<section class="panel">
    ${panelHead('Most Picked', `${ICONS.fist()} Character select`)}
    <ol class="bars">
      ${top.map((c, i) => `<li class="bar">
        <span class="bar__rank">${i + 1}</span>
        <span class="bar__name">${esc(c.name)}</span>
        <span class="bar__track"><i style="width:${Math.max(6, (c.games / max) * 100)}%"></i></span>
        <span class="bar__val">${c.games}<small> games · ${Math.round((c.wins / c.games) * 100)}% win</small></span>
      </li>`).join('')}
    </ol>
  </section>`;
}

function placements(ctx: Ctx): string {
  const list = ctx.d.bracket.placements;
  if (!list.length || !ctx.d.bracket.champion) return '';
  return `<section class="panel">
    ${panelHead('Final Standings', `${ICONS.trophy()} Playoffs`)}
    <ol class="placings">
      ${list.map(p => `<li class="placing placing--${p.place.replace('–', '-')}">
        <span class="placing__pos">${p.place}</span>${portrait(ctx, p.id, 'sm')}
        <a class="placing__name" href="#/player/${p.id}">${playerName(ctx, p.id)}</a>${teamTag(ctx, p.id)}
        ${finishBadge(ctx.d.players[p.id]?.finish ?? '')}
      </li>`).join('')}
    </ol>
  </section>`;
}

function rosterPreview(ctx: Ctx): string {
  if (ctx.d.drawn) return '';
  const teams = Object.entries(ctx.state.teams).sort(([, a], [, b]) => a.order - b.order);
  return `<section class="panel">
    ${panelHead('The Fighters', `${ICONS.fighters()} 6 teams · 24 players`, `<a class="link" href="#/players">All fighters ${ICONS.arrowRight()}</a>`)}
    <div class="team-strip">
      ${teams.map(([tid, t]) => `<div class="team-col" style="--team:${t.color}">
        <div class="team-col__name">${esc(t.name)}</div>
        ${Object.entries(ctx.state.players).filter(([, p]) => p.team === tid).map(([pid]) =>
          `<a class="team-col__p" href="#/player/${pid}">${portrait(ctx, pid, 'xs')}<span>${playerName(ctx, pid)}</span></a>`).join('')}
      </div>`).join('')}
    </div>
  </section>`;
}

export const arenaView: View = {
  title: () => 'Arena',
  render(ctx) {
    // With a stream on, Now Playing takes the full width so the video is big enough for a projector.
    const wide = streamedStations(ctx).length > 0;
    return `
    ${hero(ctx)}
    ${champion(ctx)}
    ${wide ? nowPlaying(ctx) : ''}
    <div class="arena-grid">
      <div class="arena-grid__main">
        ${wide ? '' : nowPlaying(ctx)}
        ${placements(ctx)}
        ${groupsSnapshot(ctx)}
        ${rosterPreview(ctx)}
      </div>
      <aside class="arena-grid__side">
        ${upNextPanel(ctx)}
        ${recentPanel(ctx)}
        ${charactersPanel(ctx)}
      </aside>
    </div>`;
  },
};
