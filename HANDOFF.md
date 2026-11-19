# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 5, 2026-11-20)
- **Current Goal:** Step 6 of `doc/plans/2026-11-19-first-playable.md`: processing stations, dish-only pass, the fries line.
- **Recent Changes & Files Touched (Step 5, done):**
  - `src/ui/undo.ts`: inverse commands (place/remove/rotate x3/configure), `applyGroup` (all-or-nothing), `undoLast`, 50-entry cap.
  - `src/ui/store.ts`: `dispatch` records build commands for undo; `dispatchGroup(cmds, label)` = one action, one undo entry; `undo()`; snapshot has `undo: { count, label }`.
  - `src/ui/uiState.ts` (tool, ghost dir, cursor, drag, selection, toast), `actions.ts` (mouse/keyboard actions), `hotkeys.ts`, `palette.ts`, `format.ts` (money, reason text).
  - `src/ui/canvas/input.ts` (tileAt, L-path `planBeltDrag`, `computeOverlay`), `draw.ts` (`drawOverlay`), `GridCanvas.tsx` (pointer events).
  - `src/ui/BuildPalette.tsx`, `Inspector.tsx`, `Toast.tsx`, `App.tsx`, `styles.css`. Tests: `undo.test.ts`, `hotkeys.test.ts`, `canvas/input.test.ts`.
- **Active Decisions / Constraints:**
  - Ghost and drag validity come from the sim (`canPlace`, `placeCost`), so preview and sim agree.
  - Undo is not time travel: `nextId` and `events` are not rolled back, and a re-placed building gets a new id. Items inside a sold building are not restored. Tests compare states with `nextId`/`events` normalised.
  - Keyboard: Enter places a belt and advances the cursor one tile in its facing. R rotates the ghost while a tool is active, else the selected building.
  - Fast belt is not in the palette (needs restaurant tier, Step 16). Inspector station progress assumes `progress` counts up from 0: confirm in Step 6.
  - Visual check was in the in-app browser only (desktop and 375 px); touch input was not tried on a real device.
- **Exact Next Step:** Implement Step 6 in a fresh worktree from `origin/main`: chopper, fryer and stove processing in `src/sim`, the dish-only pass, status badges, and the `friesLine` layout. The Step 5 inspector already shows station progress and held items.
