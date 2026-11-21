# Project Handoff State

- **Last Updated By:** Claude (implementer, pass shelf and goal 5, 2026-11-22)
- **Current Goal:** First playable is finished (Steps 1 to 18 `done`). Two user decisions were applied this session: non-blocking pass shelf and a rewritten goal 5. The side effect on profit needs a decision.
- **Recent Changes & Files Touched:**
  - Pass shelf (`src/sim/transfer.ts`): the pass never refuses a dish; a 5th copy of a dish (PASS_SHELF_CAP 4) drops the oldest unsold copy, counted as spoiled (`wasteSpoiled`, `spoiledByItem`, `spoiled` event). `src/ui/blockReason.ts` and `buildingInfo.ts` text updated. Tests in `src/sim/customers.test.ts`.
  - Goal 5 (`src/content/goals.ts`, `GOAL_DISH_SALES` = 10 in `src/sim/constants.ts`): "Sell 5 different dishes, 10+ of each, in one day"; id `menu-5` kept (old saves load); checks today and, at day end (summary), the last day; note lists the best day's dishes. Tests in `goals.test.ts`, `goalsView.test.ts`, `save.test.ts`.
  - Docs: GAME_DESIGN 5.3 row, section 8 and changelog; plan 2.5 goal row and a "Re-measure" note under Journey simulation. Harness `player.ts` comments only.
- **Active Decisions / Constraints (30-seed journey):**
  - Throttled player: 30/30 finish (was 29/30); goal 5 day 12, goal 6 day 11, end screen day 12 (was 10, 9, 10); about 48 min of service at 1x. Goal 5 now comes about with goal 6. Without the throttle 26/30 finish (was 17/30).
  - PROBLEM: back-pressure used to throttle pantries for free; now surplus is thrown away at the pass (about 87 dishes a day with the throttle, 145 without). Single-dish layouts lose profit: saladLine 5-day profit $152 to -$20, sandwichLine $158 to -$102, friesSaladLine $390 to $268. The Step 18 target "no layout loses money" fails for salad and sandwich. Not tuned (user said stop and report).
  - Open proposals: pantry stops when the shelf is full, money sink after the upgrade, goal 6 about $450, second pass.
  - Work in a worktree; commit and push each finished piece (CLAUDE.md Workflow).
- **Exact Next Step:** The user decides how to stop the overproduction waste (see PROBLEM) and the pace target; then change the design doc first, the numbers or rule next, and re-run `npm run sim -- --journey --seeds 30` and the layout table.
