import { useEffect, useState } from 'react';
import { App as F7App, f7, f7ready, Link, Navbar, Page, Toolbar, View } from 'framework7-react';
import { flash, settings, tags, timer, useOwner, useStore } from './state';
import { actions, fmt, installApi, isLocked, remainingMs, runTick, focusMinutes } from './timer';
import { activeLang, t } from './i18n';
import { prime } from './sound';
import { purgeOld } from './db';
import { installSync, syncConfig } from './sync';
import { installLive } from './live';
import { TimerView } from './TimerView';
import { StatsView } from './StatsView';
import { SettingsView, exportData } from './SettingsView';
import { Modal, keyName, normKey, useNow } from './ui';

type Tab = 'timer' | 'stats' | 'settings';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const DAY30 = 30 * 86400000;
const ICONS: Record<Tab, string> = {
  timer: 'M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v4l3 2M9 2h6',
  stats: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8 4-2 1 .5 2.5-2 1.5-2.3-1-1.7 2H11.5l-1.7-2-2.3 1-2-1.5L6 13 4 12l2-1-.5-2.5 2-1.5 2.3 1L11.5 6h1l1.7 2 2.3-1 2 1.5L18 11z',
};
const TabIcon = ({ k }: { k: Tab }) => <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden><path d={ICONS[k]} /></svg>;

function Banners() {
  const s = useStore(settings);
  const [, force] = useState(0);
  const items = [];
  if (s.notify && s.finishedOnce && 'Notification' in window && Notification.permission === 'default') {
    items.push(
      <div className="banner" key="perm"><span>{t('enableNotif')}</span>
        <button onClick={() => Notification.requestPermission().then(() => force((n) => n + 1))}>{t('enable')}</button></div>,
    );
  }
  if (isIOS && !isStandalone() && !s.installDismissed) {
    items.push(
      <div className="banner" key="install"><span><b>{t('installTitle')}</b><br />{t('installSteps')}</span>
        <button onClick={() => settings.set((x) => ({ ...x, installDismissed: true }))}>{t('dismiss')}</button></div>,
    );
  }
  if (!syncConfig.get().enabled && Date.now() - Math.max(s.lastExport, s.firstUse, s.exportSnooze) > DAY30) {
    items.push(
      <div className="banner" key="export"><span>{t('exportReminder')}</span>
        <button onClick={() => exportData('csv')}>{t('exportNow')}</button>
        <button onClick={() => settings.set((x) => ({ ...x, exportSnooze: Date.now() }))}>{t('later')}</button></div>,
    );
  }
  return <>{items}</>;
}

function Toast() {
  const f = useStore(flash);
  if (!f) return null;
  return <div className="toast" role="status" onClick={() => flash.set(null)}>{f.text}</div>;
}

export default function App() {
  const s = useStore(settings);
  const st = useStore(timer);
  const owner = useOwner();
  const [tab, setTab] = useState<Tab>('timer');
  const [help, setHelp] = useState(false);
  const [announce, setAnnounce] = useState('');
  const now = useNow(st.status === 'running', 1000);

  // Appearance, language
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = s.theme;
    f7ready(() => { f7.setDarkMode(s.theme === 'system' ? 'auto' : s.theme === 'dark'); f7.setColorTheme(s.accent); });
    r.style.setProperty('--accent', s.accent);
    // macOS 27 Liquid Glass appearance slider: 0 clear … 1 opaque
    const g = Math.min(1, Math.max(0, s.glass));
    r.style.setProperty('--glass-alpha', String(0.25 + g * 0.65));
    r.style.setProperty('--glass-blur', `${12 + g * 28}px`);
    r.lang = activeLang();
    const c = s.theme === 'light' ? '#ffffff' : s.theme === 'dark' ? '#111111' : matchMedia('(prefers-color-scheme: light)').matches ? '#ffffff' : '#111111';
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', c);
  }, [s.theme, s.accent, s.lang, s.glass]);

  // Timer tick, API, startup tasks
  useEffect(() => {
    installApi();
    installSync();
    installLive();
    purgeOld().catch(() => {});
    const id = setInterval(runTick, 250);
    const onVis = () => runTick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    const unlock = () => prime();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'ft-action') return;
      if (e.data.action === 'next') { if (timer.get().status === 'ready') actions.start(); }
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);

    const onPhase = (e: Event) => {
      const d = (e as CustomEvent).detail as { phase: string; status: string };
      setAnnounce(`${t('phaseFocus')}: ${d.status}`);
    };
    window.addEventListener('focustimer:phasechange', onPhase);

    // URL scheme: /?start=25&tag=Work&title=Report
    let urlStart = false;
    const q = new URLSearchParams(location.search);
    const startMin = Number(q.get('start'));
    if (q.has('start') && focusMinutes(startMin) === startMin) {
      urlStart = true;
      settings.set((x) => ({ ...x, focusMin: startMin }));
      const tagName = (q.get('tag') || '').toLowerCase();
      const tg = tags.get().find((x) => x.name.toLowerCase() === tagName);
      timer.set((x) => ({ ...x, phase: 'focus', status: 'ready', activeTagId: tg?.id ?? x.activeTagId, title: (q.get('title') || x.title).slice(0, 120) }));
      actions.start();
      history.replaceState(null, '', location.pathname);
    }
    if (!urlStart && settings.get().startOnOpen && timer.get().status === 'ready' && timer.get().phase === 'focus') actions.start();

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      navigator.serviceWorker?.removeEventListener('message', onMsg);
      window.removeEventListener('focustimer:phasechange', onPhase);
    };
  }, []);

  // Tab title and icon badge
  useEffect(() => {
    const nav = navigator as unknown as { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (s.titleCountdown && st.status !== 'ready') {
      const ms = remainingMs(st, Date.now());
      document.title = `${fmt(ms)} · ${t('appName')}`;
      nav.setAppBadge?.(Math.max(1, Math.ceil(ms / 60000))).catch(() => {});
    } else {
      document.title = t('appName');
      nav.clearAppBadge?.().catch(() => {});
    }
  }, [now, st, s.titleCountdown, s.lang]);

  // Hotkeys
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
      if (el.tagName === 'BUTTON' && e.key === ' ') return;
      const k = normKey(e.key), hk = settings.get().hotkeys;
      if (k === hk.close) setHelp(false);
      else if (k === hk.help) setHelp((v) => !v);
      else if (k === hk.start) { e.preventDefault(); if (!isLocked(timer.get())) actions.toggle(); }
      else if (k === hk.reset) actions.reset();
      else if (k === hk.skip) actions.skip();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const dark = s.theme === 'system' ? 'auto' : s.theme === 'dark';
  const TABS = [['timer', 'tabTimer'], ['stats', 'tabStats'], ['settings', 'tabSettings']] as const;
  return (
    <F7App theme="ios" darkMode={dark} colors={{ primary: s.accent }} className="app">
      <div className="wallpaper" aria-hidden="true" />
      <div className="shell">
        {/* Desktop (macOS) sidebar; hidden on phones via CSS */}
        <nav className="sidebar glass" aria-label={t('appName')}>
          <div className="sidebar-title">{t('appName')}{!owner && <small className="ro"> · {t('readOnly')}</small>}</div>
          {TABS.map(([k, label]) => (
            <button key={k} className={'side-item' + (tab === k ? ' on' : '')} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
              <TabIcon k={k} /><span>{t(label)}</span>
            </button>
          ))}
        </nav>
      <View main className="safe-areas">
        <Page>
          <Navbar title={t('appName')} subtitle={!owner ? t('readOnly') : undefined} />
          <Toolbar tabbar icons bottom>
            {TABS.map(([k, label]) => (
              <Link key={k} tabLink tabLinkActive={tab === k} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
                <i className="icon"><TabIcon k={k} /></i>
                <span className="tabbar-label">{t(label)}</span>
              </Link>
            ))}
          </Toolbar>
          <main>
            <Banners />
            {tab === 'timer' && <TimerView />}
            {tab === 'stats' && <StatsView />}
            {tab === 'settings' && <SettingsView />}
          </main>
        </Page>
      </View>
      </div>
      <Toast />
      <div className="sr" aria-live="polite">{announce}</div>
      {help && (
        <Modal title={t('hotkeyHelp')} onClose={() => setHelp(false)}>
          {([['hkStart', 'start'], ['hkReset', 'reset'], ['hkSkip', 'skip'], ['hkClose', 'close'], ['hkHelp', 'help']] as const).map(([l, k]) => (
            <div className="row" key={k}><span>{t(l)}</span><kbd>{keyName(s.hotkeys[k])}</kbd></div>
          ))}
          <button className="wide" onClick={() => setHelp(false)}>{t('closeBtn')}</button>
        </Modal>
      )}
    </F7App>
  );
}
