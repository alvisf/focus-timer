// Airtable sync. One row per session, keyed by the session id. Deletes are soft (deleted = true),
// so every change is an upsert and no Airtable record ids are needed. Last write (updatedAt) wins.
import { createStore, isOwner, Session, showFlash, Tag, tags, uid } from './state';
import { getAllSessions, putSessionsLocal, deleteSessionsLocal, setSyncHook, SyncOp, cutoffTs } from './db';

export interface SyncConfig { enabled: boolean; token: string; baseId: string; table: string; lastPull: number }
export interface SyncStatus { state: 'off' | 'idle' | 'syncing' | 'error'; at: number; error: string; pending: number }

export const syncConfig = createStore<SyncConfig>('ft.airtable', { enabled: false, token: '', baseId: '', table: 'Sessions', lastPull: 0 });
export const syncStatus = createStore<SyncStatus>(null, { state: 'off', at: 0, error: '', pending: 0 });
// Pending ops survive a reload. Key = session id, so repeated edits collapse into one upsert.
const queue = createStore<Record<string, SyncOp>>('ft.syncQueue', {});

const API = 'https://api.airtable.com/v0';
const FIELDS: { name: string; type: string; options?: unknown }[] = [
  { name: 'id', type: 'singleLineText' },
  { name: 'title', type: 'singleLineText' },
  { name: 'tag', type: 'singleLineText' },
  { name: 'startedAt', type: 'number', options: { precision: 0 } },
  { name: 'endedAt', type: 'number', options: { precision: 0 } },
  { name: 'plannedSeconds', type: 'number', options: { precision: 0 } },
  { name: 'actualSeconds', type: 'number', options: { precision: 0 } },
  { name: 'completed', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
  { name: 'createdManually', type: 'checkbox', options: { icon: 'check', color: 'grayBright' } },
  { name: 'clockChanged', type: 'checkbox', options: { icon: 'check', color: 'grayBright' } },
  { name: 'interruptions', type: 'multilineText' },
  { name: 'updatedAt', type: 'number', options: { precision: 0 } },
  { name: 'deleted', type: 'checkbox', options: { icon: 'check', color: 'redBright' } },
];

/** Table for live timer sync (one row, id = 'live'). See live.ts. */
export const LIVE_TABLE = 'Live';
export const LIVE_FIELDS: { name: string; type: string; options?: unknown }[] = [
  { name: 'id', type: 'singleLineText' },
  { name: 'state', type: 'singleLineText' },
  { name: 'runId', type: 'singleLineText' },
  { name: 'startedAt', type: 'number', options: { precision: 0 } },
  { name: 'durationMin', type: 'number', options: { precision: 0 } },
  { name: 'pausedMs', type: 'number', options: { precision: 0 } },
  { name: 'pausedAt', type: 'number', options: { precision: 0 } },
  { name: 'updatedAt', type: 'number', options: { precision: 0 } },
  { name: 'deviceId', type: 'singleLineText' },
];

type Row = Record<string, unknown>;
const configured = (c: SyncConfig) => c.enabled && c.token && c.baseId && c.table;

export async function api(path: string, init: RequestInit = {}): Promise<Row> {
  const c = syncConfig.get();
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = (await r.json().catch(() => ({}))) as Row;
  if (!r.ok) {
    const e = body.error as { type?: string; message?: string } | string | undefined;
    throw new Error(typeof e === 'string' ? e : e?.message || e?.type || `HTTP ${r.status}`);
  }
  return body;
}

function toRow(s: Session, deleted = false): Row {
  const tag = tags.get().find((x) => x.id === s.tagId)?.name ?? '';
  return {
    id: s.id, title: s.title, tag, startedAt: s.startedAt, endedAt: s.endedAt,
    plannedSeconds: s.plannedSeconds, actualSeconds: s.actualSeconds, completed: s.completed,
    createdManually: s.createdManually, clockChanged: s.clockChanged,
    interruptions: JSON.stringify(s.interruptions ?? []), updatedAt: s.updatedAt ?? Date.now(), deleted,
  };
}
function fromRow(f: Row, newTags: Tag[]): Session {
  const name = String(f.tag ?? '').trim();
  let tagId: string | null = null;
  if (name) {
    let tg = [...tags.get(), ...newTags].find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!tg) { tg = { id: uid(), name, color: '#6e56cf', order: tags.get().length + newTags.length, presetId: null }; newTags.push(tg); }
    tagId = tg.id;
  }
  let ints: Session['interruptions'] = [];
  try { ints = JSON.parse(String(f.interruptions || '[]')); } catch { /* keep empty */ }
  return {
    id: String(f.id), title: String(f.title ?? ''), tagId,
    startedAt: Number(f.startedAt) || 0, endedAt: Number(f.endedAt) || 0,
    plannedSeconds: Number(f.plannedSeconds) || 0, actualSeconds: Number(f.actualSeconds) || 0,
    interruptions: ints, completed: !!f.completed, phaseType: 'focus',
    createdManually: !!f.createdManually, clockChanged: !!f.clockChanged, updatedAt: Number(f.updatedAt) || 0,
  };
}

const setStatus = (p: Partial<SyncStatus>) => syncStatus.set((s) => ({ ...s, ...p, pending: Object.keys(queue.get()).length }));

async function push() {
  const c = syncConfig.get();
  const q = queue.get();
  const ids = Object.keys(q);
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const records = chunk.map((id) => {
      const op = q[id];
      return { fields: op.kind === 'put' ? toRow(op.session) : { id, updatedAt: op.at, deleted: true } };
    });
    await api(`/${c.baseId}/${encodeURIComponent(c.table)}`, {
      method: 'PATCH',
      body: JSON.stringify({ performUpsert: { fieldsToMergeOn: ['id'] }, records, typecast: true }),
    });
    queue.set((cur) => { const n = { ...cur }; chunk.forEach((id) => { if (n[id] === q[id]) delete n[id]; }); return n; });
  }
}

// Pulls every row inside the local 3-month window and lets the per-row updatedAt check decide.
// No "since" cursor: updatedAt comes from each device's own clock, so a cursor skipped rows
// pushed later with older stamps (e.g. Push all from another device).
async function pull() {
  const c = syncConfig.get();
  const rows: Row[] = [];
  let offset: string | undefined;
  do {
    const p = new URLSearchParams({ pageSize: '100', filterByFormula: `{endedAt} > ${cutoffTs()}` });
    if (offset) p.set('offset', offset);
    const r = await api(`/${c.baseId}/${encodeURIComponent(c.table)}?${p}`);
    (r.records as { fields: Row }[]).forEach((x) => rows.push(x.fields));
    offset = r.offset as string | undefined;
  } while (offset);

  const local = new Map((await getAllSessions()).map((s) => [s.id, s]));
  const pending = queue.get();
  const puts: Session[] = []; const dels: string[] = []; const newTags: Tag[] = [];
  for (const f of rows) {
    const id = String(f.id || ''); if (!id) continue;
    const upd = Number(f.updatedAt) || 0;
    if (pending[id] && pending[id].at >= upd) continue; // our unsent change is newer
    const mine = local.get(id);
    if (mine && (mine.updatedAt ?? 0) >= upd) continue;
    if (f.deleted) { if (mine) dels.push(id); }
    else puts.push(fromRow(f, newTags));
  }
  if (newTags.length) tags.set((l) => [...l, ...newTags]);
  if (puts.length) await putSessionsLocal(puts);
  if (dels.length) await deleteSessionsLocal(dels);
  syncConfig.set((x) => ({ ...x, lastPull: Date.now() }));
}

let running = false;
export async function syncNow(): Promise<void> {
  const c = syncConfig.get();
  if (!configured(c)) { setStatus({ state: 'off' }); return; }
  if (running || !isOwner() || !navigator.onLine) return;
  running = true;
  setStatus({ state: 'syncing', error: '' });
  try {
    await push();
    await pull();
    setStatus({ state: 'idle', at: Date.now() });
  } catch (e) {
    const msg = (e as Error).message;
    if (syncStatus.get().error !== msg) showFlash(`Sync: ${msg}`);
    setStatus({ state: 'error', error: msg });
  } finally { running = false; }
}

/** First-time setup: creates the table with the right fields. Needs the schema.bases:write scope. */
export async function createTable(): Promise<void> {
  const c = syncConfig.get();
  const errs: string[] = [];
  // Sessions table, then the small table for live timer sync. Either may already exist.
  for (const [name, fields] of [[c.table, FIELDS], [LIVE_TABLE, LIVE_FIELDS]] as const) {
    try { await api(`/meta/bases/${c.baseId}/tables`, { method: 'POST', body: JSON.stringify({ name, fields }) }); }
    catch (e) { errs.push(`${name}: ${(e as Error).message}`); }
  }
  if (errs.length) throw new Error(errs.join('\n'));
}

/** Push every local session (use after enabling sync on a device that already has data). */
export async function pushAll(): Promise<void> {
  const all = await getAllSessions();
  queue.set((q) => { const n = { ...q }; all.forEach((s) => { n[s.id] = { kind: 'put', session: s, at: s.updatedAt ?? Date.now() }; }); return n; });
  await syncNow();
}

let debounce = 0;
function schedule(ms = 1500) { clearTimeout(debounce); debounce = window.setTimeout(() => { void syncNow(); }, ms); }

export function installSync() {
  setSyncHook((ops) => {
    if (!configured(syncConfig.get())) return;
    queue.set((q) => { const n = { ...q }; ops.forEach((op) => { n[op.kind === 'put' ? op.session.id : op.id] = op; }); return n; });
    setStatus({});
    schedule();
  });
  window.addEventListener('online', () => schedule(500));
  setInterval(() => { void syncNow(); }, 5 * 60 * 1000);
  syncConfig.subscribe(() => setStatus({ state: configured(syncConfig.get()) ? syncStatus.get().state === 'off' ? 'idle' : syncStatus.get().state : 'off' }));
  setStatus({ state: configured(syncConfig.get()) ? 'idle' : 'off' });
  schedule(800);
}
