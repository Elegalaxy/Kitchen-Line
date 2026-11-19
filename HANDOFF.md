# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 15, 2026-11-20)
- **Current Goal:** Step 16 of `doc/plans/2026-11-19-first-playable.md`: goals, restaurant tier, expansions, end screen. Steps 1 to 15 are done.
- **Recent Changes & Files Touched (Step 15):**
  - `src/sim/summary.ts`: pure `summarizeDay(stats, prevStats, {now, atDayStart})` (KPIs, deltas or null, dish rows, worst dish, `bottleneckHint`), `bottleneckHintOf`, `worstDishOf`. Hint rule: largest of lostPatience / lostNoMatch / wasteSpoiled wins; ties patience, noMatch, waste; no hint when all 0 (queue-full losses and binned/destroyed waste never hint). Patience names the worst dish, waste names the most-spoiled item.
  - Sim additions: `DayStats.spoiledByItem` (counted in `spoil.ts`), `GameState.prevDay` (set in `endDay`, used for deltas), `TICKS_PER_SECOND` in `constants.ts`. Hashes changed; no fixtures held any.
  - UI: `DaySummary.tsx` (modal, replaces the placeholder banner in `App.tsx`) and `daySummaryView.ts` (deltas with arrow and sign, hint text, stars, `pickReviews`); `.modal*` and `.sum-*` styles in `styles.css` (old `.summary` rules removed).
  - Tests: `summary.test.ts`, `daySummaryView.test.ts`; one assertion added to `spoil.test.ts`.
- **Active Decisions / Constraints:**
  - The modal has a fixed size across days: every dish gets a row, 3 review slots and the delta rows are reserved. Esc does nothing; focus is on "Back to kitchen" and trapped; all keys stop at the dialog.
  - Reputation delta compares values at 1 decimal (what the UI shows). It is the change over the day, not vs the previous day.
  - `totals.profit` is still NOT updated anywhere. Step 16 goals need it: add `totals.profit += profitOf(today)` in `endDay` (changes hashes after day end) or compute from days.
  - The top bar rating arrow in the build phase still compares against `repAtDayStart` of the finished day (it only resets at `openService`); cosmetic, not touched.
  - Harness `withMenu` still writes the menu directly. Sim tests import only `vitest` and `src/sim`; no `process`/`Date`/`console` in `src/sim`.
  - Commit and push each finished step (CLAUDE.md Workflow); work in a worktree.
- **Exact Next Step:** Step 16: goals as data (`src/content/goals.ts`), `upgradeTier`, `buyExpansion`, end screen, `GoalsPanel` (replaces the Goals tab placeholder). Decide where `totals.profit` is updated first. The user wants to review Step 15 by playing 2 days.
