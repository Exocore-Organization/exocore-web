# FAHH — Terminal Error Sound

Never miss a failed command again! **FAHH** plays a short alert sound whenever a terminal command exits with a non-zero status code.

Ported from the [VS Code FAHH Sound Extension](https://github.com/Roahn333singh/Faah..Sound-Extention) by Rohan Singh, adapted for Exocore's web-based terminal.

---

## What it does

- **Listens** to your terminal — every time a shell command fails (e.g. `npm install` errors, `python: command not found`, compile failures), it plays a descending three-tone alert sound synthesised in the browser via the Web Audio API.
- **No files needed** — the sound is generated on-the-fly; no MP3 or audio file is required.
- **Debounced** — won't spam sounds if multiple errors appear in quick succession (1.5 s cooldown).

---

## How to use

| Method | Action |
|---|---|
| **Status bar** | Click `🔔 FAHH` to toggle mute / unmute |
| **Command palette** | `FAHH: Toggle error sound` |
| **Command palette** | `FAHH: Test error sound` — play the alarm right now |
| **Command palette** | `FAHH: Volume +10` / `FAHH: Volume −10` |

Settings are **persisted** across reloads.

---

## Detection strategy

1. **Shell integration** (best) — injects a `PROMPT_COMMAND` hook that sends a private escape sequence (`\033]9000;FAHH\007`) on every non-zero exit code. Works in bash and zsh.
2. **Terminal data events** — listens to `exo:terminal-data` events dispatched by the Exocore terminal panel.
3. **Pattern matching** (fallback) — watches terminal output for strings like `error:`, `fatal:`, `command not found`, `npm ERR!`, `exit code 1`, etc.

---

## Credits

Original VS Code extension by **Rohan Singh** — adapted for Exocore.
