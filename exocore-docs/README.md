# Exocore Docs

A standalone Vite + React documentation site that renders every Markdown
file under [`./docs/`](./docs/) with full-text search, a sticky sidebar,
breadcrumbs, prev/next pagers, and dark-mode syntax highlighting. Built to
drop straight onto a Hugging Face **Static Space**, GitHub Pages, Netlify,
S3 — anywhere that serves a `dist/` folder.

> **Self-contained.** The full docs corpus (markdown + screenshots) lives
> inside this project (`./docs/` and `./public/screenshots/`). It used to
> read from `../exocore-web/docs/` via a vite alias, but the upstream copy
> in `exocore-web/` is now mirrored locally so this site can be split off
> into its own repo without breaking. To resync after editing the docs in
> the main project, just `cp -R ../exocore-web/docs/. ./docs/` and
> `cp -R ../exocore-web/docs/screenshots/. ./public/screenshots/`.

## Stack

| Piece | What it does |
| --- | --- |
| **Vite 6** | Bundles the SPA. Reads the local `./docs/` tree at build time via `import.meta.glob` so the entire docs corpus is shipped in one JS bundle (no runtime fetch). |
| **React 19** + **react-router-dom 7** | App shell, hash-routed pages (works on any dumb static host without rewrite rules). |
| **react-markdown** + **remark-gfm** + **rehype-slug** + **rehype-highlight** | Markdown → HTML, GitHub-Flavoured Markdown extensions, slug-based heading anchors, and `highlight.js` syntax colours (GitHub Dark theme). |
| **In-memory search** (`src/lib/docs.ts`) | Tokenised title+body indexing with snippet previews and `/` shortcut. |

## Quickstart

```bash
cd exocore-docs
npm install
npm run dev          # vite on :5173
npm run build        # outputs ./dist
npm run preview      # serves ./dist on :4173
```

## Hugging Face Spaces deploy

1. `npm run build`
2. Push the **contents of `dist/`** (not the `dist/` folder itself) to a
   Hugging Face *Static* Space repo. The space root must contain
   `index.html`.
3. Done — every page is reachable under `https://<user>-<space>.hf.space/`.

Because the SPA uses `HashRouter`, a deep link like
`/#/docs/editor/` works without any nginx rewrite. Asset URLs are
`./assets/...` (relative), so the build also works under a sub-path
(`/myspace/...`) with no changes.

## How docs are picked up

```ts
import.meta.glob("../../docs/**/*.md", { query: "?raw", import: "default", eager: true });
```

That single line walks the entire local `./docs/` tree at build time and
inlines every `.md` file into the JS bundle. The pipeline in
`src/lib/docs.ts`:

1. Strips the path prefix down to a slug (`docs/editor/README.md → editor/`).
2. Pulls the first H1 as the title.
3. Pulls the first non-heading paragraph as the search-result excerpt.
4. Builds a lower-cased haystack for the in-memory search.

Add a new `.md` anywhere under `./docs/` and rebuild — it shows up in the
sidebar, in the home grid, and in search with no further wiring.

## Layout reference

```
exocore-docs/
├── index.html                  ← Vite entry HTML
├── public/
│   ├── favicon.svg             ← inline-svg "E" favicon
│   └── screenshots/            ← desktop / mobile / editor PNGs (served as static assets)
├── docs/                       ← full markdown corpus (mirrored from exocore-web/docs)
│   ├── README.md               ← index page
│   ├── auth/  dashboard/  editor/  github/  cloud/  …
│   └── screenshots/            ← same screenshots, kept in-tree so the docs render
│                                  correctly when browsed on disk (e.g. on GitHub)
├── package.json                ← React 19 + Vite 6 + react-markdown
├── vite.config.ts              ← base: "./", allowedHosts, no external aliases
├── tsconfig.json
├── src/
│   ├── main.tsx                ← HashRouter mount
│   ├── App.tsx                 ← <Layout/> shell + routes
│   ├── styles.css              ← single-file palette + responsive shell
│   ├── lib/docs.ts             ← glob ./docs/**/*.md → DOCS[] index + search()
│   ├── components/
│   │   ├── Layout.tsx          ← topbar + sidebar shell + mobile drawer
│   │   ├── Sidebar.tsx         ← per-section nav
│   │   ├── SearchBox.tsx       ← / shortcut + dropdown results
│   │   └── MarkdownView.tsx    ← react-markdown w/ rewritten links + real <img>
│   └── pages/
│       ├── Home.tsx            ← hero + featured grid + all-pages list
│       ├── DocPage.tsx         ← rendered markdown + breadcrumb + pager
│       └── NotFound.tsx
```

## Notes / gotchas

- **Images inside docs** (e.g. `../screenshots/editor/01.png`) are now
  rendered as real `<img>` tags. The renderer (`MarkdownView.tsx`)
  resolves the relative path against the doc's slug, detects the
  `screenshots/` segment, and re-anchors onto `./screenshots/...` —
  served verbatim by the host out of `public/screenshots/`.
- **Routing** is hash-based on purpose — keeps the site portable to every
  static host without server-side URL rewriting.
- **Bundle size** is ~630 KB JS (200 KB gzip) for the full SPA + every
  doc. Screenshots are *not* in the JS bundle — they sit in `public/` and
  are loaded lazily as the user scrolls each page.
