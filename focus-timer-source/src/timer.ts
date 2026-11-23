import { celebrate, flash, isOwner, Session, settings, showFlash, timer, TimerState, uid } from './state';
import { getAllSessions, putSession } from './db';
import { canStart } from './energy';
import { playEnd, tick as tickSound } from './sound';
import { QUOTES, t } from './i18n';

/** The only timer lengths, in minutes. No custom length. */
export const FOCUS_OPTIONS = [25, 60, 90] as const;
export const focusMinutes = (m: number) => ((FOCUS_OPTIONS as readonly number[]).includes(m) ? m : FOCUS_OPTIONS[0]);
export const dur = () => focusMinutes(settings.get().focusMin) * 60;

export function remainingMs(st: TimerState, now: number): number {
  if (st.status === 'ready') return dur() * 1000;
  if (st.status === 'paused') return Math.max(0, st.phaseEndsAt! - st.pausedAt!);
  return Math.max(0, st.phaseEndsAt! - now);
}
export const totalMs = (st: TimerState) => (st.status === 'ready' ? dur() : st.plannedSeconds) * 1000;
export const isLocked = (st: TimerState) => st.commitment && st.phase === 'focus' && st.status === 'running';

const emit = () => {
  const st = timer.get();
  window.dispatchEvent(new CustomEvent('focustimer:phasechange', { detail: { phase: st.phase, status: st.status } }));
};
function commit(next: TimerState) { timer.set(next); emit(); }

function begin(st: TimerState, now: number): TimerState {
  const secs = dur();
  return {
    ...st, status: 'running', phaseStartedAt: now, phaseEndsAt: now + secs * 1000, pausedAt: null,
    plannedSeconds: secs, interruptions: [], clockChanged: false, commitment: settings.get().commitment, runId: uid(),
  };
}

function activeSeconds(st: TimerState, endAt: number): number {
  const gone = st.interruptions.reduce((a, i) => a + (i.endedAt - i.startedAt), 0)
    + (st.status === 'paused' && st.pausedAt ? endAt - st.pausedAt : 0);
  return Math.max(0, Math.round((endAt - st.phaseStartedAt! - gone) / 1000));
}

function record(st: TimerState, endAt: number, completed: boolean) {
  if (st.phase !== 'focus' || st.status === 'ready' || !st.phaseStartedAt) return;
  const actual = activeSeconds(st, endAt);
  if (!completed && actual <= 60) return;
  const ints = [...st.interruptions];
  if (st.status === 'paused' && st.pausedAt) ints.push({ startedAt: st.pausedAt, endedAt: endAt });
  const s: Session = {
    id: st.runId ?? uid(), title: st.title, tagId: st.activeTagId, startedAt: st.phaseStartedAt, endedAt: endAt,
    plannedSeconds: st.plannedSeconds, actualSeconds: actual, interruptions: ints,
    completed, phaseType: 'focus', createdManually: false, clockChanged: st.clockChanged,
  };
  void putSession(s).catch(() => showFlash('Could not save the session.'));
}

// One timer at a time: there are no breaks. Every phase ends back at a ready focus timer.
function advance(st: TimerState): TimerState {
  return { ...st, phase: 'focus', cycleIndex: 0, status: 'ready', phaseStartedAt: null, phaseEndsAt: null, pausedAt: null, interruptions: [], clockChanged: false };
}

function alertEnd() {
  const s = settings.get();
  playEnd(s.focusSound, s.volume);
  const title = t('focusDone');
  const quote = s.quotes ? QUOTES[Math.floor(Math.random() * QUOTES.length)] : '';
  showFlash(quote ? `${title}. ${quote}` : title);
  celebrate.set(Date.now());
  if (!s.finishedOnce) settings.set((x) => ({ ...x, finishedOnce: true }));
  if (s.notify && 'Notification' in window && Notification.permission === 'granted') {
    const opts = {
      body: quote || t('phaseFocus'),
      tag: 'ft-phase', icon: 'icons/icon-192.png', actions: [{ action: 'next', title: t('startNext') }],
    };
    navigator.serviceWorker?.getRegistration().then((reg) => {
      if (reg) void reg.showNotification(title, opts as NotificationOptions);
      else new Notification(title, { body: opts.body });
    }).catch(() => { try { new Notification(title, { body: opts.body }); } catch { /* none */ } });
  }
}

function complete(st: TimerState, now: number) {
  const late = now - st.phaseEndsAt!;
  const live = late < 5000;
  record(st, st.phaseEndsAt!, true);
  commit(advance(st));
  if (live) alertEnd();
  else showFlash(t('finishedAway'));
}

export const actions = {
  async start() {
    if (!isOwner() || timer.get().status !== 'ready') return;
    let ok = true;
    try { ok = canStart(await getAllSessions(), Date.now()); } catch { /* db unavailable: do not block */ }
    if (!ok) { showFlash(t('energyEmpty')); return; }
    const st = timer.get();
    if (!isOwner() || st.status !== 'ready') return;
    commit(begin(st, Date.now()));
  },
  pause() {
    const st = timer.get();
    if (!isOwner() || st.status !== 'running' || isLocked(st)) return;
    commit({ ...st, status: 'paused', pausedAt: Date.now() });
  },
  resume() {
    const st = timer.get();
    if (!isOwner() || st.status !== 'paused') return;
    const now = Date.now();
    const gap = now - st.pausedAt!;
    commit({
      ...st, status: 'running', pausedAt: null, phaseEndsAt: st.phaseEndsAt! + gap,
      interruptions: [...st.interruptions, { startedAt: st.pausedAt!, endedAt: now }],
    });
  },
  toggle() {
    const st = timer.get();
    if (st.status === 'ready') actions.start();
    else if (st.status === 'running') actions.pause();
    else actions.resume();
  },
  reset() {
    const st = timer.get();
    if (!isOwner() || isLocked(st)) return;
    record(st, Date.now(), false);
    commit({ ...st, status: 'ready', phaseStartedAt: null, phaseEndsAt: null, pausedAt: null, interruptions: [], clockChanged: false });
  },
  skip() {
    const st = timer.get();
    if (!isOwner() || isLocked(st)) return;
    const now = Date.now();
    record(st, now, false);
    commit(advance(st));
  },
  setTitle(title: string) { if (isOwner()) timer.set((st) => ({ ...st, title })); },
  setTag(id: string | null) { if (isOwner()) timer.set((st) => ({ ...st, activeTagId: id })); },
};

let lastWall = Date.now(), lastPerf = performance.now();
document.addEventListener('visibilitychange', () => { lastWall = Date.now(); lastPerf = performance.now(); });
let lastTickSecond = 0;

export function runTick() {
  if (!isOwner()) return;
  const now = Date.now();
  const st = timer.get();
  const drift = (now - lastWall) - (performance.now() - lastPerf);
  if (st.status === 'running' && Math.abs(drift) > 2000 && now - lastWall < 3000 && !st.clockChanged) {
    timer.set({ ...st, clockChanged: true });
  }
  lastWall = now; lastPerf = performance.now();
  const cur = timer.get();
  if (cur.status === 'running' && now >= cur.phaseEndsAt!) { complete(cur, now); return; }
  const s = settings.get();
  if (cur.status === 'running' && cur.phase === 'focus' && s.tick && document.visibilityState === 'visible') {
    const sec = Math.floor(now / 1000);
    if (sec !== lastTickSecond) { lastTickSecond = sec; tickSound(s.tickVolume); }
  }
}

export const fmt = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
};

export function installApi() {
  const api = {
    start: actions.start, stop: actions.reset, pause: actions.pause, resume: actions.resume,
    skip: actions.skip, reset: actions.reset,
    getPhase: () => { const st = timer.get(); return st.status === 'ready' ? 'idle' : st.phase; },
    getRemainingSeconds: () => Math.ceil(remainingMs(timer.get(), Date.now()) / 1000),
    getTitle: () => timer.get().title,
    setTitle: actions.setTitle,
  };
  (window as unknown as { focusTimer: typeof api }).focusTimer = api;
}

export { flash };

// A timer saved by an older version may still sit in a break: move it back to focus.
if (timer.get().phase !== 'focus') timer.set(advance(timer.get()));
