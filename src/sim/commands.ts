// applyCommand(state, defs, cmd) -> { state, result }.
// Commands are untrusted. The input state is never mutated: a valid command works on one
// structuredClone; a rejected command returns the ORIGINAL state object untouched and a
// `commandRejected` event inside the result (not in state.events, so the state hash is
// unchanged). Handled now: place, remove, rotate, configure, openService, dismissSummary. Money is integer cents:
// placing charges the cost, removing refunds 100% and counts the items inside as
// destroyed waste. A building placed during service warms up for WARMUP_TICKS (belts
// do not). setMenu, setPrice and unlockRecipe arrive in Step 14: until then they are rejected, with
// 'Menu is locked during service' during service. The other types are rejected for now.

import { START_INGREDIENT, WARMUP_TICKS } from './constants.ts'
import { emptyDayStats, newBuilding } from './game.ts'
import {
  buildingAt,
  canPlace,
  configReason,
  footprint,
  inBounds,
  placeCost,
  tileIndex,
} from './grid.ts'
import type { PlaceCommand } from './grid.ts'
import type {
  Building,
  Command,
  CommandResult,
  ConfigFields,
  Defs,
  Dir,
  GameState,
  RejectReason,
} from './types.ts'

export type ApplyOutcome = { state: GameState; result: CommandResult }

function reject(state: GameState, cmd: unknown, reason: RejectReason): ApplyOutcome {
  const command =
    typeof cmd === 'object' && cmd !== null && typeof (cmd as { type?: unknown }).type === 'string'
      ? (cmd as { type: string }).type
      : 'unknown'
  return {
    state,
    result: { ok: false, reason, event: { type: 'commandRejected', tick: state.tick, command, reason } },
  }
}

/** Number of items held inside a building (they are destroyed when it is removed). */
export function countItems(b: Building): number {
  switch (b.kind) {
    case 'belt':
      return b.slots.filter((s) => s !== null).length
    case 'splitter':
    case 'merger':
    case 'filter':
      return b.buf === null ? 0 : 1
    case 'chopper':
    case 'fryer':
    case 'stove':
      return b.input.length + (b.output === null ? 0 : 1)
    case 'assembler':
      return Object.values(b.inputs).reduce((n, list) => n + list.length, 0) + (b.output === null ? 0 : 1)
    case 'pass':
      return b.shelf.length
    case 'pantry':
    case 'bin':
      return 0
  }
}

function refundOf(defs: Defs, b: Building): number {
  const def = defs.buildings[b.kind]
  if (b.kind === 'belt' && b.fast && def.fast !== undefined) return def.fast.cost
  return def.cost
}

function clearTiles(state: GameState, b: Building): void {
  for (let i = 0; i < state.tiles.length; i += 1) {
    if (state.tiles[i] === b.id) state.tiles[i] = null
  }
}

function place(state: GameState, defs: Defs, cmd: PlaceCommand): ApplyOutcome {
  const why = canPlace(state, defs, cmd)
  if (why !== null) return reject(state, cmd, why)
  const next = structuredClone(state)
  const cost = placeCost(defs, cmd)
  const warm = next.phase === 'service' && cmd.kind !== 'belt'
  const b = newBuilding(
    cmd.kind,
    next.nextId,
    cmd.x,
    cmd.y,
    cmd.dir,
    warm ? next.tick + WARMUP_TICKS : next.tick,
    { ingredient: cmd.config?.ingredient ?? START_INGREDIENT },
  )
  next.nextId += 1
  if (warm) b.status = 'warming'
  applyConfig(b, cmd.config)
  next.buildings[b.id] = b
  for (const t of footprint(b.kind, b.x, b.y, b.dir)) next.tiles[tileIndex(next, t.x, t.y)] = b.id
  next.money -= cost
  next.events.push({ type: 'built', tick: next.tick, kind: b.kind, x: b.x, y: b.y, cost })
  return { state: next, result: { ok: true } }
}

/** Apply already-validated config fields to a (cloned) building. Returns destroyed item count. */
function applyConfig(b: Building, config: (ConfigFields & { fast?: boolean }) | undefined): number {
  if (config === undefined) return 0
  let destroyed = 0
  if (b.kind === 'belt' && config.fast === true) b.fast = true
  if (b.kind === 'pantry') {
    if (config.ingredient !== undefined) b.ingredient = config.ingredient
    if (config.interval !== undefined) b.interval = config.interval
  }
  if (b.kind === 'filter' && config.filterItem !== undefined) {
    destroyed += b.buf === null ? 0 : 1
    b.filterItem = config.filterItem
    b.buf = null
  }
  if (b.kind === 'assembler' && config.recipe !== undefined) {
    if (config.recipe !== b.recipe) {
      destroyed += countItems(b)
      b.inputs = {}
      b.output = null
      b.progress = 0
    }
    b.recipe = config.recipe
  }
  return destroyed
}

function remove(state: GameState, defs: Defs, x: number, y: number): ApplyOutcome {
  if (state.phase !== 'build' && state.phase !== 'service') return reject(state, { type: 'remove' }, 'wrong phase')
  if (!Number.isInteger(x) || !Number.isInteger(y)) return reject(state, { type: 'remove' }, 'invalid command')
  const id = buildingAt(state, x, y)
  const found = id === null ? undefined : state.buildings[id]
  if (found === undefined) return reject(state, { type: 'remove' }, 'nothing there')
  if (found.kind === 'pass') return reject(state, { type: 'remove' }, 'pass cannot be removed')
  const next = structuredClone(state)
  const b = next.buildings[found.id]
  const refund = refundOf(defs, b)
  const destroyed = countItems(b)
  clearTiles(next, b)
  delete next.buildings[b.id]
  next.money += refund
  next.today.wasteDestroyed += destroyed
  next.events.push({ type: 'removed', tick: next.tick, kind: b.kind, x: b.x, y: b.y, refund, destroyed })
  return { state: next, result: { ok: true } }
}

function rotate(state: GameState, x: number, y: number): ApplyOutcome {
  const cmd = { type: 'rotate' }
  if (state.phase !== 'build' && state.phase !== 'service') return reject(state, cmd, 'wrong phase')
  if (!Number.isInteger(x) || !Number.isInteger(y)) return reject(state, cmd, 'invalid command')
  const id = buildingAt(state, x, y)
  const found = id === null ? undefined : state.buildings[id]
  if (found === undefined) return reject(state, cmd, 'nothing there')
  const dir = ((found.dir + 1) % 4) as Dir
  const tiles = footprint(found.kind, found.x, found.y, dir)
  for (const t of tiles) {
    if (!inBounds(state, t.x, t.y)) return reject(state, cmd, 'out of bounds')
  }
  for (const t of tiles) {
    const occupant = state.tiles[tileIndex(state, t.x, t.y)]
    if (occupant !== null && occupant !== found.id) return reject(state, cmd, 'occupied')
  }
  const next = structuredClone(state)
  const b = next.buildings[found.id]
  clearTiles(next, b)
  b.dir = dir
  for (const t of tiles) next.tiles[tileIndex(next, t.x, t.y)] = b.id
  return { state: next, result: { ok: true } }
}

function configure(state: GameState, defs: Defs, cmd: Extract<Command, { type: 'configure' }>): ApplyOutcome {
  if (state.phase !== 'build' && state.phase !== 'service') return reject(state, cmd, 'wrong phase')
  if (!Number.isInteger(cmd.x) || !Number.isInteger(cmd.y)) return reject(state, cmd, 'invalid command')
  const id = buildingAt(state, cmd.x, cmd.y)
  const found = id === null ? undefined : state.buildings[id]
  if (found === undefined) return reject(state, cmd, 'nothing there')
  const config: ConfigFields = {
    ingredient: cmd.ingredient,
    interval: cmd.interval,
    filterItem: cmd.filterItem,
    recipe: cmd.recipe,
  }
  const clean = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined)) as ConfigFields
  if (Object.keys(clean).length === 0) return reject(state, cmd, 'invalid config')
  const why = configReason(found.kind, clean, state, defs)
  if (why !== null) return reject(state, cmd, why)
  const next = structuredClone(state)
  next.today.wasteDestroyed += applyConfig(next.buildings[found.id], clean)
  return { state: next, result: { ok: true } }
}

/** build -> service: the clock restarts at 0 and today's stats are fresh. */
function openService(state: GameState, cmd: Command): ApplyOutcome {
  if (state.phase !== 'build') return reject(state, cmd, 'wrong phase')
  const next = structuredClone(state)
  next.phase = 'service'
  next.dayTick = 0
  next.today = emptyDayStats(next.day)
  return { state: next, result: { ok: true } }
}

/** summary -> build: the next day starts (day + 1, clock back to 0). */
function dismissSummary(state: GameState, cmd: Command): ApplyOutcome {
  if (state.phase !== 'summary') return reject(state, cmd, 'wrong phase')
  const next = structuredClone(state)
  next.phase = 'build'
  next.day += 1
  next.dayTick = 0
  return { state: next, result: { ok: true } }
}

export function applyCommand(state: GameState, defs: Defs, cmd: Command): ApplyOutcome {
  if (typeof cmd !== 'object' || cmd === null) return reject(state, cmd, 'invalid command')
  switch (cmd.type) {
    case 'place':
      return place(state, defs, cmd)
    case 'remove':
      return remove(state, defs, cmd.x, cmd.y)
    case 'rotate':
      return rotate(state, cmd.x, cmd.y)
    case 'configure':
      return configure(state, defs, cmd)
    case 'setMenu':
    case 'setPrice':
    case 'unlockRecipe':
      // The menu is locked while service runs. The commands themselves arrive in Step 14.
      return reject(state, cmd, state.phase === 'service' ? 'Menu is locked during service' : 'not implemented')
    case 'openService':
      return openService(state, cmd)
    case 'dismissSummary':
      return dismissSummary(state, cmd)
    case 'buyExpansion':
    case 'upgradeTier':
      return reject(state, cmd, 'not implemented')
    default:
      return reject(state, cmd, 'invalid command')
  }
}
