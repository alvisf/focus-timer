let ctx: AudioContext | null = null;

export function prime() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* audio unavailable */ }
}
export const audioReady = () => !!ctx && ctx.state === 'running';

function tone(freq: number, at: number, len: number, vol: number, type: OscillatorType = 'sine') {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = ctx.currentTime + at;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + len + 0.05);
}

export const SOUND_NAMES = ['Chime', 'Bell', 'Beeps'];

export function playEnd(idx: number, volume: number) {
  prime();
  if (!ctx) return;
  const v = volume * 0.5;
  if (idx === 0) { tone(660, 0, 0.9, v); tone(880, 0.25, 1.1, v); tone(1320, 0.5, 1.4, v); }
  else if (idx === 1) { tone(523, 0, 2, v, 'triangle'); tone(1046, 0, 1.6, v * 0.5, 'triangle'); }
  else { for (let i = 0; i < 3; i++) tone(880, i * 0.25, 0.15, v, 'square'); }
}

export function tick(volume: number) {
  if (!ctx || ctx.state !== 'running') return;
  tone(1800, 0, 0.03, volume * 0.25, 'square');
}
