# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 13, 2026-11-20)
- **Current Goal:** Step 14 of `doc/plans/2026-11-19-first-playable.md`: menu and prices panel, recipe unlocks (adds `setMenu`, `setPrice`, `unlockRecipe` commands). Steps 1 to 13 are done.
- **Recent Changes & Files Touched (Step 13):**
  - `src/harness/run.ts` (new): pure `runDays(defs, opts)` / `runDaysFrom(state, defs, days)` return per-day summaries plus the final `stateHash`; `formatRun` prints the `[sim]` lines. Per day: `openService` -> 2400 ticks -> `dismissSummary`; profit is `profitOf(lastDay)`, rep is `reputationOf` after the day, avgWait is in ticks (`t`).
  - `src/harness/args.ts` (new): pure `parseArgs` / `parseMenu`; `cli.ts` prints the error plus usage and exits 1. Flags: `--layout --seed --days (1-100) --menu dish:cents,... --speedtest --list`.
  - `src/harness/cli.ts`: thin wrapper; the only wall-clock use (`--speedtest`).
  - `src/harness/{args,run,perf}.test.ts` (new). `perf.test.ts` lives in the harness (not `src/sim`) because it needs real content; 16x12 full belt-ring grid about 0.66 s, dish lines about 0.05 s each for 7 days, best of 3, limit 1 s.
  - `CLAUDE.md` Commands section updated with the real `npm run sim` usage.
- **Active Decisions / Constraints:**
  - `--menu` prices are integer cents. Until Step 14 adds `setMenu`, the harness writes the menu on a state copy (`withMenu` in `run.ts`, also unlocks the dishes). Switch it to commands in Step 14.
  - Most lost customers are `noMatch` (taste), and avgWait is 0.0t because customers take a dish already on the shelf; that is Step 18 tuning, not a harness bug.
  - `totals.profit` is still not updated at day end (Step 15/16: use `profitOf(lastDay)`).
  - The big-grid perf case is the slowest (about 0.66 s of the 1 s limit): watch it when sim work is added.
  - Sim tests import only `vitest` and `src/sim`; no `process`/`Date`/`console` in `src/sim`.
  - Commit and push each finished step (CLAUDE.md Workflow); work in a worktree.
- **Exact Next Step:** Step 14: `src/ui/MenuPanel.tsx`, `SidePanel.tsx` tabs, `ingredientCostOf(dish)`, `src/ui/money.ts`, and the `setMenu`/`setPrice`/`unlockRecipe` commands in `src/sim/commands.ts` (locked during service, price clamped 50%-300% of reference, menu cap 4 at the stall).
