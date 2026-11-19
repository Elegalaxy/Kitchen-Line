# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 2, 2026-11-19)
- **Current Goal:** Step 3 of `doc/plans/2026-11-19-first-playable.md`: tick loop (pantry, belts, pass, bin).
- **Recent Changes & Files Touched (Step 2, done):**
  - `src/sim/`: `types.ts` (data model, `Defs`, `Command`, `RejectReason`), `constants.ts`, `rng.ts` and `hash.ts` (copied; streams `arrivals`, `reviews`), `grid.ts` (geometry, `canPlace`, `configReason`), `commands.ts` (`applyCommand`: place/remove/rotate/configure), `game.ts` (`createGame`, `newBuilding`).
  - `src/content/`: `items.ts`, `buildings.ts`, `recipes.ts`, `dishes.ts`, `index.ts` (`DEFS`).
  - Tests: `src/sim/grid.test.ts` (inline Defs fixture), `src/content/content.test.ts` (also a smoke test on real `DEFS`).
  - Plan Step 2 set to `done`.
- **Active Decisions / Constraints:**
  - Sim tests may import only `vitest` and `src/sim` (architecture test), so they cannot use `DEFS`. Use an inline fixture; real-content checks go in `src/content`.
  - A rejected command returns the original state object and puts the `commandRejected` event in `result.event`, not in `state.events`, so the state stays hash-identical. The store/UI should log `result.event`.
  - Remove refunds 100% and adds the number of items inside to `today.wasteDestroyed` (an item count). Changing an assembler recipe or a filter item also destroys items inside.
  - Non-belt buildings placed during `service` get `onlineAt = tick + 30` and status `warming`. Place, remove, rotate and configure are only accepted in `build` and `service`.
  - Other commands (`setMenu`, `openService`, ...) are rejected as `not implemented` until their steps.
  - Fast belt = `config.fast` on a belt `place` (cost 300, restaurant tier); not configurable later.
  - Assembler second tile is the tile right of the anchor (`dir + 1`). Rotating checks bounds and occupancy of the new footprint.
  - No item id counter yet: Step 3 must add one to `GameState` when it creates items.
- **Exact Next Step:** Implement Step 3 in a fresh worktree from `origin/main`: `runTicks`, `stepTick`, `transfer.ts`, `order.ts`, belt/pantry/pass/bin behaviour and `tick.test.ts`, then commit and push.
