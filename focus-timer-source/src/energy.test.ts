import { describe, expect, it } from 'vitest';
import { BLOCKS, BLOCK_SECONDS, blockFills, fmtLeft, drainedSeconds, leftSeconds, liveFocusSeconds, startOfToday, canStart } from './energy';
import type { Session, TimerState } from './state';

const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();
const NOW = at(2026, 10, 15, 12, 0, 0);

const session = (over: Partial<Session> = {}): Session => ({
  id: 'x', title: '', tagId: null, startedAt: at(2026, 10, 15, 9), endedAt: at(2026, 10, 15, 9, 25),
  plannedSeconds: 1500, actualSeconds: 1500, interruptions: [], completed: true, phaseType: 'focus',
  createdManually: false, clockChanged: false, ...over,
});
const DEFAULT_TIMER: TimerState = {
  phase: 'focus', status: 'ready', phaseStartedAt: null, phaseEndsAt: null, pausedAt: null,
  plannedSeconds: 1500, cycleIndex: 0, activeTagId: null, title: '', commitment: false,
  interruptions: [], clockChanged: false,
};
const running = (over: Partial<TimerState> = {}): TimerState => ({
  ...DEFAULT_TIMER, phase: 'focus', status: 'running', phaseStartedAt: NOW - 600_000, phaseEndsAt: NOW + 900_000, ...over,
});

describe('constants', () => {
  it('has 4 blocks of one hour', () => {
    expect(BLOCKS).toBe(4);
    expect(BLOCK_SECONDS).toBe(3600);
  });
});

describe('startOfToday', () => {
  it('returns local midnight', () => {
    expect(startOfToday(at(2026, 10, 15, 23, 59, 59))).toBe(at(2026, 10, 15));
    expect(startOfToday(at(2026, 10, 15, 0, 0, 0))).toBe(at(2026, 10, 15));
  });
});

describe('drainedSeconds', () => {
  it('is 0 for an empty list', () => {
    expect(drainedSeconds([], 0, NOW)).toBe(0);
  });
  it('sums actualSeconds of today sessions', () => {
    const list = [session({ actualSeconds: 1500 }), session({ id: 'y', actualSeconds: 600 })];
    expect(drainedSeconds(list, 0, NOW)).toBe(2100);
  });
  it('ignores sessions that started on another day', () => {
    const list = [session({ startedAt: at(2026, 10, 14, 23, 59) }), session({ id: 'z', startedAt: at(2026, 10, 16, 0, 0) })];
    expect(drainedSeconds(list, 0, NOW)).toBe(0);
  });
  it('counts a session that started just after midnight and one that started just before the next', () => {
    const list = [session({ startedAt: at(2026, 10, 15, 0, 0, 0), actualSeconds: 60 }), session({ id: 'b', startedAt: at(2026, 10, 15, 23, 59, 59), actualSeconds: 30 })];
    expect(drainedSeconds(list, 0, NOW)).toBe(90);
  });
  it('counts a session that runs over midnight on the day it started', () => {
    const s = session({ startedAt: at(2026, 10, 14, 23, 50), endedAt: at(2026, 10, 15, 0, 20), actualSeconds: 1800 });
    expect(drainedSeconds([s], 0, at(2026, 10, 14, 23, 55))).toBe(1800);
    expect(drainedSeconds([s], 0, NOW)).toBe(0);
  });
  it('counts manual and unfinished sessions', () => {
    const list = [session({ createdManually: true, actualSeconds: 900 }), session({ id: 'u', completed: false, actualSeconds: 120 })];
    expect(drainedSeconds(list, 0, NOW)).toBe(1020);
  });
  it('adds the live seconds', () => {
    expect(drainedSeconds([session({ actualSeconds: 1000 })], 250, NOW)).toBe(1250);
  });
  it('ignores invalid values (NaN, negative, non-number)', () => {
    const bad = [
      session({ id: 'a', actualSeconds: NaN }), session({ id: 'b', actualSeconds: -50 }),
      session({ id: 'c', actualSeconds: undefined as unknown as number }), session({ id: 'd', actualSeconds: Infinity }),
    ];
    expect(drainedSeconds(bad, 0, NOW)).toBe(0);
    expect(drainedSeconds(bad, NaN, NOW)).toBe(0);
    expect(drainedSeconds(bad, -10, NOW)).toBe(0);
  });
  it('handles null or undefined input lists', () => {
    expect(drainedSeconds(null as unknown as Session[], 0, NOW)).toBe(0);
    expect(drainedSeconds(undefined as unknown as Session[], 5, NOW)).toBe(5);
  });
  it('stays fast with 10k sessions', () => {
    const list = Array.from({ length: 10_000 }, (_, i) => session({ id: String(i), actualSeconds: 1 }));
    const t0 = performance.now();
    expect(drainedSeconds(list, 0, NOW)).toBe(10_000);
    expect(performance.now() - t0).toBeLessThan(100);
  });
  it('does not change its input', () => {
    const list = [session()];
    const copy = JSON.stringify(list);
    drainedSeconds(list, 0, NOW);
    expect(JSON.stringify(list)).toBe(copy);
  });
});

describe('blockFills', () => {
  it('returns 4 full blocks when nothing is drained', () => {
    expect(blockFills(0)).toEqual([1, 1, 1, 1]);
  });
  it('drains block 1 first', () => {
    expect(blockFills(1800)).toEqual([0.5, 1, 1, 1]);
  });
  it('matches the spec example: 1h 36m leaves block 2 at 40%', () => {
    const f = blockFills(96 * 60);
    expect(f[0]).toBe(0);
    expect(f[1]).toBeCloseTo(0.4, 10);
    expect(f[2]).toBe(1);
    expect(f[3]).toBe(1);
  });
  it('empties block 1 at exactly one hour', () => {
    expect(blockFills(3600)).toEqual([0, 1, 1, 1]);
  });
  it('one second short of a block', () => {
    expect(blockFills(3599)[0]).toBeCloseTo(1 / 3600, 10);
  });
  it('is all empty at 4 hours', () => {
    expect(blockFills(14_400)).toEqual([0, 0, 0, 0]);
  });
  it('clamps over 4 hours', () => {
    expect(blockFills(20_000)).toEqual([0, 0, 0, 0]);
  });
  it('clamps negative and invalid values to full', () => {
    expect(blockFills(-5)).toEqual([1, 1, 1, 1]);
    expect(blockFills(NaN)).toEqual([1, 1, 1, 1]);
  });
  it('always returns BLOCKS entries', () => {
    expect(blockFills(123)).toHaveLength(BLOCKS);
  });
});

describe('leftSeconds', () => {
  it('is 4h on a fresh day', () => {
    expect(leftSeconds(0)).toBe(14_400);
  });
  it('is 3h 35m after 25 minutes', () => {
    expect(leftSeconds(1500)).toBe(12_900);
  });
  it('never goes below 0', () => {
    expect(leftSeconds(99_999)).toBe(0);
  });
  it('treats invalid input as nothing drained', () => {
    expect(leftSeconds(NaN)).toBe(14_400);
  });
});

describe('liveFocusSeconds', () => {
  it('is 0 when ready', () => {
    expect(liveFocusSeconds(DEFAULT_TIMER, NOW)).toBe(0);
  });
  it('counts elapsed seconds of a running focus phase', () => {
    expect(liveFocusSeconds(running(), NOW)).toBe(600);
  });
  it('does not count break phases', () => {
    expect(liveFocusSeconds(running({ phase: 'short' }), NOW)).toBe(0);
    expect(liveFocusSeconds(running({ phase: 'long' }), NOW)).toBe(0);
  });
  it('subtracts earlier pauses', () => {
    const st = running({ interruptions: [{ startedAt: NOW - 400_000, endedAt: NOW - 300_000 }] });
    expect(liveFocusSeconds(st, NOW)).toBe(500);
  });
  it('freezes while paused', () => {
    const st = running({ status: 'paused', pausedAt: NOW - 200_000 });
    expect(liveFocusSeconds(st, NOW)).toBe(400);
    expect(liveFocusSeconds(st, NOW + 60_000)).toBe(400);
  });
  it('is 0 without a start time', () => {
    expect(liveFocusSeconds(running({ phaseStartedAt: null }), NOW)).toBe(0);
  });
  it('is never negative (clock moved back)', () => {
    expect(liveFocusSeconds(running({ phaseStartedAt: NOW + 5000 }), NOW)).toBe(0);
  });
  it('ignores a phase that started on an earlier day', () => {
    expect(liveFocusSeconds(running({ phaseStartedAt: at(2026, 10, 14, 23, 50) }), NOW)).toBe(0);
  });
});

describe('fmtLeft', () => {
  it.each([
    [14_400, '4h'], [12_900, '3h 35m'], [2700, '45m'], [3600, '1h'], [59, '0m'], [60, '1m'], [0, '0m'],
  ])('formats %i seconds as %s', (sec, out) => {
    expect(fmtLeft(sec)).toBe(out);
  });
  it('handles invalid input', () => {
    expect(fmtLeft(NaN)).toBe('0m');
    expect(fmtLeft(-5)).toBe('0m');
  });
});

import { zipLevel } from './energy';
describe('zipLevel', () => {
  it('maps drained seconds to blocks left (4 full .. 0 empty)', () => {
    expect(zipLevel(0)).toBe(4);
    expect(zipLevel(1)).toBe(4);
    expect(zipLevel(3600)).toBe(3);
    expect(zipLevel(3601)).toBe(3);
    expect(zipLevel(7200)).toBe(2);
    expect(zipLevel(10800)).toBe(1);
    expect(zipLevel(14399)).toBe(1);
    expect(zipLevel(14400)).toBe(0);
    expect(zipLevel(99999)).toBe(0);
  });
  it('handles bad input', () => {
    expect(zipLevel(NaN)).toBe(4);
    expect(zipLevel(-5)).toBe(4);
  });
});

describe('canStart', () => {
  it('allows start with energy left', () => {
    expect(canStart([session({ actualSeconds: 3 * 3600 })], NOW)).toBe(true);
  });
  it('blocks start at 4 hours or more', () => {
    expect(canStart([session({ actualSeconds: 4 * 3600 })], NOW)).toBe(false);
    expect(canStart([session({ actualSeconds: 3 * 3600 }), session({ id: 'y', actualSeconds: 3600 })], NOW)).toBe(false);
  });
  it('ignores yesterday', () => {
    expect(canStart([session({ startedAt: at(2026, 10, 14, 9), actualSeconds: 5 * 3600 })], NOW)).toBe(true);
  });
});
