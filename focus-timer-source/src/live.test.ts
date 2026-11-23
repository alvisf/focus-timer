import { beforeEach, describe, expect, it, vi } from 'vitest';

const flashes: string[] = [];
let energyOk = true;
vi.mock('./state', () => {
  const createStore = <T,>(_key: string | null, def: T) => {
    let v = def; const subs = new Set<() => void>();
    return {
      get: () => v,
      set: (f: T | ((x: T) => T)) => { v = typeof f === 'function' ? (f as (x: T) => T)(v) : f; subs.forEach((s) => s()); },
      subscribe: (s: () => void) => { subs.add(s); return () => subs.delete(s); },
    };
  };
  const DEFAULT_TIMER = {
    phase: 'focus', status: 'ready', phaseStartedAt: null, phaseEndsAt: null, pausedAt: null,
    plannedSeconds: 1500, cycleIndex: 0, activeTagId: null, title: '', commitment: false, interruptions: [], clockChanged: false,
  };
  return {
    createStore, isOwner: () => true, showFlash: (t: string) => flashes.push(t), tags: createStore('t', []),
    timer: createStore('ft.timer', DEFAULT_TIMER), uid: () => 'me-device', DEFAULT_TIMER,
  };
});
vi.mock('./db', () => ({
  getAllSessions: async () => [], putSessionsLocal: async () => {}, deleteSessionsLocal: async () => {},
  setSyncHook: () => {}, cutoffTs: () => 1000,
}));
vi.mock('./energy', () => ({ canStart: () => energyOk }));
vi.mock('./i18n', () => ({ t: (k: string) => k }));

import { applyLive, installLive, LiveRow, pollLive, toLive } from './live';
import { syncConfig } from './sync';
import { timer, TimerState } from './state';

const MIN = 60000;
const T0 = 1_700_000_000_000;
const idle = timer.get();
const running = (over: Partial<TimerState> = {}): TimerState => ({
  ...idle, status: 'running', runId: 'r1', phaseStartedAt: T0, phaseEndsAt: T0 + 25 * MIN, plannedSeconds: 1500, ...over,
});
const row = (over: Partial<LiveRow> = {}): LiveRow => ({
  id: 'live', state: 'running', runId: 'r1', startedAt: T0, durationMin: 25, pausedMs: 0, pausedAt: 0,
  updatedAt: T0 + 1, deviceId: 'other', ...over,
});

describe('toLive', () => {
  it('maps a running timer', () => {
    expect(toLive(running(), 'd', T0 + 5)).toEqual(row({ deviceId: 'd', updatedAt: T0 + 5 }));
  });
  it('maps a paused timer with its paused time', () => {
    const st = running({ status: 'paused', pausedAt: T0 + 10 * MIN, interruptions: [{ startedAt: T0 + MIN, endedAt: T0 + 2 * MIN }] });
    expect(toLive(st, 'd', 9)).toMatchObject({ state: 'paused', pausedMs: MIN, pausedAt: T0 + 10 * MIN });
  });
  it('maps ready to idle', () => {
    expect(toLive({ ...idle, runId: 'r1' }, 'd', 9)).toMatchObject({ state: 'idle', runId: 'r1', startedAt: 0 });
  });
});

describe('applyLive', () => {
  it('starts a remote run with its own length and countdown', () => {
    const n = applyLive(idle, row({ durationMin: 60 }), T0 + MIN, true) as TimerState;
    expect(n).toMatchObject({ status: 'running', runId: 'r1', phaseStartedAt: T0, phaseEndsAt: T0 + 60 * MIN, plannedSeconds: 3600 });
  });
  it('does nothing when the run already matches', () => {
    expect(applyLive(running(), row(), T0 + MIN, true)).toBeNull();
  });
  it('blocks a remote start when the day is used up', () => {
    expect(applyLive(idle, row(), T0, false)).toBe('blocked');
  });
  it('still follows pause of a run it already has when energy is out', () => {
    const n = applyLive(running(), row({ state: 'paused', pausedAt: T0 + 5 * MIN }), T0 + 5 * MIN, false) as TimerState;
    expect(n).toMatchObject({ status: 'paused', pausedAt: T0 + 5 * MIN });
  });
  it('resumes with the remote paused time as an interruption', () => {
    const st = running({ status: 'paused', pausedAt: T0 + 5 * MIN });
    const n = applyLive(st, row({ pausedMs: 2 * MIN }), T0 + 7 * MIN, true) as TimerState;
    expect(n.status).toBe('running');
    expect(n.phaseEndsAt).toBe(T0 + 27 * MIN);
    expect(n.interruptions).toEqual([{ startedAt: T0 + 5 * MIN, endedAt: T0 + 7 * MIN }]);
  });
  it('resets on a remote reset of the same run', () => {
    expect(applyLive(running(), row({ state: 'idle' }), T0 + MIN, true)).toMatchObject({ status: 'ready', phaseStartedAt: null });
  });
  it('ignores a remote stop of another run', () => {
    expect(applyLive(running(), row({ state: 'idle', runId: 'old' }), T0 + MIN, true)).toBeNull();
  });
  it('lets its own tick finish when the remote stop is at the end', () => {
    expect(applyLive(running(), row({ state: 'idle' }), T0 + 25 * MIN - 1000, true)).toBeNull();
  });
});

describe('poll and write', () => {
  let remote: LiveRow | null = null;
  const patches: { fields: LiveRow }[] = [];
  beforeEach(() => {
    remote = null; patches.length = 0; flashes.length = 0; energyOk = true;
    timer.set(idle);
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain('/app1/Live');
      if (init?.method === 'PATCH') {
        const b = JSON.parse(String(init.body));
        expect(b.performUpsert).toEqual({ fieldsToMergeOn: ['id'] });
        patches.push(...b.records);
        remote = b.records[0].fields;
        return new Response('{"records":[]}');
      }
      return new Response(JSON.stringify({ records: remote ? [{ fields: remote }] : [] }));
    }));
    syncConfig.set({ enabled: true, token: 'pat', baseId: 'app1', table: 'Sessions', lastPull: 0 });
  });

  it('writes on local start, applies a remote reset, and does not echo', async () => {
    installLive();
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    const t = Date.now();
    timer.set(running({ phaseStartedAt: t, phaseEndsAt: t + 25 * MIN }));
    await vi.waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].fields).toMatchObject({ state: 'running', runId: 'r1', deviceId: 'me-device' });

    await pollLive(); // our own row: ignored
    expect(timer.get().status).toBe('running');

    remote = { ...patches[0].fields, state: 'idle', deviceId: 'other', updatedAt: Date.now() + 10 };
    await pollLive();
    expect(timer.get().status).toBe('ready');
    expect(patches).toHaveLength(1); // applying the remote row wrote nothing back

    await pollLive();
    expect(patches).toHaveLength(1);
  });

  it('shows the energy message instead of starting', async () => {
    energyOk = false;
    remote = row({ runId: 'new', updatedAt: Date.now() + 100 });
    await pollLive();
    expect(timer.get().status).toBe('ready');
    expect(flashes).toEqual(['energyEmpty']);
  });
});
