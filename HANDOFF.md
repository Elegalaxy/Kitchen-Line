# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 6, 2026-11-20)
- **Current Goal:** Step 7 of `doc/plans/2026-11-19-first-playable.md`: splitter, merger, filter.
- **Recent Changes & Files Touched (Step 6, done):**
  - `src/sim/stations.ts` (new): `stepStation` for chopper/fryer/stove. `progress` counts up from 0 for `input[0]`; output made at `recipe.ticks` and pushed the same tick; a stuck output means `blocked` and no progress.
  - `src/sim/transfer.ts`: `tryInsert(state, defs, building, item, fromDir)` (new `defs` arg). Stations accept only recipe inputs, fewer than 2 queued, not from their front. The pass accepts dishes only (by def kind), counts `delivered` and `today.served`, and serves at once (shelf stays empty until Step 11). `findStationRecipe` lives here.
  - `src/sim/tick.ts`, `constants.ts` (`STATION_INPUT_CAP`, `PASS_SHELF_CAP`), `types.ts` (new event `stationDone`; `process` is banned by the architecture test).
  - `src/ui/canvas/draw.ts`: status badges (idle muted, blocked bad, warming info, no cash warn; glyph plus colour), station progress bar. `src/content/layouts.ts`: `friesLine` (pantry, belt, chopper, belt, fryer, 2 belts, pass; $69).
  - Tests: `src/sim/stations.test.ts` (new); `tick.test.ts` pantry now emits a dish-kind `plate` because the pass refuses non-dishes.
- **Active Decisions / Constraints:**
  - Timing: first fries served at tick 81; the fryer makes one per 40 ticks (28 fries in 1200 ticks); belt steps jitter delivery gaps by 1 to 2 ticks. Stations update with non-belts before belts, so the pass/stations push first.
  - `demoBeltLine` now stalls at the pass (raw potatoes are refused); kept as a stall demo.
  - Pass and bin get no status badge (they flip every tick). Chopper/fryer show no badge while working (`ok`).
  - Not tried: placing a stove with the idle badge at full zoom beyond a small screenshot; build during service/warm-up visuals.
- **Exact Next Step:** Step 7: splitter, merger and filter in `src/sim` (buffers of 1, round-robin `rr`, `filterItem`), acceptance in `transfer.ts`, drawing and inspector config. Use `stepStation`'s push pattern and inline Defs fixtures in tests.
