import { useEffect, useState } from 'react';
import type { Session } from './state';

const DB = 'focus-timer';
const STORE = 'sessions';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('endedAt', 'endedAt');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then((db) => new Promise<T>((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res((req ? req.result : undefined) as T);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  }));
}

const bus = new EventTarget();
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ft-sessions') : null;
if (bc) bc.onmessage = () => bus.dispatchEvent(new Event('change'));
function changed() { bus.dispatchEvent(new Event('change')); bc?.postMessage('changed'); }

export const getAllSessions = () => run<Session[]>('readonly', (s) => s.getAll());

// Sync hook: local writes are reported here so the sync layer can queue them.
export type SyncOp = { kind: 'put'; session: Session; at: number } | { kind: 'del'; id: string; at: number };
let hook: ((ops: SyncOp[]) => void) | null = null;
export const setSyncHook = (f: (ops: SyncOp[]) => void) => { hook = f; };
const stamp = (s: Session): Session => ({ ...s, updatedAt: Date.now() });

export async function putSession(s: Session) {
  const x = stamp(s);
  await run('readwrite', (st) => st.put(x)); changed();
  hook?.([{ kind: 'put', session: x, at: x.updatedAt! }]);
}
export async function putSessions(list: Session[]) {
  const xs = list.map(stamp);
  await run('readwrite', (st) => { xs.forEach((x) => st.put(x)); });
  changed();
  hook?.(xs.map((x) => ({ kind: 'put', session: x, at: x.updatedAt! })));
}
export async function deleteSession(id: string) {
  await run('readwrite', (st) => st.delete(id)); changed();
  hook?.([{ kind: 'del', id, at: Date.now() }]);
}
export async function clearSessions() {
  const ids = (await getAllSessions()).map((s) => s.id);
  await run('readwrite', (st) => st.clear()); changed();
  const at = Date.now();
  hook?.(ids.map((id) => ({ kind: 'del', id, at })));
}
// Writes that came FROM the sync layer: no stamp, no hook.
export async function putSessionsLocal(list: Session[]) {
  await run('readwrite', (st) => { list.forEach((x) => st.put(x)); }); changed();
}
export async function deleteSessionsLocal(ids: string[]) {
  await run('readwrite', (st) => { ids.forEach((id) => st.delete(id)); }); changed();
}

export function cutoffTs(now = Date.now()) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 3);
  return d.getTime();
}
export async function purgeOld() {
  const cutoff = cutoffTs();
  await run('readwrite', (st) => {
    const req = st.index('endedAt').openCursor(IDBKeyRange.upperBound(cutoff));
    req.onsuccess = () => {
      const c = req.result;
      if (c) { c.delete(); c.continue(); }
    };
  });
  changed();
}

export function useSessions(): Session[] {
  const [list, setList] = useState<Session[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => { getAllSessions().then((l) => { if (alive) setList(l); }).catch(() => {}); };
    load();
    bus.addEventListener('change', load);
    return () => { alive = false; bus.removeEventListener('change', load); };
  }, []);
  return list;
}
