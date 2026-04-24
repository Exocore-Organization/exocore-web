# 01 — Default editor view

  Right after login + project pick, the editor opens onto the project root. Monaco shows a welcome banner, the file explorer lists the seeded files, and the bottom panel starts collapsed.

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![01 — Default editor view — desktop](../screenshots/editor/01-editor-default.png) | ![01 — Default editor view — mobile](../screenshots/editor/mobile/01-editor-default.png) |
  
  ## What it does

  - `<LayoutHeader />` shows the project name + path, command palette button, and theme toggle.
- `<Sidebar />` defaults to the **Explorer** tab (`activeSidebarTab = 'explorer'`).
- Bottom panel is `'none'` unless the user navigated in with `?autoinstall=1` (in which case the terminal opens with the install command pre-loaded).

  ## Source files

  - [`client/editor/coding.tsx`](../../client/editor/coding.tsx)
- [`client/editor/Layout.tsx`](../../client/editor/Layout.tsx)
- [`client/editor/Sidebar.tsx`](../../client/editor/Sidebar.tsx)

  ---

  ← Back to the [editor index](./README.md).
  