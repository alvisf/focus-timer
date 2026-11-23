# Focus Timer

React + Vite + TypeScript PWA. No backend. Spec: v2.

    npm install
    npm run dev        # http://127.0.0.1:5173
    npm run build      # type-check + production build into dist/
    npm run preview

Deploy `dist/` to any static HTTPS host. On iPhone: Safari > Share > Add to Home Screen.

Notes
- Data: IndexedDB (sessions), localStorage (settings, timer, tags, presets). Sessions older than 3 months are deleted on open.
- Only English and German are translated. Other languages fall back to English.
