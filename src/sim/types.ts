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

export type BuildingStatus = 'ok' | 'idle' | 'blocked' | 'warming' | 'noCash' | 'noRecipe'

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
    | { kind: 'pantry'; ingredient: ItemId; interval: number; cooldown: number }
    | { kind: 'splitter'; buf: Item | null; rr: number }
    | { kind: 'merger'; buf: Item | null; rr: number }
    | { kind: 'filter'; filterItem: ItemId | null; buf: Item | null }
    | { kind: 'chopper' | 'fryer' | 'stove'; input: Item[]; output: Item | null; progress: number }
    | {
        kind: 'assembler'
        recipe: DishId | null
        inputs: Record<ItemId, Item[]>
        output: Item | null
        progress: number
      }
    | { kind: 'pass'; shelf: Item[]; delivered: number }
    | { kind: 'bin' }
  )

export type Customer = {
  id: number
  arriveTick: number
  prefs: DishId[]
  budget: number
  patience: number
  dish: DishId
  price: number
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
  wasteBinned: number
  wasteDestroyed: number
  byDish: Record<DishId, { served: number; lost: number; sales: number }>
  reviews: { stars: number; text: string; dish: DishId | null }[]
}

export type RejectReason =
  | 'invalid command'
  | 'invalid config'
  | 'wrong phase'
  | 'out of bounds'
  | 'occupied'
  | 'cannot afford'
  | 'locked by tier'
  | 'locked recipe'
  | 'nothing there'
  | 'pass cannot be removed'
  | 'pass cannot be placed'
  | 'not implemented'

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
  today: DayStats
  lastDay: DayStats | null
  totals: { served: number; profit: number; days: number }
  goalsDone: string[]
  events: SimEvent[]
}

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
}

export type Defs = {
  items: Record<ItemId, ItemDef>
  buildings: Record<BuildingKind, BuildingDef>
  stationRecipes: StationRecipe[]
  dishes: Record<DishId, DishDef>
}

// ---- Commands -----------------------------------------------------------

export type ConfigFields = {
  ingredient?: ItemId
  interval?: number
  filterItem?: ItemId | null
  recipe?: DishId | null
}

export type Command =
  | {
      type: 'place'
      kind: BuildingKind
      x: number
      y: number
      dir: Dir
      config?: ConfigFields & { fast?: boolean }
    }
  | { type: 'remove'; x: number; y: number }
  | { type: 'rotate'; x: number; y: number }
  | ({ type: 'configure'; x: number; y: number } & ConfigFields)
  | { type: 'setMenu'; dishes: DishId[] }
  | { type: 'setPrice'; dish: DishId; cents: number }
  | { type: 'unlockRecipe'; dish: DishId }
  | { type: 'buyExpansion' }
  | { type: 'upgradeTier' }
  | { type: 'openService' }
  | { type: 'dismissSummary' }

export type CommandResult =
  | { ok: true }
  | { ok: false; reason: RejectReason; event: SimEvent }
