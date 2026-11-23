import { useEffect, useState } from 'react';
import { actions, fmt, isLocked, remainingMs, totalMs, focusMinutes, FOCUS_OPTIONS } from './timer';
import { celebrate, presets, settings, tags, takeOver, timer, useOwner, useStore } from './state';
import { t } from './i18n';
import { useNow } from './ui';
import { useSessions } from './db';
import { keyName } from './ui';
import { canStart, blockFills, drainedSeconds, fmtLeft, leftSeconds, liveFocusSeconds, zipLevel, BLOCKS, BLOCK_SECONDS } from './energy';
import { Zip } from './Zip';

const phaseLabel = () => t('phaseFocus');

export function Controls() {
  const st = useStore(timer);
  const owner = useOwner();
  const locked = isLocked(st);
  const hk = useStore(settings).hotkeys;
  const sessions = useSessions();
  const now = useNow(false);
  const empty = st.status === 'ready' && !canStart(sessions, now);
  const primary = st.status === 'ready' ? t('start') : st.status === 'running' ? t('pause') : t('resume');
  return (
    <div className="controls">
      <button className="primary" title={keyName(hk.start)} onClick={actions.toggle} disabled={!owner || empty || (st.status === 'running' && locked)}>{primary}<kbd className="hk">{keyName(hk.start)}</kbd></button>
      <button title={keyName(hk.reset)} onClick={actions.reset} disabled={!owner || locked || st.status === 'ready'}>{t('reset')}<kbd className="hk">{keyName(hk.reset)}</kbd></button>
    </div>
  );
}

export function Ring({ size = 260 }: { size?: number }) {
  const st = useStore(timer);
  const now = useNow(st.status === 'running');
  const rem = remainingMs(st, now);
  const frac = st.status === 'ready' ? 0 : 1 - rem / totalMs(st);
  const r = 46, c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="ring-bg" />
        <circle cx="50" cy="50" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, frac)))} transform="rotate(-90 50 50)" />
      </svg>
      <div className="ring-text">
        <div className="phase">{phaseLabel()}</div>
        <div className="time" role="timer" aria-live="off">{fmt(rem)}</div>
      </div>
    </div>
  );
}

function Energy() {
  const st = useStore(timer);
  const sessions = useSessions();
  const now = useNow(st.status === 'running', 1000);
  const drained = drainedSeconds(sessions, liveFocusSeconds(st, now), now);
  const left = leftSeconds(drained);
  const text = left === 0 ? t('energyEmpty') : t('energyLeft', { time: fmtLeft(left) });
  return (
    <div className="energy" role="img" aria-label={`${t('energyLabel')}: ${text}`}>
      <Zip level={zipLevel(drained)} hue={Math.round(120 * (left / (BLOCKS * BLOCK_SECONDS)))} />
      <div className="energy-bars" style={{ ["--hue" as string]: Math.round(120 * (left / (BLOCKS * BLOCK_SECONDS))) }}>
        {blockFills(drained).map((f, i) => (
          <span key={i} className="energy-block"><i style={{ width: `${Math.round(f * 100)}%` }} /></span>
        ))}
      </div>
      <small>{text}</small>
    </div>
  );
}

function Confetti() {
  const stamp = useStore(celebrate);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!stamp || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setOn(true);
    const id = setTimeout(() => setOn(false), 3200);
    return () => clearTimeout(id);
  }, [stamp]);
  if (!on) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 9) * 0.1}s`, background: `hsl(${(i * 47) % 360} 80% 60%)` }} />
      ))}
    </div>
  );
}

export function TimerView() {
  const st = useStore(timer);
  const tg = useStore(tags);
  const ps = useStore(presets);
  const cfg = useStore(settings);
  const owner = useOwner();
  const locked = isLocked(st);

  const pickTag = (id: string) => {
    const tagId = id || null;
    actions.setTag(tagId);
    const preset = ps.find((p) => p.id === tg.find((x) => x.id === tagId)?.presetId);
    if (preset && st.status === 'ready') {
      settings.set((x) => ({
        ...x, focusMin: focusMinutes(Math.round(preset.focusSeconds / 60)),
      }));
    }
  };

  return (
    <div className="view timer-view">
      {!owner && (
        <div className="banner warn">
          <span>{t('readOnly')}</span>
          <button onClick={takeOver}>{t('takeOver')}</button>
        </div>
      )}
      <div className="tv-col tv-clock">
      <Ring />
      <div className="chips length-chips" role="group" aria-label={t('focusMin')}>
        {FOCUS_OPTIONS.map((n) => (
          <button key={n} className={focusMinutes(cfg.focusMin) === n ? 'on' : ''} disabled={!owner || st.status !== 'ready'}
            onClick={() => settings.set((x) => ({ ...x, focusMin: n }))}>{n} min</button>
        ))}
      </div>
      </div>
      <div className="tv-col tv-side">
      <Energy />
      <input
        className="title-input" value={st.title} placeholder={t('titlePlaceholder')} maxLength={120}
        aria-label={t('fTitle')} disabled={!owner} onChange={(e) => actions.setTitle(e.target.value)}
      />
      {tg.length > 0 && <select aria-label={t('tagLabel')} value={st.activeTagId ?? ''} disabled={!owner} onChange={(e) => pickTag(e.target.value)}>
        <option value="">{t('noTag')}</option>
        {[...tg].sort((a, b) => a.order - b.order).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>}
      <Controls />
      {locked && <p className="note">{t('locked')}</p>}
      </div>
      <Confetti />
    </div>
  );
}
