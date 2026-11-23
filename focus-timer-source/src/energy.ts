import type { Session, TimerState } from './state';

// Daily energy: 4 blocks of 1 hour. Computed from existing data, never stored.
export const BLOCKS = 4;
export const BLOCK_SECONDS = 3600;
const TOTAL_SECONDS = BLOCKS * BLOCK_SECONDS;

const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function startOfToday(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const startOfTomorrow = (now: number): number => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
};

/** Active seconds of the focus phase that is running or paused right now. */
export function liveFocusSeconds(st: TimerState, now: number): number {
  if (st.phase !== 'focus' || st.status === 'ready' || st.phaseStartedAt == null) return 0;
  if (st.phaseStartedAt < startOfToday(now)) return 0;
  const end = st.status === 'paused' && st.pausedAt != null ? st.pausedAt : now;
  const gone = st.interruptions.reduce((a, i) => a + (i.endedAt - i.startedAt), 0);
  return Math.max(0, Math.round((end - st.phaseStartedAt - gone) / 1000));
}

/** Focus seconds used today: saved sessions that started today, plus the live phase. */
export function drainedSeconds(sessions: readonly Session[] | null | undefined, live: number, now: number): number {
  const from = startOfToday(now);
  const to = startOfTomorrow(now);
  let sum = valid(live) ? live : 0;
  for (const s of sessions ?? []) {
    if (s.startedAt >= from && s.startedAt < to && valid(s.actualSeconds)) sum += s.actualSeconds;
  }
  return sum;
}

/** Fill of each block, 0 (empty) to 1 (full). Block 1 drains first. */
export function blockFills(drained: number): number[] {
  const d = valid(drained) ? drained : 0;
  return Array.from({ length: BLOCKS }, (_, i) =>
    Math.min(1, Math.max(0, 1 - (d - i * BLOCK_SECONDS) / BLOCK_SECONDS)));
}

export function leftSeconds(drained: number): number {
  const d = valid(drained) ? drained : 0;
  return Math.max(0, TOTAL_SECONDS - d);
}

/** "3h 35m", "4h", "45m". Whole minutes, rounded down. */
export function fmtLeft(sec: number): string {
  const m = Math.floor((valid(sec) ? sec : 0) / 60);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/** Blocks of energy left, 4 (full) to 0 (empty). Drives the mascot's mood. */
export function zipLevel(drained: number): number {
  return Math.ceil(leftSeconds(drained) / BLOCK_SECONDS);
}

/** False once the day's 4 hours are used up. */
export function canStart(sessions: readonly Session[] | null | undefined, now: number): boolean {
  return leftSeconds(drainedSeconds(sessions, 0, now)) > 0;
}
