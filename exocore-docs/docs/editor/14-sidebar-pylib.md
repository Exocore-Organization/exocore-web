# 14 — PyLib pane (Python project)

  Switching to the seeded `exorepo-py` project re-labels the package tab to **PyPI** and renders `PyLibrary.tsx` in place of `NpmPane.tsx`. The same UX patterns apply (search → install → list installed) but the backing store is the project's `requirements.txt` / `pyproject.toml`.

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![14 — PyLib pane (Python project) — desktop](../screenshots/editor/14-sidebar-pylib.png) | ![14 — PyLib pane (Python project) — mobile](../screenshots/editor/mobile/14-sidebar-pylib.png) |
  
  ## What it does

  - Package-tab swap is driven by `getPackageManagerLabel(projectLanguage)` — the same dispatcher routes Rust → Cargo, Go → go modules, Java → Maven, etc.
- Installs go through `pip install --user` inside the project's virtualenv (created on first install).
- Search hits `https://pypi.org/pypi/<name>/json` server-side and is cached for 5 minutes per name.

  ## Source files

  - [`client/editor/PyLibrary.tsx`](../../client/editor/PyLibrary.tsx)
- [`client/editor/PackagesPane.tsx`](../../client/editor/PackagesPane.tsx)
- [`routes/editor/pylib.ts`](../../routes/editor/pylib.ts)

  ---

  ← Back to the [editor index](./README.md).
  