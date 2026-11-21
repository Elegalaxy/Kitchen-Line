# Project Handoff State

- **Last Updated By:** Claude (implementer, journey simulation, 2026-11-22)
- **Current Goal:** The first playable is finished (Steps 1 to 18 `done`). The whole journey (stall, upgrade, restaurant, end screen) is now simulated; remaining work is the user's playtest and the design decisions listed below.
- **Recent Changes & Files Touched:**
  - New harness only (no sim/content/ui change): `src/harness/player.ts` (scripted efficient player, applyCommand only, policy documented at the top), `journey.ts` (tables), `cli.ts`/`args.ts` (`npm run sim -- --journey [--seeds N] [--cautious] [--no-throttle] [--fryer auto|always|never] [--max-days N] [--example N]`), tests `player.test.ts`, `args.test.ts`.
  - Plan: "Journey simulation" note after Step 18 in `doc/plans/2026-11-19-first-playable.md` with the result tables and answers.
- **Active Decisions / Constraints (journey results, 30 seeds):**
  - Efficient player: stall goals done by day 4 (3-5), upgrade day 6 (4-7), goal 5 day 10, goal 6 day 9, end screen day 10 (9-11) = about 40 min of service at 1x, 10 min at 4x, plus build time. Below the 1-2 hour target.
  - Goals 5 and 6 are reachable (3-4 restaurant days after the upgrade). MENU_CAP 6 fits goal 5 (no contradiction), but goal 5 only checks `menu.length >= 5`, so it needs no production line.
  - REAL PROBLEM: the pass has 4 sides, the menu allows 6 dishes, so a 5th dish shares a pass side; a full shelf of one dish blocks the other and its items spoil. Without slowing the shared pantries to 80 ticks only 16/30 seeds finish. The single fryer is 95% busy at the restaurant tier but customers rarely give up (0.2 a day); a second fryer cannot get its own pass side and made things worse (`--fryer always`: 13/30 finish).
  - Proposals (not applied, design doc first): second pass or non-blocking shelf; goal 5 = 5 dishes each sold 10+ in a day; goal 6 about $450 or more arrivals if 1-2 hours at 1x is wanted; a money sink after the upgrade (cash piles up, median $533 at the end).
  - Work in a worktree; commit and push each finished piece (CLAUDE.md Workflow).
- **Exact Next Step:** The user decides on the proposals above (pass sides and goal 5/6 numbers, pace target), then the design doc and numbers change and `npm run sim -- --journey --seeds 30` is re-run. The earlier playtest asks still stand: 2 days of fries then salad, judge money pace and waiting/waste clarity.
