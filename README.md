# QMaker

Offline question paper maker for schools and colleges. Windows desktop app (Electron).

- **Block editor** — build the paper directly on an A4 page; questions are blocks you insert with `+`.
- **Question templates** — MCQ, fill in the blank, true/false, match the following, short/long answer, question with parts, case study. Create your own templates.
- **Marks blueprint** — plan each section (type, count, marks each, "answer any N"), see marks distribution by section, chapter, difficulty and type, and auto-fill from the question bank.
- **Either/or questions**, sub-parts (a)(b), case studies (i)(ii).
- **Images anywhere** — paste, drop or pick; inline, left, centre or beside the text.
- **English, हिन्दी, తెలుగు** — bundled fonts per script, font size and spacing settings.
- **Export** to PDF and Word (.docx), with answer keys.
- **Share on WhatsApp** — `.qbank` / `.qpaper` files; importing merges without duplicates.
- **Undo/redo, daily automatic backups**, backup and restore.

## Develop

```sh
npm install
npm run dev          # Vite + Electron with hot reload
npm run typecheck
```

## Build for Windows

```sh
npm run dist:share     # release/QMaker-Share/ — one-click "Install QMaker.exe" + read-me
npm run dist:portable  # release/QMaker-Portable/ — no-install folder that keeps its data inside
```
