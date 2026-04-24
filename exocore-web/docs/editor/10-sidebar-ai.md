# 10 — AI sidebar pane

  `ExocoreAI.tsx` is the in-editor chat assistant. It streams Server-Sent Events from `routes/editor/ai.ts`, supports file / terminal tool-use, and can target the built-in Exo provider or any user-configured OpenAI / Anthropic / OpenRouter key.

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![10 — AI sidebar pane — desktop](../screenshots/editor/10-sidebar-ai.png) | ![10 — AI sidebar pane — mobile](../screenshots/editor/mobile/10-sidebar-ai.png) |
  
  ## What it does

  - Chat tab — ChatGPT-style stream with code-blocks, file-attach, and an `Apply diff` button that pipes the suggested change through Monaco's diff merger.
- Setup tab — pick provider, paste API key (kept in localStorage), set system prompt, choose model.
- Tool-use is gated server-side: every read / write / shell call is logged in the project's `.exocore/ai-audit.log`.

  ## Source files

  - [`client/editor/ExocoreAI.tsx`](../../client/editor/ExocoreAI.tsx)
- [`client/editor/ai/ExoSetupPanel.tsx`](../../client/editor/ai/ExoSetupPanel.tsx)
- [`client/editor/ai/RestSetupPanel.tsx`](../../client/editor/ai/RestSetupPanel.tsx)
- [`routes/editor/ai.ts`](../../routes/editor/ai.ts)

  ---

  ← Back to the [editor index](./README.md).
  