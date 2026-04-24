# Exocore Docs

A standalone Vite + React documentation site that renders every Markdown
file under [`../exocore-web/docs/`](../exocore-web/docs/) with full-text
search, a sticky sidebar, breadcrumbs, prev/next pagers, and dark-mode
syntax highlighting. Built to drop straight onto a Hugging Face **Static
Space**, GitHub Pages, Netlify, S3 — anywhere that serves a `dist/` folder.

## Stack

| Piece | What it does |
| --- | --- |
| **Vite 6** | Bundles the SPA. Reads sibling docs at build time via `import.meta.glob` so the entire docs corpus is shipped in one JS bundle (no runtime fetch). |
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
import.meta.glob("../../../exocore-web/docs/**/*.md", { query: "?raw", import: "default", eager: true });
```

That single line walks the entire docs tree at build time and inlines
every `.md` file into the JS bundle. The pipeline in `src/lib/docs.ts`:

1. Strips the path prefix down to a slug (`docs/editor/README.md → editor/`).
2. Pulls the first H1 as the title.
3. Pulls the first non-heading paragraph as the search-result excerpt.
4. Builds a lower-cased haystack for the in-memory search.

Add a new `.md` anywhere under `exocore-web/docs/` and rebuild — it shows up
in the sidebar, in the home grid, and in search with no further wiring.

## Layout reference

```
exocore-docs/
├── index.html                  ← Vite entry HTML
├── public/favicon.svg          ← inline-svg "E" favicon
├── package.json                ← React 19 + Vite 6 + react-markdown
├── vite.config.ts              ← base: "./", aliases, allowedHosts
├── tsconfig.json
├── src/
│   ├── main.tsx                ← HashRouter mount
│   ├── App.tsx                 ← <Layout/> shell + routes
│   ├── styles.css              ← single-file palette + responsive shell
│   ├── lib/docs.ts             ← glob → DOCS[] index + search()
│   ├── components/
│   │   ├── Layout.tsx          ← topbar + sidebar shell + mobile drawer
│   │   ├── Sidebar.tsx         ← per-section nav
│   │   ├── SearchBox.tsx       ← / shortcut + dropdown results
│   │   └── MarkdownView.tsx    ← react-markdown w/ rewritten links + code highlighter
│   └── pages/
│       ├── Home.tsx            ← hero + featured grid + all-pages list
│       ├── DocPage.tsx         ← rendered markdown + breadcrumb + pager
│       └── NotFound.tsx
```

## Notes / gotchas

- **Images inside docs** (e.g. `screenshots/editor/01.png`) are rendered as
  a labelled stub instead of a broken `<img>` because the source images
  live outside the docs bundle. If you want them inlined, copy the
  relevant `screenshots/` folder into `exocore-docs/public/` and update
  the rewriter in `MarkdownView.tsx`.
- **Routing** is hash-based on purpose — keeps the site portable to every
  static host without server-side URL rewriting.
- **Bundle size** is ~630 KB (200 KB gzip) for the full SPA + every doc.
  That's normal for a "ship the corpus" setup; it stays trivially fast on
  the network and avoids any per-page fetch.
