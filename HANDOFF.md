# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 11, 2026-11-20)
- **Current Goal:** Step 12 of `doc/plans/2026-11-19-first-playable.md`: ratings, reputation, reviews.
- **Recent Changes & Files Touched (Step 11, done):**
  - `src/sim/customers.ts` (new): `stepCustomers` = patience expiry, then arrival, then shelf matching. Arrival draws ONE `arrivals` float per non-closing tick; only on an arrival it draws taste count (2..3), weighted prefs without repeats (dish popularity, defs order), budget percent (90..140), patience (300..600), in that order whatever the menu. Order and draws are documented in the file header and in `tick.ts` (hash-affecting). `arrivalChance`, `reputationOf` (mean of `ratings`), `stepArrivals` are exported.
  - `src/sim/economy.ts` (new): `profitOf`, `recordSale`, `recordLoss`, `dropLeftovers` (called from `endDay`; leftovers leave unrated and uncounted, Q6). Constants in `constants.ts` (arrival gaps, reputation factor, tier factor, `WAITING_CAP`, patience, prefs, budget percent).
  - Pass (`transfer.ts`): dishes now go onto the shelf (cap 4); `delivered` still counts arrivals; `today.served` counts SALES only. Unmatched dishes stay and spoil (Step 9). New events `customerArrived`, `customerLeft` (reasons patience/noMatch/full/closing), `served`; `Customer.id` is the arrival tick.
  - `byDish.lost` books patience losses to the ordered dish, noMatch and full to the customer's first-choice dish. `today.wasteSpoiled` etc. unchanged. `totals.served` is updated per sale; `totals.profit` is still not (Step 16 / day end).
  - UI: `OrdersStrip.tsx` + `orders.ts` (patience maths) above the grid in `App.tsx`; `styles.css` `.orders*`. Dev layouts can set a menu (`LayoutSetup.menu` in `sim/layout.ts`; the five new lines put their dish on the menu).
  - Tests: `customers.test.ts` (14), `ui/ordersStrip.test.ts`. Line tests (`stations`, `tick`, `layouts`, `spoil`) now count deliveries with `menu = []` and an emptied shelf; no asserted numbers changed.
- **Active Decisions / Constraints:**
  - Sim tests that need no customers set `s.menu = []` (every arrival is then lost at once); tests that count deliveries also empty the pass shelf each tick.
  - Step 12 must keep arrival draws on `arrivals` only; review text uses `reviews`. Ratings get pushed where `recordSale`/`recordLoss` run (`today.reviews` and `ratings` are untouched so far).
  - `state.events` holds only the last tick's events. Banned word `process` in `src/sim`. Python edits of files with emoji need `encoding='utf-8'` on Windows. Sim tests import only `vitest` and `src/sim`.
  - Money is integer cents; provisional numbers only in `constants.ts` and `src/content/*`.
- **Exact Next Step:** Step 12: `src/sim/reviews.ts`, `src/content/reviewText.ts`: rating per served or lost customer (rules in plan 2.5), keep last 50 in `ratings`, review templates picked on the `reviews` stream (max 20 per day, keep lowest), TopBar reputation `4.2★` with a ▲/▼ since day start.
