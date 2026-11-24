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
4. **Grow from a stall to a chain.** The first playable covers stall → small restaurant; the chain stage (8.1) follows the restaurant end screen; franchise comes later.

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
- Dish pack (2026-11-24): two more raw ingredients, fish (150 cents per item, fresh: spoils like tomato and lettuce) and cheese (60 cents, does not spoil). Fried fish is a processed item. **[provisional]**

### 5.3 Buildings (first playable)

| Building | Function | Provisional notes |
| --- | --- | --- |
| Pantry (input) | Emits one ingredient type at a set rate; costs money per item | Stocked automatically; cost charged on emit. It can be paused and resumed by the player (one pantry in the Inspector, all pantries at once, or Pause one by one then a click on each pantry); a paused pantry emits nothing, charges nothing and keeps its cooldown frozen, in any phase (2026-11-22, click mode 2026-11-23) |
| Conveyor | Moves items one tile per N ticks | Base speed; faster belt is an upgrade |
| Splitter / merger | Splits one lane into two, or merges two into one | Round-robin |
| Filter | Sends one item type left, the rest straight | Needed once the line carries several ingredients |
| Chopper | 1 input → 1 processed output (e.g. tomato → sliced tomato) | |
| Stove | Cooks (raw patty → cooked patty, rice → cooked rice) | Slower; the usual bottleneck |
| Fryer | Fries (potato strips → fries) | |
| Assembler (2 × 1) | Combines up to 3 inputs into a dish per recipe | Recipe selected per station |
| Pass (output) | Takes finished dishes and serves them to waiting orders | Unmatched dishes wait on the pass and spoil. The shelf holds at most 4 of each dish. A 5th copy is refused (the belt backs up and the pantries stop buying) unless a different dish waits right behind it on the feeding belt, or the oldest copy is 45 s old; then the oldest is thrown away (counted as spoiled waste) and the new one takes its place. So a one-dish line stops buying when nothing sells, and an unsold dish cannot jam a mixed belt (2026-11-20, refined 2026-11-22). One extra pass can be bought at the restaurant tier ($400, at most 2 in total); it serves dishes like the first, and either pass can be sold while another remains (2026-11-23) |
| Bin | Destroys items | Counts as waste |
| Pro stations (restaurant tier) | A faster variant of the fryer, stove and assembler: it needs 2/3 of the base time per item or dish, rounded up (fryer 6 s to 4 s, stove 6 s to 4 s, assembler 3 s to 2 s) | **[provisional]** About twice the base price (fryer $80, stove $120, assembler $100), restaurant tier only, placed from Build as its own tile like the fast belt (no separate purchase). Selling refunds the full price. Everything else works like the base station; a second kitchen money sink (2026-11-24) |

### 5.4 Recipes

- A dish is a recipe tree of ingredients and processing steps. **[confirmed concept]**
- First playable target: one street-food set of about 6 dishes (for example fries, burger, rice bowl, salad, soup, sandwich), sharing ingredients so lines can overlap. **[provisional]**
- New recipes are bought with money between days. **[provisional]**
- Dish pack (2026-11-24), two restaurant-tier dishes on known buildings. **[provisional]** Fish and chips: fish goes through the fryer (60 ticks, like fries) into fried fish, then an assembler combines fried fish and fries, so it competes with fries for the fryer; reference price $9.00, unlock $120. Cheeseburger: an assembler variant of the burger (bun, cooked patty, cheese); reference price $10.00, unlock $150. A dish can name a tier it needs (`requiresTier`); it can only be unlocked, shown in the Menu and Upgrades tabs and wanted by customers from that tier on.

## 6. Front of house: the tycoon half

First-playable scope is menu, prices, customers, and reviews. **[confirmed]** Seating layout, staff, décor, and rent are **[later]**.

### 6.1 Menu and prices

- The player picks which unlocked dishes are on the menu (provisional cap: 4 at the stall, 6 at the restaurant).
- Each dish has a player-set price. A reference price is shown. **[provisional]**
- The restaurant cap stays 6 with the dish pack (user decision, 2026-11-24): 8 dishes compete for 6 slots.

### 6.2 Customers

- Customers arrive at a rate set by the time of day (rush hours) and by reputation. **[provisional]** Balance numbers (2026-11-20): mean gap 100 ticks when quiet and 30 in a rush at 3★ (about 51 customers a day at the stall). The restaurant tier multiplies the arrival rate by 2.0 (was 1.5, 2026-11-23).
- Taste pool (2026-11-24): a customer draws their liked dishes from the dishes whose tier is at or below the current tier. A dish with a `requiresTier` (the dish pack) is in the pool only when it is also unlocked, so a restaurant that never buys fish and chips never loses customers to it. The older dishes stay in the pool even when locked, as before. **[provisional]**
- Each has a taste profile (preferred dishes), a budget, and patience. They choose an affordable menu dish they like; if none, they leave. **[provisional]**
- An order waits at the pass. If patience runs out before the dish arrives, the customer leaves unhappy and pays nothing. **[provisional]**
- Seating is abstract in the first playable: a fixed capacity of waiting orders (provisional: 6 at the stall). **[provisional]**

### 6.3 Reviews and reputation

- Each served or lost customer leaves a rating from wait time, price versus their budget, and whether they got a dish they wanted. **[provisional]**
- Reputation is a rolling average of recent ratings and scales the arrival rate. **[provisional]**
- The end-of-day summary shows sales, lost customers, waste (spoiled during the day and left at close, listed separately), average wait, and a few written reviews that name the problem ("waited forever for fries"). **[provisional]**
- Food critics (restaurant tier only, section 9): a critic's rating counts `CRITIC_RATING_WEIGHT` = 10 times in the reputation average (it is stored as 10 entries in the rolling window of 50, one review is written). A critic who leaves unserved rates 1 star counted `CRITIC_LOST_WEIGHT` = 3 times. **[provisional]**

### 6.4 Restaurant upgrades

Bought once each in the build phase, restaurant tier only. **[provisional]** This brings decor-style upgrades forward from **[later]** in a small form; the user approved it on 2026-11-23. The menu cap stays 6; daily trends and food critics (section 9) also exist at the restaurant tier only.

| Upgrade | Effect | Cost |
| --- | --- | --- |
| More tables | +3 waiting places | $300 |
| Street sign | +15% arrivals | $400 |
| Music | +25% customer patience | $300 |
| Nice plates | +15% customer budget | $600 |

## 7. Economy

- Money comes from dish sales. Costs are ingredients (charged at the pantry), building purchases, and kitchen expansions. **[provisional]**
- No wages or loans in the first playable. **[later: staff]** Branches pay rent every night (8.1, provisional); the flagship pays no rent. **[later: flagship rent]**
- Bankruptcy: if money runs out, pantries stop emitting until there is cash, so the player can always recover by selling buildings. No game-over in the first playable. **[provisional]**

## 8. Progression and win state

- Milestone goals move the player from **stall** to **small restaurant** (bigger grid, more menu slots, more customers). **[confirmed: milestone goals]** Provisional milestone examples: serve 100 dishes, reach 4★ reputation, earn a set total profit.
- Restaurant goal 5 (provisional): sell 5 different dishes, at least 10 of each (`GOAL_DISH_SALES`), in one day. It is checked on the day in progress and on a finished day at day end, so it needs a real production line for each dish; a long menu alone does not complete it. Goal 6 is unchanged.
- Restaurant goal 7 (provisional, 2026-11-23): earn $5,000 profit at the restaurant tier (profit counted from the moment of the upgrade; an old restaurant save without that mark counts all its profit). The "Ready to expand" end screen comes after goal 7, not after goal 6.
- Chain of branches: **[provisional]**, see 8.1 (user decision 2026-11-24). Franchise comes after it. **[later]**
- Franchise prestige: sell the chain and restart with a better recipe book and blueprints. **[later; confirmed as the long-term structure]**
- The first playable ends at the restaurant tier with a "you're ready to expand" end screen, which is now the midpoint: after "Keep playing" the chain stage (8.1) opens. **[provisional]**

### 8.1 Chain stage

**[provisional]**, approved by the user on 2026-11-24. The numbers live in `sim/constants.ts` and `content/branchAreas.ts`.

- The chain stage opens after the restaurant end screen (`state.won`). There is no new tier: the flagship stays a restaurant. The player can open up to `BRANCH_MAX` = 3 branches (Branches tab, build phase only).
- A **blueprint** is a snapshot of the flagship kitchen: grid size, buildings and their settings (buffers emptied, status idle, pantries running), menu with prices and unlocked dishes. Its value is the sum of the selling prices of its buildings. A blueprint is a copy of the kitchen to another location. It is NOT grid copy/paste (the **[confirmed]** "Copy/paste is [later]" rule in section 13 stands).
- A branch runs its blueprint automatically. The restaurant upgrades (sign, music, tables, plates) do NOT apply to branches: only the kitchen does.
- **Sites.** Each branch gets one fixed next site: a hash of the seed, "area" and the number of branches already open picks it among the areas not yet used, and it is shown before buying. Areas (demand is a percent of the normal arrival rate):

| Area | Demand | Rent per night |
| --- | --- | --- |
| Quiet suburb | 80% | $60 |
| College town | 100% | $90 |
| Riverside | 110% | $110 |
| Old town | 120% | $140 |
| Station square | 140% | $190 |

- **Cost.** Opening costs the blueprint's value (about $1,550 for the first-playable kitchens) plus a fee: $1,000, $2,000, $3,000 for branch 1, 2, 3 (`BRANCH_OPEN_FEES`). A **refit** (copy the current flagship kitchen to the branch again) costs $250 (`BRANCH_REFIT_FEE`) plus any increase in blueprint value. A refit with an unchanged kitchen is refused. There is no close-branch command: an open that would not make money is refused instead.
- **Test day.** Opening or refitting runs one full headless day of the blueprint (pantries paused for the last `CLOSING_SOON_TICKS`, like the harness player), at the site's demand, with the flagship's current reputation and day. The result (profit, sales, served, customers) is stored as the branch's `expected`. The open is refused ("branch would lose money") when expected profit minus the night's rent is zero or less. The test day uses its own random stream (seed + branch id), so the flagship's draws never change, and it has no critic.
- **Every night** each branch adds `round(expected profit x noise / 100) - rent` to the money, where noise is 90 to 110 (`BRANCH_NOISE_PERCENT` = 10) from a hash of seed, night, branch and day (no random stream, nothing stored beyond the day summary). The day summary shows each branch's net and rent.
- **Goals (chain).** 1) Open 3 branches. 2) Branches earn $5,000 net in total (`chainProfit`). 3) $1,000 in one day (flagship profit plus the branch nets of that day; was $1,200 until the 2026-11-24 harness measurement, see the chain plan: with $1,200 three of 20 seeds needed 40 days or more, because the flagship makes about $350 to $530 a night and the three branches about $500 to $600 together). Goals 2 and 3 are only done in the summary phase. When all three are done the "Chain built" end screen shows (measured with the scripted player, 20 seeds: median day 31, max 35, about 2.1 h of service at 1x).
- Without branches nothing changes: a run that never opens a branch has identical hashes and results.
- **[later]** A branch's own manager, selling a branch, branch-specific menus.

## 9. Demand that moves

- Lunch and dinner rushes in every day. **[provisional: first playable]**
- Daily trends, restaurant tier only. **[provisional]** Each day one dish is "in demand": its taste weight is doubled (`TREND_WEIGHT_FACTOR` = 2) when a customer draws what they like, so more customers want it. The trend is picked from the dishes the player has unlocked (not only those on the menu, so adding the trend dish to the menu is the decision), by a hash of the seed and the day number: no random stream, no saved field, same seed and day give the same trend. At least 2 unlocked dishes are needed. It is announced in the build phase (Menu tab and top bar) and the day summary shows how many of that dish were served. The stall tier has no trends. If the player unlocks a dish before opening, the trend may change, because the pool changed. Approved by the user on 2026-11-24.
- Food critics, restaurant tier only. **[provisional]** On about one restaurant day in six a critic visits (`CRITIC_DAY_MODULUS` = 5: a hash of seed and day picks the days, and two days in a row are never both critic days). The visit is announced the day before (build phase and day summary: "A critic visits tomorrow") and is shown on the day itself. The first possible critic day is the day after the upgrade to restaurant, so it can always be announced. One extra customer, the critic, arrives at a fixed tick inside the dinner rush (hash of seed and day, within `CRITIC_ARRIVAL_SPAN` = 300 ticks of the rush start; no random draw, so the normal arrivals do not change). The critic orders the menu dish with the highest popularity (ties: first on the menu) and ignores the queue cap and the budget (it counts as a customer), is served before other customers who want the same dish, and has higher standards: patience `CRITIC_PATIENCE` = 240 ticks (normal 300 to 600) and the usual wait and price penalties, with the budget set to `CRITIC_BUDGET_PERCENT` = 120 percent of the dish's reference price, so a price over 108 percent of reference costs a star. Their rating counts 10 times in reputation (6.3). A critic who cannot order (empty menu) or gives up counts as a 1-star rating weighted 3. The day summary shows "Critic: N stars (served / lost)". The stall tier has no critics. Approved by the user on 2026-11-23/24.
- Seasonal menus. **[later]**

## 10. Presentation

- Clean flat shapes and icons: colored tiles, simple machine shapes, emoji or icon ingredients. **[confirmed]**
- The line must make problems visible: backed-up belts, idle stations, and spoiling items are marked (icon plus color, never color alone). **[provisional]**
- The tycoon panels (menu, prices, upgrades, summary, goals, and after the restaurant end screen the Branches tab: next site, cost, expected nightly net, open and refit) are regular UI beside or over the grid, following the global UI/UX guide (tabular figures, key-value rows, one primary action). **[provisional]** The Upgrades tab is the shop: the restaurant tier, kitchen size, and recipe unlocks. The fast belt and the pro stations are placed from Build; Upgrades only shows when those tiles are unlocked. The Menu tab lists dishes the player already owns.

## 11. Tech

- TypeScript, React, and Vite, the same stack as trading-sim. React for menus and panels; a canvas renderer (PixiJS or plain Canvas 2D, planner's choice) for the grid. **[confirmed]**
- The simulation is a pure, headless module (state + tick → state) with no rendering dependencies, so it can be unit-tested, run faster than real time, and later used for offline catch-up and balance runs. **[provisional]**
- Save: local browser storage, one save slot, in the first playable. **[provisional]**

## 12. First-playable scope

In:

- One location (see the 2026-11-24 note below: the chain stage 8.1 opens more) growing from stall (8 × 6) to small restaurant, with a second pass and four restaurant upgrades (6.4) to spend cash on
- The buildings in 5.3, about 6 dishes, menu and prices
- Customers with taste, budget, patience; rush hours; reputation and reviews
- End-of-day summary and milestone goals
- Visible-item belts on a fixed tick, pause and speed controls
- One local save

Out (later): offline progress, seating layout, staff, décor, flagship rent, franchise prestige. In after the first playable (8.1, user decision 2026-11-24): branches and blueprints across locations. Grid copy/paste stays later.

The **[confirmed]** "one location in the first playable" rule ended on 2026-11-24 by user decision: the chain stage may open up to 3 branches after the restaurant end screen. The first-playable path itself (stall to restaurant) is unchanged.

Success criteria for the first playable: a new player can build a working line for one dish in under 5 minutes, and finding and fixing a bottleneck feels satisfying. **[provisional]**

## 13. Open questions

Resolved on 2026-11-19 (confirmed by the user; details in [plans/2026-11-19-first-playable.md](plans/2026-11-19-first-playable.md) section 3):

- Building during service: allowed. New non-belt buildings take 30 ticks to come online. The menu and prices are locked during service. **[confirmed]**
- Spoilage: only fresh produce and finished dishes spoil. **[confirmed]**
- Undo (last 50 build actions) and drag-to-draw belts are in. Copy/paste is **[later]**. **[confirmed]**
- Tutorial: partly pre-built start (pass, potato pantry, Fries on the menu). The checklist stays until a Salad is served: build the Fries line and open for service, finish the day and read the summary, add Salad to the menu (its price starts at the reference price), then build a second line into the north side of the pass. Ghost tiles suggest each layout and can be dismissed. If that salad line costs more than the player has when the step starts, the game adds the difference once. **[confirmed]**
- Numbers: the plan's section 2.5 table, tuned with the harness. **[provisional]**
- Customers still waiting at closing leave without a rating. **[confirmed]**
- Selling a building refunds 100% in the first playable. **[confirmed]**

No open questions remain for the first playable.

## 14. Changelog

- 2026-11-24: User decision (ends the **[confirmed]** "one location" rule; chain stage, provisional numbers): after the restaurant end screen the player can open up to 3 branches (8.1). Each runs a blueprint snapshot of the flagship kitchen, adds its nightly profit minus rent to the day summary, and has chain goals and a "Chain built" end screen. Blueprints are a copy across locations, not grid copy/paste: the **[confirmed]** "Copy/paste is [later]" rule (section 13) is not changed. Branch rent is the only rent; flagship rent stays **[later]**. Without branches all hashes and fixtures are unchanged.

- 2026-11-24: Dish pack (provisional numbers, no **[confirmed]** rule changed): fish and chips and cheeseburger at the restaurant tier, new ingredients fish and cheese, `DishDef.requiresTier` and the taste-pool rule in 6.2. Menu cap stays 6 (user decision). Stall draws are identical; restaurant hashes change (more dishes in the pool once unlocked).
- 2026-11-24: Pro stations (5.3, 10; provisional numbers, no **[confirmed]** rule): pro fryer, stove and assembler at the restaurant tier, 2/3 of the base time, about 2x the price, placed from Build like the fast belt, 100% refund. Optional `pro` flag on the building, absent unless set, so stall hashes are unchanged.

- 2026-11-23: Pantry pause click mode (section 5.3, no new rule). Build has "Pause one by one": each click on a pantry toggles it, so several can be stopped without opening the Inspector. Hovering a build item no longer replaces the Inspector while a building is selected.

- 2026-11-23: User approved the "Restaurant growth" slice (plan doc/plans/2026-11-23-restaurant-growth.md; no **[confirmed]** rule changed): a second pass at the restaurant tier ($400, 5.3), restaurant arrival factor 1.5 to 2.0 (6.2), four restaurant upgrades (new 6.4, brought forward from **[later]** decor), restaurant goal 7 and the end screen after it (8).

- 2026-11-23: Tutorial salad step (confirmed rule in section 13). When that step is current and the suggested line costs more than the player has, the game adds the difference once (`tutorialHelp`, capped by `TUTORIAL_HELP_CAP`). A bad day can no longer leave the line unaffordable. New game clears the one-time flag.

- 2026-11-24: User decision (restaurant tier only, no **[confirmed]** rule): daily trends move from **[later]** to **[provisional]** in section 9. One unlocked dish a day has double taste weight (`TREND_WEIGHT_FACTOR` = 2 in `sim/constants.ts`), chosen from a hash of seed and day. Stall runs are unchanged; restaurant hashes change on purpose.

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

- 2026-11-24: User decision (restaurant tier only, no **[confirmed]** rule): food critics move from **[later]** to **[provisional]** in section 9 (approved 2026-11-23/24). A critic visits about one restaurant day in six, announced the day before, rated with weight 10 in reputation (6.3), lost critic 1 star weight 3. Numbers in `sim/constants.ts`. Stall runs are unchanged; restaurant hashes change on purpose.
