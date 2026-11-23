import { useMemo, useState } from 'react';
import { deleteSession, putSession, useSessions } from './db';
import { Session, tags, uid, useStore } from './state';
import { activeLang, t } from './i18n';
import { Modal, Toggle } from './ui';

const addDays = (d: number, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.getTime(); };
const startOfDay = (d: number) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };

function firstDay(): number {
  try {
    const loc = new Intl.Locale(activeLang() === 'auto' ? navigator.language : activeLang()) as unknown as {
      getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number }; maximize(): { region?: string };
    };
    const wi = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (wi) return wi.firstDay % 7;
    const region = loc.maximize().region ?? '';
    return ['US', 'CA', 'JP', 'BR', 'MX', 'IN', 'IL', 'KR', 'TW', 'HK', 'ZA', 'AU'].includes(region) ? 0 : 1;
  } catch { return 1; }
}
const weekStart = (d: number) => addDays(startOfDay(d), -((new Date(d).getDay() - firstDay() + 7) % 7));

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}${t('hrs')} ${Math.round(m % 60)}${t('min')}` : `${Math.round(m)} ${t('min')}`);
const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function Editor({ init, onClose }: { init: Session | null; onClose: () => void }) {
  const tg = useStore(tags);
  const now = Date.now();
  const [title, setTitle] = useState(init?.title ?? '');
  const [tagId, setTagId] = useState(init?.tagId ?? '');
  const [start, setStart] = useState(toLocalInput(init?.startedAt ?? now - 25 * 60000));
  const [end, setEnd] = useState(toLocalInput(init?.endedAt ?? now));
  const [done, setDone] = useState(init?.completed ?? true);
  const [err, setErr] = useState('');
  const s0 = new Date(start).getTime(), e0 = new Date(end).getTime();
  const valid = !Number.isNaN(s0) && !Number.isNaN(e0) && e0 > s0;
  const ints = init?.interruptions ?? [];
  const lost = ints.reduce((a, i) => a + (i.endedAt - i.startedAt), 0);
  const actual = valid ? Math.max(0, Math.round((e0 - s0 - lost) / 1000)) : 0;
  const save = async () => {
    if (!valid) { setErr(t('badTimes')); return; }
    await putSession({
      id: init?.id ?? uid(), title, tagId: tagId || null, startedAt: s0, endedAt: e0,
      plannedSeconds: init?.plannedSeconds ?? actual, actualSeconds: actual, interruptions: ints, completed: done,
      phaseType: 'focus', createdManually: init?.createdManually ?? true, clockChanged: init?.clockChanged ?? false,
    });
    onClose();
  };
  return (
    <Modal title={init ? t('editSession') : t('addSession')} onClose={onClose}>
      <label className="field">{t('fTitle')}<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field">{t('tagLabel')}
        <select value={tagId} onChange={(e) => setTagId(e.target.value)}>
          <option value="">{t('noTag')}</option>
          {tg.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <label className="field">{t('fStart')}<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label className="field">{t('fEnd')}<input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      <p className="note">{valid ? hm(actual / 60) : ''}</p>
      <Toggle label={t('fCompleted')} checked={done} onChange={setDone} />
      {err && <p className="err" role="alert">{err}</p>}
      <div className="controls">
        <button className="primary" onClick={save}>{t('save')}</button>
        <button onClick={onClose}>{t('cancel')}</button>
        {init && <button className="danger" onClick={async () => { await deleteSession(init.id); onClose(); }}>{t('del')}</button>}
      </div>
    </Modal>
  );
}

export function StatsView() {
  const all = useSessions();
  const tg = useStore(tags);
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [anchor, setAnchor] = useState(Date.now());
  const [edit, setEdit] = useState<Session | 'new' | null>(null);
  const lang = activeLang() === 'auto' ? undefined : activeLang();

  const step = mode === 'day' ? 1 : 7;
  const from = mode === 'day' ? startOfDay(anchor) : weekStart(anchor);
  const to = addDays(from, step);
  const prevFrom = addDays(from, -step);

  const inRange = (a: number, b: number) => all.filter((s) => s.startedAt >= a && s.startedAt < b);
  const cur = useMemo(() => inRange(from, to), [all, from, to]);
  const prevTotal = useMemo(() => inRange(prevFrom, from).reduce((a, s) => a + s.actualSeconds, 0), [all, prevFrom, from]);
  const total = cur.reduce((a, s) => a + s.actualSeconds, 0);
  const ints = cur.reduce((a, s) => a + s.interruptions.length, 0);
  const trend = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

  const n = mode === 'day' ? 24 : 7;
  const buckets = Array.from({ length: n }, () => ({ by: new Map<string, number>(), sum: 0, count: 0 }));
  cur.forEach((s) => {
    const d = new Date(s.startedAt);
    const i = mode === 'day' ? d.getHours() : Math.min(6, Math.round((startOfDay(s.startedAt) - from) / 86400000));
    const b = buckets[Math.max(0, i)];
    b.by.set(s.tagId ?? '', (b.by.get(s.tagId ?? '') ?? 0) + s.actualSeconds);
    b.sum += s.actualSeconds; b.count++;
  });
  const max = Math.max(1, ...buckets.map((b) => b.sum));
  const color = (id: string) => tg.find((x) => x.id === id)?.color ?? 'var(--accent)';
  const label = (i: number) => mode === 'day'
    ? (i % 6 === 0 ? String(i) : '')
    : new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(addDays(from, i));
  const heading = mode === 'day'
    ? new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(from)
    : `${new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(from)} – ${new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(addDays(from, 6))}`;

  const groups = new Map<string, Session[]>();
  [...cur].sort((a, b) => b.startedAt - a.startedAt).forEach((s) => {
    const k = new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(s.startedAt);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  });
  const tm = (ts: number) => new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(ts);

  return (
    <div className="view stats-view">
      <div className="seg" role="tablist">
        {(['day', 'week'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{t(m)}</button>
        ))}
      </div>
      <div className="nav">
        <button aria-label={t('prev')} onClick={() => setAnchor(addDays(anchor, -step))}>‹</button>
        <button className="link" onClick={() => setAnchor(Date.now())}>{heading}</button>
        <button aria-label={t('next')} disabled={to > Date.now()} onClick={() => setAnchor(addDays(anchor, step))}>›</button>
      </div>
      <div className="totals">
        <div><b>{cur.length}</b><span>{t('sessions')}</span></div>
        <div><b>{hm(total / 60)}</b><span>{t('focusTime')}</span></div>
        <div><b>{ints}</b><span>{t('interruptions')}</span></div>
      </div>
      {trend !== null && (
        <div className={'trend ' + (trend >= 0 ? 'up' : 'down')}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% <small>{t('trendVs', { p: mode === 'day' ? t('pDay') : t('pWeek') })}</small>
        </div>
      )}
      {cur.length === 0 ? (
        <p className="chart empty">{t('noSessions')}</p>
      ) : (
        <div className={'chart ' + mode} role="img" aria-label={`${t('focusTime')}: ${hm(total / 60)}`}>
          {buckets.map((b, i) => (
            <div className="col" key={i} title={`${hm(b.sum / 60)} · ${b.count}`}>
              <div className="bar" style={{ height: `${(b.sum / max) * 100}%` }}>
                {[...b.by.entries()].map(([id, sec]) => <span key={id} style={{ flex: sec, background: color(id) }} />)}
              </div>
              <small>{label(i)}</small>
            </div>
          ))}
        </div>
      )}
      <button className="primary wide" onClick={() => setEdit('new')}>{t('addSession')}</button>
      {[...groups.entries()].map(([k, list]) => (
        <section key={k}>
          <h3>{k}</h3>
          {list.map((s) => (
            <button key={s.id} className="srow" onClick={() => setEdit(s)}>
              <i style={{ background: color(s.tagId ?? '') }} />
              <span className="grow">
                <b>{s.title || '—'}</b>
                <small>{tm(s.startedAt)}–{tm(s.endedAt)}{s.tagId ? ` · ${tg.find((x) => x.id === s.tagId)?.name ?? ''}` : ''}{s.interruptions.length ? ` · ${s.interruptions.length}×` : ''}{!s.completed ? ` · ${t('incomplete')}` : ''}</small>
              </span>
              <span>{hm(s.actualSeconds / 60)}</span>
            </button>
          ))}
        </section>
      ))}
      {edit && <Editor init={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
