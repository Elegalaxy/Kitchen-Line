# Kitchen Line — Game Design

Living design document. Source of truth for rules, numbers, and first-playable scope. The portfolio brief is [docs/ideas/kitchen-line.md](../../docs/ideas/kitchen-line.md).

Last updated: 2026-11-22

Every rule is tagged:

- **[confirmed]** — decided by the user
- **[provisional]** — a default to build and test with; may change after playtesting
- **[later]** — agreed direction, not in the first playable
- **[open]** — undecided; see section 13

## 1. Concept

A restaurant game in two halves. The player builds an automated kitchen line on a 2D top-down grid (back of house), and runs the restaurant's menu, prices, and reputation (front of house). The menu decides what the line must produce; the line decides what the menu can be. **[confirmed]**

The player never cooks by hand. **[confirmed]**

## 2. Pillars

1. **The menu drives the factory.** Each dish is a recipe tree; tycoon choices become building problems.
2. **Readable, cozy automation.** Small kitchens; the whole line fits on screen and bottlenecks are visible.
3. **Demand moves.** A finished line does not stay optimal; redesign is part of the loop.
4. **Grow from a stall to a chain.** First playable covers stall → small restaurant; chain and franchise come later.

## 3. Core loop

1. Pick dishes for the menu and set their prices.
2. Build or rebuild the line so it can produce those dishes.
3. Open for service. Customers arrive, order, wait, eat, pay, and review.
4. Read the results (sales, lost customers, waste, reviews) and find the bottleneck.
5. Spend profit on new stations, more kitchen space, and new recipes. Repeat.

Building happens while service is paused or running. **[provisional: building is allowed during service, but new machines take a few seconds to come online]**

## 4. Time and service

- The game runs on a fixed simulation tick. **[confirmed: tick-based]** Provisional: 10 ticks per second at 1× speed, with 2× and 4× speed and pause.
- A day is one service: open → lunch rush → quiet → dinner rush → close. **[provisional]** Provisional length: about 4 real minutes at 1×.
- Between days: an end-of-day summary, then the build/menu phase with no time pressure. **[provisional]**
- Overnight cleanup: when the day ends, everything still held on the line (belts, routing buffers, station and assembler inputs and outputs, the pass shelf) is thrown away, so every day starts with an empty kitchen. It counts as spoiled waste of the ending day and the summary lists it separately as "left at close". Pantry cooldowns are untouched. **[provisional, 2026-11-22]**
- Offline progress (the restaurant serves while the player is away) is **[later]**. The simulation must be deterministic from state plus elapsed ticks so offline catch-up can be added without a rewrite.

## 5. Back of house: the kitchen grid

### 5.1 Grid

- Top-down square grid. **[confirmed: 2D grid]** Provisional start size: 8 × 6 tiles (stall); expansions buy extra rows/columns up to about 16 × 12 in the first playable.
- One building per tile, except multi-tile stations (2 × 1) where noted. Rotate in four directions.

### 5.2 Items

- Every ingredient and dish is a visible item that moves tile by tile on the tick. **[confirmed]**
- A belt tile holds at most 2 items (one per half). **[provisional]**
- Items have a freshness timer. Fresh ingredients that expire on the line become waste. **[provisional: in the first playable, only fresh produce and finished dishes spoil]**

### 5.3 Buildings (first playable)

| Building | Function | Provisional notes |
| --- | --- | --- |
| Pantry (input) | Emits one ingredient type at a set rate; costs money per item | Stocked automatically; cost charged on emit. It can be paused and resumed by the player (one pantry in the Inspector, or all pantries at once); a paused pantry emits nothing, charges nothing and keeps its cooldown frozen, in any phase (2026-11-22) |
| Conveyor | Moves items one tile per N ticks | Base speed; faster belt is an upgrade |
| Splitter / merger | Splits one lane into two, or merges two into one | Round-robin |
| Filter | Sends one item type left, the rest straight | Needed once the line carries several ingredients |
| Chopper | 1 input → 1 processed output (e.g. tomato → sliced tomato) | |
| Stove | Cooks (raw patty → cooked patty, rice → cooked rice) | Slower; the usual bottleneck |
| Fryer | Fries (potato strips → fries) | |
| Assembler (2 × 1) | Combines up to 3 inputs into a dish per recipe | Recipe selected per station |
| Pass (output) | Takes finished dishes and serves them to waiting orders | Unmatched dishes wait on the pass and spoil. The shelf holds at most 4 of each dish. A 5th copy is refused (the belt backs up and the pantries stop buying) unless a different dish waits right behind it on the feeding belt, or the oldest copy is 45 s old; then the oldest is thrown away (counted as spoiled waste) and the new one takes its place. So a one-dish line stops buying when nothing sells, and an unsold dish cannot jam a mixed belt (2026-11-20, refined 2026-11-22) |
| Bin | Destroys items | Counts as waste |

### 5.4 Recipes

- A dish is a recipe tree of ingredients and processing steps. **[confirmed concept]**
- First playable target: one street-food set of about 6 dishes (for example fries, burger, rice bowl, salad, soup, sandwich), sharing ingredients so lines can overlap. **[provisional]**
- New recipes are bought with money between days. **[provisional]**

## 6. Front of house: the tycoon half

First-playable scope is menu, prices, customers, and reviews. **[confirmed]** Seating layout, staff, décor, and rent are **[later]**.

### 6.1 Menu and prices

- The player picks which unlocked dishes are on the menu (provisional cap: 4 at the stall, 6 at the restaurant).
- Each dish has a player-set price. A reference price is shown. **[provisional]**

### 6.2 Customers

- Customers arrive at a rate set by the time of day (rush hours) and by reputation. **[provisional]** Balance numbers (2026-11-20): mean gap 100 ticks when quiet and 30 in a rush at 3★ (about 51 customers a day at the stall).
- Each has a taste profile (preferred dishes), a budget, and patience. They choose an affordable menu dish they like; if none, they leave. **[provisional]**
- An order waits at the pass. If patience runs out before the dish arrives, the customer leaves unhappy and pays nothing. **[provisional]**
- Seating is abstract in the first playable: a fixed capacity of waiting orders (provisional: 6 at the stall). **[provisional]**

### 6.3 Reviews and reputation

- Each served or lost customer leaves a rating from wait time, price versus their budget, and whether they got a dish they wanted. **[provisional]**
- Reputation is a rolling average of recent ratings and scales the arrival rate. **[provisional]**
- The end-of-day summary shows sales, lost customers, waste (spoiled during the day and left at close, listed separately), average wait, and a few written reviews that name the problem ("waited forever for fries"). **[provisional]**

## 7. Economy

- Money comes from dish sales. Costs are ingredients (charged at the pantry), building purchases, and kitchen expansions. **[provisional]**
- No rent, wages, or loans in the first playable. **[later: rent and staff]**
- Bankruptcy: if money runs out, pantries stop emitting until there is cash, so the player can always recover by selling buildings. No game-over in the first playable. **[provisional]**

## 8. Progression and win state

- Milestone goals move the player from **stall** to **small restaurant** (bigger grid, more menu slots, more customers). **[confirmed: milestone goals]** Provisional milestone examples: serve 100 dishes, reach 4★ reputation, earn a set total profit.
- Restaurant goal 5 (provisional): sell 5 different dishes, at least 10 of each (`GOAL_DISH_SALES`), in one day. It is checked on the day in progress and on a finished day at day end, so it needs a real production line for each dish; a long menu alone does not complete it. Goal 6 is unchanged.
- Later tiers: restaurant → chain of branches → franchise. **[later]**
- Franchise prestige: sell the chain and restart with a better recipe book and blueprints. **[later; confirmed as the long-term structure]**
- The first playable ends at the restaurant tier with a "you're ready to expand" end screen. **[provisional]**

## 9. Demand that moves

- Lunch and dinner rushes in every day. **[provisional: first playable]**
- Daily trends (one dish or ingredient is in demand), food critics, and seasonal menus. **[later]**

## 10. Presentation

- Clean flat shapes and icons: colored tiles, simple machine shapes, emoji or icon ingredients. **[confirmed]**
- The line must make problems visible: backed-up belts, idle stations, and spoiling items are marked (icon plus color, never color alone). **[provisional]**
- The tycoon panels (menu, prices, upgrades, summary, goals) are regular UI beside or over the grid, following the global UI/UX guide (tabular figures, key-value rows, one primary action). **[provisional]** The Upgrades tab is the shop: the restaurant tier, kitchen size, and recipe unlocks. The fast belt is placed from Build; Upgrades only shows when that tile is unlocked. The Menu tab lists dishes the player already owns.

## 11. Tech

- TypeScript, React, and Vite, the same stack as trading-sim. React for menus and panels; a canvas renderer (PixiJS or plain Canvas 2D, planner's choice) for the grid. **[confirmed]**
- The simulation is a pure, headless module (state + tick → state) with no rendering dependencies, so it can be unit-tested, run faster than real time, and later used for offline catch-up and balance runs. **[provisional]**
- Save: local browser storage, one save slot, in the first playable. **[provisional]**

## 12. First-playable scope

In:

- One location growing from stall (8 × 6) to small restaurant
- The buildings in 5.3, about 6 dishes, menu and prices
- Customers with taste, budget, patience; rush hours; reputation and reviews
- End-of-day summary and milestone goals
- Visible-item belts on a fixed tick, pause and speed controls
- One local save

Out (later): offline progress, seating layout, staff, décor, rent, trends, critics, branches, franchise prestige, blueprints/copy-paste across locations.

Success criteria for the first playable: a new player can build a working line for one dish in under 5 minutes, and finding and fixing a bottleneck feels satisfying. **[provisional]**

## 13. Open questions

Resolved on 2026-11-19 (confirmed by the user; details in [plans/2026-11-19-first-playable.md](plans/2026-11-19-first-playable.md) section 3):

- Building during service: allowed. New non-belt buildings take 30 ticks to come online. The menu and prices are locked during service. **[confirmed]**
- Spoilage: only fresh produce and finished dishes spoil. **[confirmed]**
- Undo (last 50 build actions) and drag-to-draw belts are in. Copy/paste is **[later]**. **[confirmed]**
- Tutorial: partly pre-built start (pass, potato pantry, Fries on the menu). The checklist stays until a Salad is served: build the Fries line and open for service, finish the day and read the summary, add Salad to the menu (its price starts at the reference price), then build a second line into the north side of the pass. Ghost tiles suggest each layout and can be dismissed. **[confirmed]**
- Numbers: the plan's section 2.5 table, tuned with the harness. **[provisional]**
- Customers still waiting at closing leave without a rating. **[confirmed]**
- Selling a building refunds 100% in the first playable. **[confirmed]**

No open questions remain for the first playable.

## 14. Changelog

- 2026-11-22: Closing-time warning (UI only, no rule or number change). `CLOSING_SOON_TICKS` = 600 in `constants.ts`: in the last 600 ticks (was 400; a 5-day sweep of 200, 400, 600 showed profit rises with the lead and served customers do not change) of service the top bar warns that items left on the line are thrown away and offers a one-click pantry pause; the scripted harness player pauses at the same point.

- 2026-11-22: Upgrades tab (presentation, section 10, no new rule or number). Restaurant tier, kitchen expansions and recipe unlocks move off Goals and Menu onto an Upgrades tab. The fast belt stays a Build-tab tile; the new tab only shows that it unlocks with the restaurant tier.

- 2026-11-22: Tutorial extended (confirmed rule in section 13). The checklist no longer stops at the first Fries sale. It continues through the day summary, adding Salad to the menu, and serving one Salad, with ghost tiles for a second line on the north side of the pass.

- 2026-11-22: User decision (production-line control, no **[confirmed]** rule): overnight cleanup. At day end every item still held anywhere on the line is thrown away and counted as spoiled waste of the ending day (`wasteSpoiled`, `spoiledByItem`; the new `wasteOvernight` / `overnightByItem` say how much of it was left at close). This replaces the Q6 note "items on belts stay into the next day" for items; leftover customers were already dropped. Reason: a flooded kitchen carried its stock into the next day and pantries kept buying ingredients nobody needed.
- 2026-11-22: User decision (production-line control, no **[confirmed]** rule): a pantry can be paused and resumed, in any phase including mid-service. A paused pantry emits nothing, charges nothing and keeps its cooldown frozen (status "Paused"). One pantry is toggled in the Inspector; a top-bar control pauses or resumes all pantries at once. Old saves load with every pantry running.

- 2026-11-22: Restaurant goal 5 changed (provisional numbers, no **[confirmed]** rule): from "have 5 dishes on the menu" to "sell 5 different dishes, 10+ of each, in one day" (`GOAL_DISH_SALES` = 10 in `sim/constants.ts`). The goal id `menu-5` is kept so old saves still load. Goal 6 is unchanged.

- 2026-11-22: User decision after the re-measure (rule change in 5.3, no **[confirmed]** rule): the pass drop is no longer unconditional. A full shelf (4 of a dish) refuses a 5th copy (back-pressure, so the pantries stop buying) unless a different dish waits right behind it on the feeding belt, or the oldest copy is `PASS_DROP_AGE_TICKS` (450 ticks, 45 s, provisional) old; then the oldest copy is dropped. Reason: the always-accepting shelf removed the free back-pressure, so pantries overbought and saladLine / sandwichLine lost money (-$20 / -$102 over 5 days). Measured (20 seeds): 20/20 finish with the pantry throttle and 0 loss days, 19/20 without it; saladLine / sandwichLine 5-day profit $112 / $98.
- 2026-11-22: User decision after the journey simulation (rule change in 5.3, no **[confirmed]** rule): the pass shelf is non-blocking. It still holds at most 4 of each dish (`PASS_SHELF_CAP`), but a 5th copy is accepted and the oldest unsold copy of that dish is thrown away and counted as spoiled waste, instead of the dish being refused and jamming the belt. Reason: with 5 dishes sharing pass sides only 16/30 simulated runs could finish.

- 2026-11-20: Balance pass (plan Step 18). Only provisional numbers changed, no **[confirmed]** rule: arrival gaps 150 / 50 → 100 / 30 ticks (about 31 → 51 customers a day at 3★), customer budget 90–140% → 100–160% of the first-choice dish's reference price, finished dishes spoil after 600 ticks (was 300) in 5.2, fryer 4 s → 6 s in 5.3. One small rule change in 5.3: the pass shelf holds up to 4 of each dish (was 4 dishes in total). Evidence is in the plan's Step 18 Progress line.

- 2026-11-19: The user confirmed the first-playable plan's section 3 decisions. Section 13 is resolved; the plan's numbers are the provisional defaults.

- 2026-11-19: First design doc. Confirmed by the user: TypeScript + React + Vite with a canvas grid; visible items moving on a fixed tick; first-playable tycoon depth is menu, prices, customers, and reviews; offline progress later; clean shapes and icons; milestone goals with franchise prestige later; one location in the first playable. Remaining rules are provisional defaults.
