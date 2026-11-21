# Project Handoff State

- **Last Updated By:** Claude (implementer, production-line control, 2026-11-22)
- **Current Goal:** First playable is finished (Steps 1 to 18 `done`). This round added two user-decided controls: pantry pause and overnight cleanup. Remaining work is the user's playtest and the balance decision below.
- **Recent Changes & Files Touched:**
  - Pantry pause (commit 1): `configure { paused }` and `setPantriesPaused` (`src/sim/commands.ts`, `grid.ts`, `tick.ts`, `types.ts`), status `paused`, one undo entry for the bulk command (`src/ui/undo.ts`), view helper `src/ui/pantryPause.ts`, Inspector toggle, Build panel "Pause / Resume pantries" button, canvas badge, `blockReason.ts`. The flag exists only while paused, so no hash changed; old saves load (`src/persist/save.ts`). Pause works in every phase.
  - Overnight cleanup (commit 2): `clearOvernight` in `src/sim/spoil.ts`, called by `endDay` (`day.ts`); new stats `wasteOvernight` / `overnightByItem` (part of `wasteSpoiled`), optional on load; summary row "Waste: left at close"; the bottleneck hint ignores it.
  - Docs: GAME_DESIGN section 4, 5.3, 6.3 and changelog; plan note "Production-line control" after the Journey simulation.
- **Active Decisions / Constraints:**
  - Re-measure (20 seeds): throttled journey still 20/20 (end screen day 11 -> 12). `--no-throttle` drops from 19/20 to 11/20. Every layout still profits but less: 5-day profit saladLine 112 -> 77, sandwichLine 98 -> 55, friesLine 271 -> 262, friesSaladLine 324 -> 286, burgerLine 76 -> 43, soupLine 105 -> 93, riceBowlLine 214 -> 196. Cause: the pipeline is refilled every morning and binned at close.
  - No other numbers were changed. The scripted player (`src/harness/player.ts`) never pauses pantries.
  - Wall-clock perf tests (`src/harness/perf.test.ts`) fail when the machine is loaded (they also failed on the previous commit); run them alone.
  - Work in a worktree; commit and push each finished piece (CLAUDE.md Workflow).
- **Exact Next Step:** The user decides whether the overnight cost is acceptable (options in the plan note: teach the player to pause pantries before close, cheaper refills, or leave it), then re-run `npm run sim -- --journey --seeds 20` with and without `--no-throttle`. Earlier playtest asks still stand: 2 days of fries then salad, judge money pace, waiting and waste clarity, and try the new pause buttons.
