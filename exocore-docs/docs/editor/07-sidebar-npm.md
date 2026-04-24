# 07 — NPM sidebar pane

  `NpmPane.tsx` searches the public registry, lists the project's installed dependencies, and (when an access token is present in localStorage) lets you publish a new version.

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![07 — NPM sidebar pane — desktop](../screenshots/editor/07-sidebar-npm.png) | ![07 — NPM sidebar pane — mobile](../screenshots/editor/mobile/07-sidebar-npm.png) |
  
  ## What it does

  - Search proxies through `/exocore/api/editor/npm/search?q=…` to avoid CORS and to allow private-registry overrides.
- Install / uninstall calls into `routes/editor/npm.ts` which runs `npm install --save` inside the project workspace.
- Publish flow uses the user's npm access token (stored client-side, never echoed back to the server logs).

  ## Source files

  - [`client/editor/NpmPane.tsx`](../../client/editor/NpmPane.tsx)
- [`routes/editor/npm.ts`](../../routes/editor/npm.ts)

  ---

  ← Back to the [editor index](./README.md).
  