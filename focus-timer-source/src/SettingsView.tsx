import { useState } from 'react';
import { Settings, settings, tags, useStore } from './state';
import { t } from './i18n';
import { Toggle } from './ui';
import { clearSessions, getAllSessions } from './db';
import { saveFile, toCsv, toTxt } from './csv';
import { createTable, pushAll, syncConfig, syncNow, syncStatus } from './sync';

function SyncSection() {
  const c = useStore(syncConfig);
  const st = useStore(syncStatus);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const set = (p: Partial<typeof c>) => syncConfig.set((x) => ({ ...x, ...p }));
  const go = async (what: string, fn: () => Promise<void>, ok: string) => {
    setBusy(what); setMsg('');
    try { await fn(); setMsg(ok); } catch (e) { setMsg(`${t('syncError')}: ${(e as Error).message}`); } finally { setBusy(''); }
  };
  const status = st.state === 'off' ? t('syncOff') : st.state === 'syncing' ? t('syncing')
    : st.state === 'error' ? `${t('syncError')}: ${st.error}` : st.at ? t('syncedAt', { time: new Date(st.at).toLocaleTimeString() }) : t('syncIdle');
  return (
    <>
      <h2>{t('gSync')}</h2>
      <p className="note">{t('syncNote')}</p>
      <div className="field"><span>{t('syncToken')}</span><input type="password" autoComplete="off" value={c.token} placeholder="pat…" onChange={(e) => set({ token: e.target.value.trim() })} /></div>
      <div className="field"><span>{t('syncBase')}</span><input value={c.baseId} placeholder="app…" onChange={(e) => set({ baseId: e.target.value.trim() })} /></div>
      <div className="field"><span>{t('syncTable')}</span><input value={c.table} onChange={(e) => set({ table: e.target.value })} /></div>
      <Toggle label={t('syncEnable')} checked={c.enabled} onChange={(v) => set({ enabled: v })} />
      <div className="controls wrap">
        <button disabled={!!busy || !c.token || !c.baseId} onClick={() => go('create', createTable, t('syncTableCreated'))}>{t('syncCreateTable')}</button>
        <button disabled={!!busy || !c.enabled} onClick={() => go('now', syncNow, t('syncDone'))}>{t('syncNow')}</button>
        <button disabled={!!busy || !c.enabled} onClick={() => go('all', pushAll, t('syncDone'))}>{t('syncPushAll')}</button>
      </div>
      <p className="note">{status}{st.pending ? ` · ${t('syncPending', { n: st.pending })}` : ''}</p>
      {msg && <pre className="note pre">{msg}</pre>}
    </>
  );
}

const set = (p: Partial<Settings>) => settings.set((s) => ({ ...s, ...p }));

export async function exportData(kind: 'csv' | 'txt') {
  const list = await getAllSessions();
  const tg = tags.get();
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === 'csv') await saveFile(`focus-timer-${stamp}.csv`, 'text/csv', toCsv(list, tg));
  else await saveFile(`focus-timer-${stamp}.txt`, 'text/plain', toTxt(list, tg));
  set({ lastExport: Date.now() });
}

export function SettingsView() {
  return (
    <div className="view settings-view">
      <SyncSection />

      <h2>{t('resetStats')}</h2>
      <button className="danger wide" onClick={async () => { if (window.confirm(t('confirmResetStats'))) await clearSessions(); }}>{t('resetStats')}</button>

    </div>
  );
}
