import { describe, expect, it } from 'vitest';
import type { BoardState, Game, GroupId, Side } from '../src/tekken/engine/types';
import { applyPatch, blankState, normalize } from '../src/tekken/engine/state';
import { groupMatchId, orderedPair } from '../src/tekken/engine/match';
import { computeGroup, groupMembers, roundRobin, tieKey } from '../src/tekken/engine/groups';
import { drawGroups, drawIssues, genderIssues, orderedGroups } from '../src/tekken/engine/draw';
import { GROUP_GENDER, GROUPS } from '../src/tekken/engine/format';
import { derive } from '../src/tekken/engine/tournament';
import { playoffMatchId, type PlayoffSlot } from '../src/tekken/engine/playoffs';
import { simulateStep } from '../src/tekken/engine/simulate';

/* ---------- helpers ---------- */
function drawnState(): BoardState {
  const s = blankState();
  for (const [pid, g] of Object.entries(orderedGroups(s))) s.players[pid]!.group = g;
  return s;
}

function games(wa: number, wb: number): Game[] {
  const out: Game[] = [];
  // alternate so the score is reached naturally; the winner takes the last game
  const winner: Side = wa > wb ? 'a' : 'b';
  const loserWins = Math.min(wa, wb);
  for (let i = 0; i < loserWins; i++) out.push({ w: winner === 'a' ? 'b' : 'a' });
  for (let i = 0; i < Math.max(wa, wb); i++) out.push({ w: winner });
  return out;
}

/** Record `winner` beating `loser` with `loserGames` games for the loser (BO3 group match). */
function result(s: BoardState, winner: string, loser: string, loserGames = 0) {
  const [a, b] = orderedPair(winner, loser);
  const wa = winner === a ? 2 : loserGames;
  const wb = winner === a ? loserGames : 2;
  s.matches[groupMatchId(winner, loser)] = { a, b, games: games(wa, wb), updatedAt: '2026-01-01T00:00:00Z' };
}

const A = (s: BoardState) => groupMembers(s, 'A') as [string, string, string, string, string, string];

/** Seat order i beats seat order j whenever i < j — a clean, tie-free group. */
function strictGroup(s: BoardState, g: GroupId) {
  const m = groupMembers(s, g);
  for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) result(s, m[i]!, m[j]!);
}

/* ---------- tests ---------- */
describe('round robin', () => {
  it('gives 6 players 5 rounds of 3 with every pair exactly once', () => {
    const rounds = roundRobin(['1', '2', '3', '4', '5', '6']);
    expect(rounds).toHaveLength(5);
    const seen = new Set<string>();
    for (const r of rounds) {
      expect(r).toHaveLength(3);
      expect(new Set(r.flat()).size).toBe(6);
      for (const [x, y] of r) seen.add([x, y].sort().join());
    }
    expect(seen.size).toBe(15);
  });
});

describe('group draw', () => {
  it('puts women in A/B, men in C/D, exactly one player per team in each group', () => {
    for (let i = 0; i < 50; i++) {
      const s = blankState();
      for (const [pid, g] of Object.entries(drawGroups(s))) s.players[pid]!.group = g;
      expect(drawIssues(s)).toEqual([]);
      expect(genderIssues(s)).toEqual([]);
      for (const g of GROUPS) {
        const inGroup = Object.values(s.players).filter(p => p.group === g);
        expect(inGroup).toHaveLength(6);
        expect(inGroup.every(p => p.gender === GROUP_GENDER[g])).toBe(true);
      }
    }
    const ordered = drawnState();
    expect(genderIssues(ordered)).toEqual([]);
    expect(ordered.players.p03!.group).toBe('A');   // team 1's first woman
    expect(ordered.players.p01!.group).toBe('C');   // team 1's first man
  });

  it('reports a group with two players from one team, and gender mismatches as warnings', () => {
    const s = drawnState();
    const [w1, w2] = ['p03', 'p04'];
    s.players[w1]!.group = 'B';
    s.players[w2]!.group = 'A';  // same team, same gender, swapped: still valid
    expect(drawIssues(s)).toEqual([]);
    expect(genderIssues(s)).toEqual([]);
    s.players.p07!.group = 'B';  // team 2 now has two women in B, none in A
    expect(drawIssues(s).join()).toMatch(/two players/);

    const g = drawnState();
    g.players.p01!.gender = 'F';  // a man in Group C now marked as a woman
    expect(drawIssues(g)).toEqual([]);                 // groups still stand
    expect(genderIssues(g).join()).toMatch(/3 women and 1 men.*Group C/);
  });
});

describe('group standings', () => {
  it('ranks a clean group and marks upper / lower / out', () => {
    const s = drawnState();
    strictGroup(s, 'A');
    const g = computeGroup(s, 'A');
    const m = A(s);
    expect(g.complete).toBe(true);
    expect(g.settled).toBe(true);
    expect(g.rows.map(r => r.id)).toEqual(m);
    expect(g.rows.map(r => r.status)).toEqual(['upper', 'lower', 'out', 'out', 'out', 'out']);
    expect(g.rows[0]).toMatchObject({ w: 5, l: 0, gw: 10, gl: 0, diff: 10 });
  });

  it('breaks a two-way points tie by head-to-head', () => {
    const s = drawnState();
    const [p1, p2, p3, p4, p5, p6] = A(s);
    result(s, p1, p2); result(s, p1, p4); result(s, p1, p5); result(s, p1, p6); result(s, p3, p1);
    result(s, p2, p3); result(s, p2, p4); result(s, p2, p5); result(s, p2, p6);
    result(s, p4, p3); result(s, p5, p3); result(s, p6, p3);
    result(s, p4, p5); result(s, p5, p6); result(s, p6, p4);
    const g = computeGroup(s, 'A');
    expect(g.rows[0]).toMatchObject({ id: p1, status: 'upper', decidedBy: 'Head-to-head' });
    expect(g.rows[1]).toMatchObject({ id: p2, status: 'lower', decidedBy: 'Head-to-head' });
    // p4/p5/p6 share 3rd on everything, but it does not decide a playoff spot
    expect(g.rows.slice(2, 5).every(r => r.tied && r.place === 3 && r.status === 'out')).toBe(true);
    expect(g.openTies).toEqual([]);
    expect(g.settled).toBe(true);
  });

  it('breaks a three-way tie by game differential (no head-to-head for 3+)', () => {
    const s = drawnState();
    const [p1, p2, p3, p4, p5, p6] = A(s);
    result(s, p1, p2, 1); result(s, p2, p3); result(s, p3, p1);
    for (const top of [p1, p2, p3]) for (const low of [p4, p5, p6]) result(s, top, low);
    result(s, p4, p5); result(s, p5, p6); result(s, p6, p4);
    const g = computeGroup(s, 'A');
    expect(g.rows.slice(0, 3).map(r => r.id)).toEqual([p2, p3, p1]);
    expect(g.rows.slice(0, 3).map(r => r.diff)).toEqual([7, 6, 5]);
    expect(g.rows[0]!.decidedBy).toBe('Game differential');
    expect(g.settled).toBe(true);
  });

  it('demands BO1 tie-breakers, then an organiser decision, for a dead-even top tie', () => {
    const s = drawnState();
    const [p1, p2, p3, p4, p5, p6] = A(s);
    result(s, p1, p2); result(s, p2, p3); result(s, p3, p1);
    for (const top of [p1, p2, p3]) for (const low of [p4, p5, p6]) result(s, top, low);
    result(s, p4, p5); result(s, p5, p6); result(s, p6, p4);

    let g = computeGroup(s, 'A');
    expect(g.settled).toBe(false);
    expect(g.openTies).toEqual([{ key: tieKey('A', [p1, p2, p3]), group: 'A', ids: [p1, p2, p3], place: 1, stage: 'tiebreak' }]);
    expect(g.tiebreaks).toHaveLength(3);
    expect(g.tiebreaks.every(f => f.bestOf === 1)).toBe(true);
    expect(g.rows.slice(0, 3).every(r => r.status === null)).toBe(true);

    // tie-breakers go round in a circle again → still level → organiser decides
    const tbWin = (w: string, l: string) => {
      const f = g.tiebreaks.find(t => [t.a, t.b].includes(w) && [t.a, t.b].includes(l))!;
      s.matches[f.id] = { a: f.a!, b: f.b!, games: [{ w: f.a === w ? 'a' : 'b' }] };
    };
    tbWin(p1, p2); tbWin(p2, p3); tbWin(p3, p1);
    g = computeGroup(s, 'A');
    expect(g.openTies[0]?.stage).toBe('decision');

    s.decisions[tieKey('A', [p1, p2, p3])] = [p3, p1, p2];
    g = computeGroup(s, 'A');
    expect(g.settled).toBe(true);
    expect(g.rows.slice(0, 3).map(r => [r.id, r.status])).toEqual([[p3, 'upper'], [p1, 'lower'], [p2, 'out']]);
  });

  it('resolves a tie-breaker round robin by most TB wins', () => {
    const s = drawnState();
    const [p1, p2, p3, p4, p5, p6] = A(s);
    result(s, p1, p2); result(s, p2, p3); result(s, p3, p1);
    for (const top of [p1, p2, p3]) for (const low of [p4, p5, p6]) result(s, top, low);
    result(s, p4, p5); result(s, p5, p6); result(s, p6, p4);
    const tb = computeGroup(s, 'A').tiebreaks;
    const tbWin = (w: string, l: string) => {
      const f = tb.find(t => [t.a, t.b].includes(w) && [t.a, t.b].includes(l))!;
      s.matches[f.id] = { a: f.a!, b: f.b!, games: [{ w: f.a === w ? 'a' : 'b' }] };
    };
    tbWin(p2, p1); tbWin(p2, p3); tbWin(p3, p1);
    const g = computeGroup(s, 'A');
    expect(g.rows.slice(0, 3).map(r => r.id)).toEqual([p2, p3, p1]);
    expect(g.rows[0]!.decidedBy).toBe('Tie-breaker match');
    expect(g.settled).toBe(true);
  });

  it('counts a withdrawn player\'s unplayed matches as losses but keeps played results', () => {
    const s = drawnState();
    const [p1, p2] = A(s);
    result(s, p1, p2, 1);
    s.players[p1]!.withdrawn = true;
    const g = computeGroup(s, 'A');
    const r1 = g.rows.find(r => r.id === p1)!;
    expect(r1).toMatchObject({ played: 5, w: 1, l: 4 });
    const auto = g.fixtures.filter(f => f.score.auto);
    expect(auto).toHaveLength(4);
    expect(auto.every(f => f.score.loser === p1)).toBe(true);
  });

  it('ignores a stored result whose players no longer match the fixture', () => {
    const s = drawnState();
    const [p1, p2] = A(s);
    s.matches[groupMatchId(p1, p2)] = { a: 'p99', b: p2, games: games(2, 0) };
    const f = computeGroup(s, 'A').fixtures.find(x => x.id === groupMatchId(p1, p2))!;
    expect(f.score.stale).toBe(true);
    expect(f.status).toBe('ready');
  });
});

describe('playoffs', () => {
  function settled(): BoardState {
    const s = drawnState();
    for (const g of GROUPS) strictGroup(s, g);
    return s;
  }
  const play = (s: BoardState, slot: PlayoffSlot, w: Side) => {
    const f = derive(s).bracket.fixtures[slot];
    expect(f.status).toBe('ready');
    const need = f.bestOf === 5 ? 3 : 2;
    s.matches[playoffMatchId(slot)] = { a: f.a!, b: f.b!, games: Array.from({ length: need }, () => ({ w })) };
  };

  it('seeds GSL-style crossover and runs a bracket reset', () => {
    const s = settled();
    const d0 = derive(s);
    const seed = (g: GroupId, i: number) => groupMembers(s, g)[i]!;
    expect(d0.stage.key).toBe('playoffs');
    expect([d0.bracket.fixtures.WSF1.a, d0.bracket.fixtures.WSF1.b]).toEqual([seed('A', 0), seed('B', 0)]);
    expect([d0.bracket.fixtures.LR1A.a, d0.bracket.fixtures.LR1A.b]).toEqual([seed('C', 1), seed('D', 1)]);
    expect(d0.bracket.fixtures.LR2A.status).toBe('waiting');

    for (const slot of ['WSF1', 'WSF2', 'LR1A', 'LR1B', 'LR2A', 'LR2B', 'WF', 'LR3'] as const) play(s, slot, 'a');
    // LR2A = loser of WSF1 (B1) vs winner of LR1A (C2): different groups
    const lr2a = derive(s).bracket.fixtures.LR2A;
    expect([lr2a.a, lr2a.b]).toEqual([seed('B', 0), seed('C', 1)]);

    play(s, 'LF', 'b');     // B1 comes through the lower bracket
    play(s, 'GF', 'b');     // and beats A1 → reset
    let d = derive(s);
    expect(d.bracket.resetNeeded).toBe(true);
    expect(d.bracket.champion).toBeNull();
    expect(d.bracket.fixtures.GF2.status).toBe('ready');

    play(s, 'GF2', 'a');
    d = derive(s);
    expect(d.bracket.champion).toBe(seed('A', 0));
    expect(d.stage.key).toBe('finished');
    expect(d.bracket.placements.map(p => [p.place, p.id])).toEqual([
      ['1', seed('A', 0)], ['2', seed('B', 0)], ['3', seed('C', 0)], ['4', seed('D', 0)],
      ['5–6', seed('C', 1)], ['5–6', seed('A', 1)], ['7–8', seed('D', 1)], ['7–8', seed('B', 1)],
    ]);
    expect(d.players[seed('A', 0)]!.finish).toBe('Champion');
  });

  it('ends without a reset when the upper-bracket finalist wins', () => {
    const s = settled();
    for (const slot of ['WSF1', 'WSF2', 'LR1A', 'LR1B', 'LR2A', 'LR2B', 'WF', 'LR3', 'LF', 'GF'] as const) play(s, slot, 'a');
    const d = derive(s);
    expect(d.bracket.resetNeeded).toBe(false);
    expect(d.bracket.fixtures.GF2.status).toBe('skipped');
    expect(d.bracket.champion).toBe(groupMembers(s, 'A')[0]);
  });

  it('honours a manual seed override', () => {
    const s = settled();
    const other = groupMembers(s, 'A')[2]!;
    s.seeds.A1 = other;
    const d = derive(s);
    expect(d.bracket.fixtures.WSF1.a).toBe(other);
    expect(d.bracket.seedSource.A1).toBe('manual');
  });
});

describe('rehearsal simulation', () => {
  it('can play a whole cup from an empty draw to a champion', () => {
    let s = drawnState();
    for (let step = 0; step < 40; step++) {
      const d = derive(s);
      if (d.bracket.champion) break;
      s = applyPatch(s, simulateStep(s, d));
    }
    expect(derive(s).bracket.champion).not.toBeNull();
  });
});

describe('state', () => {
  it('normalises stored snapshots and applies path patches', () => {
    const s = drawnState();
    const raw = JSON.parse(JSON.stringify(s));
    raw.matches['g-p01-p05'] = { a: 'p01', b: 'p05', games: { 0: { w: 'a' }, 1: { w: 'a' } } };
    const n = normalize(raw)!;
    expect(n.matches['g-p01-p05']!.games).toHaveLength(2);
    const p = applyPatch(n, { 'players/p01/name': 'Bat', 'matches/g-p01-p05': null });
    expect(p.players.p01!.name).toBe('Bat');
    expect(p.matches['g-p01-p05']).toBeUndefined();
    expect(n.players.p01!.name).not.toBe('Bat');
    expect(normalize({ teams: {} })).toBeNull();

    raw.players.p01.photo = 'data:image/webp;base64,AAAA';
    raw.players.p02.photo = 'https://xyz.supabase.co/storage/v1/object/public/tekken-photos/b/p02-1.webp';
    raw.players.p03.photo = 'http://insecure.example.com/p03.jpg';
    raw.players.p04.photo = 'javascript:alert(1)';
    const withPhotos = normalize(raw)!;
    expect(withPhotos.players.p01!.photo).toBe('data:image/webp;base64,AAAA');
    expect(withPhotos.players.p02!.photo).toMatch(/^https:\/\/xyz\.supabase\.co\//);
    expect(withPhotos.players.p03!.photo).toBeUndefined();
    expect(withPhotos.players.p04!.photo).toBeUndefined();
  });
});

describe('youtube links', () => {
  it('turns the links YouTube hands out into embeds, and rejects the rest', async () => {
    const { youtubeEmbed } = await import('../src/tekken/ui/streams');
    const id = 'jfKfPfyJRdk';
    for (const link of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=30s`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/live/${id}?feature=share`,
      `https://m.youtube.com/live/${id}`,
      `https://www.youtube.com/embed/${id}`,
    ]) expect(youtubeEmbed(link)).toBe(`https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0`);
    expect(youtubeEmbed('https://www.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow/live'))
      .toBe('https://www.youtube.com/embed/live_stream?channel=UCSJ4gkVC6NrvII8umztf0Ow&autoplay=1&mute=1&playsinline=1&rel=0');
    for (const bad of ['', 'not a url', 'https://www.twitch.tv/somebody', 'https://www.youtube.com/@ddam/live', 'https://youtu.be/short']) {
      expect(youtubeEmbed(bad)).toBeNull();
    }
  });
});
