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

- Status: `todo`
- Files: `src/sim/types.ts`, `src/sim/upgrades.ts`, `src/sim/customers.ts`, `src/sim/commands.ts`, `src/content/upgrades.ts`, `src/content/index.ts`, `src/persist/save.ts`, `src/ui/UpgradesPanel.tsx`, `src/ui/OrdersStrip.tsx`, tests
- What changes: `buyUpgrade` command (build phase, restaurant tier, once each). Effects: waiting places, arrival percent, patience percent, budget percent. Budget and patience are scaled after the RNG draw so draw order is unchanged.
- Acceptance: with no upgrades bought all hashes unchanged.

### Step 4: Arrival factor

- Status: `todo`
- Files: `src/sim/constants.ts`, restaurant fixtures
- What changes: `TIER_ARRIVAL_FACTOR.restaurant` 1.5 to 2.0 (deliberate hash change).

### Step 5: Goal 7

- Status: `todo`
- Files: `src/sim/types.ts`, `src/sim/commands.ts`, `src/content/goals.ts`, `src/persist/save.ts`, tests
- What changes: `tierProfitStart` set by `upgradeTier`; goal `restaurant-profit` (profit made at the restaurant tier, target `RESTAURANT_TOTAL_PROFIT_TARGET`); the end screen comes after goal 7.

### Step 6: Harness

- Status: `todo`
- Files: `src/harness/player.ts`, `args.ts`, `cli.ts`, `journey.ts`, tests
- What changes: PASS2 project, upgrade purchases, `--no-upgrades` and `--no-pass2`, goal7 column and extra journey lines.

### Step 7: Measure and tune

- Status: `todo`
- What changes: only the goal-7 target, upgrade costs and effect sizes may be tuned.
- Acceptance: 20/20 seeds reach the end screen within 40 days; end-screen median day 17 to 20, no seed beyond day 28; 0 loss days; `--no-upgrades` ends at least 1 day later (median); before the second fryer at least 50% of restaurant days have 2+ fries customers giving up, after it at most 0.5 per day.
