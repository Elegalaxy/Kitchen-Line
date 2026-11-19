# Kitchen Line: First Playable Implementation Plan

Date: 2026-11-19
Status: approved. The user confirmed all section 3 recommendations on 2026-11-19. Implementation has not started; wait for the user's go-ahead before Step 1.
Design source of truth: [../GAME_DESIGN.md](../GAME_DESIGN.md).

How to use this plan: the implementer does one step at a time, in order. After each step, the implementer sets Status to `done` and adds a dated Progress line. The tester then sets `verified` or `failed`. Allowed status values: `todo`, `done`, `verified`, `failed`, `blocked`.

## 1. Goal

Build the first playable from GAME_DESIGN.md section 12. The first slice is a visible pantry → belt → pass line on a canvas grid, driven by a pure, deterministic, tick-based simulation. The finished slice is a full stall-to-restaurant run: about 10 buildings, 6 dishes, customers, rush hours, reputation and reviews, end-of-day summaries, milestone goals, pause and speed, and one local save.

## 2. Assumptions

### 2.1 Design assumptions

- GAME_DESIGN.md as of 2026-11-19 is the rulebook. `[confirmed]` rules are built as written. `[provisional]` rules are built as defaults. `[later]` items are not built. `[open]` items use the recommendations in section 3.
- Money is integer cents everywhere in `src/sim`. It is displayed as `$12.50`.
- Time is integer ticks. 10 ticks = 1 s at 1×. `state.tick` (the global clock) only advances during service, so nothing spoils between days.
- Randomness only comes from seeded named streams stored in the state: `arrivals` (arrival, taste, budget, patience) and `reviews` (review text choice). The same seed plus the same commands give the same run.
- No git commands. The kitchen-line folder has no repo yet, so the global worktree rule does not apply until the user creates one.

### 2.2 Project layout

`kitchen-line/` is its own project with its own `package.json`. It never imports from `trading-sim/`. Files may be copied from trading-sim (configs, `rng.ts`, `hash.ts`, `debug.ts`, architecture test) as new files. Create files only when a step needs them.

```text
kitchen-line/
  doc/                        design and plans
  CLAUDE.md                   commands and layer rules (Step 1)
  package.json                scripts: dev, build, test, typecheck, lint, sim
  index.html, vite.config.ts, tsconfig*.json, .oxlintrc.json, .gitignore
  tests/architecture.test.ts
  src/
    main.tsx
    sim/        pure rules: grid, items, buildings, tick, customers, economy, goals
    content/    data only: items, recipes, buildings, dishes, goals, layouts, review text
    harness/    Node CLI: run a layout N days headless, print summaries
    persist/    localStorage save (one slot)
    ui/         React panels, store, game loop, debug.ts
      canvas/   Canvas 2D grid renderer and input mapping (no React state inside the draw loop)
```

Allowed imports: `sim` imports only `sim`. `content` imports `sim` types. `harness` imports `sim` and `content`. `persist` imports `sim` types. `ui` imports `sim`, `content` and `persist`. Step 1 enforces this.

### 2.3 Renderer choice: plain Canvas 2D

The grid is at most 16 × 12 tiles with a few hundred items. Canvas 2D draws that at 60 fps easily. It adds no dependency, emoji and flat shapes render directly, and hit-testing a square grid is simple arithmetic. PixiJS would add about 400 KB, a scene graph to keep in sync with the sim state, and an API to learn, with no visible gain at this scale. If a later zoomed-out multi-branch view needs it, the renderer is one folder (`src/ui/canvas/`) and can be swapped.

### 2.4 Conventions every step follows

- **Simulation shape:**
  - Public functions never mutate their input.
  - `applyCommand(state, defs, cmd) → { state, result }` and `runTicks(state, defs, n) → state` clone the state once with `structuredClone`, then mutate the clone internally. This keeps batch runs fast.
  - Content definitions (`defs`) are passed in, never imported by `sim`.
- **Debug prints:**
  - The sim never prints. Each tick, notable things go into `state.events` (a typed array, cleared at the start of each tick): `emit`, `process`, `served`, `spoiled`, `binned`, `customerArrived`, `customerLeft`, `commandRejected`, and so on.
  - The UI uses `debugLog(tag, ...)` from `src/ui/debug.ts`, which prints only in dev builds. Tags: `[ui]`, `[store]`, `[save]`, `[canvas]`.
  - The harness prints `[sim]` lines. Tests may print `[DEBUG <area>]` lines.
- **Input validation:**
  - Commands, UI inputs and loaded saves are untrusted.
  - A bad command returns `{ ok: false, reason }`, logs `commandRejected`, and leaves the state unchanged. The sim never throws on bad input.
  - Save errors show a UI message and call `console.error`.
- **Provisional numbers** live only in `src/sim/constants.ts` (rules) and `src/content/*` (items, recipes, prices), with a comment naming the GAME_DESIGN section.
- **Definition of done for every step:**
  1. `npm run typecheck`, `npm test` and `npm run lint` pass in `kitchen-line/`.
  2. The step's debug prints exist.
  3. A dated Progress line is added.
- **UI** follows the global UI/UX guide:
  - tabular figures (`font-variant-numeric: tabular-nums`) on every number, with numeric columns right-aligned;
  - key-value rows, not prose;
  - one primary action per view;
  - status shown with icon plus color, never color alone;
  - visible focus rings and hit targets of at least 44 px;
  - reserved space so nothing shifts;
  - empty and error states designed.

  Colors are defined once as CSS custom properties in `src/ui/styles.css`: `--good`, `--bad`, `--warn`, `--info`, `--money`, `--text`, `--text-muted`, `--text-faint`, `--surface`, `--surface-raised`, `--focus`.

### 2.5 Provisional numbers

All values are tuning placeholders. Ticks are at 10 ticks/s.

| Area | Value |
| --- | --- |
| Tick rate | 10 ticks/s at 1×. Speeds: pause, 1×, 2×, 4× |
| Day length | 2400 ticks (4 min at 1×). Clock shown as 11:00 → 22:00 |
| Day phases (ticks) | 0–240 open (quiet), 240–840 lunch rush, 840–1380 quiet, 1380–1980 dinner rush, 1980–2280 quiet, 2280–2400 closing (no arrivals) |
| Arrivals | Mean gap 150 ticks when quiet and 50 ticks in a rush. Per-tick chance = 1 / gap × reputation factor × tier factor |
| Reputation factor | 0.4 + 0.2 × reputation (1★ → 0.6, 3★ → 1.0, 5★ → 1.4) |
| Tier factor | Stall 1.0, restaurant 1.5 |
| Expected customers | About 31 per day at 3★ (stall) |
| Waiting-order capacity | Stall 6, restaurant 10 |
| Patience | Uniform 300–600 ticks (30–60 s) from order |
| Taste | Each customer likes 2–3 of the 6 dishes in a preference order, drawn by popularity weight (fries 3, burger 3, sandwich 2, salad 2, rice bowl 2, soup 1) |
| Budget | Reference price of the customer's first-choice dish × uniform 0.9–1.4 |
| Belt | 2 slots per tile (half tiles). A half-tile step every 3 ticks (1 tile per 0.6 s). Fast belt: every 2 ticks |
| Pantry | Emit interval selectable from 10, 20, 40 or 80 ticks (default 20). Only emits if its front accepts and money ≥ cost |
| Chopper / fryer / stove / assembler | 20 / 40 / 60 / 30 ticks per item |
| Station buffers | Processors: input 2, output 1. Assembler: 2 per ingredient, output 1. Splitter, merger and filter: 1 |
| Warm-up | A building placed during service is offline for 30 ticks. Belts have no warm-up |
| Spoilage | Fresh produce (tomato, lettuce, sliced tomato, chopped lettuce) after 600 ticks. Finished dishes after 300 ticks. A warning marker shows in the last third. Nothing else spoils |
| Pass | 1 per kitchen, pre-placed, cannot be removed. Shelf of 4 dishes |
| Ingredient cost (cents) | potato 30, tomato 40, lettuce 40, bun 50, patty 120, rice 30, bread 40 |
| Dish reference price (cents) | Fries 300, Salad 450, Soup 400, Sandwich 600, Burger 800, Rice bowl 700 |
| Price input range | 50% to 300% of the reference price, in 10-cent steps |
| Menu cap | Stall 4, restaurant 6 |
| Starting money | 15000 ($150) |
| Building cost (cents) | belt 100, fast belt 300 (restaurant tier), pantry 1000, splitter 800, merger 800, filter 1200, chopper 2500, fryer 4000, stove 6000, assembler (2 × 1) 5000, bin 500 |
| Selling a building | 100% refund. Items inside are destroyed and counted as waste |
| Recipes | Fries and Salad start unlocked. Soup 4000, Sandwich 6000, Burger 8000, Rice bowl 10000 |
| Grid expansions | 8×6 → 10×8 (10000, stall) → 12×9 (20000), 14×11 (35000), 16×12 (50000). Sizes from 12×9 up need the restaurant tier |
| Ratings (1–5 integer) | Served customers start at 5. Wait over 50% of patience −1, over 80% −2. Price over 90% of budget −1. Not their first choice −1. Patience ran out: 1. No affordable liked dish or queue full: 2. Minimum 1 |
| Reputation | Average of the last 50 ratings. A new game is seeded with 10 virtual ratings of 3 |
| Profit for goals | Sales minus ingredient cost. Building and expansion spending is excluded |
| Stall goals | (1) Serve your first dish. (2) Serve 100 dishes in total. (3) Reach 4.0★. (4) Earn $300 total profit. All four unlock "Upgrade to restaurant" for $250 |
| Restaurant goals | (5) Have 5 dishes on the menu. (6) Earn $300 profit in a single day with ≥ 90% of customers served at ≥ 4.2★. Finishing both shows the "Ready to expand" end screen |

Rough stall economy check: 31 customers × about $4.50 ≈ $140 sales, minus about $25 ingredients, gives about $115 a day. Goals 2–4 take about 4–6 days (20–30 minutes). A single fryer (4 s) roughly matches the rush (1 customer per 5 s at 3★), so it becomes the bottleneck as reputation rises. That is the intended "find and fix" moment.

### 2.6 Content: items and recipes

- **Raw ingredients:** potato 🥔, tomato 🍅, lettuce 🥬, bun, patty (raw) 🥩, rice 🌾, bread 🍞.
- **Processing:**
  - Chopper: potato → potato strips, tomato → sliced tomato, lettuce → chopped lettuce.
  - Fryer: potato strips → **Fries** 🍟.
  - Stove: patty → cooked patty, rice → cooked rice, sliced tomato → **Soup** 🍲.
- **Assembler recipes:**
  - **Salad** 🥗 = chopped lettuce + sliced tomato.
  - **Burger** 🍔 = bun + cooked patty + sliced tomato.
  - **Sandwich** 🥪 = bread + sliced tomato + chopped lettuce.
  - **Rice bowl** 🍛 = cooked rice + cooked patty.
- **Shape encoding** (so color is never the only cue):
  - raw ingredient: circle;
  - processed ingredient: rounded square;
  - dish: circle with a plate ring;
  - spoiling item: a ⚠ badge.

## 3. Decisions (section 13 resolutions, all confirmed by the user on 2026-11-19)

- **Q1. Build during service?** Recommended: **yes**. New non-belt buildings take 30 ticks (3 s) to come online and show a ⏳ badge. Removing a building during service destroys its items as waste. Also recommended (a new point): **the menu and prices are locked during service** and edited between days. This keeps customer choice and the day summary easy to read.
- **Q2. What spoils?** Recommended: **only fresh produce and finished dishes** (list in 2.5). Raw patty, buns, bread, rice and potato never spoil in the first playable.
- **Q3. Undo and copy/paste.** Recommended:
  - **Undo yes:** Ctrl+Z, last 50 build actions, done as inverse commands. It works because refunds are 100%.
  - **Drag-to-draw belts yes:** press and drag lays a belt path with automatic directions.
  - **Copy/paste deferred to a follow-up.** On grids up to 16×12, drag-belts plus undo cover most of the value, and paste needs selection, cost preview and collision rules.
- **Q4. Tutorial.** Recommended: **partly pre-built**. A new game starts with the pass, a potato pantry and Fries on the menu. The Goals panel shows a 4-item checklist for the first goal: place a chopper, place a fryer, connect them with belts to the pass, open for service. An empty start makes the 5-minute target hard. A fully built line teaches nothing.
- **Q5. Exact numbers.** Use the table in 2.5. They are tuned in Step 18 with the harness.
- **Q6. Leftover customers at close (new).** Recommended: customers still waiting at tick 2400 leave without a rating and are not counted as lost. Items on belts stay into the next day.
- **Q7. Selling refund (new).** Recommended: 100% in the first playable, so experimenting is free. Revisit when money gets tight.

## 4. Data model (src/sim/types.ts)

```ts
type Dir = 0 | 1 | 2 | 3;                       // N E S W; "front" = dir
type ItemId = string; type DishId = string;      // keys into content
interface Item { id: number; type: ItemId; bornTick: number }

type Building =
  | { kind: 'belt'; fast: boolean; slots: [Item | null, Item | null]; stalled: boolean } & Base
  | { kind: 'pantry'; ingredient: ItemId; interval: number; cooldown: number } & Base
  | { kind: 'splitter' | 'merger'; buf: Item | null; rr: number } & Base
  | { kind: 'filter'; filterItem: ItemId | null; buf: Item | null } & Base
  | { kind: 'chopper' | 'fryer' | 'stove'; input: Item[]; output: Item | null; progress: number } & Base
  | { kind: 'assembler'; recipe: DishId | null; inputs: Record<ItemId, Item[]>; output: Item | null; progress: number } & Base
  | { kind: 'pass'; shelf: Item[] } & Base
  | { kind: 'bin' } & Base;
interface Base { id: number; x: number; y: number; dir: Dir; onlineAt: number;
  status: 'ok' | 'idle' | 'blocked' | 'warming' | 'noCash' | 'noRecipe' }

interface Customer { id: number; arriveTick: number; prefs: DishId[]; budget: number;
  patience: number; dish: DishId; price: number }

interface DayStats { day: number; sales: number; ingredientCost: number; spent: number;
  customers: number; served: number; lostPatience: number; lostNoMatch: number; lostFull: number;
  waitTicksTotal: number; wasteSpoiled: number; wasteBinned: number; wasteDestroyed: number;
  byDish: Record<DishId, { served: number; lost: number; sales: number }>;
  reviews: { stars: number; text: string; dish: DishId | null }[] }

interface GameState {
  version: 1; seed: string; rng: { arrivals: RngState; reviews: RngState };
  tick: number; day: number; dayTick: number;
  phase: 'build' | 'service' | 'summary' | 'won';
  tier: 'stall' | 'restaurant'; expansion: number;               // index into expansion sizes
  width: number; height: number; tiles: (number | null)[];      // building id per tile; assembler fills 2
  buildings: Record<number, Building>; nextId: number;
  money: number; unlocked: DishId[]; menu: { dish: DishId; price: number }[];
  waiting: Customer[]; ratings: number[];                         // last 50
  today: DayStats; lastDay: DayStats | null;
  totals: { served: number; profit: number; days: number };
  goalsDone: string[]; events: SimEvent[];
}
```

Assembler footprint: the anchor tile plus the tile to its right relative to `dir`. It accepts inputs from any side except the front of the anchor. Its output goes out the front of the anchor.

Commands:
- `place {kind, x, y, dir, config?}`
- `remove {x, y}`
- `rotate {x, y}`
- `configure {x, y, ingredient | interval | filterItem | recipe}`
- `setMenu {dishes}`
- `setPrice {dish, cents}`
- `unlockRecipe {dish}`
- `buyExpansion`
- `upgradeTier`
- `openService`
- `dismissSummary`

## 5. Steps

Milestones:
- Steps 1–4: a visible belt moving items on screen.
- Steps 5–8: the full building set and all 6 dishes.
- Steps 9–12: the service day with customers and reputation.
- Steps 13–18: harness, panels, progression, save, tutorial and balance.

Review with the user after Step 6 (first real fries line) and after Step 15.

Working folder for all commands: `D:\Coding\project\kitchen-line`.

---

### Step 1: Scaffold the app and the architecture test

- Status: `done`
- Progress: 2026-11-19: scaffold, architecture test (probe `Math.random()` in `src/sim` fails with file, line and rule) and CLAUDE.md done; typecheck, test, lint and build pass. Awaiting the user's `npm run dev` check.
- Depends on: the user's go-ahead to start coding
- Files: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.harness.json`, `.oxlintrc.json`, `.gitignore`, `CLAUDE.md`, `src/main.tsx`, `src/ui/App.tsx`, `src/ui/debug.ts`, `src/ui/styles.css`, `src/harness/cli.ts`, `tests/architecture.test.ts`
- What changes:
  - Copy the config files from `trading-sim/` as new files and rename the project to `kitchen-line`. Use the same dependency versions (React 19, Vite 8, TypeScript 6, Vitest 4, tsx, oxlint). The scripts are the same: `dev`, `build`, `lint`, `test`, `typecheck`, and `sim` = `tsx src/harness/cli.ts`. Keep `base: './'` in Vite.
  - Copy `trading-sim/tests/architecture.test.ts` and adapt it to the layer rules in 2.2. `src/ui/canvas` belongs to `ui`. In `src/sim` it bans `Math.random`, `Date`, `performance.now`, `console`, storage, `process`, DOM globals and React.
  - `styles.css` defines the color tokens from 2.4 (dark theme, AA contrast) and a `.num` class with `font-variant-numeric: tabular-nums`.
  - `CLAUDE.md`: a short version of trading-sim's: commands, layers, "money is integer cents", "ticks are integers", "plan in doc/plans".
  - `App` shows "Kitchen Line – dev build". `debugLog('[ui]', 'app mounted')`.
- Must not change: `doc/`. No imports from `trading-sim/`. No `git init`.
- Acceptance: `npm install`, `npm run typecheck`, `npm test`, `npm run lint` and `npm run build` succeed. A temporary `src/sim/probe.ts` using `Math.random()` fails the architecture test with file, line and rule; delete it afterwards.
- Verification: the user runs `npm run dev` and sees the dev-build text and `[ui] app mounted` in the console.

### Step 2: Sim core: RNG, content, grid placement, money

- Status: `done`
- Progress: 2026-11-19: sim core done (types, constants, rng/hash copies with `arrivals`/`reviews`, grid, commands, `createGame`, content `DEFS`). Place/remove/rotate/configure with rejections verified by `stateHash`; typecheck, test, lint and build pass.
- Depends on: 1
- Files: `src/sim/types.ts`, `src/sim/constants.ts`, `src/sim/rng.ts` (copied from trading-sim, streams `arrivals` and `reviews`), `src/sim/hash.ts` (copied), `src/sim/grid.ts`, `src/sim/commands.ts`, `src/sim/game.ts`, `src/content/items.ts`, `src/content/buildings.ts`, `src/content/recipes.ts`, `src/content/dishes.ts`, `src/content/index.ts` (exports `DEFS`), `src/sim/grid.test.ts`, `src/content/content.test.ts`
- What changes:
  - The types from section 4. Content with all items, recipes, dishes and building costs from 2.5 and 2.6. Each building has a `requiresTier`.
  - `createGame(defs, seed)`: 8×6 grid, money 15000, the pass at (7, 2) facing W, the potato pantry at (0, 2) facing E, menu `[fries @ 300]`, unlocked `[fries, salad]`, phase `build`, ratings seeded with 10 × 3.
  - `grid.ts`:
    - `tileIndex`, `inBounds`, `neighbor(x, y, dir)`, `footprint(kind, x, y, dir)`;
    - `canPlace(state, defs, cmd) → reason | null`. Reasons: out of bounds, occupied, cannot afford, locked by tier, pass cannot be removed.
  - `applyCommand` handles `place` / `remove` / `rotate` / `configure` for now. It charges or refunds money, and on remove counts destroyed items in `today.wasteDestroyed`.
  - `content.test.ts`: every recipe input exists, every dish is reachable from pantry ingredients through station recipes, and costs are positive integers.
  - Debug prints: `commandRejected` events with a reason. The test prints `[DEBUG grid]` lines.
- Acceptance:
  - Placing a building deducts its cost. Removing it refunds 100%.
  - The assembler fills 2 tiles and rotates its footprint.
  - Out of bounds, overlap, no money, wrong tier and removing the pass are each rejected with the state unchanged (compared by `stateHash`).
  - The input state is never mutated (deep-freeze the input in the test).

### Step 3: Tick loop: pantry, belts, pass, bin

- Status: `done`
- Progress: 2026-11-19: `runTicks`/`stepTick`, `transfer.ts`, `order.ts`, belt/pantry/pass/bin rules and `tick.test.ts` done (first delivery at tick 30, 29 per 600 ticks in all four facings); typecheck, test, lint and build pass.
- Depends on: 2
- Files: `src/sim/tick.ts`, `src/sim/transfer.ts`, `src/sim/order.ts`, `src/sim/game.ts`, `src/sim/tick.test.ts`
- What changes:
  - `runTicks(state, defs, n)`: clone once, then call `stepTick(draft)` n times. In this step it runs in any phase; Step 10 restricts it to `service`.
  - `transfer.ts`: `tryInsert(draft, building, item, fromDir) → boolean`. Each kind decides whether it accepts:
    - Belt: into slot 0 from back, left or right, only if slot 0 is empty. Never from its front.
    - Pass and bin: from any side. In this step the pass accepts any item as a placeholder and counts `delivered`; Step 6 restricts it to dishes.
  - `order.ts`: `updateOrder(state)` returns building ids, downstream first. For each belt, the distance is the number of belt steps until a non-belt or the edge. Belt cycles are ordered by id. Non-belt buildings come first. It is cached in a module-level `WeakMap` keyed by `state.tiles`, or recomputed every tick; the grid is small, so start with recomputing.
  - The belt step happens every 3 ticks (fast belt every 2) on the global tick:
    - slot 1 pushes to the front neighbour with `tryInsert`;
    - then slot 0 moves to slot 1 if it is empty;
    - an item moves at most once per tick (`movedTick` stored on a draft-only `Set`).
    - `stalled = true` when slot 1 was full and could not push.
  - Pantry: `cooldown--`. At 0, if money ≥ cost and the front accepts, create an item, charge the cost (`today.ingredientCost`), and reset the cooldown. Otherwise set status `noCash` or `blocked` and retry next tick.
  - Events: `emit`, `delivered`, `binned`.
- Acceptance (tests):
  - A straight 5-belt line from the pantry to the pass delivers the first item after a predictable tick count (assert the exact number).
  - Throughput is identical for lines facing N, E, S and W (each delivers the same count in 600 ticks).
  - A belt never holds more than 2 items.
  - With the pass replaced by nothing (belt end at the grid edge), the line fills to 2 per tile, the pantry goes `blocked` and money stops dropping.
  - A pantry with money < cost shows `noCash` and emits nothing.
  - Two runs from the same state give the same `stateHash`.

### Step 4: Canvas renderer, store and game loop (first visible slice)

- Status: `done`
- Progress: 2026-11-19: store (throttled snapshot), loop (tick accumulator), canvas draw + itemMotion, TopBar, `demoBeltLine` layout (6 belts, since the 8-wide grid leaves 6 tiles between pantry and pass) done with unit tests; typecheck, test, lint and build pass; page loaded in the in-app browser with no console errors, items glide, Space pauses, mobile width fits.
- Depends on: 3
- Files: `src/ui/store.ts`, `src/ui/loop.ts`, `src/ui/canvas/GridCanvas.tsx`, `src/ui/canvas/draw.ts`, `src/ui/canvas/itemMotion.ts`, `src/ui/TopBar.tsx`, `src/ui/App.tsx`, `src/ui/styles.css`, `src/content/layouts.ts`
- What changes:
  - `store.ts`: a `useSyncExternalStore` store holding `GameState` and `DEFS`, with `dispatch(cmd)`, `setSpeed(0 | 1 | 2 | 4)`, and `getState()`.
    - React subscribers are notified at most 5 times a second (throttled).
    - The canvas reads `getState()` every animation frame instead of re-rendering through React.
  - `loop.ts`: `requestAnimationFrame` with a time accumulator. Ticks to run = floor(acc / (100 ms / speed)), capped at 40 per frame so a background tab does not spiral. It calls `runTicks` once per frame.
  - `draw.ts`:
    - Tile size fits the container (min 32 px, max 64 px).
    - Floor checkerboard; buildings as flat shapes with an emoji glyph and a direction arrow.
    - Belts as a strip with chevrons. A stalled belt gets a hatched overlay plus a ⛔ glyph.
    - Items drawn with the shape encoding from 2.6.
  - `itemMotion.ts` (renderer-only map from item id to displayed x, y):
    - Each frame the displayed position moves toward the item's target slot position. Maximum speed is half a tile per belt period, scaled by the speed setting.
    - Items jump if they are more than 1.5 tiles away (new or removed).
    - Items inside stations are drawn as a count badge, not moving.
  - `TopBar`: day, money (`.num`), pause / 1× / 2× / 4× buttons as a segmented control with `aria-pressed`. Space toggles pause.
  - `layouts.ts`: a `demoBeltLine` layout (pantry → 5 belts → pass) as a list of `place` commands. Applied in dev with `?layout=demoBeltLine`.
  - Debug prints: `[store] dispatch <cmd> -> ok|rejected <reason>`, `[canvas] tile=<px> grid=<w>x<h>`.
- Acceptance: with `?layout=demoBeltLine`, potatoes visibly glide tile by tile into the pass. Pause freezes them. 4× is visibly faster and smooth. Money ticks down by 0.30 per emit. Resizing the window keeps the grid fitted and nothing jumps.
- Verification: the user opens `npm run dev` with `?layout=demoBeltLine` and watches potatoes move.

### Step 5: Building UX: palette, ghost, drag-belts, rotate, remove, inspector, undo, keyboard

- Status: `done`
- Progress: 2026-11-20: palette (10 buildings, hotkeys 1-9 and 0, visible disabled reasons), ghost with sim-checked validity, one-action drag-belts (L-path, all-or-nothing), rotate, sell (right-click, X, Delete), inspector with config controls, undo (50 entries, groups atomic), keyboard cursor and toasts done with unit tests; typecheck, test, lint and build pass; place, drag, rotate, sell, undo and keyboard place checked in the in-app browser (desktop and 375 px), no console errors. The by-hand rebuild-in-under-a-minute check is the user's.
- Depends on: 4
- Files: `src/ui/BuildPalette.tsx`, `src/ui/Inspector.tsx`, `src/ui/canvas/input.ts`, `src/ui/canvas/draw.ts`, `src/ui/undo.ts`, `src/ui/store.ts`, `src/ui/App.tsx`, `src/ui/undo.test.ts`
- What changes:
  - **Palette** (right panel): one button per building with glyph, name and cost (`.num`).
    - Disabled buttons show the reason as a visible line, not only a tooltip ("Needs $40.00", "Restaurant tier").
    - Hotkeys 1–9 and 0, shown on the buttons.
  - **Ghost preview** under the cursor: a green outline with ✓ when valid, a red outline with ✕ and the reason text when invalid. R rotates and Esc cancels.
  - **Drag-to-draw belts:** pointer down, drag, pointer up places belts along an L-path (horizontal first, then vertical). Each belt faces the next tile. Occupied tiles are skipped. The total cost is shown next to the cursor, and the drag is rejected as a whole if it can't be afforded.
  - **Remove:** right-click, or X then click, or Delete on the selection. The pass cannot be removed.
  - **Inspector:** click selects a building. Key-value rows: kind, status (icon plus word), held items, progress %, and config controls (pantry ingredient and interval, filter item, assembler recipe). These controls use `configure`. Sell button with the refund amount.
  - **Undo** (`undo.ts`): a stack of up to 50 inverse commands (place ↔ remove with the same config; rotate ×3; configure with the previous value), pushed when a build command succeeds. Ctrl+Z pops and dispatches. A rejected inverse (for example, no money to re-place) shows a toast and drops the entry.
  - **Keyboard:** the canvas has `tabIndex=0` and a visible focus ring. Arrow keys move a tile cursor, Enter places or selects, R rotates, Delete removes. All palette and inspector controls are reachable with Tab.
- Acceptance:
  - Placing, rotating, removing and undoing all work with both mouse and keyboard.
  - Drawing a 6-tile belt costs $6.00 in one action and one undo entry.
  - Invalid placement shows its reason.
  - Tests: undo of place restores money and grid (hash equal). Undo of a drag removes the whole path.
- Verification: the user rebuilds the demo line by hand from the starting layout in under a minute.

### Step 6: Processing stations, dish-only pass, the fries line

- Status: `todo`
- Depends on: 5
- Files: `src/sim/stations.ts`, `src/sim/tick.ts`, `src/sim/transfer.ts`, `src/sim/stations.test.ts`, `src/ui/canvas/draw.ts`, `src/content/layouts.ts`
- What changes:
  - **Chopper, fryer and stove:**
    - They accept an item only if a station recipe exists for it and the input has fewer than 2 items. Inputs come from back, left or right.
    - When online and the output is empty, they start the first input. After the station time, they produce the output item (new id, `bornTick` = now).
    - The output pushes out the front with `tryInsert`.
    - Status: `warming`, `idle` (no input), `blocked` (output full and the push failed), or `ok`.
  - The pass now accepts dishes only, up to 4 on the shelf. Until customers exist (Step 11) it serves a dish immediately and counts `today.served`.
  - **Status badges** on the canvas: idle ⏸ (muted), blocked ⛔ (`--bad`), warming ⏳ (`--info`), no cash $ (`--warn`). A thin progress bar for the processing station.
  - Layout `friesLine`: pantry(potato) → belts → chopper → belts → fryer → belts → pass.
- Acceptance (tests): `friesLine` serves its first fries at the asserted tick and then serves N fries in 1200 ticks at the fryer-limited rate (±1). A tomato fed into a fryer is not accepted, so the belt stalls. An unconnected stove shows `idle`.
- Verification (review with the user): build the fries line by hand from the starting state and time it. The target is under 5 minutes.

### Step 7: Splitter, merger, filter

- Status: `todo`
- Depends on: 6
- Files: `src/sim/logistics.ts`, `src/sim/transfer.ts`, `src/sim/tick.ts`, `src/sim/logistics.test.ts`, `src/ui/canvas/draw.ts`, `src/ui/Inspector.tsx`
- What changes:
  - **Splitter:** input from the back. Output alternates left and right (`rr`). If one side is blocked, the other is used.
  - **Merger:** inputs from left, right and back, round-robin by `rr` so no side starves. Output to the front.
  - **Filter:** input from the back. `filterItem` goes left, everything else goes front. With no filter set, everything goes front. The setting is chosen in the inspector from the items that exist.
  - Each has a one-item buffer.
- Acceptance (tests):
  - The splitter feeding 2 bins gives a 50/50 count (±1). With one side blocked, 100% goes to the other.
  - The merger with two saturated inputs takes 50/50 (±1).
  - The filter sends only tomatoes left from a mixed potato/tomato line.

### Step 8: Assembler and all 6 dishes

- Status: `todo`
- Depends on: 7
- Files: `src/sim/stations.ts`, `src/sim/transfer.ts`, `src/sim/stations.test.ts`, `src/content/layouts.ts`, `src/ui/canvas/draw.ts`, `src/ui/Inspector.tsx`
- What changes:
  - The assembler (2×1) with a selected `recipe` (an unlocked assembler dish only). It accepts an item if it is a recipe input and that input holds fewer than 2. It starts when every input has at least 1, takes 30 ticks, and outputs the dish out the front of the anchor.
  - Status `noRecipe` when unset, shown as a ❓ badge.
  - The canvas draws small input pips on the assembler (one per ingredient, filled or empty) so a missing ingredient is visible.
  - Layouts: `saladLine`, `burgerLine`, `soupLine`, `sandwichLine`, `riceBowlLine`, each a complete working line within 10×8.
- Acceptance (tests): each of the 6 layouts serves at least 5 of its dish within 1200 ticks. An assembler with a missing input never produces anything and shows `idle`.

### Step 9: Freshness, spoilage and waste

- Status: `todo`
- Depends on: 8
- Files: `src/sim/spoil.ts`, `src/sim/tick.ts`, `src/sim/spoil.test.ts`, `src/ui/canvas/draw.ts`
- What changes:
  - Each tick, any item whose type has `shelfTicks` and whose `tick - bornTick ≥ shelfTicks` is removed, wherever it is (belt, buffer, shelf). It adds `today.wasteSpoiled` and a `spoiled` event with position.
  - The bin adds `wasteBinned`.
  - Renderer: an item in the last third of its shelf life gets a ⚠ badge and a pulsing outline (`--warn`). A `spoiled` event shows a brief 🗑 puff at that tile (600 ms, UI only).
- Acceptance (tests): a sliced tomato on a dead-end belt spoils at exactly 600 ticks. A dish on the pass with no customer spoils at 300 ticks. Potatoes never spoil.

### Step 10: Day cycle, phases, warm-up, clock

- Status: `todo`
- Depends on: 9
- Files: `src/sim/day.ts`, `src/sim/game.ts`, `src/sim/tick.ts`, `src/sim/day.test.ts`, `src/ui/TopBar.tsx`, `src/ui/App.tsx`
- What changes:
  - `openService`: build → service, `dayTick = 0`, new `today` stats.
  - `runTicks` does nothing unless the phase is `service`.
  - When `dayTick` reaches 2400: `lastDay = today`, `totals.days++`, phase → `summary`. `dismissSummary` sets phase → `build` and `day++`.
  - `place` during service sets `onlineAt = tick + 30` for non-belt kinds. In build phase it is online at once.
  - `setMenu`, `setPrice` and `unlockRecipe` are rejected during service ("Menu is locked during service").
  - `phaseAt(dayTick)` returns `open | lunchRush | quiet | dinnerRush | closing` from 2.5.
  - TopBar:
    - clock `HH:MM` (`.num`, fixed width);
    - a phase badge with icon and word (🔥 Lunch rush);
    - a thin day-progress bar with rush bands marked;
    - the primary button "Open for service" in build phase. During service, the speed controls are the main controls and there is no primary button.
- Acceptance (tests): a day ends at exactly 2400 ticks of service. Ticks in build phase change nothing (hash equal). A building placed in service is `warming` for 30 ticks. Price changes in service are rejected.

### Step 11: Customers, orders and economy

- Status: `todo`
- Depends on: 10
- Files: `src/sim/customers.ts`, `src/sim/economy.ts`, `src/sim/tick.ts`, `src/sim/stations.ts` (pass), `src/content/dishes.ts`, `src/sim/customers.test.ts`, `src/ui/OrdersStrip.tsx`, `src/ui/App.tsx`
- What changes:
  - **Arrival** each service tick (not in closing): draw from the `arrivals` stream against the per-tick chance in 2.5. Draw prefs (2–3, weighted, no repeats), budget and patience.
  - **Choice:** the first dish in prefs that is on the menu with price ≤ budget. If none: `lostNoMatch`. If waiting is full: `lostFull`. Otherwise add to `waiting`.
  - **Pass matching:** each tick, each dish on the shelf goes to the oldest waiting customer for that dish. Sale: `money += price`, `today.sales += price`, record wait ticks and `byDish`.
  - Waiting customers whose patience ends are removed as `lostPatience`.
  - At day end, leftover customers are dropped without rating (Q6).
  - `economy.ts`: `profitOf(stats) = sales - ingredientCost`. The bankruptcy rule is already handled by pantry `noCash`.
  - **UI `OrdersStrip`** above the grid:
    - one fixed-width chip per waiting slot (capacity shown as empty slots, so there is no layout shift);
    - each chip shows the dish glyph and a patience bar that turns `--warn` then `--bad`, with a ⏰ icon under 25%.
- Acceptance (tests):
  - With a fixed seed the same customers arrive (hash equal across runs).
  - The rush has about 3× the arrival rate of quiet periods (10,000-tick statistical test, ±15%).
  - A menu without fries loses fries-first customers who can't afford anything else.
  - A dish never goes to a customer who ordered something else.
  - Money only rises through sales.

### Step 12: Ratings, reputation, reviews

- Status: `todo`
- Depends on: 11
- Files: `src/sim/reviews.ts`, `src/content/reviewText.ts`, `src/sim/customers.ts`, `src/sim/reviews.test.ts`, `src/ui/TopBar.tsx`
- What changes:
  - The rating rules from 2.5 on each served or lost customer. Push to `ratings` and keep the last 50. Reputation is their average, used by arrivals.
  - Review text: templates keyed by the main reason, e.g. `waitedLong` "Waited forever for {dish}", `overpriced` "{dish} was overpriced", `notFirstChoice` "Wanted {pref}, got {dish}", `noMatch` "Nothing I wanted at a price I liked", `queueFull` "Couldn't even order, the queue was full", `gaveUp` "Left before my {dish} came", `great` "{dish} was fast and fresh".
  - The template variant is picked on the `reviews` stream. Keep up to 20 reviews per day: always keep the lowest-rated, plus a sample.
  - TopBar: reputation as `4.2★` (`.num`) with a change arrow ▲ or ▼ since day start.
- Acceptance (tests): each reason produces its template. Reputation equals the mean of the stored ratings. Seeds are deterministic. The reviews stream does not change arrivals (arrival log equal with review drawing stubbed).

### Step 13: Harness CLI and performance check

- Status: `todo`
- Depends on: 12
- Files: `src/harness/cli.ts`, `src/harness/run.ts`, `src/sim/perf.test.ts`
- What changes:
  - `npm run sim -- --layout friesLine --seed demo --days 5 [--menu fries:300,salad:450] [--speedtest]`
  - It applies the layout and menu, then for each day runs `openService` → 2400 ticks → `dismissSummary`. It prints one `[sim] day=<n> served= lost=p/n/f sales= cost= profit= rep= waste= avgWait=` line per day and the final `stateHash`.
  - Validation: unknown layout, dish or bad number exits with code 1 and a message.
  - `perf.test.ts`: a full 16×12 grid of looping belts with items, plus the five dish layouts, runs 7 days (16,800 ticks) in under 1 s on Node.
- Acceptance: two identical invocations print identical output. `friesLine` for 5 days prints plausible numbers (profit > 0, rep between 2 and 5). The perf test passes.

### Step 14: Menu and prices panel, recipe unlocks

- Status: `todo`
- Depends on: 13
- Files: `src/ui/MenuPanel.tsx`, `src/ui/SidePanel.tsx` (tabs: Build, Menu, Goals), `src/content/dishes.ts` (helper `ingredientCostOf(dish)`), `src/ui/money.ts`, `src/ui/App.tsx`
- What changes:
  - Table: one row per dish. Columns: on-menu toggle, dish glyph and name, price input, reference price, ingredient cost, margin (± with ▲/▼ and color), served today. Numbers are right-aligned with `.num`.
  - Locked dishes show "Unlock $80.00" as a button (disabled with the reason if unaffordable).
  - The menu cap is shown as "3 / 4 on menu". At the cap the remaining toggles are disabled with that reason.
  - The price input accepts dollars and is clamped to 50%–300% of the reference price. An invalid value shows an inline error and is not dispatched.
  - During service the whole panel is read-only with a "Locked during service" note.
  - Empty state: "No dishes on the menu: customers will leave."
- Acceptance: menu and price changes show up in the next service. Every invalid input shows an error. Keyboard-only use works.

### Step 15: End-of-day summary

- Status: `todo`
- Depends on: 14
- Files: `src/ui/DaySummary.tsx`, `src/sim/summary.ts`, `src/sim/summary.test.ts`, `src/ui/App.tsx`
- What changes:
  - `summarizeDay(stats, prevStats)` is a pure function. It returns KPI values, deltas, the worst dish (most lost), and a `bottleneckHint`:
    - most lost to patience: "Customers gave up waiting for {dish}";
    - most no-match: "Menu or prices don't fit customers";
    - most waste: "{item} spoiled on the line".
  - The modal shows when the phase is `summary`:
    - KPI cards: Profit, Served / Customers (%), Reputation, Average wait (s);
    - a key-value block: sales, ingredient cost, lost (patience / no match / queue full), waste (spoiled / binned / destroyed);
    - a per-dish table;
    - up to 3 reviews (stars as ★ plus a number);
    - one primary button, "Back to kitchen" (`dismissSummary`). It gets focus on open; Esc does not dismiss.
  - Deltas versus the previous day use ▲/▼ and a sign.
- Acceptance (tests): the hint picks the right reason in each case. Manually: day 1 with the fries line shows the summary with all numbers filled and no layout jump between days.
- Verification (review with the user): play 2 days.

### Step 16: Goals, restaurant tier, expansions, end screen

- Status: `todo`
- Depends on: 15
- Files: `src/content/goals.ts`, `src/content/expansions.ts`, `src/sim/goals.ts`, `src/sim/game.ts`, `src/sim/goals.test.ts`, `src/ui/GoalsPanel.tsx`, `src/ui/EndScreen.tsx`
- What changes:
  - Goals are data: `{ id, tier, label, check(state) → { done, current, target } }`. Checked at each service tick end and at day end. The stall goals and restaurant goals are from 2.5.
  - `upgradeTier`: needs all stall goals done and $250. It sets `tier = restaurant`, the menu cap to 6, capacity to 10, and the arrival factor to 1.5, and unlocks fast belts.
  - `buyExpansion` grows `width` and `height`, keeping buildings at their coordinates. It respects tier gating. It is allowed in build phase only.
  - All restaurant goals done → `phase = won` at day end. `EndScreen`: "Ready to expand", totals, and a "Keep playing" button (sets `phase = build`, goals stay done).
  - `GoalsPanel`: a checklist with progress `63 / 100` (`.num`) and a bar per goal, ✓ icon when done. "Upgrade to restaurant" is the primary button when available, otherwise disabled with the reason. The expansion button shows the next size and cost.
- Acceptance (tests): goals complete at their thresholds. The upgrade is rejected before all goals are done. Expansion keeps every building and item. The end screen triggers once.

### Step 17: Save and load

- Status: `todo`
- Depends on: 16
- Files: `src/persist/save.ts`, `src/persist/save.test.ts`, `src/ui/store.ts`, `src/ui/App.tsx`, `src/ui/SaveNotice.tsx`
- What changes:
  - Key `kitchen-line.save.v1`. Envelope `{ version: 1, savedAt: <ISO string from the UI>, state }`.
  - `loadSave(raw) → { ok, state } | { ok: false, reason }` validates the version, required top-level fields, array lengths (`tiles.length === width * height`) and that each building id exists.
  - Autosave: on each build-phase command (debounced 1 s), on day end, and on `visibilitychange` → hidden. Saving mid-service is fine because the state is plain JSON.
  - On load error: keep the raw text under `kitchen-line.save.v1.corrupt`, show a notice with "Start new game" as the primary action, and call `console.error`.
  - Settings menu in the TopBar: "New game" with a confirm dialog (destructive).
  - Debug prints: `[save] saved bytes=<n> day=<d>`, `[save] loaded day=<d>`, `[save] error <reason>`.
- Acceptance (tests): save → load round-trip gives the same `stateHash`. Truncated JSON, a wrong version and a missing field are each rejected with a reason. Manually: reloading the page mid-service resumes at the same tick, paused.

### Step 18: Tutorial start, polish states, balance pass

- Status: `todo`
- Depends on: 17
- Files: `src/content/goals.ts` (first-goal checklist), `src/ui/GoalsPanel.tsx`, `src/ui/canvas/draw.ts`, `src/ui/*.tsx` (states), `src/sim/constants.ts`, `src/content/*.ts` (tuning only)
- What changes:
  - **First-goal checklist (Q4):** place a chopper, place a fryer, connect to the pass (any fries delivered), open for service. While the checklist is open, faint ghost hint tiles show a suggested chopper and fryer position. They are drawn only and can be dismissed.
  - **States:**
    - grid hover tooltip for any item (name, freshness s);
    - empty inspector ("Select a building");
    - 0 customers today;
    - a very large money value uses compact notation above $1M;
    - a long review text is truncated with a full title.
  - Check that every `--*` token pair meets AA, and check a narrow width (≥ 1024 px is the supported minimum for the first playable; below it the side panel stacks under the grid).
  - **Balance:**
    - Run the harness for each dish layout and a 2-dish combo over 5 days.
    - Target: one fryer is the visible bottleneck at ≥ 4★ rush, the stall goals take 4–6 days, no layout loses money with reference prices.
    - Adjust numbers only in constants and content. Record the before and after table in Progress.
- Acceptance: the section 8 criteria.

## 6. Testing summary

- Unit tests (Vitest, next to source): grid placement, belt ordering and throughput by direction, each station, logistics ratios, spoilage timing, day cycle, customers (seeded), ratings, summary hints, goals, save round-trip, perf.
- Determinism: `stateHash` equality across repeated runs in tests and the harness.
- Architecture test keeps `sim` pure.
- Harness (`npm run sim`) for faster-than-real-time balance runs.
- Manual checks per step as listed. Playtest checkpoints after Steps 6, 15 and 18.

## 7. Risks and mitigations

- **Building UX is the make-or-break.**
  - Mitigations: drag-belts, ghost with reasons, 100% refund, undo, keyboard cursor (Step 5), and the hand-build timing check in Step 6 before more systems are built on top.
- **Belt update order bugs** (direction-dependent speed, items jumping 2 tiles, deadlocks on loops).
  - Mitigations: downstream-first order, a once-per-tick move guard, the 4-direction throughput test, and a belt-loop test (no item loss, no crash).
- **Sim and render coupling** (React re-rendering 40 times a second, stutter).
  - Mitigations: the canvas reads the store directly each frame, React panels are throttled to 5 Hz, item positions are interpolated in a renderer-only map, and the ticks per frame are capped.
- **Performance:**
  - Tiny grid; the perf test guards the headless speed.
  - `structuredClone` happens once per `runTicks` call, not per tick.
- **Determinism drift:**
  - Integer ticks and cents; named seeded streams in the state; no `Date` or `Math.random` in sim (architecture test).
  - Reputation is a float average but computed the same way everywhere.
- **Balance:**
  - All numbers are in two places. The harness gives day summaries in seconds. Step 18 is dedicated to tuning, and the rush/fryer ratio is designed in.
- **Emoji rendering differs by OS:**
  - The shape encoding and a 1-letter fallback keep items distinguishable. If an emoji renders as tofu, draw the letter.
- **Save compatibility:**
  - The versioned envelope and validation; a corrupt save is kept, not overwritten.
- **Scope creep:**
  - Copy/paste, fast-belt variants beyond one, trends and statistics graphs are kept out (see follow-ups).

## 8. Acceptance criteria for the first playable

1. A new player, starting from the tutorial state, builds a working Fries line and serves the first dish in under 5 minutes, with no instructions outside the game.
2. During a rush, at least one bottleneck is visible on the grid (stalled belt ⛔, idle station ⏸, spoiling ⚠, impatient orders ⏰). Adding a second station or rerouting visibly raises served/customers in the next day's summary.
3. All ~10 buildings and all 6 dishes are buildable and produce correctly. The Step 8 layouts pass.
4. Customers arrive with lunch and dinner rushes. They choose from the menu by taste and budget, wait, pay or leave. Reputation moves with service quality and changes arrivals.
5. The end-of-day summary shows sales, profit, lost customers by reason, waste, average wait, a per-dish table, reviews that name problems, and a bottleneck hint.
6. Milestones take the player from stall (8×6) to restaurant (up to 16×12, 6 menu slots) and end with the "Ready to expand" screen. The target is about 1–2 hours of play.
7. Pause, 1×, 2× and 4× work. Building during service works with warm-up. Undo works.
8. One local save persists across reloads, including mid-service. A corrupt save is handled without data loss.
9. The sim runs headless and deterministically (same seed and commands give the same hash). 7 days run in under 1 s in Node.
10. The UI meets the UI/UX guide:
    - tabular numbers;
    - structured data;
    - one primary action per view;
    - icon plus color for status;
    - keyboard reachable with a visible focus ring;
    - no layout shift as values change;
    - empty and error states present.

## 9. Optional follow-ups (not in the steps)

- Copy/paste of a rectangular selection with cost preview.
- An offline catch-up using `runTicks` from `savedAt`. This is already possible because the sim is pure.
- Per-station throughput statistics graph in the inspector.
- Balance batch mode in the harness (many seeds, percentile report), like trading-sim Step 12.
