import { settings } from './state';

export const LANGS: [string, string][] = [
  ['auto', 'Auto'], ['en', 'English'], ['de', 'Deutsch'], ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文'],
  ['fr', 'Français'], ['es', 'Español'], ['pt', 'Português'], ['pl', 'Polski'], ['ru', 'Русский'],
  ['it', 'Italiano'], ['nl', 'Nederlands'], ['ko', '한국어'], ['ca', 'Català'], ['ja', '日本語'],
  ['sv', 'Svenska'], ['nb', 'Norsk'], ['tr', 'Türkçe'], ['uk', 'Українська'], ['vi', 'Tiếng Việt'],
];

const en = {
  appName: 'Focus Timer',
  tabTimer: 'Timer', tabStats: 'Statistics', tabSettings: 'Settings',
  phaseFocus: 'Focus',
  start: 'Start', pause: 'Pause', resume: 'Resume', reset: 'Reset', skip: 'Skip',
  titlePlaceholder: 'What are you working on?', noTag: 'No tag', tagLabel: 'Tag',
  energyLabel: 'Energy today', energyLeft: '{time} left', energyEmpty: 'No energy left today',
  locked: 'Commitment Mode: locked until this session ends.',
  readOnly: 'Another tab runs the timer. This tab is read-only.', takeOver: 'Take over',
  closeBtn: 'Close',
  focusDone: 'Focus session finished',
  startNext: 'Start next', finishedAway: 'A timer finished while the app was closed. It was saved at the correct time.',
  enableNotif: 'Turn on notifications to get an alert when a timer ends.', enable: 'Turn on', later: 'Later',
  exportReminder: 'It has been 30 days. Export your data to keep a backup.', exportNow: 'Export now',
  installTitle: 'Install on your iPhone or iPad',
  installSteps: 'Open this page in Safari, tap Share, then Add to Home Screen. Install to keep your statistics: Safari deletes site data after 7 days without use.',
  dismiss: 'Dismiss',
  hotkeyHelp: 'Keyboard shortcuts', hkStart: 'Start / pause / resume', hkReset: 'Reset', hkSkip: 'Skip', hkClose: 'Close overlay', hkHelp: 'Show this list',
  day: 'Day', week: 'Week', today: 'Today', prev: 'Previous', next: 'Next',
  sessions: 'Sessions', focusTime: 'Focus time', interruptions: 'Interruptions',
  trendVs: 'vs previous {p}', pDay: 'day', pWeek: 'week',
  addSession: 'Add session', editSession: 'Edit session', save: 'Save', cancel: 'Cancel', del: 'Delete',
  fTitle: 'Title', fStart: 'Start', fEnd: 'End', fCompleted: 'Completed', badTimes: 'End must be after start.',
  noSessions: 'No sessions in this period.', incomplete: 'incomplete', manual: 'added by hand',
  min: 'min', hrs: 'h',
  gDurations: 'Durations', focusMin: 'Timer length (min)',
  gNotify: 'Notifications and sound', notifyOn: 'Notifications', focusSound: 'Focus end sound', volume: 'Volume', quotes: 'Motivational quotes (English)', preview: 'Play',
  notifDenied: 'Notifications are blocked. Re-enable them in your browser or iOS Settings for this site.',
  notifNone: 'Notifications are not available here. You get an in-page banner and sound instead.',
  gSounds: 'Ticking', tick: 'Ticking sound during focus', tickVolume: 'Ticking volume',
  gBehavior: 'Behavior', commitment: 'Commitment Mode', startOnOpen: 'Start a session when the app opens', titleCountdown: 'Show countdown in tab title and icon badge',
  backgroundNote: 'No code runs while the app is closed or in the background on iOS. A timer that ends then gives no alert. You see it finished when you reopen the app.',
  gAppearance: 'Appearance', theme: 'Theme', themeSystem: 'System', themeDark: 'Dark', themeLight: 'Light', accent: 'Accent color',
  glass: 'Liquid Glass', glassClear: 'Clear', glassOpaque: 'Opaque',
  gHotkeys: 'Hotkeys', pressKey: 'Press a key…', keySpace: 'Space',
  gTags: 'Tags', addTag: 'Add tag', tagName: 'Tag name', preset: 'Preset', noPreset: 'No preset', addPreset: 'Add preset', presetName: 'Preset name',
  presetFocus: 'Focus',
  gData: 'Data', exportCsv: 'Export CSV', exportTxt: 'Export TXT', importCsv: 'Import CSV', resetStats: 'Reset statistics', resetSettings: 'Reset settings',
  confirmResetStats: 'Delete all sessions? This cannot be undone.', confirmResetSettings: 'Reset all settings to defaults?',
  dataNote: 'Data is stored only in this browser. Sessions older than 3 months are deleted automatically when the app opens. Export is the only backup.',
  importResult: 'Imported {n} sessions, skipped {s} duplicates, {e} bad rows.',
  gLanguage: 'Language', langNote: 'Untranslated parts show in English.',
  gMore: 'More settings', gSoundsAll: 'Sounds', gPresets: 'Presets',
  gSync: 'Airtable sync',
  syncNote: 'Share sessions between iPhone and Mac through one Airtable table. The token is kept in this browser only.',
  syncToken: 'Personal access token', syncBase: 'Base id', syncTable: 'Table name', syncEnable: 'Sync on',
  syncCreateTable: 'Create table', syncNow: 'Sync now', syncPushAll: 'Upload all local sessions',
  syncTableCreated: 'Table created. Turn sync on, then upload all local sessions.', syncDone: 'Synced.',
  syncOff: 'Sync is off.', syncing: 'Syncing…', syncIdle: 'Waiting for the first sync.', syncedAt: 'Last sync {time}.', syncError: 'Sync error', syncPending: '{n} waiting',
  delTag: 'Delete tag', up: 'Move up', down: 'Move down',
  about: 'About', aboutText: 'Focus Timer runs fully in your browser. No account, no server, no ads.',
};
export type K = keyof typeof en;

const de: Partial<Record<K, string>> = {
  tabTimer: 'Timer', tabStats: 'Statistik', tabSettings: 'Einstellungen',
  phaseFocus: 'Fokus',
  start: 'Start', pause: 'Pause', resume: 'Weiter', reset: 'Zurücksetzen', skip: 'Überspringen',
  titlePlaceholder: 'Woran arbeitest du?', noTag: 'Kein Tag', tagLabel: 'Tag',
  energyLabel: 'Energie heute', energyLeft: 'noch {time}', energyEmpty: 'Keine Energie mehr heute',
  locked: 'Commitment-Modus: gesperrt bis die Einheit endet.',
  readOnly: 'Ein anderer Tab steuert den Timer. Dieser Tab ist schreibgeschützt.', takeOver: 'Übernehmen',
  closeBtn: 'Schließen',
  focusDone: 'Fokus-Einheit beendet', startNext: 'Nächste starten',
  enable: 'Aktivieren', later: 'Später', dismiss: 'Ausblenden',
  day: 'Tag', week: 'Woche', today: 'Heute', prev: 'Zurück', next: 'Weiter',
  sessions: 'Einheiten', focusTime: 'Fokuszeit', interruptions: 'Unterbrechungen',
  addSession: 'Einheit hinzufügen', editSession: 'Einheit bearbeiten', save: 'Speichern', cancel: 'Abbrechen', del: 'Löschen',
  fTitle: 'Titel', fStart: 'Start', fEnd: 'Ende', fCompleted: 'Abgeschlossen',
  noSessions: 'Keine Einheiten in diesem Zeitraum.',
  gDurations: 'Dauer', focusMin: 'Fokus (Min.)', gNotify: 'Benachrichtigungen und Ton', notifyOn: 'Benachrichtigungen', volume: 'Lautstärke',
  gBehavior: 'Verhalten', commitment: 'Commitment-Modus',
  gAppearance: 'Darstellung', theme: 'Design', themeSystem: 'System', themeDark: 'Dunkel', themeLight: 'Hell', accent: 'Akzentfarbe',
  glass: 'Liquid Glass', glassClear: 'Klar', glassOpaque: 'Deckend',
  gMore: 'Weitere Einstellungen', gSoundsAll: 'Töne', gPresets: 'Vorlagen',
  gSync: 'Airtable-Sync', syncToken: 'Personal Access Token', syncBase: 'Base-ID', syncTable: 'Tabellenname', syncEnable: 'Sync an',
  syncCreateTable: 'Tabelle anlegen', syncNow: 'Jetzt synchronisieren', syncPushAll: 'Alle lokalen Einheiten hochladen',
  syncDone: 'Synchronisiert.', syncOff: 'Sync ist aus.', syncing: 'Synchronisiere…', syncedAt: 'Letzter Sync {time}.', syncError: 'Sync-Fehler', syncPending: '{n} ausstehend',
  gHotkeys: 'Tastenkürzel', gTags: 'Tags', gData: 'Daten', gLanguage: 'Sprache',
  exportCsv: 'CSV exportieren', exportTxt: 'TXT exportieren', importCsv: 'CSV importieren', resetStats: 'Statistik zurücksetzen', resetSettings: 'Einstellungen zurücksetzen',
};

export function activeLang(): string {
  const l = settings.get().lang;
  if (l !== 'auto') return l;
  const n = navigator.language || 'en';
  if (/^zh/i.test(n)) return /TW|HK|Hant/i.test(n) ? 'zh-Hant' : 'zh-Hans';
  const p = n.slice(0, 2).toLowerCase();
  const code = p === 'no' ? 'nb' : p;
  return LANGS.some((x) => x[0] === code) ? code : 'en';
}

export function t(k: K, v?: Record<string, string | number>): string {
  const lang = activeLang();
  let s: string = (lang === 'de' ? de[k] : undefined) ?? en[k];
  if (v) for (const key of Object.keys(v)) s = s.replace(`{${key}}`, String(v[key]));
  return s;
}

export const QUOTES = [
  'The secret of getting ahead is getting started.',
  'Focus on being productive instead of busy.',
  'Small steps every day add up.',
  'Do the next right thing.',
  'You do not have to see the whole staircase, just take the first step.',
  'Done is better than perfect.',
  'What you do today can improve all your tomorrows.',
  'Well begun is half done.',
];
