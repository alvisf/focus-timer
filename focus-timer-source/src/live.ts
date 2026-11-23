// Live timer sync with other devices (e.g. the kirocrew pomodoro userscript).
// One Airtable row (id = 'live') in its own table holds the running timer. Each side writes it on
// start / pause / resume / reset / finish and polls it every 5 s. The newest updatedAt wins and a
// side ignores its own writes (deviceId). The session row id is the run id, so a run that both
// sides finish is still one session row.
import { createStore, isOwner, showFlash, timer, TimerState, uid } from './state';
import { api, LIVE_TABLE, syncConfig } from './sync';
export { LIVE_FIELDS, LIVE_TABLE } from './sync';
import { getAllSessions } from './db';
import { canStart } from './energy';
import { t } from './i18n';

export const LIVE_ID = 'live';
export const POLL_MS = 5000;
/** A remote stop this close to our own end is a finish: let our own tick save it. */
const FINISH_SLACK_MS = 3000;

export interface LiveRow {
  id: string; state: 'running' | 'paused' | 'idle'; runId: string;
  startedAt: number; durationMin: number; pausedMs: number; pausedAt: number;
  updatedAt: number; deviceId: string;
}


const pausedSum = (st: TimerState) => st.interruptions.reduce((a, i) => a + (i.endedAt - i.startedAt), 0);

/** The live row for a local timer state. */
export function toLive(st: TimerState, deviceId: string, now: number): LiveRow {
  const base = { id: LIVE_ID, runId: st.runId ?? '', updatedAt: now, deviceId };
  if (st.status === 'ready' || st.phaseStartedAt == null) {
    return { ...base, state: 'idle', startedAt: 0, durationMin: 0, pausedMs: 0, pausedAt: 0 };
  }
  return {
    ...base, state: st.status === 'paused' ? 'paused' : 'running', startedAt: st.phaseStartedAt,
    durationMin: Math.round(st.plannedSeconds / 60), pausedMs: pausedSum(st),
    pausedAt: st.status === 'paused' ? st.pausedAt ?? now : 0,
  };
}

/** What changes the remote row asks for: a new state, 'blocked' (energy used up) or null (nothing). */
export function applyLive(st: TimerState, r: LiveRow, now: number, allowStart: boolean): TimerState | 'blocked' | null {
  const same = !!r.runId && st.runId === r.runId;
  if (r.state === 'idle') {
    if (!same || st.status === 'ready') return null;
    if (st.status === 'running' && st.phaseEndsAt! - now < FINISH_SLACK_MS) return null;
    return { ...st, status: 'ready', phaseStartedAt: null, phaseEndsAt: null, pausedAt: null, interruptions: [], clockChanged: false };
  }
  const endsAt = r.startedAt + r.durationMin * 60000 + r.pausedMs;
  const pausedAt = r.state === 'paused' ? r.pausedAt : null;
  if (same && st.status === r.state && st.phaseEndsAt === endsAt && st.pausedAt === pausedAt) return null;
  if (!same && !allowStart) return 'blocked';
  let ints = same ? [...st.interruptions] : [];
  const gap = r.pausedMs - ints.reduce((a, i) => a + (i.endedAt - i.startedAt), 0);
  if (gap > 0) {
    const from = same && st.pausedAt ? st.pausedAt : r.startedAt;
    ints = [...ints, { startedAt: from, endedAt: from + gap }];
  }
  return {
    ...st, phase: 'focus', status: r.state, runId: r.runId, phaseStartedAt: r.startedAt, phaseEndsAt: endsAt,
    pausedAt, plannedSeconds: r.durationMin * 60, interruptions: ints, clockChanged: false,
    commitment: same ? st.commitment : false,
  };
}

const deviceStore = createStore<string>('ft.deviceId', '');
if (!deviceStore.get()) deviceStore.set(uid());
const deviceId = () => deviceStore.get();

const sig = (st: TimerState) => `${st.status}|${st.runId}|${st.phaseEndsAt}|${st.pausedAt}`;
let lastSig = '';
let lastSeen = 0; // updatedAt of the newest live row we wrote or applied
let applying = false;
let lastErr = '';
const on = () => { const c = syncConfig.get(); return !!(c.enabled && c.token && c.baseId) && isOwner() && navigator.onLine; };
const path = () => `/${syncConfig.get().baseId}/${LIVE_TABLE}`;

function fail(e: unknown) {
  const msg = (e as Error).message;
  if (msg !== lastErr) showFlash(`Live sync: ${msg}`);
  lastErr = msg;
}

async function write(st: TimerState) {
  if (!on()) return;
  const row = toLive(st, deviceId(), Date.now());
  lastSeen = Math.max(lastSeen, row.updatedAt);
  try {
    await api(path(), { method: 'PATCH', body: JSON.stringify({ performUpsert: { fieldsToMergeOn: ['id'] }, records: [{ fields: row }], typecast: true }) });
    lastErr = '';
  } catch (e) { fail(e); }
}

export async function pollLive() {
  if (!on()) return;
  try {
    const p = new URLSearchParams({ maxRecords: '1', filterByFormula: `{id} = '${LIVE_ID}'` });
    const r = await api(`${path()}?${p}`);
    lastErr = '';
    const f = (r.records as { fields: LiveRow }[] | undefined)?.[0]?.fields;
    if (!f || !(Number(f.updatedAt) > lastSeen)) return;
    lastSeen = Number(f.updatedAt);
    if (f.deviceId === deviceId()) return;
    const row: LiveRow = {
      ...f, startedAt: Number(f.startedAt) || 0, durationMin: Number(f.durationMin) || 0,
      pausedMs: Number(f.pausedMs) || 0, pausedAt: Number(f.pausedAt) || 0, runId: String(f.runId ?? ''),
    };
    const st = timer.get();
    let allow = true;
    if (row.state !== 'idle' && st.runId !== row.runId) {
      try { allow = canStart(await getAllSessions(), Date.now()); } catch { /* db unavailable: do not block */ }
    }
    const next = applyLive(timer.get(), row, Date.now(), allow);
    if (next === 'blocked') { showFlash(t('energyEmpty')); return; }
    if (!next) return;
    applying = true;
    try { timer.set(next); lastSig = sig(next); } finally { applying = false; }
  } catch (e) { fail(e); }
}

let installed = false;
export function installLive() {
  if (installed) return;
  installed = true;
  lastSig = sig(timer.get());
  timer.subscribe(() => {
    if (applying || !isOwner()) return;
    const st = timer.get();
    const s = sig(st);
    if (s === lastSig) return;
    lastSig = s;
    void write(st);
  });
  setInterval(() => { void pollLive(); }, POLL_MS);
  void pollLive();
}
