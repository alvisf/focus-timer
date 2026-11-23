import { Session, Tag, uid } from './state';

export const CSV_HEADER = ['date', 'start', 'end', 'title', 'tag', 'duration', 'interruptions', 'completed'];

const DANGER = /^[=+\-@\t\r]/;
const safe = (v: string) => (DANGER.test(v) ? "'" + v : v);
const unsafe = (v: string) => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);
const q = (v: string | number) => '"' + String(v).replace(/"/g, '""') + '"';
const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function toCsv(list: Session[], tags: Tag[]): string {
  const name = (id: string | null) => tags.find((t) => t.id === id)?.name ?? '';
  const rows = [...list].sort((a, b) => a.startedAt - b.startedAt).map((s) => [
    localDate(s.startedAt), new Date(s.startedAt).toISOString(), new Date(s.endedAt).toISOString(),
    safe(s.title), safe(name(s.tagId)), s.actualSeconds, s.interruptions.length, s.completed ? 'yes' : 'no',
  ]);
  return [CSV_HEADER, ...rows].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
}

export function toTxt(list: Session[], tags: Tag[]): string {
  const name = (id: string | null) => tags.find((t) => t.id === id)?.name ?? '-';
  return [...list].sort((a, b) => a.startedAt - b.startedAt).map((s) => {
    const a = new Date(s.startedAt), b = new Date(s.endedAt);
    const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${localDate(s.startedAt)} ${hm(a)}-${hm(b)} | ${s.title || '-'} | ${name(s.tagId)} | ${Math.round(s.actualSeconds / 60)} min | ${s.interruptions.length} interruptions | ${s.completed ? 'completed' : 'incomplete'}`;
  }).join('\n') + '\n';
}

export function parseCsv(text: string): { row: string[]; line: number }[] {
  const out: { row: string[]; line: number }[] = [];
  let row: string[] = [], cur = '', inQ = false, line = 1, start = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else { if (c === '\n') line++; cur += c; }
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') out.push({ row, line: start });
      row = []; line++; start = line;
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); out.push({ row, line: start }); }
  return out;
}

export interface ImportResult { sessions: Session[]; newTags: Tag[]; errors: string[]; skipped: number }

export function importCsv(text: string, existing: Session[], tags: Tag[]): ImportResult {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  const errors: string[] = [];
  const sessions: Session[] = [];
  const newTags: Tag[] = [];
  let skipped = 0;
  const seen = new Set(existing.map((s) => `${s.startedAt}|${s.endedAt}|${s.title}`));
  rows.forEach(({ row, line }, idx) => {
    if (idx === 0 && row[0].trim().toLowerCase() === 'date') return;
    if (row.length < 8) { errors.push(`Line ${line}: expected 8 columns, found ${row.length}`); return; }
    const start = Date.parse(row[1]), end = Date.parse(row[2]), dur = Number(row[5]), ints = Number(row[6]);
    if (Number.isNaN(start)) { errors.push(`Line ${line}: bad start time`); return; }
    if (Number.isNaN(end) || end <= start) { errors.push(`Line ${line}: bad end time`); return; }
    if (!Number.isFinite(dur) || dur < 0) { errors.push(`Line ${line}: bad duration`); return; }
    if (!Number.isInteger(ints) || ints < 0) { errors.push(`Line ${line}: bad interruptions`); return; }
    const done = row[7].trim().toLowerCase();
    if (!['yes', 'no', 'true', 'false'].includes(done)) { errors.push(`Line ${line}: bad completed value`); return; }
    const title = unsafe(row[3]);
    const key = `${start}|${end}|${title}`;
    if (seen.has(key)) { skipped++; return; }
    seen.add(key);
    const tagName = unsafe(row[4]).trim();
    let tagId: string | null = null;
    if (tagName) {
      let tg = [...tags, ...newTags].find((t) => t.name.toLowerCase() === tagName.toLowerCase());
      if (!tg) {
        tg = { id: uid(), name: tagName, color: '#6e56cf', order: tags.length + newTags.length, presetId: null };
        newTags.push(tg);
      }
      tagId = tg.id;
    }
    sessions.push({
      id: uid(), title, tagId, startedAt: start, endedAt: end,
      plannedSeconds: Math.round(dur), actualSeconds: Math.round(dur),
      interruptions: Array.from({ length: ints }, () => ({ startedAt: start, endedAt: start })),
      completed: done === 'yes' || done === 'true', phaseType: 'focus', createdManually: false, clockChanged: false,
    });
  });
  return { sessions, newTags, errors, skipped };
}

export async function saveFile(name: string, mime: string, content: string) {
  const file = new File([content], name, { type: mime });
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch { /* fall back to download */ }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
