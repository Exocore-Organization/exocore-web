# 05 — Webview / preview (desktop only)

  Whenever the runtime detects a freshly-bound HTTP server it surfaces the URL inside an embedded `<iframe>` (`Webview.tsx`). The mobile capture intentionally skips this frame — the embedded preview iframe consistently crashes the Chromium 138 mobile target during Puppeteer captures.

  ## Screenshot

  ![05 — Webview / preview (desktop only) — desktop](../screenshots/editor/05-editor-webview.png)

  > Mobile capture is intentionally skipped for this frame — the embedded preview iframe crashes the Chromium 138 mobile target during Puppeteer runs.
  
  ## What it does

  - Detection: a small line-scanner inside `runtime.ts` watches stdout for `Listening on http://…` / `Local: http://…` and feeds the URL to the webview pane.
- Reverse-proxy: `/exocore/api/editor/proxy/:projectId/*` rewrites HTML/JS to keep relative URLs pointing at the proxy.
- Tunnel button next to the URL spawns a Cloudflare quick-tunnel for sharing.

  ## Source files

  - [`client/editor/Webview.tsx`](../../client/editor/Webview.tsx)
- [`routes/editor/runtime.ts`](../../routes/editor/runtime.ts)

  ---

  ← Back to the [editor index](./README.md).
  