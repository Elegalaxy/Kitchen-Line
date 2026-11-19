# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 16, 2026-11-20)
- **Current Goal:** Step 17 of `doc/plans/2026-11-19-first-playable.md`: save and load (key `kitchen-line.save.v1`, `src/persist`). Steps 1 to 16 are done.
- **Recent Changes & Files Touched (Step 16):**
  - Content: `src/content/goals.ts` (4 stall goals, 2 restaurant goals, threshold constants), `src/content/expansions.ts` (10x8 $100, 12x9 $200, 14x11 $350, 16x12 $500; from 12x9 needs restaurant). Both go into `DEFS` as `Defs.goals` / `Defs.expansions` (optional, like `reviewTemplates`; sim never imports content).
  - Sim: `src/sim/goals.ts` (`updateGoals`, `checkWin`, `upgradeProblem`, `expansionProblem`, `nextExpansion`); `upgradeTier` ($250 `UPGRADE_COST`) and `buyExpansion` in `commands.ts` (build phase only); `endDay(state, defs)` adds `profitOf(today)` to `totals.profit`, re-checks goals, sets `phase = 'won'` once. Goals are also checked at each service tick end and after every accepted command. `dismissSummary` also leaves `won` ("Keep playing"). New events `goalDone`, `tierUpgraded`, `expanded`, `won`; new reject reasons `goals not done`, `already restaurant`, `no more expansions`.
  - UI: `GoalsPanel.tsx`, `EndScreen.tsx`, `goalsView.ts`, `modalKeys.ts` (shared by DaySummary and EndScreen), Goals styles; dev-only `?cheat=progress|goals|restaurant|won` in `store.ts` (DEV builds only).
  - Tests: `src/sim/goals.test.ts`, `src/content/goals.test.ts`, `src/ui/goalsView.test.ts`; one expectation changed in `grid.test.ts` (`buyExpansion` with no expansions defined now rejects `no more expansions`).
- **Active Decisions / Constraints:**
  - New state fields Step 17 must persist: `won` (boolean), plus the already existing `goalsDone`, `tier`, `expansion`, `width`, `height`, `tiles`, `totals`, `prevDay`, `repAtDayStart`. A save may be in phase `won`; loading must keep it.
  - Restaurant goals are watched only at tier restaurant. "Great day" ($300 profit, 90% served, 4.2 stars) can only complete at day end (phase `summary`), so upgrading right after a great stall day does not complete it. `totals.profit` grows at day end; the stall profit goal adds the day in progress while service runs.
  - Undo stack is left alone on expansion (inverse commands use coordinates, which do not move).
  - Fast belts are unlocked in the sim after the upgrade but the palette has no fast belt entry yet (only the sim `place` config `fast`). Cheap follow-up if wanted in Step 18.
  - Sim tests import only `vitest` and `src/sim` (inline Defs fixtures); no `process`/`Date`/`console` in `src/sim`. Harness `withMenu` still writes the menu directly.
  - Commit and push each finished step (CLAUDE.md Workflow); work in a worktree.
- **Exact Next Step:** Step 17: versioned save in `src/persist` (import only sim types), autosave and load in the store, validate untrusted saves (include `won`, goals, expansion size and tile array length), UI messages on save errors.
