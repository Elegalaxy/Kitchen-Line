# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 10, 2026-11-20)
- **Current Goal:** Step 11 of `doc/plans/2026-11-19-first-playable.md`: customers, orders and economy.
- **Recent Changes & Files Touched (Step 10, done):**
  - `src/sim/day.ts` (new): `phaseAt(dayTick)` (open, lunchRush, quiet, dinnerRush, closing), `endDay`, `advanceDayClock`. `constants.ts`: `DAY_TICKS` 2400, `DAY_PHASE_STARTS`.
  - `src/sim/tick.ts`: `stepTick` advances `dayTick` and ends the day at 2400 (phase `summary`, `lastDay = today`, `totals.days++`; `dayTick` stays 2400 until dismissed). `runTicks` does nothing unless phase is `service` and stops the tick the day ends.
  - `src/sim/commands.ts`: `openService` (build only; `dayTick = 0`, fresh `today`), `dismissSummary` (summary only; `day++`, `dayTick = 0`). `setMenu`/`setPrice`/`unlockRecipe` still do not exist (Step 14): rejected with reason 'Menu is locked during service' in service, 'not implemented' otherwise.
  - UI: `TopBar.tsx` (clock, phase badge, day bar with labelled striped rush bands, primary 'Open for service' in build), `App.tsx` placeholder summary banner with 'Continue' (real summary is Step 15), `format.ts` (`clockText`, `PHASE_TEXT`, `phaseKey`), `styles.css`.
  - Dev `?layout=` loader (`newGameState` in `store.ts`) now opens service after applying the layout.
  - Tests: `src/sim/day.test.ts` (7). Fixtures in `logistics`, `stations`, `spoil`, `tick`, `layouts`, `itemMotion` tests now set phase `service` (after building, so nothing warms up); `grid.test.ts` asserts `buyExpansion` (not `openService`) is 'not implemented'. No asserted numbers changed.
- **Active Decisions / Constraints:**
  - Any sim test that calls `runTicks` needs phase `service` first (`openService` or `s.phase = 'service'`).
  - `openService` replaces `today` with fresh stats; `totals.profit` and `totals.served` are not updated at day end yet (Step 11/12).
  - `state.events` holds only the last tick's events; use the `runTicks` callback. Rejected commands return the original state with the event in `result.event`.
  - Banned word `process` in `src/sim`. Python edits of files with emoji need `encoding='utf-8'` on Windows. Sim tests import only `vitest` and `src/sim`.
  - Money is integer cents; provisional numbers only in `constants.ts` and `src/content/*`.
- **Exact Next Step:** Step 11: `src/sim/customers.ts`, `economy.ts`: arrivals each service tick except in `closing` (use `phaseAt`), prefs/budget/patience from the `arrivals` stream, choice and pass matching, lostNoMatch/lostFull/lostPatience, drop leftovers at day end (call from `endDay` or the tick), `OrdersStrip` UI.
