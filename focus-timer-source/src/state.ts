import { useSyncExternalStore } from 'react';

export type PhaseType = 'focus' | 'short' | 'long';
export interface Interruption { startedAt: number; endedAt: number }
export interface Session {
  id: string; title: string; tagId: string | null;
  startedAt: number; endedAt: number;
  plannedSeconds: number; actualSeconds: number;
  interruptions: Interruption[];
  completed: boolean; phaseType: 'focus';
  createdManually: boolean; clockChanged: boolean;
  /** Last local or remote change, ms. Used by sync; newest wins. */
  updatedAt?: number;
}
export interface Tag { id: string; name: string; color: string; order: number; presetId: string | null }
export interface Preset {
  id: string; name: string;
  focusSeconds: number; shortBreakSeconds: number; longBreakSeconds: number; sessionsPerCycle: number;
}
export interface Hotkeys { start: string; reset: string; skip: string; close: string; help: string }
export interface Settings {
  focusMin: number; shortMin: number; longMin: number; cycle: number;
  autoBreak: boolean; autoSession: boolean; autoSkip: boolean;
  notify: boolean; focusSound: number; breakSound: number; volume: number; quotes: boolean;
  tick: boolean; tickVolume: number;
  commitment: boolean; fullscreenBreak: boolean; startOnOpen: boolean; titleCountdown: boolean;
  theme: 'system' | 'dark' | 'light'; accent: string;
  /** Liquid Glass look (macOS 27): 0 = clear, 1 = opaque. */
  glass: number;
  hotkeys: Hotkeys; lang: string;
  firstUse: number; lastExport: number; exportSnooze: number;
  finishedOnce: boolean; installDismissed: boolean;
}
export interface TimerState {
  phase: PhaseType; status: 'ready' | 'running' | 'paused';
  phaseStartedAt: number | null; phaseEndsAt: number | null; pausedAt: number | null;
  plannedSeconds: number; cycleIndex: number;
  activeTagId: string | null; title: string; commitment: boolean;
  interruptions: Interruption[]; clockChanged: boolean;
  /** Id of the running focus run. Also the saved session's id, so devices in live sync write one row. */
  runId?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  focusMin: 25, shortMin: 5, longMin: 15, cycle: 4,
  autoBreak: true, autoSession: false, autoSkip: false,
  notify: true, focusSound: 0, breakSound: 0, volume: 0.7, quotes: true,
  tick: false, tickVolume: 0.3,
  commitment: false, fullscreenBreak: true, startOnOpen: false, titleCountdown: true,
  theme: 'system', accent: '#e5484d', glass: 0.5,
  hotkeys: { start: ' ', reset: 'r', skip: 's', close: 'Escape', help: '?' },
  lang: 'auto', firstUse: 0, lastExport: 0, exportSnooze: 0,
  finishedOnce: false, installDismissed: false,
};
export const DEFAULT_TIMER: TimerState = {
  phase: 'focus', status: 'ready', phaseStartedAt: null, phaseEndsAt: null, pausedAt: null,
  plannedSeconds: 25 * 60, cycleIndex: 0, activeTagId: null, title: '', commitment: false,
  interruptions: [], clockChanged: false,
};

export interface Store<T> {
  get(): T;
  set(v: T | ((p: T) => T)): void;
  subscribe(f: () => void): () => void;
}

export function createStore<T>(key: string | null, def: T): Store<T> {
  const read = (): T => {
    if (!key) return def;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return def;
      const parsed = JSON.parse(raw);
      return Array.isArray(def) ? parsed : { ...def, ...parsed };
    } catch { return def; }
  };
  let val = read();
  const subs = new Set<() => void>();
  const notify = () => subs.forEach((f) => f());
  if (key) {
    window.addEventListener('storage', (e) => { if (e.key === key) { val = read(); notify(); } });
  }
  return {
    get: () => val,
    set(v) {
      val = typeof v === 'function' ? (v as (p: T) => T)(val) : v;
      if (key) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage full or blocked */ } }
      notify();
    },
    subscribe(f) { subs.add(f); return () => { subs.delete(f); }; },
  };
}
export function useStore<T>(s: Store<T>): T {
  return useSyncExternalStore(s.subscribe, s.get);
}

export const settings = createStore<Settings>('ft.settings', DEFAULT_SETTINGS);
export const timer = createStore<TimerState>('ft.timer', DEFAULT_TIMER);
export const tags = createStore<Tag[]>('ft.tags', []);
export const presets = createStore<Preset[]>('ft.presets', []);
export const flash = createStore<{ id: number; text: string } | null>(null, null);
export const celebrate = createStore<number>(null, 0);

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

if (!settings.get().firstUse) settings.set((s) => ({ ...s, firstUse: Date.now() }));
localStorage.setItem('ft.dataVersion', '1');

export function showFlash(text: string) {
  const id = Date.now();
  flash.set({ id, text });
  setTimeout(() => { if (flash.get()?.id === id) flash.set(null); }, 6000);
}

// Which tab owns the timer. Other tabs are read-only.
const tabId = uid();
const ownerStore = createStore<boolean>(null, true);
const OWNER_KEY = 'ft.owner';
function claim() { localStorage.setItem(OWNER_KEY, JSON.stringify({ id: tabId, ts: Date.now() })); }
function checkOwner() {
  let o: { id: string; ts: number } | null = null;
  try { o = JSON.parse(localStorage.getItem(OWNER_KEY) || 'null'); } catch { /* ignore */ }
  if (!o || o.id === tabId || Date.now() - o.ts > 6000) { claim(); ownerStore.set(true); }
  else ownerStore.set(false);
}
checkOwner();
setInterval(checkOwner, 2000);
window.addEventListener('beforeunload', () => {
  if (ownerStore.get()) localStorage.removeItem(OWNER_KEY);
});
export const isOwner = () => ownerStore.get();
export const useOwner = () => useStore(ownerStore);
export function takeOver() { claim(); ownerStore.set(true); }
