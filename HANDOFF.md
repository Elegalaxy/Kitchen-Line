# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 4, 2026-11-19)
- **Current Goal:** Step 5 of `doc/plans/2026-11-19-first-playable.md`: building UX (palette, ghost, drag-belts, rotate, remove, inspector, undo, keyboard).
- **Recent Changes & Files Touched (Step 4, done):**
  - `src/ui/store.ts`: `createStore` / `getGameStore` / `useSnapshot`; `dispatch`, `setSpeed`, `togglePause`, `advance(n)`; `createThrottle`; `newGameState(defs, layout)`.
  - `src/ui/loop.ts`: rAF loop, `advanceAccumulator` (100 ms/tick / speed, max 40 ticks per frame, backlog dropped).
  - `src/ui/canvas/`: `GridCanvas.tsx` (imperative per-frame draw), `draw.ts` (scene, palette read from CSS tokens, `fitTile` 32..64), `itemMotion.ts` (display easing in tile units).
  - `src/ui/TopBar.tsx`, `App.tsx` (Space toggles pause), `styles.css` (top bar, segmented control, grid wrap).
  - `src/content/layouts.ts`: `LAYOUTS.demoBeltLine`, applied in dev via `?layout=demoBeltLine`.
  - Tests: `loop.test.ts`, `store.test.ts`, `canvas/itemMotion.test.ts`. Plan Step 4 set to `done`.
- **Active Decisions / Constraints:**
  - The canvas reads `store.getState()` each frame; React only sees the snapshot, replaced at most 5 times a second for ticks (commands and speed publish at once).
  - Canvas tile size comes from the container via ResizeObserver; the canvas is exactly the grid. There is no pixel offset, so Step 5 hit-testing is `floor(offset / tile)` on the canvas rect (tile size from `fitTile`, exported from `draw.ts`).
  - Only belt items are drawn moving; station contents are count badges. The pass shows its `delivered` count (placeholder until Step 6).
  - demoBeltLine has 6 belts (not 5): the grid is 8 wide with pantry at x=0 and pass at x=7.
  - Sim rules from Step 3 still hold: rejected commands return the original state; `state.events` holds only the last tick.
  - Visual check done only in the in-app browser (desktop and 375 px width); 4x speed was not eyeballed, only unit-tested.
- **Exact Next Step:** Implement Step 5 in a fresh worktree from `origin/main`: palette, ghost placement, drag-belts, rotate, remove, inspector, undo and keyboard, dispatching sim commands through `store.dispatch`.
