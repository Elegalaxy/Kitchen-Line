# Restaurant growth (slice 1)

Status: approved by the user on 2026-11-23, with: trends and critics later at the restaurant tier only, menu cap stays 6, the chain tier is later (not in this slice).

Goal: give restaurant-tier cash somewhere to go and stretch the journey to an end screen around day 17 to 20 (about 70 min of service at 1x for the scripted player, was day 11).

Rules for every step: one commit per step after `npm run typecheck`, `npm run lint` and `npx vitest run --exclude src/harness/perf.test.ts` pass. Stall-tier hashes and fixtures stay unchanged; restaurant hashes change on purpose only in Step 4. New `GameState` fields are optional and absent until used, validated in `src/persist/save.ts` when present, no save version bump. Allowed status values: `todo`, `done`, `verified`.

Working folder: `D:\Coding\project\Kitchen-Line-worktrees\restaurant-growth`.

### Step 1: Design doc

- Status: `done`
- Progress: 2026-11-23: GAME_DESIGN 5.3, 6.2, new 6.4, 8, 12 and the changelog updated.
- Files: `doc/GAME_DESIGN.md`
- What changes: 5.3 Pass row (second pass), 6.2 restaurant arrival factor 2.0, new 6.4 Restaurant upgrades, 8 goal 7 and the end screen after it, 12 scope list, changelog.

### Step 2: Second pass

- Status: `done`
- Progress: 2026-11-23: pass entry is placeable at the restaurant tier ($400, listed last in `buildings.ts` so the palette hotkeys 1 to 0 keep their buildings); `PASS_MAX` = 2, `pass limit` reject reason, removing a pass is refused only for the last one. All existing hashes and fixtures unchanged. Not changed (another chat edits it): the Inspector still disables Sell for any pass; the Sell tool and the remove command work.
- Files: `src/content/buildings.ts`, `src/sim/constants.ts` (`PASS_MAX`), `src/sim/grid.ts`, `src/sim/commands.ts`, `src/sim/types.ts`, `src/ui/format.ts`, `src/ui/canvas/input.ts`, tests
- What changes: the pass becomes placeable at the restaurant tier for $400, at most 2. Placing a third is rejected with `pass limit`; a pass can be removed (100% refund) while another remains.
- Acceptance: all existing hashes and fixtures unchanged.

### Step 3: Restaurant upgrades

- Status: `done`
- Progress: 2026-11-23: `buyUpgrade` command, `state.upgrades` (optional, validated in save.ts), `src/sim/upgrades.ts`, `src/content/upgrades.ts`, effects in `customers.ts` (budget and patience scaled after the draws), Upgrades tab section "Restaurant upgrades" (restaurant tier only), `OrdersStrip` uses `waitingCap`. New reject reason `already owned`. No hash changed. Not yet browser-checked.
- Files: `src/sim/types.ts`, `src/sim/upgrades.ts`, `src/sim/customers.ts`, `src/sim/commands.ts`, `src/content/upgrades.ts`, `src/content/index.ts`, `src/persist/save.ts`, `src/ui/UpgradesPanel.tsx`, `src/ui/OrdersStrip.tsx`, tests
- What changes: `buyUpgrade` command (build phase, restaurant tier, once each). Effects: waiting places, arrival percent, patience percent, budget percent. Budget and patience are scaled after the RNG draw so draw order is unchanged.
- Acceptance: with no upgrades bought all hashes unchanged.

### Step 4: Arrival factor

- Status: `done`
- Progress: 2026-11-23: `TIER_ARRIVAL_FACTOR.restaurant` 2.0. Two unit tests that hard-coded 1.5 were updated; no hash fixture changed (none covers a restaurant run). Stall hashes unchanged.
- Files: `src/sim/constants.ts`, restaurant fixtures
- What changes: `TIER_ARRIVAL_FACTOR.restaurant` 1.5 to 2.0 (deliberate hash change).

### Step 5: Goal 7

- Status: `done`
- Progress: 2026-11-23: `tierProfitStart` (set by `upgradeTier`, validated in save.ts when present), goal `restaurant-profit` (target `RESTAURANT_TOTAL_PROFIT_TARGET` = $4,000, done only in the summary phase; an old restaurant save without the mark counts all profit). `checkWin` needed no change (it waits for every restaurant goal); the Goals panel and end screen list goals from `defs.goals`, so goal 7 shows up there. Browser check pending.
- Files: `src/sim/types.ts`, `src/sim/commands.ts`, `src/content/goals.ts`, `src/persist/save.ts`, tests
- What changes: `tierProfitStart` set by `upgradeTier`; goal `restaurant-profit` (profit made at the restaurant tier, target `RESTAURANT_TOTAL_PROFIT_TARGET`); the end screen comes after goal 7.

### Step 6: Harness

- Status: `done`
- Progress: 2026-11-23: PASS2 project (second pass at (9,2), bought together with the second fryer line; the line's belt (9,3) faces north into it, no collision found), restaurant upgrades bought in order tables, sign, music, plates once all dish lines are built and the reserve is kept, `--no-upgrades` and `--no-pass2`, goal7 column, "days from the upgrade to goal 7" line, median restaurant spending line, and a "second fryer, from the day it is built" line in the fryer load output.
- Files: `src/harness/player.ts`, `args.ts`, `cli.ts`, `journey.ts`, tests
- What changes: PASS2 project, upgrade purchases, `--no-upgrades` and `--no-pass2`, goal7 column and extra journey lines.

### Step 7: Measure and tune

- Status: `done`
- Progress: 2026-11-23: measured with `npm run sim -- --journey --seeds 20` (journey-1 to journey-20). Only the goal-7 target was tuned ($4,000 gave end-screen median day 16, $5,000 gives 18); upgrade costs and effect sizes were left as in GAME_DESIGN 6.4.

Results (20 seeds each, 0 loss days everywhere, 20/20 reached the end screen; day = end screen day, "upg" = upgrade-to-restaurant day, median 6):

| Variant | End screen median (min-max) | Days upgrade to end | Median cash spent at restaurant tier |
| --- | --- | --- | --- |
| Before this slice (origin 0c0aad0) | 11 (10-14) | 5 | n/a |
| Goal 7 $4,000 (first try, all features) | 16 (15-17) | 10 | $2,895 |
| Final: goal 7 $5,000, all features | 18 (17-20) | 12 | $2,895 |
| `--no-upgrades` | 19 (18-21) | 13 | $1,295 |
| `--no-pass2` | 18 (17-19) | 12 | $2,495 |
| `--no-throttle` | 17 (16-19) | 11 | $2,895 |

Service time to the end screen at 1x: median 18 days x 4 min = 72 min (max 20 days = 80 min); 4x: 18 min.

Fryer load (final variant): before the second fryer 67% of restaurant days had 2+ fries customers giving up (3.41 a day on average, 102 days); from the day the second fryer line is built 0.00 a day and 0% of days with 2+ (162 days). The 7 layouts `--days 5 --seed demo` print identical output before and after (stall unchanged).

Findings: the upgrades are worth about one day (end screen 19 without them, 18 with); the second pass changes the end day by less than a day (the old west join into the merger already worked, so what the pass buys is the fries lane no longer sharing the east side). Restaurant profit is about $450 a day once the five-dish line runs.

- What changes: only the goal-7 target, upgrade costs and effect sizes may be tuned.
- Acceptance: 20/20 seeds reach the end screen within 40 days; end-screen median day 17 to 20, no seed beyond day 28; 0 loss days; `--no-upgrades` ends at least 1 day later (median); before the second fryer at least 50% of restaurant days have 2+ fries customers giving up, after it at most 0.5 per day.
