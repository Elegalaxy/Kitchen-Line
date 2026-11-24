// Data model for the sim (plan section 4) plus the shape of the content defs
// the sim is handed. The sim never imports content; it only sees `Defs`.

/** Named random streams. The order is part of the seed contract. */
export const RNG_STREAM_NAMES = ['arrivals', 'reviews'] as const
export type RngStreamName = (typeof RNG_STREAM_NAMES)[number]
export type RngStream = { a: number; b: number; c: number; d: number; spare?: number }
export type RngState = Record<RngStreamName, RngStream>
export type Weighted<T> = { value: T; weight: number }

/** N E S W. "front" of a building is its dir. */
export type Dir = 0 | 1 | 2 | 3
export type ItemId = string
export type DishId = string
export type Tier = 'stall' | 'restaurant'
/** Goal groups: the tiers plus the chain stage (GAME_DESIGN 8.1), which has no tier of its own (`state.won` opens it). */
export type GoalTier = Tier | 'chain'
export type Item = { id: number; type: ItemId; bornTick: number }

export type BuildingKind =
  | 'belt'
  | 'pantry'
  | 'splitter'
  | 'merger'
  | 'filter'
  | 'chopper'
  | 'fryer'
  | 'stove'
  | 'assembler'
  | 'pass'
  | 'bin'

export type BuildingStatus = 'ok' | 'idle' | 'blocked' | 'warming' | 'noCash' | 'noRecipe' | 'paused'

export type Base = {
  id: number
  x: number
  y: number
  dir: Dir
  onlineAt: number
  status: BuildingStatus
}

export type Building = Base &
  (
    | { kind: 'belt'; fast: boolean; slots: [Item | null, Item | null]; stalled: boolean }
    /** `paused` is only present (true) while the player has paused it; absent means running. */
    | { kind: 'pantry'; ingredient: ItemId; interval: number; cooldown: number; paused?: boolean }
    | { kind: 'splitter'; buf: Item | null; rr: number }
    | { kind: 'merger'; buf: Item | null; rr: number }
    | { kind: 'filter'; filterItem: ItemId | null; buf: Item | null }
    | { kind: 'chopper'; input: Item[]; output: Item | null; progress: number }
    /** `pro` is only present (true) on the pro variant: it needs less time per item (GAME_DESIGN 5.3). */
    | { kind: 'fryer' | 'stove'; pro?: boolean; input: Item[]; output: Item | null; progress: number }
    | {
        kind: 'assembler'
        pro?: boolean
        recipe: DishId | null
        inputs: Record<ItemId, Item[]>
        output: Item | null
        progress: number
      }
    | { kind: 'pass'; shelf: Item[]; delivered: number }
    | { kind: 'bin' }
  )

/** Why a customer left unserved (counted in DayStats). Closing-time leftovers are not a loss (Q6). */
export type LostReason = 'patience' | 'noMatch' | 'full'

/**
 * `id` is the global tick the customer arrived on: at most one customer arrives per tick and
 * `state.tick` only ever grows, so it is unique. `arriveTick` is when the order was placed;
 * the customer leaves unserved once `state.tick - arriveTick >= patience` (patience is the
 * total allowance in ticks, not what is left).
 */
export type Customer = {
  id: number
  arriveTick: number
  prefs: DishId[]
  budget: number
  patience: number
  dish: DishId
  price: number
  /** True for the food critic (critic.ts): higher standards, rating weighted. Absent for everyone else. */
  critic?: true
}

export type DayStats = {
  day: number
  sales: number
  ingredientCost: number
  spent: number
  customers: number
  served: number
  lostPatience: number
  lostNoMatch: number
  lostFull: number
  waitTicksTotal: number
  wasteSpoiled: number
  /** Spoiled items today per item type (sums to wasteSpoiled); feeds the summary hint (Step 15). */
  spoiledByItem: Record<ItemId, number>
  /** Part of `wasteSpoiled`: items thrown away at day end (still on the line at close). */
  wasteOvernight: number
  /** Part of `spoiledByItem`: the same overnight items per type. */
  overnightByItem: Record<ItemId, number>
  wasteBinned: number
  wasteDestroyed: number
  byDish: Record<DishId, { served: number; lost: number; sales: number }>
  reviews: Review[]
  /** The food critic's result today (critic.ts); absent on days without a critic or before the critic is resolved. */
  critic?: { stars: number; served: boolean; dish: DishId | null }
  /** Each branch's night: `net` is after `rent` (both cents). Absent while there are no branches (GAME_DESIGN 8.1). */
  branches?: { id: number; net: number; rent: number }[]
}

/** The main reason behind a rating (plan Step 12); picks the review template. */
export type ReviewReason = 'waitedLong' | 'overpriced' | 'notFirstChoice' | 'noMatch' | 'queueFull' | 'gaveUp' | 'great'

/** A written review kept in `DayStats.reviews`. */
export type Review = { stars: number; text: string; dish: DishId | null; reason: ReviewReason }

/** Parts of a service day (plan 2.5). */
export type DayPhase = 'open' | 'lunchRush' | 'quiet' | 'dinnerRush' | 'closing'

export type RejectReason =
  | 'invalid command'
  | 'invalid config'
  | 'wrong phase'
  | 'out of bounds'
  | 'occupied'
  | 'cannot afford'
  | 'locked by tier'
  | 'locked recipe'
  | 'already unlocked'
  | 'menu full'
  | 'not on menu'
  | 'price out of range'
  | 'invalid price'
  | 'nothing there'
  | 'pass cannot be removed'
  | 'pass cannot be placed'
  | 'pass limit'
  | 'already owned'
  | 'not implemented'
  | 'goals not done'
  | 'already restaurant'
  | 'no more expansions'
  | 'Menu is locked during service'
  | 'chain locked'
  | 'branch limit'
  | 'no such branch'
  | 'blueprint unchanged'
  | 'branch would lose money'

/**
 * Events are cleared at the start of each tick (Step 3). `applyCommand` does not
 * store `commandRejected` in the state (a rejected command leaves the state
 * identical); it returns the event next to the result instead.
 */
export type SimEvent =
  | { type: 'built'; tick: number; kind: BuildingKind; x: number; y: number; cost: number }
  | {
      type: 'removed'
      tick: number
      kind: BuildingKind
      x: number
      y: number
      refund: number
      destroyed: number
    }
  | { type: 'emit'; tick: number; x: number; y: number; item: ItemId; cost: number }
  | { type: 'stationDone'; tick: number; x: number; y: number; input: ItemId; output: ItemId }
  | { type: 'assembled'; tick: number; x: number; y: number; dish: DishId }
  | { type: 'delivered'; tick: number; x: number; y: number; item: ItemId }
  | { type: 'binned'; tick: number; x: number; y: number; item: ItemId }
  | { type: 'spoiled'; tick: number; x: number; y: number; item: ItemId }
  | { type: 'customerArrived'; tick: number; id: number; prefs: DishId[]; dish: DishId | null; price: number; critic?: true }
  | { type: 'customerLeft'; tick: number; id: number; reason: LostReason | 'closing'; dish: DishId | null }
  | { type: 'served'; tick: number; id: number; dish: DishId; price: number; wait: number }
  | { type: 'goalDone'; tick: number; id: string }
  | { type: 'tierUpgraded'; tick: number; cost: number }
  | { type: 'upgradeBought'; tick: number; id: string; cost: number }
  | { type: 'tutorialHelp'; tick: number; cents: number }
  | { type: 'expanded'; tick: number; width: number; height: number; cost: number }
  | { type: 'won'; tick: number }
  | { type: 'branchOpened'; tick: number; id: number; areaId: string; cost: number }
  | { type: 'branchRefit'; tick: number; id: number; cost: number }
  | { type: 'chainWon'; tick: number }
  | { type: 'commandRejected'; tick: number; command: string; reason: RejectReason }

export type GameState = {
  version: 1
  seed: string
  rng: RngState
  tick: number
  day: number
  dayTick: number
  phase: 'build' | 'service' | 'summary' | 'won'
  tier: Tier
  expansion: number
  width: number
  height: number
  /** Building id per tile, or null. An assembler fills 2 tiles. */
  tiles: (number | null)[]
  buildings: Record<number, Building>
  nextId: number
  /** Next item id; items are created by pantries. */
  nextItemId: number
  money: number
  unlocked: DishId[]
  menu: { dish: DishId; price: number }[]
  waiting: Customer[]
  ratings: number[]
  /** Reputation when today's service opened (the TopBar change arrow compares against it). */
  repAtDayStart: number
  today: DayStats
  lastDay: DayStats | null
  /** The day before `lastDay` (set when a day ends); the summary shows deltas against it (Step 15). */
  prevDay: DayStats | null
  totals: { served: number; profit: number; days: number }
  /** Ids of goals that were reached; a goal stays done for good (plan Step 16). */
  goalsDone: string[]
  /** Ids of the restaurant upgrades bought (GAME_DESIGN 6.4). Absent until the first purchase. */
  upgrades?: string[]
  /**
   * `totals.profit` when the restaurant upgrade was bought (set by `upgradeTier`); restaurant goal 7 counts
   * profit from there. Absent in older restaurant saves: they count all their profit.
   */
  tierProfitStart?: number
  /** The `day` of the upgrade to restaurant (critics start the day after). Absent in older restaurant saves. */
  tierDay?: number
  /** True once the "Ready to expand" end screen has been triggered; it never triggers twice. */
  won: boolean
  /** Branches of the chain stage (GAME_DESIGN 8.1). Absent until the first one opens. */
  branches?: Branch[]
  /** Net cents the branches have earned in total (after rent). Absent until the first branch night. */
  chainProfit?: number
  /** True once the "Chain built" end screen has been triggered; it never triggers twice. */
  chainWon?: true
  /**
   * The stall kitchen as it was when the player upgraded to a restaurant (GAME_DESIGN 8.2, starter kitchen).
   * Set once by `upgradeTier`; absent in a run that never upgraded and in older saves.
   */
  stallKit?: Blueprint
  events: SimEvent[]
}

// ---- Chain stage (GAME_DESIGN 8.1) ----------------------------------------

/** A snapshot of the flagship kitchen that a branch runs: buffers empty, buildings idle, pantries running. */
export type Blueprint = {
  width: number
  height: number
  expansion: number
  tiles: (number | null)[]
  buildings: Record<number, Building>
  menu: { dish: DishId; price: number }[]
  unlocked: DishId[]
  /** Cents: the sum of the selling prices of the buildings (what opening it costs on top of the fee). */
  value: number
}

/** The result of one headless test day of a blueprint at a site (cents and counts). */
export type BranchExpected = { profit: number; sales: number; served: number; customers: number }

export type Branch = {
  id: number
  areaId: string
  openedDay: number
  /** The flagship `day` the blueprint was taken on (opening or the last refit). */
  blueprintDay: number
  refits: number
  blueprint: Blueprint
  expected: BranchExpected
}

/** One site on offer (content/branchAreas.ts). `demandPercent` scales arrivals, `rent` is charged per night (cents). */
export type BranchAreaDef = { id: string; name: string; emoji: string; demandPercent: number; rent: number }

// ---- Content defs handed to the sim -------------------------------------

export type ItemDef = {
  id: ItemId
  name: string
  emoji: string
  kind: 'raw' | 'processed' | 'dish'
  /** Pantry cost per item in cents. Raw items only. */
  cost?: number
  /** Ticks until the item spoils; absent = never spoils. */
  spoilTicks?: number
}

export type BuildingDef = {
  kind: BuildingKind
  name: string
  emoji: string
  /** Cents. 0 for the pass (pre-placed, not for sale). */
  cost: number
  requiresTier: Tier
  /** Footprint length in tiles (assembler 2). */
  tiles: 1 | 2
  /** False for the pass: it is pre-placed and cannot be bought. */
  placeable: boolean
  /** Belt only: the fast variant's cost and tier. */
  fast?: { cost: number; requiresTier: Tier }
  /** Fryer, stove and assembler only: the pro variant's cost and tier. */
  pro?: { cost: number; requiresTier: Tier }
}

/** Station recipe: a chopper, fryer or stove turns one input into one output. */
export type StationRecipe = {
  station: 'chopper' | 'fryer' | 'stove'
  input: ItemId
  output: ItemId
  ticks: number
}

export type DishDef = {
  id: DishId
  name: string
  emoji: string
  /** Cents. */
  refPrice: number
  /** Taste draw weight. */
  popularity: number
  startsUnlocked: boolean
  /** Cents to unlock; 0 if it starts unlocked. */
  unlockCost: number
  /** Assembler inputs (up to 3). Absent for station-made dishes (fries, soup). */
  inputs?: ItemId[]
  /** Lowest tier that can unlock, list and be wanted. Absent = any tier (GAME_DESIGN 6.2, dish pack). */
  requiresTier?: Tier
  /** Season id (SeasonDef.id) this dish is wanted in; customers only want it then (GAME_DESIGN 9). Absent = all year. */
  season?: string
}

/** One season (GAME_DESIGN 9, restaurant tier). Percent maps are of the base value; unlisted entries count as 100. */
export type SeasonDef = {
  id: string
  name: string
  emoji: string
  /** Pantry price percent per raw item id. */
  costPercent: Record<ItemId, number>
  /** Taste weight percent per dish id. */
  tastePercent: Record<DishId, number>
  /** Branch night profit percent. */
  branchPercent: number
}

export type Defs = {
  items: Record<ItemId, ItemDef>
  buildings: Record<BuildingKind, BuildingDef>
  stationRecipes: StationRecipe[]
  dishes: Record<DishId, DishDef>
  /**
   * Review text variants per reason, with `{dish}` and `{pref}` placeholders (content/reviewText.ts).
   * Optional so test fixtures can omit it; without it the review text is the reason key.
   */
  reviewTemplates?: Record<ReviewReason, string[]>
  /** Milestone goals (content/goals.ts). Optional so fixtures can omit them: no goals means none to finish. */
  goals?: GoalDef[]
  /** Grid expansion steps in order (content/expansions.ts). Without them no expansion is available. */
  expansions?: ExpansionDef[]
  /** Restaurant upgrades (content/upgrades.ts). Without them none is on offer. */
  upgrades?: UpgradeDef[]
  /** Branch sites (content/branchAreas.ts). Without them no branch can open. */
  branchAreas?: BranchAreaDef[]
  /** The four seasons in calendar order (content/seasons.ts). Without them there are no seasons. */
  seasons?: SeasonDef[]
  /** Franchise perks (content/perks.ts). Without them none is on offer. */
  perks?: PerkDef[]
}

/**
 * A franchise perk (GAME_DESIGN 8.2): permanent levels bought with franchise points between runs.
 * `costs[i]` is the price of level i + 1. The effect is per level and changes the starting state only.
 */
export type PerkDef = {
  id: string
  name: string
  emoji: string
  costs: number[]
  effect: {
    /** Cents of extra start cash per level. */
    startMoney?: number
    /** Starting virtual ratings turned into 4 stars, per level (a count). */
    goodRatings?: number
    /** Expansion steps applied for free at the start, per level. */
    startExpansion?: number
    /** True: a saved starter kitchen is installed free on day 1 (needs `MetaState.starterKit`). */
    starterKit?: boolean
  }
}

/** One finished franchised run in the meta history (GAME_DESIGN 8.2). */
export type RunRecord = { run: number; seed: string; days: number; profit: number; chainProfit: number; points: number }

/** One saved kitchen in the blueprint library: the run it came from and its stall kitchen (GAME_DESIGN 8.2). */
export type LibraryEntry = { run: number; kit: Blueprint }

/** Meta progress across runs (GAME_DESIGN 8.2), saved under its own key. Not part of `GameState`. */
export type MetaState = {
  runsCompleted: number
  points: number
  perks: Record<string, number>
  recipeBook: DishId[]
  history: RunRecord[]
  /** Legacy single saved kitchen (before the library). Read as library slot 1 by `libraryOf`; never written any more. */
  starterKit?: Blueprint
  /** The blueprint library: LIBRARY_SLOTS slots, null = empty. Absent until a kitchen is saved (GAME_DESIGN 8.2). */
  library?: (LibraryEntry | null)[]
  /** Slot (0-based) of the kitchen that starts the next run, or null for none. Absent: the most recently saved one. */
  activeKit?: number | null
}

/** What a goal reports: `current` and `target` are in the goal's unit (count, cents or stars). */
export type GoalProgress = { done: boolean; current: number; target: number; note?: string }
export type GoalUnit = 'count' | 'cents' | 'stars'

/** A milestone (content/goals.ts). `check` is pure and reads the state only. */
export type GoalDef = {
  id: string
  tier: GoalTier
  label: string
  unit: GoalUnit
  check(state: GameState): GoalProgress
}

/** One grid expansion step (content/expansions.ts); `state.expansion` counts the steps bought. */
export type ExpansionDef = { width: number; height: number; cost: number; requiresTier: Tier }

/** What a restaurant upgrade does (GAME_DESIGN 6.4). Percent effects of several upgrades add up. */
export type UpgradeEffect = {
  /** Extra arrival chance in percent (15 = x1.15). */
  arrivalPercent?: number
  /** Extra waiting places. */
  waitingCapBonus?: number
  /** Extra customer budget in percent. */
  budgetPercent?: number
  /** Extra customer patience in percent. */
  patiencePercent?: number
}

/** One restaurant upgrade (content/upgrades.ts); `state.upgrades` lists the ids bought. */
export type UpgradeDef = {
  id: string
  name: string
  emoji: string
  /** Cents. */
  cost: number
  requiresTier: Tier
  effect: UpgradeEffect
}

// ---- Commands -----------------------------------------------------------

export type ConfigFields = {
  ingredient?: ItemId
  interval?: number
  filterItem?: ItemId | null
  recipe?: DishId | null
  /** Pantry only: true pauses it (no emit, no cost, cooldown frozen), false resumes it. */
  paused?: boolean
}

/** Config of a place command: the fast belt and the pro stations are variants chosen at placement. */
export type PlaceConfig = ConfigFields & { fast?: boolean; pro?: boolean }

export type Command =
  | {
      type: 'place'
      kind: BuildingKind
      x: number
      y: number
      dir: Dir
      config?: PlaceConfig
    }
  | { type: 'remove'; x: number; y: number }
  | { type: 'rotate'; x: number; y: number }
  | ({ type: 'configure'; x: number; y: number } & ConfigFields)
  /** Pause or resume every pantry at once (any phase). */
  | { type: 'setPantriesPaused'; paused: boolean }
  | { type: 'setMenu'; dishes: DishId[] }
  | { type: 'setPrice'; dish: DishId; cents: number }
  | { type: 'unlockRecipe'; dish: DishId }
  | { type: 'buyExpansion' }
  | { type: 'upgradeTier' }
  /** Buy one restaurant upgrade (build phase, restaurant tier, once each). */
  | { type: 'buyUpgrade'; id: string }
  /** Open the next branch at its fixed site (build phase, after the restaurant end screen). */
  | { type: 'openBranch' }
  /** Copy the current flagship kitchen to branch `id` again. */
  | { type: 'refitBranch'; id: number }
  | { type: 'openService' }
  | { type: 'dismissSummary' }
  /** Add cents once so the suggested salad line can be bought (UI calls this; capped). */
  | { type: 'tutorialHelp'; cents: number }

export type CommandResult =
  | { ok: true }
  | { ok: false; reason: RejectReason; event: SimEvent }
