// createGame: builds the starting state (plan Step 2). 8 x 6 grid, $150, the pass at
// (7, 2) facing W, a potato pantry at (0, 2) facing E, fries on the menu at its
// reference price, build phase, and 10 virtual ratings of 3. Pure: same defs and seed
// give the same state.

import {
  INITIAL_RATING_COUNT,
  INITIAL_RATING_VALUE,
  PANTRY_DEFAULT_INTERVAL,
  PANTRY_DIR,
  PANTRY_POS,
  PASS_DIR,
  PASS_POS,
  START_HEIGHT,
  START_INGREDIENT,
  START_MONEY,
  START_TIER,
  START_WIDTH,
} from './constants.ts'
import { tileIndex } from './grid.ts'
import { createRng } from './rng.ts'
import type { Building, DayStats, Defs, DishId, GameState } from './types.ts'

export function emptyDayStats(day: number): DayStats {
  return {
    day,
    sales: 0,
    ingredientCost: 0,
    spent: 0,
    customers: 0,
    served: 0,
    lostPatience: 0,
    lostNoMatch: 0,
    lostFull: 0,
    waitTicksTotal: 0,
    wasteSpoiled: 0,
    wasteBinned: 0,
    wasteDestroyed: 0,
    byDish: {},
    reviews: [],
  }
}

/** A fresh building of `kind` with empty buffers. `ingredient` is the pantry default. */
export function newBuilding(
  kind: Building['kind'],
  id: number,
  x: number,
  y: number,
  dir: Building['dir'],
  onlineAt: number,
  defaults: { ingredient: string },
): Building {
  const base = { id, x, y, dir, onlineAt, status: 'idle' as const }
  switch (kind) {
    case 'belt':
      return { ...base, kind, fast: false, slots: [null, null], stalled: false }
    case 'pantry':
      return { ...base, kind, ingredient: defaults.ingredient, interval: PANTRY_DEFAULT_INTERVAL, cooldown: 0 }
    case 'splitter':
    case 'merger':
      return { ...base, kind, buf: null, rr: 0 }
    case 'filter':
      return { ...base, kind, filterItem: null, buf: null }
    case 'chopper':
    case 'fryer':
    case 'stove':
      return { ...base, kind, input: [], output: null, progress: 0 }
    case 'assembler':
      return { ...base, kind, recipe: null, inputs: {}, output: null, progress: 0 }
    case 'pass':
      return { ...base, kind, shelf: [], delivered: 0 }
    case 'bin':
      return { ...base, kind }
  }
}

export function createGame(defs: Defs, seed: string): GameState {
  const unlocked: DishId[] = Object.values(defs.dishes)
    .filter((d) => d.startsUnlocked)
    .map((d) => d.id)
  const fries = defs.dishes['fries']
  const state: GameState = {
    version: 1,
    seed,
    rng: createRng(seed),
    tick: 0,
    day: 1,
    dayTick: 0,
    phase: 'build',
    tier: START_TIER,
    expansion: 0,
    width: START_WIDTH,
    height: START_HEIGHT,
    tiles: new Array<number | null>(START_WIDTH * START_HEIGHT).fill(null),
    buildings: {},
    nextId: 1,
    nextItemId: 1,
    money: START_MONEY,
    unlocked,
    menu: fries === undefined ? [] : [{ dish: fries.id, price: fries.refPrice }],
    waiting: [],
    ratings: new Array<number>(INITIAL_RATING_COUNT).fill(INITIAL_RATING_VALUE),
    repAtDayStart: INITIAL_RATING_VALUE,
    today: emptyDayStats(1),
    lastDay: null,
    totals: { served: 0, profit: 0, days: 0 },
    goalsDone: [],
    events: [],
  }
  const defaults = { ingredient: START_INGREDIENT }
  const pass = newBuilding('pass', state.nextId++, PASS_POS.x, PASS_POS.y, PASS_DIR, 0, defaults)
  const pantry = newBuilding('pantry', state.nextId++, PANTRY_POS.x, PANTRY_POS.y, PANTRY_DIR, 0, defaults)
  for (const b of [pass, pantry]) {
    state.buildings[b.id] = b
    state.tiles[tileIndex(state, b.x, b.y)] = b.id
  }
  return state
}

export { runTicks } from './tick.ts'
