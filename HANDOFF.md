# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 14, 2026-11-20)
- **Current Goal:** Step 15 of `doc/plans/2026-11-19-first-playable.md`: end-of-day summary (`DaySummary.tsx`, `src/sim/summary.ts`). Steps 1 to 14 are done.
- **Recent Changes & Files Touched (Step 14):**
  - `src/sim/commands.ts`: real `setMenu` (exact dish list; existing prices kept, new dishes at reference price; cap `MENU_CAP` stall 4, restaurant 6), `setPrice` (integer cents, 10-cent steps, 50%-300% of reference, rejected not clamped), `unlockRecipe` (charges `unlockCost`). Build phase only: service gives 'Menu is locked during service', summary/won give 'wrong phase'.
  - `src/sim/menu.ts` (`priceBounds`, `priceProblem`), constants `MENU_CAP`, `PRICE_*` in `constants.ts`, new RejectReasons mapped in `src/ui/format.ts` (a locked dish reuses 'locked recipe').
  - `src/content/dishes.ts`: `ingredientCostOf(dish)` (UI only; sim does not import it).
  - UI: `SidePanel.tsx` (tabs Build/Menu/Goals, `sideTabs.ts`), `MenuPanel.tsx`, `menuView.ts` (view model), `money.ts` (dollars<->cents), styles appended to `styles.css`; `App.tsx` uses `SidePanel`.
  - Tests: `menu.test.ts`, `menuView.test.ts`, `money.test.ts`, `sideTabs.test.ts`, `ingredientCostOf` in `content.test.ts`. No existing test changed.
- **Active Decisions / Constraints:**
  - Harness `withMenu` (`src/harness/run.ts`) still writes the menu directly (free unlocks, any price): switching to commands would change outputs and hashes. `LAYOUT_SETUP` also unchanged.
  - Menu rows are cards (side panel is 320 px) with table ARIA roles; price input commits on Enter or blur, Escape reverts.
  - The Goals tab is a placeholder until Step 16. The placeholder day-over banner in `App.tsx` is replaced in Step 15.
  - `totals.profit` is still not updated at day end (Step 15/16: use `profitOf(lastDay)`).
  - Sim tests import only `vitest` and `src/sim`; no `process`/`Date`/`console` in `src/sim`.
  - Commit and push each finished step (CLAUDE.md Workflow); work in a worktree.
- **Exact Next Step:** Step 15: `src/sim/summary.ts` plus tests and `src/ui/DaySummary.tsx` replacing the placeholder summary banner; review with the user after it (plan milestone).
