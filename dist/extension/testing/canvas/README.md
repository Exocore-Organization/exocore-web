# Canvas (EXO × CANVAS)

Vanilla port of `client/editor/VisualCanvasEditor.tsx` packaged as an Exocore
extension.

## What it does

- Opens a fullscreen visual editor on top of the code editor.
- Drag-place **rectangles**, **circles**, **text** and **images** on a fixed
  canvas (presets: 800×500, 1080×1080, 1280×720, 540×960).
- Move, resize, lock, hide, reorder layers; HEX-pick fills + strokes.
- **Apply Code** writes generated source straight into the active tab:
    - `.html` / `.htm` → standalone HTML page with inline `<canvas>` script.
    - `.js` / `.ts` → either a browser `renderExoCanvas(canvas)` function or
      a Node `canvas` script (auto-detected from the existing import).
    - any other file → falls back to the HTML output.

## How to open

- **Command palette** → `Canvas: Open Visual Editor`
- **Status bar** → click the **CANVAS** chip on the right side
- **Keyboard** → `Ctrl/⌘ + Shift + V`

## Keyboard shortcuts (inside the canvas)

| Key                        | Action                              |
|----------------------------|-------------------------------------|
| `Esc`                      | Close the canvas editor             |
| `Delete` / `Backspace`     | Remove the selected shape           |
| `Arrow ←/→/↑/↓`            | Nudge selection 1 px (Shift = 10 px)|
| `Ctrl/⌘ + Z`               | Undo                                |
| `Ctrl/⌘ + Shift + Z` / `Y` | Redo                                |

## Notes

- The extension lives in the `testing/` channel so it auto-loads on every
  editor boot. Once it's promoted, drop the folder under `official/` instead
  and remove it from `testing/`.
- The original React component had a generated-code preview strip at the
  bottom; it ships the same way here.
