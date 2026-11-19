# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 8, 2026-11-20)
- **Current Goal:** Step 9 of `doc/plans/2026-11-19-first-playable.md`: freshness, spoilage and waste.
- **Recent Changes & Files Touched (Step 8, done):**
  - `src/sim/stations.ts`: `stepAssembler`. With no recipe: `noRecipe`. Starts when the output is empty and every recipe input holds at least 1; `progress` counts up to `ASSEMBLER_TICKS` (30), then one of each input is consumed and the dish is made (bornTick = now) and pushed out the front of the anchor. Status `blocked` (dish stuck), `ok`, `idle` (input missing). New event `assembled`.
  - `src/sim/transfer.ts`: assembler accepts only recipe inputs, fewer than `ASSEMBLER_INPUT_CAP` (2) of that input, never from `dir` (front). `constants.ts` has both constants; `tick.ts` calls `stepAssembler` with the non-belts.
  - `src/sim/layout.ts` (new): `applyLayout(state, defs, commands, setup?)`, the dev loader. `LAYOUT_SETUP` in `src/content/layouts.ts` unlocks the dish and sets money to $300 (no sales exist until Step 11, so $150 runs dry). `src/ui/store.ts` `newGameState` uses it.
  - `src/content/layouts.ts`: `saladLine`, `soupLine`, `sandwichLine`, `burgerLine`, `riceBowlLine`, all inside 8x6; each assembler input has its own feed (anchor (4,2) facing E, second tile (4,3); 3-input lines add pantry (4,0) and a processor (4,1) facing S).
  - `src/ui/canvas/draw.ts`: pips on the assembler's second tile, ❓ badge, progress bar, recipe emoji. `Inspector.tsx`: recipe select lists unlocked dishes only, shows assembler progress.
  - Tests: `stations.test.ts` (assembler block), `src/content/layouts.test.ts` (6 dish lines on real DEFS, 5+ dishes in 1200 ticks, missing ingredient idle).
- **Active Decisions / Constraints:**
  - No grid-size change: all layouts fit the 8x6 start grid (plan said 10x8). Expansion is Step 16.
  - Assembler accepts from any side except `dir`, for both of its tiles. The second tile's front side is also refused.
  - Spoilage is not built: `ItemDef.spoilTicks` exists in content but the sim ignores it until Step 9. The plan text says `shelfTicks`; the field is `spoilTicks`.
  - Banned word `process` in `src/sim`. Python edits of files with emoji need `encoding='utf-8'` on Windows.
  - Sim tests import only `vitest` and `src/sim`; content-level tests (real DEFS) live in `src/content/*.test.ts`.
- **Exact Next Step:** Step 9: `src/sim/spoil.ts` removes items past `spoilTicks` wherever they are (belts, buffers, station slots, assembler inputs, shelf), adds `today.wasteSpoiled` and a `spoiled` event with position; renderer shows a warning marker in the last third. Spoilage changes item lifetimes, so line tests (e.g. the 600-tick tomato on a dead-end belt) shift; note hash changes.
