# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 18 balance half, 2026-11-20)
- **Current Goal:** The first playable is finished (Steps 1 to 18 all `done`). Remaining work is the user's playtest and any number tweaks that come out of it.
- **Recent Changes & Files Touched (Step 18 balance):**
  - Numbers (provisional only): arrival gaps 150/50 -> 100/30 ticks (`src/sim/constants.ts`), customer budget 90-140% -> 100-160% (same file), dish spoilage 300 -> 600 ticks (`src/content/items.ts`), fryer 40 -> 60 ticks (`src/content/recipes.ts`). Rating values, prices, costs and goals are unchanged.
  - One rule change: the pass shelf holds up to 4 of EACH dish (was 4 dishes in total, which let an unsold dish block all others): `src/sim/transfer.ts`.
  - New layout `friesSaladLine` in `src/content/layouts.ts` (dev loader, `?layout=friesSaladLine`).
  - Tests: arrival tests use the constants, `spoil.test.ts` compares only `spoiled` events, new tests for the per-dish shelf and avgWait (`customers.test.ts`) and the new layout (`layouts.test.ts`).
  - Docs: plan section 2.5 table and economy paragraph, Step 18 Progress (before/after table), `doc/GAME_DESIGN.md` changelog, 5.3 and 6.2.
  - Finding: summary `avgWait` 0.0 is genuine (dishes are on the shelf before customers arrive); it is not a bug.
- **Active Decisions / Constraints:**
  - Results (harness, 20-30 seeds): every dish line now profits (mean $24 to $78 a day), stall goals done by day 4 median with an efficient player (3 to 6 across seeds).
  - Known gap: at the stall tier one fryer is busy all rush from about 4 stars but customers rarely wait; the clear fryer bottleneck appears at the restaurant tier. Stronger stall pressure needs a slower fryer or more arrivals, which would speed the goals past 4 to 6 days.
  - The pass has only 3 free sides on the 8x6 grid, so a 4th dish shares a belt and a jammed dish can block the one behind it (head-of-line); this is the intended puzzle, not yet playtested.
  - Restaurant goals (5 dishes; $300 in one day at 90% served and 4.2 stars) were not simulated.
  - Work in a worktree; commit and push each finished piece (CLAUDE.md Workflow).
- **Exact Next Step:** The user plays 2 days (fries, then add salad) and reviews: pace of money, whether waiting and waste read clearly, and whether the stall fryer pressure is enough. Then tune the numbers in `src/sim/constants.ts` and `src/content/*` (design doc first) or start the follow-ups in plan section 9.
