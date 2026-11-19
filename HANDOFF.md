# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 18 polish half, 2026-11-20)
- **Current Goal:** Step 18 balance pass (the polish half is done; Step 18 Status stays `todo` until the balance table is recorded in its Progress).
- **Recent Changes & Files Touched (Step 18 polish):**
  - Tutorial: `src/ui/tutorial.ts` (pure: `tutorialView`, `tutorialHints`, `lineReachesPass`), `TutorialCard.tsx` (above the side tabs, all tabs, open until `totals.served > 0`), hint tiles drawn by `drawHints` in `canvas/draw.ts` (canvas only, no pointer input). Chopper (2,2), fryer (4,2), then belts in the gaps. `hintsHidden` and `fast` are new ui-only `UiState` fields (not saved).
  - States: `tileInfo.ts` + `TileInfo.tsx` (freshness seconds, hover tooltip via `Overlay.tip`, status region for the keyboard cursor), empty inspector, `ordersNote` in `orders.ts`, `Money.tsx` + `formatMoneyCompact` / `clipText` in `format.ts` (compact above $1M, full value in title and sr-only), summary card "No customers today", review text clipped.
  - Fast belt: palette entry after Belt (`⏩ Fast belt`, no number hotkey; 1-9, 0 still map to DEFS order). `selectTool(ctx, tool, fast)`, `planBeltDrag(..., fast)`, `paletteReason/paletteCost(..., fast)`.
  - `tests/contrast.test.ts` (reads `styles.css` with fs; in `tests/` because `src/ui` type-check has no node types). No token changed. `src/ui/polish.test.ts` covers the rest. `canvas/input.test.ts` gained the two new `UiState` fields.
  - Side panel now stacks under the grid below 1024 px (media query was 760).
- **Active Decisions / Constraints:**
  - Tutorial progress is derived from state, no sim state. "Connect" counts when a pantry feeds the pass through belts, a chopper and a fryer (or a dish was delivered), because delivery needs service open.
  - Numbers stay provisional: tune only in `src/sim/constants.ts` and `src/content/*`; hashes change deliberately. Never edit `doc/` rules without a user decision.
  - Work in a worktree; commit and push each finished piece (CLAUDE.md Workflow).
  - New `GameState` fields must be added to `validateState` in `save.ts`.
- **Exact Next Step:** Balance pass: run the harness (`npm run sim -- ...`) for each dish layout and a 2-dish combo over 5 days. Targets: one fryer is the visible bottleneck at 4 stars or more in a rush, stall goals take 4 to 6 days, no layout loses money at reference prices. Adjust numbers only in constants and content, record the before and after table in Step 18's Progress, then set Step 18 to `done`. Also open: the summary `avgWait` reads 0.0 (check how `waitTicksTotal` feeds `summary`).
