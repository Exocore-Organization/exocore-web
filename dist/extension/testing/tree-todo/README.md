# Tree Todo

Scans every file in your project and lists all TODO, FIXME, HACK, NOTE, BUG, OPTIMIZE, and XXX comments in one searchable panel. Click any item to jump straight to it in the editor.

---

## What it does

- **Scans all text files** in the active project (JS, TS, Python, Rust, Go, HTML, CSS, Markdown, and 40+ more).
- **Extracts comments** matching:
  - `// TODO: description`
  - `# FIXME: description`
  - `/* HACK: ... */`
  - `<!-- NOTE: ... -->`
  - …and any combination of `TODO`, `FIXME`, `HACK`, `NOTE`, `BUG`, `OPTIMIZE`, `XXX`
- **Groups** results by file.
- **Jump to line** — click any item to open the file at that exact line.
- **Filter by tag** — click the coloured pill buttons (`TODO`, `FIXME`, etc.) to show only that category.
- **Text search** — type in the filter box to search by file name or comment text.
- **Re-scan** — click ⟳ to re-scan after you've edited files.

---

## How to open

| Method | Action |
|---|---|
| **Status bar** | Click `📋 TODOs` |
| **Command palette** | `Tree Todo: Show all TODO / FIXME comments` |
| **Keyboard** | `Ctrl/⌘+Shift+T` |

Click the panel again (or press `Esc`) to close it.

---

## Tag colours

| Tag | Colour |
|---|---|
| `TODO` | 🟡 Yellow |
| `FIXME` | 🔴 Red |
| `HACK` | 🟠 Orange |
| `NOTE` | 🔵 Cyan |
| `BUG` | 🔴 Red |
| `OPTIMIZE` | 🟢 Green |
| `XXX` | 🟣 Purple |
