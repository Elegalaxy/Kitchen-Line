# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 12, 2026-11-20)
- **Current Goal:** Step 13 of `doc/plans/2026-11-19-first-playable.md`: harness CLI and performance check. Steps 1 to 12 are done.
- **Recent Changes & Files Touched (Step 12):**
  - `src/sim/reviews.ts` (new): rating rules (`rateServed`, `rateLost`), `submitRating` pushes to `state.ratings` (last 50) and writes a review into `today.reviews` (max 20, lowest always kept, reservoir sample). Draw order on the `reviews` stream is in its header.
  - `src/content/reviewText.ts` (new): 2 template variants per reason; `DEFS.reviewTemplates` carries them to the sim (`Defs.reviewTemplates` is optional, test fixtures omit it and get the reason key as text).
  - `src/sim/customers.ts`: `submitRating` after every `recordSale`/`recordLoss`; arrivals draw order unchanged.
  - `src/sim/types.ts`: `Review` (with `reason`), `ReviewReason`, `GameState.repAtDayStart`; `commands.ts` sets it in `openService`; `game.ts` seeds it to 3.
  - `src/ui/TopBar.tsx`, `format.ts` (`reputationView`), `styles.css`: `3.2★` readout with a ▲/▼ since day start, fixed width, sr-only text.
  - `src/sim/reviews.test.ts` (new, 24 tests). No existing test changed.
- **Active Decisions / Constraints:**
  - Reputation = mean of the last 50 ratings, seeded with 10 x 3. A served rating's main reason = biggest penalty (ties: wait, price, choice).
  - Day-end leftovers are dropped unrated (Q6). `state.events` holds only the last tick's events.
  - `totals.profit` is still not updated anywhere: Step 15 (summary) or 16 (goals) should set it at day end via `profitOf(lastDay)`.
  - `repAtDayStart` keeps the previous day's value during build/summary, so the arrow shows the last day's change until the next service opens. Step 17 (save) must include `repAtDayStart`.
  - Reviews list UI and summary are Step 15; menu/price panel is Step 14.
  - Sim tests import only `vitest` and `src/sim` (inline Defs fixtures); no `process` in `src/sim`.
  - Commit and push each finished step (CLAUDE.md Workflow); work in a worktree.
- **Exact Next Step:** Step 13: `src/harness/cli.ts` (`npm run sim -- <args>`), run a layout N days headless, print `[sim]` summaries, and check performance. The harness may import `sim` and `content`, not `ui` or `persist`.
