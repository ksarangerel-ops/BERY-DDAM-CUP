/* ============================================================
   ADMIN — organiser console (Supabase admin login).
   Tabs: Matches (live scoring) · Draw · Roster · Playoffs · Settings
============================================================ */
import type { BoardState, GroupId, MatchRecord, SeedSlot, Side } from '../../engine/types';
import type { Fixture } from '../../engine/match';
import { CHARACTERS } from '../../engine/characters';
import { GENDER_LABEL, GROUP_GENDER, GROUPS, MAX_STATIONS, winsNeeded } from '../../engine/format';
import { drawGroups, genderIssues, orderedGroups, teamRoster } from '../../engine/draw';
import { SEED_SLOTS, seedHint } from '../../engine/playoffs';
import { blankState, normalize } from '../../engine/state';
import { simulateStep } from '../../engine/simulate';
import { TEKKEN_BOARD_ID } from '../../config';
import { actions, type Ctx, save, type View } from '../app';
import { EMBLEM, ICONS } from '../icons';
import { empty, fixtureLine, panelHead, playerName, portrait, vsCard } from '../components';
import { cx, esc, plural, toast } from '../dom';
import { youtubeEmbed } from '../streams';
import { storePhoto } from '../photos';

type Tab = 'matches' | 'draw' | 'roster' | 'playoffs' | 'settings';
type MatchFilter = 'queue' | GroupId | 'tb' | 'playoffs';

const TABS: [Tab, string, (c?: string) => string][] = [
  ['matches', 'Matches', ICONS.controller],
  ['draw', 'Group Draw', ICONS.shuffle],
  ['roster', 'Roster', ICONS.users],
  ['playoffs', 'Ties & Seeds', ICONS.bracket],
  ['settings', 'Settings', ICONS.gear],
];

/* ---------- view-local drafts (never persisted) ---------- */
let filter: MatchFilter = 'queue';
const charDraft: Record<string, { ca?: string; cb?: string }> = {};
const stationDraft: Record<string, number> = {};
let swapPick: string | null = null;
let revealUntil = 0;
const orderDraft: Record<string, string[]> = {};

const now = () => new Date().toISOString();
const tabOf = (ctx: Ctx): Tab => (TABS.some(([t]) => t === ctx.route.params[0]) ? ctx.route.params[0] as Tab : 'matches');

/* ============================================================
   MATCHES
============================================================ */
function listFor(ctx: Ctx): Fixture[] {
  const { d } = ctx;
  switch (filter) {
    case 'queue': {
      const ready = d.fixtures.filter(f => f.status === 'ready');
      return [...d.live, ...ready].slice(0, 24);
    }
    case 'tb': return GROUPS.flatMap(g => d.groups[g].tiebreaks);
    case 'playoffs': return Object.values(d.bracket.fixtures);
    default: return d.groups[filter].fixtures;
  }
}

function freeStation(ctx: Ctx, except?: string): number {
  const used = new Set(ctx.d.live.filter(f => f.id !== except).map(f => f.score.station));
  for (let s = 1; s <= ctx.state.meta.stations; s++) if (!used.has(s)) return s;
  return 1;
}

function defaultChar(ctx: Ctx, f: Fixture, side: Side): string {
  const draft = charDraft[f.id]?.[side === 'a' ? 'ca' : 'cb'];
  if (draft !== undefined) return draft;
  const last = f.score.games[f.score.games.length - 1];
  if (last) return (side === 'a' ? last.ca : last.cb) ?? '';
  const pid = side === 'a' ? f.a : f.b;
  return pid ? ctx.state.players[pid]?.main ?? '' : '';
}

const charSelect = (value: string, attrs: string) => `<select class="input" ${attrs}>
  <option value="">— Character —</option>
  ${CHARACTERS.map(c => `<option${c === value ? ' selected' : ''}>${esc(c)}</option>`).join('')}
</select>`;

function consolePanel(ctx: Ctx, f: Fixture): string {
  const need = winsNeeded(f.bestOf);
  const rec = ctx.state.matches[f.id];
  const ready = !!(f.a && f.b);
  const nextGame = f.score.games.length + 1;
  const name = (s: Side) => playerName(ctx, s === 'a' ? f.a : f.b);
  const station = f.score.live ? (f.score.station ?? 1) : (stationDraft[f.id] ?? freeStation(ctx, f.id));

  let body = '';
  if (f.score.stale) {
    body += `<div class="alert alert--warn">${ICONS.alert()}<span>A result is stored for <b>different fighters</b> (${esc(ctx.state.players[rec?.a ?? '']?.name ?? '?')} vs ${esc(ctx.state.players[rec?.b ?? '']?.name ?? '?')}). An earlier result or the draw changed. It is ignored.</span>
      <button class="btn btn--sm" data-act="m-clear" data-id="${f.id}" data-force="1">Delete it</button></div>`;
  }
  if (!ready) {
    body += empty(`Waiting for fighters: <b>${esc(f.aHint)}</b> vs <b>${esc(f.bHint)}</b>.`, ICONS.clock());
  } else if (f.status === 'skipped') {
    body += empty('Not needed — the upper-bracket finalist won the Grand Final.', ICONS.check());
  } else if (f.score.auto) {
    body += empty('Automatic walkover: a fighter has withdrawn. Un-withdraw them in Roster to play it.', ICONS.flag());
  } else {
    body += `<div class="console__bar">
      <label class="field field--inline"><span>Station</span>
        <select class="input" data-change="m-station" data-id="${f.id}">
          ${Array.from({ length: ctx.state.meta.stations }, (_, i) => `<option value="${i + 1}"${i + 1 === station ? ' selected' : ''}>Station ${i + 1}</option>`).join('')}
        </select>
      </label>
      ${f.score.done ? '' : f.score.live
        ? `<button class="btn btn--ghost" data-act="m-live" data-id="${f.id}" data-on="0">${ICONS.stop()} End live</button>`
        : `<button class="btn btn--red" data-act="m-live" data-id="${f.id}" data-on="1">${ICONS.play()} Go live</button>`}
      <span class="console__hint">First to ${need} · ${plural(f.score.games.length, 'game')} recorded</span>
    </div>`;

    if (!f.score.done) {
      body += `<div class="console__game">
        <div class="console__gno">Game ${nextGame}<small> · who won?</small></div>
        <div class="console__picks">
          <label class="field"><span>${name('a')} plays</span>${charSelect(defaultChar(ctx, f, 'a'), `data-change="m-char" data-id="${f.id}" data-side="a"`)}</label>
          <label class="field"><span>${name('b')} plays</span>${charSelect(defaultChar(ctx, f, 'b'), `data-change="m-char" data-id="${f.id}" data-side="b"`)}</label>
        </div>
        <div class="console__win">
          <button class="btn btn--p1 btn--xl" data-act="m-game" data-id="${f.id}" data-side="a">${ICONS.arrowRight('flip')}<span>${name('a')}<small>wins game ${nextGame}</small></span></button>
          <button class="btn btn--p2 btn--xl" data-act="m-game" data-id="${f.id}" data-side="b"><span>${name('b')}<small>wins game ${nextGame}</small></span>${ICONS.arrowRight()}</button>
        </div>
        <p class="fineprint">Winner keeps their character; the loser may switch before the next game.</p>
      </div>`;
    } else {
      const next = ctx.d.upNext.find(x => x.id !== f.id);
      body += `<div class="console__done">${ICONS.trophy()}<span><b>${playerName(ctx, f.score.winner)}</b> wins ${Math.max(f.score.sa, f.score.sb)}–${Math.min(f.score.sa, f.score.sb)}${f.score.wo ? ' by walkover' : ''}</span>
        ${next ? `<a class="btn btn--red" href="#/admin/matches/${next.id}">Next: ${esc(next.short)} ${ICONS.arrowRight()}</a>` : ''}</div>`;
    }

    if (f.score.games.length) {
      body += `<ol class="glog">${f.score.games.map((g, i) => `<li>
        <span class="glog__no">G${i + 1}</span>
        <span class="${cx('glog__p', g.w === 'a' && 'is-win')}">${name('a')} <small>${esc(g.ca || '—')}</small></span>
        <span class="glog__vs">vs</span>
        <span class="${cx('glog__p', g.w === 'b' && 'is-win')}">${name('b')} <small>${esc(g.cb || '—')}</small></span>
      </li>`).join('')}</ol>`;
    }

    body += `<div class="console__tools">
      <button class="btn btn--ghost btn--sm" data-act="m-undo" data-id="${f.id}" ${f.score.games.length || f.score.wo ? '' : 'disabled'}>${ICONS.undo()} Undo last</button>
      <button class="btn btn--ghost btn--sm" data-act="m-wo" data-id="${f.id}" data-side="a">${ICONS.flag()} W/O → ${name('a')}</button>
      <button class="btn btn--ghost btn--sm" data-act="m-wo" data-id="${f.id}" data-side="b">${ICONS.flag()} W/O → ${name('b')}</button>
      <button class="btn btn--danger btn--sm" data-act="m-clear" data-id="${f.id}" ${rec ? '' : 'disabled'}>${ICONS.x()} Clear result</button>
    </div>`;
  }

  return `<section class="panel console">
    ${vsCard(ctx, f, { link: false, size: 'lg' })}
    ${body}
  </section>`;
}

function matchesTab(ctx: Ctx): string {
  const list = listFor(ctx);
  const selId = ctx.route.params[1];
  const sel = (selId && ctx.d.byId[selId]) || ctx.d.live[0] || ctx.d.upNext[0] || null;
  const filters: [MatchFilter, string][] = [['queue', 'Queue'], ...GROUPS.map(g => [g, g] as [MatchFilter, string]), ['tb', 'TB'], ['playoffs', 'Playoffs']];
  const tbCount = GROUPS.reduce((n, g) => n + ctx.d.groups[g].tiebreaks.filter(f => f.status !== 'done').length, 0);
  return `<div class="admin-matches">
    <section class="panel admin-list">
      <div class="seg seg--tight">${filters.map(([k, label]) => `<button class="${cx('seg__btn', filter === k && 'is-active')}" data-act="m-filter" data-filter="${k}">${label}${k === 'tb' && tbCount ? `<i class="badge">${tbCount}</i>` : ''}</button>`).join('')}</div>
      ${!ctx.d.drawn && filter !== 'playoffs' ? empty('Draw the groups first.', ICONS.shuffle()) : ''}
      <div class="fx-list admin-list__scroll" data-keep-scroll="admin-list">
        ${list.length ? list.map(f => fixtureLine(ctx, f, { href: `#/admin/matches/${f.id}`, state: false, active: sel?.id === f.id })).join('')
          : filter === 'queue' ? empty('Nothing ready to play.') : filter === 'tb' ? empty('No tie-breakers needed.') : ''}
      </div>
    </section>
    ${sel ? consolePanel(ctx, sel) : `<section class="panel console">${empty('Pick a match on the left to start scoring.', ICONS.controller())}</section>`}
  </div>`;
}

function fixtureFor(ctx: Ctx, el: HTMLElement): Fixture | null {
  const f = ctx.d.byId[el.dataset.id ?? ''];
  if (!f) toast('That match no longer exists', 'bad');
  return f ?? null;
}

/** The stored record for this fixture, or a fresh one when missing/stale. */
function baseRecord(ctx: Ctx, f: Fixture): MatchRecord {
  const rec = ctx.state.matches[f.id];
  const fresh = !rec || rec.a !== f.a || rec.b !== f.b;
  return {
    a: f.a ?? '', b: f.b ?? '',
    games: fresh ? [] : [...f.score.games],
    wo: fresh ? null : rec.wo ?? null,
    live: fresh ? false : rec.live === true,
    station: fresh ? null : rec.station ?? null,
    updatedAt: now(),
  };
}

const saveMatch = (ctx: Ctx, id: string, rec: MatchRecord | null, okMsg?: string) =>
  save(ctx, { [`matches/${id}`]: rec }, okMsg);

actions({
  'm-filter': (el, ctx) => { filter = (el.dataset.filter ?? 'queue') as MatchFilter; ctx.rerender(); },

  'm-char': el => {
    const id = el.dataset.id ?? '';
    const key = el.dataset.side === 'b' ? 'cb' : 'ca';
    charDraft[id] = { ...charDraft[id], [key]: (el as HTMLSelectElement).value };
  },

  'm-station': async (el, ctx) => {
    const f = fixtureFor(ctx, el);
    if (!f) return;
    const station = Number((el as HTMLSelectElement).value) || 1;
    stationDraft[f.id] = station;
    if (f.score.live) await saveMatch(ctx, f.id, { ...baseRecord(ctx, f), station });
  },

  'm-live': async (el, ctx) => {
    const f = fixtureFor(ctx, el);
    if (!f?.a || !f.b) return;
    const on = el.dataset.on === '1';
    const station = stationDraft[f.id] ?? freeStation(ctx, f.id);
    const clash = ctx.d.live.find(x => x.id !== f.id && x.score.station === station);
    if (on && clash && !confirm(`Station ${station} already shows ${clash.label}. Replace it?`)) return;
    const updates: Record<string, unknown> = { [`matches/${f.id}`]: { ...baseRecord(ctx, f), live: on, station: on ? station : null } };
    if (on && clash) updates[`matches/${clash.id}/live`] = false;
    await save(ctx, updates, on ? `${f.short} is live on station ${station}` : `${f.short} taken off stage`, 'info');
  },

  'm-game': async (el, ctx) => {
    const f = fixtureFor(ctx, el);
    if (!f?.a || !f.b || f.score.done) return;
    const side: Side = el.dataset.side === 'b' ? 'b' : 'a';
    const rec = baseRecord(ctx, f);
    const games = [...(rec.games ?? []), { w: side, ca: defaultChar(ctx, f, 'a') || undefined, cb: defaultChar(ctx, f, 'b') || undefined }];
    const need = winsNeeded(f.bestOf);
    const won = games.filter(g => g.w === side).length;
    const done = won >= need;
    delete charDraft[f.id];
    await saveMatch(ctx, f.id, { ...rec, games, live: !done, station: rec.station ?? stationDraft[f.id] ?? freeStation(ctx, f.id) },
      done ? `${ctx.state.players[side === 'a' ? f.a : f.b]?.name} wins ${f.short}!` : undefined);
  },

  'm-undo': async (el, ctx) => {
    const f = fixtureFor(ctx, el);
    if (!f) return;
    const rec = baseRecord(ctx, f);
    if (rec.wo) rec.wo = null;
    else rec.games = (rec.games ?? []).slice(0, -1);
    delete charDraft[f.id];
    await saveMatch(ctx, f.id, rec, 'Last entry undone');
  },

  'm-wo': async (el, ctx) => {
    const f = fixtureFor(ctx, el);
    if (!f?.a || !f.b) return;
    const side: Side = el.dataset.side === 'b' ? 'b' : 'a';
    const winner = ctx.state.players[side === 'a' ? f.a : f.b]?.name;
    if (!confirm(`Award ${f.label} to ${winner} by walkover?`)) return;
    await saveMatch(ctx, f.id, { ...baseRecord(ctx, f), games: [], wo: side, live: false }, `Walkover recorded for ${winner}`);
  },

  'm-clear': async (el, ctx) => {
    const id = el.dataset.id ?? '';
    if (!confirm(el.dataset.force ? 'Delete the stale stored result?' : 'Clear this match result completely?')) return;
    delete charDraft[id];
    await saveMatch(ctx, id, null, 'Result cleared');
  },
});

/* ============================================================
   GROUP DRAW
============================================================ */
const groupResultKeys = (s: BoardState) => Object.keys(s.matches).filter(k => k.startsWith('g-') || k.startsWith('tb-'));

/** Deleting what a new draw would orphan: group + tie-breaker results, decisions, seeds. */
function resetForDraw(s: BoardState): Record<string, unknown> {
  const u: Record<string, unknown> = {};
  for (const k of groupResultKeys(s)) u[`matches/${k}`] = null;
  for (const k of Object.keys(s.decisions)) u[`decisions/${k}`] = null;
  for (const k of Object.keys(s.seeds)) u[`seeds/${k}`] = null;
  return u;
}

function confirmRedraw(ctx: Ctx, what: string): boolean {
  const n = groupResultKeys(ctx.state).length;
  if (!n) return true;
  return confirm(`${what} will DELETE ${plural(n, 'recorded group/tie-breaker result')} and any manual seeds. Continue?`);
}

function drawTab(ctx: Ctx): string {
  const roster = teamRoster(ctx.state);
  const genders = genderIssues(ctx.state);
  const revealing = Date.now() < revealUntil;
  let cellIndex = 0;
  return `<section class="panel">
    ${panelHead('Group Draw', `${ICONS.shuffle()} A &amp; B women · C &amp; D men · one fighter from every team per group`)}
    <div class="toolbar">
      <button class="btn btn--red btn--lg" data-act="draw-random">${ICONS.shuffle()} Draw groups</button>
      <span class="toolbar__spacer"></span>
      <button class="btn btn--ghost btn--sm" data-act="draw-ordered">Fill in roster order</button>
      <button class="btn btn--danger btn--sm" data-act="draw-clear">${ICONS.x()} Clear</button>
    </div>
    ${ctx.d.issues.length
      ? `<div class="alert alert--warn">${ICONS.alert()}<span>${ctx.d.issues.map(esc).join(' · ')}</span></div>`
      : `<div class="alert alert--ok">${ICONS.check()}<span>Valid draw — every group has exactly one fighter from each team.</span></div>`}
    ${genders.length ? `<div class="alert alert--warn">${ICONS.alert()}<span>${genders.map(esc).join(' · ')}. Fix the gender in Roster, then draw again.</span></div>` : ''}
    <p class="fineprint">To adjust by hand, click a fighter, then another fighter <b>from the same team and gender</b> — they swap groups, so neither rule can break.</p>
    <div class="table-wrap">
      <table class="${cx('drawgrid', revealing && 'is-revealing')}">
        <thead><tr><th>Team</th>${GROUPS.map(g => `<th><span class="gletter">${g}</span><span class="drawgrid__gender g-${GROUP_GENDER[g]}">${GENDER_LABEL[GROUP_GENDER[g]]}</span></th>`).join('')}</tr></thead>
        <tbody>
          ${roster.map(({ teamId, players }) => {
            const t = ctx.state.teams[teamId];
            return `<tr style="--team:${t?.color ?? '#555'}">
              <th class="drawgrid__team"><span class="tag tag--lg" style="--team:${t?.color}">${esc(t?.name)}</span></th>
              ${GROUPS.map(g => {
                const pid = players.find(p => ctx.state.players[p]?.group === g);
                const idx = cellIndex++;
                if (!pid) return '<td class="drawgrid__cell is-empty"><span>—</span></td>';
                const p = ctx.state.players[pid];
                return `<td class="drawgrid__cell"><button class="${cx('drawchip', swapPick === pid && 'is-picked', swapPick && swapPick !== pid && ctx.state.players[swapPick]?.team === teamId && ctx.state.players[swapPick]?.gender === p?.gender && 'is-target')}" data-act="draw-pick" data-pid="${pid}" style="--i:${idx}">
                  ${portrait(ctx, pid, 'xs')}<span>${esc(p?.name)}</span><small class="g-${p?.gender}">${p?.gender}</small>
                </button></td>`;
              }).join('')}
            </tr>`;
          }).join('')}
          ${(() => {
            const unassigned = Object.entries(ctx.state.players).filter(([, p]) => !p.group);
            return unassigned.length ? `<tr><th class="drawgrid__team muted">Not drawn</th><td colspan="4">${unassigned.map(([pid, p]) => `<span class="pill">${portrait(ctx, pid, 'xs')} ${esc(p.name)}</span>`).join(' ')}</td></tr>` : '';
          })()}
        </tbody>
      </table>
    </div>
  </section>`;
}

async function applyDraw(ctx: Ctx, assign: Record<string, GroupId | null>, msg: string) {
  const u = resetForDraw(ctx.state);
  for (const pid of Object.keys(ctx.state.players)) u[`players/${pid}/group`] = assign[pid] ?? null;
  swapPick = null;
  await save(ctx, u, msg);
}

actions({
  'draw-random': async (_el, ctx) => {
    if (!confirmRedraw(ctx, 'A new draw')) return;
    revealUntil = Date.now() + 4000;
    await applyDraw(ctx, drawGroups(ctx.state), 'Groups drawn!');
    setTimeout(() => ctx.rerender(), 4100);
  },
  'draw-ordered': async (_el, ctx) => {
    if (!confirmRedraw(ctx, 'Refilling the groups')) return;
    await applyDraw(ctx, orderedGroups(ctx.state), 'Groups filled in roster order');
  },
  'draw-clear': async (_el, ctx) => {
    if (!confirm('Remove every fighter from their group?') || !confirmRedraw(ctx, 'Clearing the groups')) return;
    await applyDraw(ctx, {}, 'Groups cleared');
  },
  'draw-pick': async (el, ctx) => {
    const pid = el.dataset.pid ?? '';
    const p = ctx.state.players[pid];
    const other = swapPick ? ctx.state.players[swapPick] : undefined;
    if (!swapPick || swapPick === pid || !other || other.team !== p?.team || other.gender !== p?.gender) {
      swapPick = swapPick === pid ? null : pid;
      ctx.rerender();
      return;
    }
    const a = swapPick, b = pid;
    const touched = Object.keys(ctx.state.matches).filter(k => k.startsWith('g-') && (k.includes(a) || k.includes(b)));
    if (touched.length && !confirm(`Swapping deletes ${plural(touched.length, 'recorded result')} involving these two fighters. Continue?`)) return;
    const u: Record<string, unknown> = {
      [`players/${a}/group`]: p?.group ?? null,
      [`players/${b}/group`]: other.group ?? null,
    };
    for (const k of touched) u[`matches/${k}`] = null;
    swapPick = null;
    await save(ctx, u, `Swapped ${other.name} ⇄ ${p?.name}`);
  },
});

/* ============================================================
   ROSTER
============================================================ */
function rosterTab(ctx: Ctx): string {
  return `<div class="roster-edit">
    ${teamRoster(ctx.state).map(({ teamId, players }) => {
      const t = ctx.state.teams[teamId];
      if (!t) return '';
      return `<section class="panel team-edit" style="--team:${t.color}">
        <div class="team-edit__head">
          <input class="input input--title" value="${esc(t.name)}" maxlength="32" data-change="team-field" data-tid="${teamId}" data-field="name" aria-label="Team name">
          <input class="input input--color" type="color" value="${esc(t.color)}" data-change="team-field" data-tid="${teamId}" data-field="color" aria-label="Team colour">
        </div>
        ${players.map(pid => {
          const p = ctx.state.players[pid];
          if (!p) return '';
          return `<div class="${cx('player-edit', p.withdrawn && 'is-withdrawn')}">
            <div class="photo-edit">
              <button class="photo-edit__pick" data-act="photo-upload" data-pid="${pid}" title="${p.photo ? 'Change photo' : 'Upload photo'}" aria-label="${p.photo ? 'Change' : 'Upload'} photo for ${esc(p.name)}">
                ${portrait(ctx, pid, 'md')}<span class="photo-edit__cam">${ICONS.camera()}</span>
              </button>
              ${p.photo ? `<button class="photo-edit__rm" data-act="photo-remove" data-pid="${pid}" title="Remove photo" aria-label="Remove photo of ${esc(p.name)}">${ICONS.x()}</button>` : ''}
            </div>
            <input class="input" value="${esc(p.name)}" maxlength="32" data-change="player-field" data-pid="${pid}" data-field="name" aria-label="Player name">
            <div class="seg seg--tiny">
              ${(['M', 'F'] as const).map(gd => `<button class="${cx('seg__btn', p.gender === gd && 'is-active')}" data-act="player-gender" data-pid="${pid}" data-gender="${gd}">${gd}</button>`).join('')}
            </div>
            ${charSelect(p.main ?? '', `data-change="player-field" data-pid="${pid}" data-field="main" aria-label="Main character"`)}
            <label class="check check--sm" title="Withdrawn: remaining matches count as losses"><input type="checkbox" data-change="player-withdrawn" data-pid="${pid}" ${p.withdrawn ? 'checked' : ''}><span>W/D</span></label>
          </div>`;
        }).join('')}
      </section>`;
    }).join('')}
  </div>
  <p class="fineprint">Changes save as soon as you leave a field. Click a portrait to upload that player's photo. <b>W/D</b> = withdrawn (rule 1): unplayed matches become losses, played results stay.</p>`;
}

actions({
  'team-field': async (el, ctx) => {
    const field = el.dataset.field;
    const value = (el as HTMLInputElement).value.trim();
    if (!field || !value) { ctx.rerender(); return; }
    await save(ctx, { [`teams/${el.dataset.tid}/${field}`]: value }, 'Team saved');
  },
  'player-field': async (el, ctx) => {
    const field = el.dataset.field;
    const value = (el as HTMLInputElement).value.trim();
    if (!field || (field === 'name' && !value)) { ctx.rerender(); return; }
    await save(ctx, { [`players/${el.dataset.pid}/${field}`]: value }, field === 'name' ? 'Name saved' : 'Main saved');
  },
  'player-gender': async (el, ctx) => {
    await save(ctx, { [`players/${el.dataset.pid}/gender`]: el.dataset.gender === 'F' ? 'F' : 'M' });
  },
  'player-withdrawn': async (el, ctx) => {
    const input = el as HTMLInputElement;
    const p = ctx.state.players[el.dataset.pid ?? ''];
    const msg = input.checked
      ? `Withdraw ${p?.name}? All their unplayed matches will count as losses.`
      : `Bring ${p?.name} back? Their automatic walkover losses will be removed.`;
    if (!confirm(msg)) { input.checked = !input.checked; return; }
    if (!await save(ctx, { [`players/${el.dataset.pid}/withdrawn`]: input.checked }, input.checked ? `${p?.name} withdrawn` : `${p?.name} reinstated`, 'info')) {
      input.checked = !input.checked;
    }
  },
});

/* ============================================================
   TIES & SEEDS
============================================================ */
function playoffsTab(ctx: Ctx): string {
  const { d } = ctx;
  const ties = GROUPS.flatMap(g => d.groups[g].openTies);
  const placeName = (pid: string) => {
    const p = ctx.state.players[pid];
    const row = p?.group ? d.groups[p.group].rows.find(r => r.id === pid) : undefined;
    return `${p?.name ?? pid}${row ? ` (${p?.group}${row.place})` : ''}`;
  };

  const groupStatus = `<div class="gstatus">${GROUPS.map(g => {
    const r = d.groups[g];
    const tone = r.settled ? 'ok' : r.complete ? 'warn' : 'wait';
    const text = r.settled ? 'Settled' : r.complete ? 'Tie to resolve' : `${r.played}/${r.total} played`;
    return `<a class="gstatus__item is-${tone}" href="#/groups/${g}"><span class="gletter">${g}</span><span>${text}</span></a>`;
  }).join('')}</div>`;

  const tiesHtml = ties.length ? ties.map(t => {
    if (t.stage === 'tiebreak') {
      const fx = d.groups[t.group].tiebreaks.filter(f => t.ids.includes(f.a ?? '') && t.ids.includes(f.b ?? ''));
      return `<div class="tie-card">
        <div class="tie-card__head">${ICONS.alert()} Group ${t.group} · place ${t.place} · BO1 tie-breaker</div>
        <div class="fx-list">${fx.map(f => fixtureLine(ctx, f, { href: `#/admin/matches/${f.id}` })).join('')}</div>
      </div>`;
    }
    const order = (orderDraft[t.key] ?? t.ids).filter(id => t.ids.includes(id));
    return `<div class="tie-card tie-card--decision">
      <div class="tie-card__head">${ICONS.alert()} Group ${t.group} · place ${t.place} · still level after tie-breakers</div>
      <p class="fineprint">Hold the organiser's extra BO1 (rule 7), then set the final order:</p>
      <ol class="order">${order.map((pid, i) => `<li>
        <span class="order__pos">${t.place + i}</span>${portrait(ctx, pid, 'xs')}<span class="order__name">${playerName(ctx, pid)}</span>
        <button class="btn btn--icon" data-act="tie-move" data-key="${t.key}" data-ids="${t.ids.join(',')}" data-pid="${pid}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${ICONS.arrowUp()}</button>
        <button class="btn btn--icon" data-act="tie-move" data-key="${t.key}" data-ids="${t.ids.join(',')}" data-pid="${pid}" data-dir="1" ${i === order.length - 1 ? 'disabled' : ''} aria-label="Move down">${ICONS.arrowDown()}</button>
      </li>`).join('')}</ol>
      <button class="btn btn--red" data-act="tie-confirm" data-key="${t.key}" data-ids="${t.ids.join(',')}">${ICONS.check()} Confirm order</button>
    </div>`;
  }).join('') : empty('No open ties. 🎉', ICONS.check());

  const decisions = Object.entries(ctx.state.decisions);
  const seedOptions = (slot: SeedSlot) => {
    const g = slot[0] as GroupId;
    const auto = d.bracket.seedSource[slot] === 'manual' ? null : d.bracket.seeds[slot];
    const manual = ctx.state.seeds[slot];
    const ids = [...d.groups[g].rows.map(r => r.id), ...Object.keys(ctx.state.players).filter(pid => ctx.state.players[pid]?.group !== g)];
    return `<label class="field seed-edit"><span><b>${slot}</b> · ${seedHint(slot)}</span>
      <select class="input" data-change="seed-set" data-slot="${slot}">
        <option value="">Auto${auto ? ` — ${esc(ctx.state.players[auto]?.name)}` : ' — pending'}</option>
        ${ids.map(pid => `<option value="${pid}"${manual === pid ? ' selected' : ''}>${esc(placeName(pid))}</option>`).join('')}
      </select></label>`;
  };

  return `<div class="split">
    <div class="stack">
      <section class="panel">
        ${panelHead('Group Status', `${ICONS.groups()} All four must settle`)}
        ${groupStatus}
      </section>
      <section class="panel">
        ${panelHead('Open Ties', `${ICONS.alert()} Rules §6–7`)}
        ${tiesHtml}
        ${decisions.length ? `<div class="decisions"><h3 class="subhead">Recorded organiser decisions</h3>${decisions.map(([k, ids]) => `<div class="decision">
          <span>Group ${esc(k[0])}: ${ids.map(id => esc(ctx.state.players[id]?.name ?? id)).join(' › ')}</span>
          <button class="btn btn--ghost btn--sm" data-act="tie-remove" data-key="${esc(k)}">${ICONS.x()} Remove</button>
        </div>`).join('')}</div>` : ''}
      </section>
    </div>
    <section class="panel">
      ${panelHead('Playoff Seeds', `${ICONS.bracket()} Auto from groups · override if needed`)}
      <div class="seed-grid">${SEED_SLOTS.map(seedOptions).join('')}</div>
      <p class="fineprint">Leave on <b>Auto</b> to follow the group results. Override only for an organiser ruling (e.g. a disqualification).</p>
      <div class="toolbar">
        <button class="btn btn--ghost btn--sm" data-act="seed-auto" ${Object.keys(ctx.state.seeds).length ? '' : 'disabled'}>Reset all to auto</button>
        <span class="toolbar__spacer"></span>
        <button class="btn btn--danger btn--sm" data-act="po-clear" ${Object.keys(ctx.state.matches).some(k => k.startsWith('po-')) ? '' : 'disabled'}>${ICONS.x()} Clear playoff results</button>
      </div>
    </section>
  </div>`;
}

actions({
  'tie-move': (el, ctx) => {
    const key = el.dataset.key ?? '';
    const ids = (el.dataset.ids ?? '').split(',');
    const order = [...(orderDraft[key] ?? ids)];
    const i = order.indexOf(el.dataset.pid ?? '');
    const j = i + Number(el.dataset.dir);
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j] as string, order[i] as string];
    orderDraft[key] = order;
    ctx.rerender();
  },
  'tie-confirm': async (el, ctx) => {
    const key = el.dataset.key ?? '';
    const order = orderDraft[key] ?? (el.dataset.ids ?? '').split(',');
    if (!confirm(`Confirm final order: ${order.map(id => ctx.state.players[id]?.name).join(' › ')}?`)) return;
    if (await save(ctx, { [`decisions/${key}`]: order }, 'Organiser decision saved')) delete orderDraft[key];
  },
  'tie-remove': async (el, ctx) => {
    if (!confirm('Remove this organiser decision?')) return;
    await save(ctx, { [`decisions/${el.dataset.key}`]: null }, 'Decision removed', 'info');
  },
  'seed-set': async (el, ctx) => {
    const slot = el.dataset.slot ?? '';
    const value = (el as HTMLSelectElement).value;
    if (ctx.d.bracket.started && !confirm('The playoffs have started. Changing a seed can invalidate played matches. Continue?')) { ctx.rerender(); return; }
    await save(ctx, { [`seeds/${slot}`]: value || null }, value ? `${slot} set manually` : `${slot} back to auto`);
  },
  'seed-auto': async (_el, ctx) => {
    if (!confirm('Put every playoff slot back on automatic?')) return;
    await save(ctx, Object.fromEntries(Object.keys(ctx.state.seeds).map(k => [`seeds/${k}`, null])), 'All seeds back to auto', 'info');
  },
  'po-clear': async (_el, ctx) => {
    if (!confirm('Delete every playoff match result?')) return;
    await save(ctx, Object.fromEntries(Object.keys(ctx.state.matches).filter(k => k.startsWith('po-')).map(k => [`matches/${k}`, null])), 'Playoff results cleared');
  },
});

/* ============================================================
   SETTINGS
============================================================ */
function settingsTab(ctx: Ctx): string {
  const mode = ctx.store.mode();
  return `<div class="split">
    <div class="stack">
      <section class="panel">
        ${panelHead('Event', `${ICONS.gear()} Basics`)}
        <label class="field"><span>Tournament title</span>
          <input class="input" value="${esc(ctx.state.meta.title)}" maxlength="48" data-change="meta-title"></label>
        <label class="field"><span>Stations (consoles on the floor)</span>
          <select class="input" data-change="meta-stations">${Array.from({ length: MAX_STATIONS }, (_, i) => `<option${i + 1 === ctx.state.meta.stations ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label>
      </section>
      <section class="panel">
        ${panelHead('Live Stream', `${ICONS.play()} YouTube · shows in Arena → Now Playing`)}
        <p class="fineprint" style="margin:0 0 12px">Paste the YouTube link of each station you stream — only fill the stations that have a camera or capture. Every screen shows it right away. Unlisted streams work. Video starts muted (a browser rule); viewers can unmute.</p>
        ${Array.from({ length: ctx.state.meta.stations }, (_, i) => i + 1).map(n => {
          const url = ctx.state.meta.streams[`s${n}`] ?? '';
          return `<div class="field">
            <span>Station ${n}</span>
            <div class="stream-input">
              <input class="input" type="url" value="${esc(url)}" placeholder="https://www.youtube.com/live/…" data-change="stream-set" data-station="${n}" aria-label="Station ${n} YouTube link">
              ${url ? `<button class="btn btn--ghost btn--sm" data-act="stream-clear" data-station="${n}">${ICONS.x()} Remove</button>` : ''}
            </div>
            ${url ? `<small class="${youtubeEmbed(url) ? 'stream-ok' : 'stream-bad'}">${youtubeEmbed(url) ? `${ICONS.check()} Showing on the Arena page` : `${ICONS.alert()} Not a YouTube video or live link`}</small>` : ''}
          </div>`;
        }).join('')}
      </section>
      <section class="panel">
        ${panelHead('Connection', `<span class="sync sync--${mode}"><i></i>${mode}</span>`)}
        <dl class="kv">
          <dt>Supabase row</dt><dd><code>public.tournaments · ${esc(TEKKEN_BOARD_ID)}</code></dd>
          <dt>Supabase</dt><dd>${ctx.online ? 'Configured' : 'Not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)'}</dd>
          <dt>Signed in</dt><dd>${ctx.email ? esc(ctx.email) : '—'}</dd>
        </dl>
        ${mode === 'local' ? '<div class="alert alert--warn">' + ICONS.alert() + '<span>LOCAL mode: changes are saved in this browser only. Other screens will not see them.</span></div>' : ''}
        ${ctx.email ? `<div class="toolbar"><button class="btn btn--ghost" data-act="admin-signout">${ICONS.lock()} Sign out</button></div>` : ''}
      </section>
    </div>
    <div class="stack">
      <section class="panel">
        ${panelHead('Rehearsal', `${ICONS.play()} Try the whole cup`)}
        <p class="fineprint">Fills every match that can be played right now with random results. Press repeatedly to walk through groups → tie-breakers → playoffs. <b>Use it on a rehearsal board</b> (set <code>VITE_TEKKEN_TOURNAMENT_ID</code>) or clear results afterwards.</p>
        <div class="toolbar">
          <button class="btn btn--red" data-act="sim-step" ${ctx.d.drawn ? '' : 'disabled title="Draw groups first"'}>${ICONS.play()} Simulate next step</button>
          <button class="btn btn--danger btn--sm" data-act="results-clear">${ICONS.x()} Clear all results</button>
        </div>
      </section>
      <section class="panel">
        ${panelHead('Backup', `${ICONS.download()} JSON`)}
        <div class="toolbar">
          <button class="btn btn--ghost" data-act="backup-download">${ICONS.download()} Download backup</button>
          <label class="btn btn--ghost">${ICONS.upload()} Restore from file<input type="file" accept="application/json" data-change="backup-restore" hidden></label>
        </div>
      </section>
      <section class="panel panel--danger">
        ${panelHead('Danger Zone')}
        <p class="fineprint">Resets names, teams, groups and every result to the blank template.</p>
        <button class="btn btn--danger" data-act="board-reset">${ICONS.alert()} Reset entire board</button>
      </section>
    </div>
  </div>`;
}

actions({
  'meta-title': async (el, ctx) => {
    const v = (el as HTMLInputElement).value.trim();
    if (!v) { ctx.rerender(); return; }
    await save(ctx, { 'meta/title': v }, 'Title saved');
  },
  'stream-set': async (el, ctx) => {
    const n = el.dataset.station;
    const url = (el as HTMLInputElement).value.trim();
    if (url && !youtubeEmbed(url)) {
      toast('That is not a YouTube link. Use the link from the Share button of the stream.', 'bad');
      ctx.rerender();
      return;
    }
    await save(ctx, { [`meta/streams/s${n}`]: url || null }, url ? `Station ${n} stream is on the Arena page` : `Station ${n} stream removed`);
  },
  'stream-clear': async (el, ctx) => {
    await save(ctx, { [`meta/streams/s${el.dataset.station}`]: null }, `Station ${el.dataset.station} stream removed`, 'info');
  },
  'meta-stations': async (el, ctx) => {
    await save(ctx, { 'meta/stations': Number((el as HTMLSelectElement).value) || 1 });
  },
  'admin-signout': async (_el, ctx) => { await ctx.store.signOut(); toast('Signed out', 'info'); },
  'sim-step': async (_el, ctx) => {
    if (ctx.online && !confirm(`This writes random results to board "${TEKKEN_BOARD_ID}" that every screen sees. Continue?`)) return;
    const u = simulateStep(ctx.state, ctx.d);
    if (!Object.keys(u).length) { toast('Nothing left to simulate', 'info'); return; }
    await save(ctx, u, `Simulated ${plural(Object.keys(u).length, 'entry', 'entries')}`, 'info');
  },
  'results-clear': async (_el, ctx) => {
    if (!confirm('Delete ALL match results, tie decisions and manual seeds? Roster and groups stay.')) return;
    const u: Record<string, unknown> = {};
    for (const k of Object.keys(ctx.state.matches)) u[`matches/${k}`] = null;
    for (const k of Object.keys(ctx.state.decisions)) u[`decisions/${k}`] = null;
    for (const k of Object.keys(ctx.state.seeds)) u[`seeds/${k}`] = null;
    await save(ctx, u, 'All results cleared');
  },
  'backup-download': (_el, ctx) => {
    const blob = new Blob([JSON.stringify(ctx.state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${TEKKEN_BOARD_ID}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'backup-restore': async (el, ctx) => {
    const input = el as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const next = normalize(JSON.parse(await file.text()));
      if (!next) { toast('That file is not a Tekken Cup board', 'bad'); return; }
      if (!confirm(`Replace the whole board with "${file.name}"?`)) return;
      const res = await ctx.store.replace(await uploadInlinePhotos(ctx, next));
      toast(res.ok ? 'Board restored' : res.error ?? 'Not saved', res.ok ? 'ok' : 'bad');
    } catch {
      toast('Could not read that file', 'bad');
    }
  },
  'board-reset': async (_el, ctx) => {
    if (prompt('Type RESET to wipe the entire board') !== 'RESET') return;
    const res = await ctx.store.replace(blankState());
    toast(res.ok ? 'Board reset' : res.error ?? 'Not saved', res.ok ? 'info' : 'bad');
  },
});

/* ============================================================
   VIEW
============================================================ */
function signInScreen(): string {
  return `<section class="lock">
    <form class="lock__card" data-submit="admin-signin">
      ${EMBLEM}
      <h1 class="lock__title">Organiser Access</h1>
      <p class="muted">Sign in with your DDAM ESPORT CUP admin account to score matches and manage the Tekken cup.</p>
      <input class="input" type="email" name="email" placeholder="Email" autocomplete="username" required aria-label="Email">
      <input class="input" type="password" name="password" placeholder="Password" autocomplete="current-password" required aria-label="Password">
      <p class="lock__error" hidden></p>
      <button class="btn btn--red btn--lg" type="submit">${ICONS.unlock()} Sign in</button>
    </form>
  </section>`;
}

actions({
  'admin-signin': async (el, ctx, ev) => {
    ev.preventDefault();
    const form = el as HTMLFormElement;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
    const error = form.querySelector<HTMLElement>('.lock__error');
    if (button) button.disabled = true;
    const message = await ctx.store.signIn(field('email').trim(), field('password'));
    if (button) button.disabled = false;
    if (message && error) { error.textContent = message; error.hidden = false; return; }
    toast('Signed in');
  },
});

/** A restored backup may carry photos inline; online they belong in Supabase Storage. */
async function uploadInlinePhotos(ctx: Ctx, next: BoardState): Promise<BoardState> {
  if (!ctx.supabase) return next;
  for (const [pid, p] of Object.entries(next.players)) {
    if (!p.photo?.startsWith('data:')) continue;
    try { p.photo = await storePhoto(ctx.supabase, pid, p.photo); } catch { delete p.photo; }
  }
  return next;
}

export const adminView: View = {
  title: () => 'Admin',
  render(ctx) {
    if (!ctx.admin) return signInScreen();
    const tab = tabOf(ctx);
    const body = { matches: matchesTab, draw: drawTab, roster: rosterTab, playoffs: playoffsTab, settings: settingsTab }[tab](ctx);
    const liveCount = ctx.d.live.length;
    return `
    <header class="page-head page-head--admin">
      <div><p class="page-head__kicker">${ICONS.unlock()} Organiser</p><h1 class="page-head__title">Admin</h1></div>
      <nav class="seg seg--admin">${TABS.map(([t, label, icon]) => `<a class="${cx('seg__btn', tab === t && 'is-active')}" href="#/admin/${t}">${icon()}<span>${label}</span>${t === 'matches' && liveCount ? `<i class="badge badge--live">${liveCount}</i>` : ''}${t === 'playoffs' && GROUPS.some(g => ctx.d.groups[g].openTies.length) ? '<i class="badge">!</i>' : ''}</a>`).join('')}</nav>
    </header>
    ${body}`;
  },
  after(root) {
    root.querySelector<HTMLInputElement>('.lock__card input[name=email]')?.focus();
  },
};

