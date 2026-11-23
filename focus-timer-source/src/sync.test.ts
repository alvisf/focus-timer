import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory fakes for the browser-bound modules sync.ts depends on.
const local = new Map<string, Record<string, unknown>>();
vi.mock('./state', () => {
  const createStore = <T,>(_key: string | null, def: T) => {
    let v = def; const subs = new Set<() => void>();
    return {
      get: () => v,
      set: (f: T | ((x: T) => T)) => { v = typeof f === 'function' ? (f as (x: T) => T)(v) : f; subs.forEach((s) => s()); },
      subscribe: (s: () => void) => { subs.add(s); return () => subs.delete(s); },
    };
  };
  return { createStore, isOwner: () => true, showFlash: vi.fn(), tags: createStore('t', []), uid: () => 'u' };
});
vi.mock('./db', () => ({
  getAllSessions: async () => [...local.values()],
  putSessionsLocal: async (l: Record<string, unknown>[]) => { l.forEach((s) => local.set(String(s.id), s)); },
  deleteSessionsLocal: async (ids: string[]) => { ids.forEach((i) => local.delete(i)); },
  setSyncHook: () => {},
  cutoffTs: () => 1000,
}));

import { syncConfig, syncNow, syncStatus } from './sync';

const row = (id: string, updatedAt: number | undefined, endedAt = 5000) =>
  ({ fields: { id, title: id, startedAt: endedAt - 60, endedAt, updatedAt } });

// Fake Airtable: holds rows, evaluates nothing, records the query it was sent.
let remote: { fields: Record<string, unknown> }[] = [];
const queries: string[] = [];
beforeEach(() => {
  local.clear(); remote = []; queries.length = 0;
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') return new Response('{"records":[]}');
    const formula = new URL(url).searchParams.get('filterByFormula') ?? '';
    queries.push(formula);
    // Emulate the one formula shape the old code sent: {updatedAt} > N
    const m = /^\{updatedAt\} > (\d+)$/.exec(formula);
    const recs = m ? remote.filter((r) => Number(r.fields.updatedAt ?? 0) > Number(m[1])) : remote;
    return new Response(JSON.stringify({ records: recs }));
  }));
  syncConfig.set({ enabled: true, token: 'pat', baseId: 'app1', table: 'Sessions', lastPull: 0 });
});

describe('pull', () => {
  it('pulls rows whose updatedAt is older than the last empty pull', async () => {
    await syncNow();                       // empty table: old code jumps lastPull to now
    remote = [row('a', 2000), row('b', 3000)]; // another device pushes old sessions
    await syncNow();
    expect(syncStatus.get().state).toBe('idle');
    expect([...local.keys()].sort()).toEqual(['a', 'b']);
  });

  it('pulls rows added in Airtable by hand with no updatedAt', async () => {
    remote = [row('hand', undefined)];
    await syncNow();
    expect(local.has('hand')).toBe(true);
  });

  it('only asks for sessions inside the 3-month window', async () => {
    await syncNow();
    expect(queries.at(-1)).toBe('{endedAt} > 1000');
  });

  it('keeps a newer local copy over an older remote row', async () => {
    local.set('a', { id: 'a', title: 'mine', updatedAt: 9000 });
    remote = [row('a', 2000)];
    await syncNow();
    expect(local.get('a')?.title).toBe('mine');
  });

  it('applies a remote soft delete', async () => {
    local.set('d', { id: 'd', title: 'x', updatedAt: 1 });
    remote = [{ fields: { id: 'd', updatedAt: 5, deleted: true } }];
    await syncNow();
    expect(local.has('d')).toBe(false);
  });
});
