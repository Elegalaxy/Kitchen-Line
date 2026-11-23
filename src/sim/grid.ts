// Grid geometry and placement rules.
// Tiles are indexed row-major (y * width + x). Dir is N E S W = 0 1 2 3 and y grows
// downward, so N is (0, -1). A building's "front" is its dir. The assembler is 2 x 1:
// its anchor tile plus the tile to the anchor's right (dir + 1), so rotating moves the
// second tile. canPlace returns the first reason a place command is invalid, or null.

import { PANTRY_INTERVALS, PASS_MAX } from './constants.ts'
import type {
  BuildingKind,
  Command,
  PlaceConfig,
  Defs,
  Dir,
  GameState,
  RejectReason,
} from './types.ts'

const DX = [0, 1, 0, -1] as const
const DY = [-1, 0, 1, 0] as const

export type Point = { x: number; y: number }
export type PlaceCommand = Extract<Command, { type: 'place' }>

export function isDir(value: unknown): value is Dir {
  return value === 0 || value === 1 || value === 2 || value === 3
}

export function tileIndex(state: Pick<GameState, 'width'>, x: number, y: number): number {
  return y * state.width + x
}

export function inBounds(state: Pick<GameState, 'width' | 'height'>, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < state.width && y < state.height
}

export function neighbor(x: number, y: number, dir: Dir): Point {
  return { x: x + DX[dir], y: y + DY[dir] }
}

/** Tiles a building of `kind` covers when anchored at (x, y) facing `dir`. Anchor first. */
export function footprint(kind: BuildingKind, x: number, y: number, dir: Dir): Point[] {
  if (kind === 'assembler') {
    const right = ((dir + 1) % 4) as Dir
    return [{ x, y }, neighbor(x, y, right)]
  }
  return [{ x, y }]
}

/** How many buildings of `kind` exist. */
export function countKind(state: Pick<GameState, 'buildings'>, kind: BuildingKind): number {
  return Object.values(state.buildings).filter((b) => b.kind === kind).length
}

/** Id of the building covering (x, y), or null (also null when out of bounds). */
export function buildingAt(state: GameState, x: number, y: number): number | null {
  if (!inBounds(state, x, y)) return null
  return state.tiles[tileIndex(state, x, y)] ?? null
}

/**
 * Validate optional config fields for a building kind. Returns a reason or null.
 * `locked recipe` is for a dish the player has not unlocked yet.
 */
export function configReason(
  kind: BuildingKind,
  config: PlaceConfig | undefined,
  state: GameState,
  defs: Defs,
): RejectReason | null {
  if (config === undefined) return null
  if (typeof config !== 'object' || config === null) return 'invalid config'
  const { ingredient, interval, filterItem, recipe, fast, paused, pro } = config
  if (fast !== undefined && (typeof fast !== 'boolean' || kind !== 'belt')) return 'invalid config'
  if (pro !== undefined && (typeof pro !== 'boolean' || !PRO_KINDS.includes(kind))) return 'invalid config'
  if (ingredient !== undefined) {
    if (kind !== 'pantry') return 'invalid config'
    const def = typeof ingredient === 'string' ? defs.items[ingredient] : undefined
    if (def === undefined || def.kind !== 'raw' || def.cost === undefined) return 'invalid config'
  }
  if (paused !== undefined && (typeof paused !== 'boolean' || kind !== 'pantry')) return 'invalid config'
  if (interval !== undefined) {
    if (kind !== 'pantry' || !PANTRY_INTERVALS.includes(interval)) return 'invalid config'
  }
  if (filterItem !== undefined) {
    if (kind !== 'filter') return 'invalid config'
    if (filterItem !== null && (typeof filterItem !== 'string' || defs.items[filterItem] === undefined)) {
      return 'invalid config'
    }
  }
  if (recipe !== undefined) {
    if (kind !== 'assembler') return 'invalid config'
    if (recipe !== null) {
      const dish = typeof recipe === 'string' ? defs.dishes[recipe] : undefined
      if (dish === undefined || dish.inputs === undefined) return 'invalid config'
      if (!state.unlocked.includes(recipe)) return 'locked recipe'
    }
  }
  return null
}

/** Building kinds that have a pro variant (GAME_DESIGN 5.3). */
export const PRO_KINDS: readonly BuildingKind[] = ['fryer', 'stove', 'assembler']

/** Cost in cents of placing this command (fast belts and pro stations cost more). */
export function placeCost(defs: Defs, cmd: PlaceCommand): number {
  const def = defs.buildings[cmd.kind]
  if (cmd.kind === 'belt' && cmd.config?.fast === true && def.fast !== undefined) return def.fast.cost
  if (cmd.config?.pro === true && def.pro !== undefined) return def.pro.cost
  return def.cost
}

/** Why `cmd` cannot be placed right now, or null if it can. */
export function canPlace(state: GameState, defs: Defs, cmd: PlaceCommand): RejectReason | null {
  if (state.phase !== 'build' && state.phase !== 'service') return 'wrong phase'
  const def = typeof cmd.kind === 'string' ? defs.buildings[cmd.kind] : undefined
  if (def === undefined || !isDir(cmd.dir)) return 'invalid command'
  if (!Number.isInteger(cmd.x) || !Number.isInteger(cmd.y)) return 'invalid command'
  if (!def.placeable) return 'pass cannot be placed'
  const cfg = configReason(cmd.kind, cmd.config, state, defs)
  if (cfg !== null) return cfg
  const fast = cmd.kind === 'belt' && cmd.config?.fast === true
  if (fast && def.fast === undefined) return 'invalid config'
  const pro = cmd.config?.pro === true
  if (pro && def.pro === undefined) return 'invalid config'
  const tier =
    fast && def.fast !== undefined ? def.fast.requiresTier : pro && def.pro !== undefined ? def.pro.requiresTier : def.requiresTier
  if (tier === 'restaurant' && state.tier !== 'restaurant') return 'locked by tier'
  if (cmd.kind === 'pass' && countKind(state, 'pass') >= PASS_MAX) return 'pass limit'
  const tiles = footprint(cmd.kind, cmd.x, cmd.y, cmd.dir)
  for (const t of tiles) {
    if (!inBounds(state, t.x, t.y)) return 'out of bounds'
  }
  for (const t of tiles) {
    if (state.tiles[tileIndex(state, t.x, t.y)] !== null) return 'occupied'
  }
  if (state.money < placeCost(defs, cmd)) return 'cannot afford'
  return null
}
