# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 9, 2026-11-20)
- **Current Goal:** Step 10 of `doc/plans/2026-11-19-first-playable.md`: day cycle, phases, warm-up, clock.
- **Recent Changes & Files Touched (Step 9, done):**
  - `src/sim/spoil.ts` (new): `stepSpoilage` runs at the start of every `stepTick` (after events are cleared, before anything moves). An item with `spoilTicks` and `tick - bornTick >= spoilTicks` is removed wherever it is (belt slots, station input/output, assembler inputs/output, routing buffer, pass shelf). Adds `today.wasteSpoiled` and a `spoiled` event (tick, x, y, item) at the building's anchor tile. Exports `buildingItems(b)` and `isSpoiled`. A station whose first input spoils resets `progress` to 0.
  - `src/sim/tick.ts`: calls `stepSpoilage`; `runTicks(state, defs, n, onTickEvents?)` has an optional callback with each tick's events. `types.ts`: `spoiled` SimEvent.
  - `src/ui/store.ts`: `advance` collects `spoiled` events through that callback; `takeSpoils()` returns and clears them (cap 200). `GridCanvas.tsx` drains them every frame into 600 ms puffs.
  - `src/ui/canvas/draw.ts`: optional `Fx` (clock, reduced-motion, puffs). Item or station holding an item in the last third of its life: ⚠ badge plus pulsing `--warn` outline (steady under `prefers-reduced-motion`). 🗑 puff rises and fades.
  - Tests: `src/sim/spoil.test.ts` (7 tests). No existing test numbers or hashes changed.
- **Active Decisions / Constraints:**
  - Spoil timing: item born at B is removed during tick B + `spoilTicks` (a station or assembler output resets bornTick to now, so a sliced tomato is as fresh as it is made).
  - The pass still serves dishes at once; its shelf stays empty until customers exist (Step 11), so the 300-tick dish test places the dish on the shelf directly.
  - `state.events` holds only the last tick's events; use the `runTicks` callback, not history.
  - Banned word `process` in `src/sim`. Python edits of files with emoji need `encoding='utf-8'` on Windows. Sim tests import only `vitest` and `src/sim`.
  - Money is integer cents; provisional numbers only in `constants.ts` and `src/content/*`.
- **Exact Next Step:** Step 10: `src/sim/day.ts` (`openService`, `dismissSummary`, `phaseAt`), `runTicks` runs only in `service`, day ends at 2400 service ticks, `place` during service sets `onlineAt = tick + 30` for non-belts, menu/price/unlock rejected in service; TopBar clock, phase badge, day bar and "Open for service". Note: the UI loop and the dev loader (`?layout=`) currently tick in build phase, which Step 10 stops; decide how dev layouts start service.
