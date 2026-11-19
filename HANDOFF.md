# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 3, 2026-11-19)
- **Current Goal:** Step 4 of `doc/plans/2026-11-19-first-playable.md`: canvas renderer, store and game loop (first visible slice).
- **Recent Changes & Files Touched (Step 3, done):**
  - `src/sim/tick.ts`: `runTicks` (clones once) and `stepTick`; belt, pantry, pass and bin rules. Re-exported from `game.ts`.
  - `src/sim/transfer.ts`: `tryInsert(state, building, item, fromDir)` and `opposite`. `src/sim/order.ts`: `updateOrder` (non-belts by id, then belts by distance to chain end, cycles last by id; recomputed every tick).
  - `src/sim/types.ts`: `GameState.nextItemId`, pass building `delivered` counter, events `emit`, `delivered`, `binned`. `constants.ts`: belt step ticks. `game.ts`: initialises both.
  - `src/sim/tick.test.ts`: inline Defs fixture, hand-built lines on a 9x9 grid.
  - Plan Step 3 set to `done`.
- **Active Decisions / Constraints:**
  - Sim tests may import only `vitest` and `src/sim`; use inline Defs fixtures.
  - A rejected command returns the original state; the `commandRejected` event is in `result.event`, not `state.events`.
  - `state.events` is replaced at the start of every tick, so after `runTicks(s, d, n)` it holds only the last tick's events. The UI should read events per tick (step 1 tick at a time) or use counters.
  - `fromDir` in `tryInsert` = direction from the receiver towards the sender. A belt refuses a sender at its front.
  - Belt step runs when `state.tick % 3 === 0` (fast: 2) using the tick before it increments. A pantry with cooldown 0 emits at once (first emit at tick 0), then every `interval` ticks. Pantry status: `noCash` is checked before `blocked`.
  - Pass accepts any item for now and only counts `delivered` (nothing on the shelf); Step 6 restricts it to dishes. Bin adds 1 to `today.wasteBinned` per item.
  - `runTicks` runs in any phase until Step 10; it does not touch `dayTick`.
  - Exact numbers: 5 belts, pantry to pass, first delivery event at tick 30; 29 deliveries in 600 ticks at interval 20.
- **Exact Next Step:** Implement Step 4 in a fresh worktree from `origin/main`: Canvas 2D renderer in `src/ui/canvas/`, store, game loop, so a belt line visibly moves items on screen.
