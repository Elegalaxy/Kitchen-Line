// applyCommand(state, defs, cmd) -> { state, result }.
// Commands are untrusted. The input state is never mutated: a valid command works on one
// structuredClone; a rejected command returns the ORIGINAL state object untouched and a
// `commandRejected` event inside the result (not in state.events, so the state hash is
// unchanged). Handled now: place, remove, rotate, configure (only `paused` works in any phase), setPantriesPaused (any phase), setMenu, setPrice, unlockRecipe,
// openService, dismissSummary, tutorialHelp. Money is integer cents:
// placing charges the cost, removing refunds 100% and counts the items inside as
// destroyed waste. A building placed during service warms up for WARMUP_TICKS (belts
// do not). setMenu, setPrice and unlockRecipe work in the build phase only ('Menu is locked
// during service' during service, 'wrong phase' in summary / won). upgradeTier, buyExpansion
// (Step 16), buyUpgrade (restaurant upgrades), openBranch, refitBranch and closeBranch (chain stage, branches.ts) are build phase only too; dismissSummary also leaves the `won` end screen
// ("Keep playing"). After every accepted command the goals are re-checked (goals.ts).

import { MENU_CAP, START_INGREDIENT, TIER_RANK, TUTORIAL_HELP_CAP, UPGRADE_COST, WARMUP_TICKS } from './constants.ts'
import { reputationOf } from './customers.ts'
import { emptyDayStats, newBuilding } from './game.ts'
import { expansionProblem, nextExpansion, updateGoals, upgradeProblem } from './goals.ts'
import {
  buildingAt,
  canPlace,
  configReason,
  countKind,
  footprint,
  inBounds,
  placeCost,
  tileIndex,
} from './grid.ts'
import type { PlaceCommand } from './grid.ts'
import { blueprintOf } from './blueprint.ts'
import {
  branchById,
  closeProblem,
  closeRefund,
  nextArea,
  nextBranchId,
  openBranchCost,
  openBranchProblem,
  profitable,
  refitCost,
  refitProblem,
  testBranch,
} from './branches.ts'
import { refundOf } from './economy.ts'
import { priceProblem } from './menu.ts'
import { buyUpgradeProblem } from './upgrades.ts'
import type {
  Building,
  Command,
  CommandResult,
  ConfigFields,
  PlaceConfig,
  Defs,
  Dir,
  GameState,
  RejectReason,
} from './types.ts'

export { refundOf } from './economy.ts'

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

/** Why `b` cannot be sold right now (only the last pass), or null. The UI reuses this rule. */
export function removeBlocked(state: GameState, b: Building): RejectReason | null {
  return b.kind === 'pass' && countKind(state, 'pass') <= 1 ? 'pass cannot be removed' : null
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

/**
 * Pause or resume a pantry. The status follows at once (time may be frozen in the build phase,
 * so the next tick cannot be relied on to refresh it); the flag is only present while paused.
 */
function setPaused(b: Building, paused: boolean): void {
  if (b.kind !== 'pantry') return
  if (paused) {
    b.paused = true
    if (b.status !== 'warming') b.status = 'paused'
  } else {
    delete b.paused
    if (b.status === 'paused') b.status = 'idle'
  }
}

/** Apply already-validated config fields to a (cloned) building. Returns destroyed item count. */
function applyConfig(b: Building, config: PlaceConfig | undefined): number {
  if (config === undefined) return 0
  let destroyed = 0
  if (b.kind === 'belt' && config.fast === true) b.fast = true
  if ((b.kind === 'fryer' || b.kind === 'stove' || b.kind === 'assembler') && config.pro === true) b.pro = true
  if (b.kind === 'pantry') {
    if (config.ingredient !== undefined) b.ingredient = config.ingredient
    if (config.interval !== undefined) b.interval = config.interval
    if (config.paused !== undefined) setPaused(b, config.paused)
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
  const blocked = removeBlocked(state, found)
  if (blocked !== null) return reject(state, { type: 'remove' }, blocked)
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
  // Pausing a pantry works in every phase; every other setting is build / service only.
  const onlyPause =
    cmd.paused !== undefined &&
    cmd.ingredient === undefined &&
    cmd.interval === undefined &&
    cmd.filterItem === undefined &&
    cmd.recipe === undefined
  if (!onlyPause && state.phase !== 'build' && state.phase !== 'service') return reject(state, cmd, 'wrong phase')
  if (!Number.isInteger(cmd.x) || !Number.isInteger(cmd.y)) return reject(state, cmd, 'invalid command')
  const id = buildingAt(state, cmd.x, cmd.y)
  const found = id === null ? undefined : state.buildings[id]
  if (found === undefined) return reject(state, cmd, 'nothing there')
  const config: ConfigFields = {
    ingredient: cmd.ingredient,
    interval: cmd.interval,
    filterItem: cmd.filterItem,
    recipe: cmd.recipe,
    paused: cmd.paused,
  }
  const clean = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined)) as ConfigFields
  if (Object.keys(clean).length === 0) return reject(state, cmd, 'invalid config')
  const why = configReason(found.kind, clean, state, defs)
  if (why !== null) return reject(state, cmd, why)
  const next = structuredClone(state)
  next.today.wasteDestroyed += applyConfig(next.buildings[found.id], clean)
  return { state: next, result: { ok: true } }
}

/**
 * Pause or resume every pantry (any phase). Rejected with 'invalid command' for a non-boolean
 * and 'nothing there' when there is no pantry. Pantries already in the wanted state are untouched.
 */
function setPantriesPaused(state: GameState, cmd: Extract<Command, { type: 'setPantriesPaused' }>): ApplyOutcome {
  if (typeof cmd.paused !== 'boolean') return reject(state, cmd, 'invalid command')
  if (!Object.values(state.buildings).some((b) => b.kind === 'pantry')) return reject(state, cmd, 'nothing there')
  const next = structuredClone(state)
  for (const b of Object.values(next.buildings)) {
    setPaused(b, cmd.paused)
  }
  return { state: next, result: { ok: true } }
}

/** Menu commands only work between days: service says so, every other non-build phase is 'wrong phase'. */
function menuPhaseProblem(state: GameState): RejectReason | null {
  if (state.phase === 'build') return null
  return state.phase === 'service' ? 'Menu is locked during service' : 'wrong phase'
}

/**
 * Set the menu to exactly `dishes` (in that order). Dishes already on the menu keep their
 * price; new ones start at the reference price. Every dish must exist and be unlocked, the
 * list must have no duplicates and fit the tier's menu cap. An empty menu is allowed.
 */
function setMenu(state: GameState, defs: Defs, cmd: Extract<Command, { type: 'setMenu' }>): ApplyOutcome {
  const phaseWhy = menuPhaseProblem(state)
  if (phaseWhy !== null) return reject(state, cmd, phaseWhy)
  const list: unknown = cmd.dishes
  if (!Array.isArray(list) || new Set(list).size !== list.length) return reject(state, cmd, 'invalid command')
  const dishes: string[] = []
  for (const d of list) {
    if (typeof d !== 'string' || defs.dishes[d] === undefined) return reject(state, cmd, 'invalid command')
    dishes.push(d)
  }
  if (dishes.some((d) => !state.unlocked.includes(d))) return reject(state, cmd, 'locked recipe')
  if (dishes.length > MENU_CAP[state.tier]) return reject(state, cmd, 'menu full')
  const next = structuredClone(state)
  next.menu = dishes.map((dish) => ({
    dish,
    price: state.menu.find((m) => m.dish === dish)?.price ?? defs.dishes[dish].refPrice,
  }))
  return { state: next, result: { ok: true } }
}

/** Change the price of a dish on the menu (whole cents, 10-cent steps, 50% to 300% of the reference). */
function setPrice(state: GameState, defs: Defs, cmd: Extract<Command, { type: 'setPrice' }>): ApplyOutcome {
  const phaseWhy = menuPhaseProblem(state)
  if (phaseWhy !== null) return reject(state, cmd, phaseWhy)
  const def = typeof cmd.dish === 'string' ? defs.dishes[cmd.dish] : undefined
  if (def === undefined) return reject(state, cmd, 'invalid command')
  const index = state.menu.findIndex((m) => m.dish === cmd.dish)
  if (index < 0) return reject(state, cmd, 'not on menu')
  const why = priceProblem(def.refPrice, cmd.cents)
  if (why !== null) return reject(state, cmd, why)
  const next = structuredClone(state)
  next.menu[index].price = cmd.cents
  return { state: next, result: { ok: true } }
}

/** Pay the dish's unlock cost; it can then go on the menu and be set on an assembler. */
function unlockRecipe(state: GameState, defs: Defs, cmd: Extract<Command, { type: 'unlockRecipe' }>): ApplyOutcome {
  const phaseWhy = menuPhaseProblem(state)
  if (phaseWhy !== null) return reject(state, cmd, phaseWhy)
  const def = typeof cmd.dish === 'string' ? defs.dishes[cmd.dish] : undefined
  if (def === undefined) return reject(state, cmd, 'invalid command')
  if (state.unlocked.includes(cmd.dish)) return reject(state, cmd, 'already unlocked')
  if (def.requiresTier !== undefined && TIER_RANK[def.requiresTier] > TIER_RANK[state.tier]) return reject(state, cmd, 'locked by tier')
  if (state.money < def.unlockCost) return reject(state, cmd, 'cannot afford')
  const next = structuredClone(state)
  next.money -= def.unlockCost
  next.unlocked.push(cmd.dish)
  return { state: next, result: { ok: true } }
}

/** build -> service: the clock restarts at 0 and today's stats are fresh. */
function openService(state: GameState, cmd: Command): ApplyOutcome {
  if (state.phase !== 'build') return reject(state, cmd, 'wrong phase')
  const next = structuredClone(state)
  next.phase = 'service'
  next.dayTick = 0
  next.today = emptyDayStats(next.day)
  next.repAtDayStart = reputationOf(next)
  return { state: next, result: { ok: true } }
}

/**
 * Pay $250 once every stall goal is done: stall -> restaurant. The menu cap, the waiting
 * capacity, the arrival factor and fast belts all read `state.tier`, so nothing else changes.
 */
function upgradeTier(state: GameState, defs: Defs, cmd: Command): ApplyOutcome {
  const why = upgradeProblem(state, defs)
  if (why !== null) return reject(state, cmd, why)
  const next = structuredClone(state)
  // The stall kitchen, saved for the franchise starter kitchen perk (GAME_DESIGN 8.2); taken before the tier changes.
  next.stallKit = blueprintOf(state, defs)
  next.money -= UPGRADE_COST
  next.tier = 'restaurant'
  next.tierProfitStart = next.totals.profit
  next.tierDay = next.day
  next.events.push({ type: 'tierUpgraded', tick: next.tick, cost: UPGRADE_COST })
  return { state: next, result: { ok: true } }
}

/** Pay for one restaurant upgrade (GAME_DESIGN 6.4): build phase, restaurant tier, once each. */
function buyUpgrade(state: GameState, defs: Defs, cmd: Extract<Command, { type: 'buyUpgrade' }>): ApplyOutcome {
  const why = buyUpgradeProblem(state, defs, cmd.id)
  const def = defs.upgrades?.find((u) => u.id === cmd.id)
  if (why !== null || def === undefined) return reject(state, cmd, why ?? 'invalid command')
  const next = structuredClone(state)
  next.money -= def.cost
  next.upgrades = [...(next.upgrades ?? []), def.id]
  next.events.push({ type: 'upgradeBought', tick: next.tick, id: def.id, cost: def.cost })
  return { state: next, result: { ok: true } }
}

/**
 * Open the next branch (GAME_DESIGN 8.1): pay the blueprint's value plus the fee, run the test day at the fixed
 * next site and store it as the branch's expectation. Refused when the test day would not make money.
 */
function openBranch(state: GameState, defs: Defs, cmd: Command): ApplyOutcome {
  const why = openBranchProblem(state, defs)
  const area = nextArea(state, defs)
  if (why !== null || area === null) return reject(state, cmd, why ?? 'branch limit')
  const blueprint = blueprintOf(state, defs)
  const id = nextBranchId(state)
  const expected = testBranch(state, defs, blueprint, area, id)
  if (!profitable(expected, area)) return reject(state, cmd, 'branch would lose money')
  const cost = openBranchCost(state, defs)
  const next = structuredClone(state)
  next.money -= cost
  next.branches = [...(next.branches ?? []), { id, areaId: area.id, openedDay: next.day, blueprintDay: next.day, refits: 0, blueprint, expected }]
  next.events.push({ type: 'branchOpened', tick: next.tick, id, areaId: area.id, cost })
  return { state: next, result: { ok: true } }
}

/** Copy the current flagship kitchen to branch `id` again: new blueprint, new test day, same site. */
function refitBranch(state: GameState, defs: Defs, cmd: Extract<Command, { type: 'refitBranch' }>): ApplyOutcome {
  const why = refitProblem(state, defs, cmd.id)
  const branch = branchById(state, cmd.id)
  const area = branch === undefined ? undefined : defs.branchAreas?.find((a) => a.id === branch.areaId)
  if (why !== null || branch === undefined || area === undefined) return reject(state, cmd, why ?? 'invalid command')
  const blueprint = blueprintOf(state, defs)
  const expected = testBranch(state, defs, blueprint, area, branch.id)
  if (!profitable(expected, area)) return reject(state, cmd, 'branch would lose money')
  const cost = refitCost(state, defs, branch)
  const next = structuredClone(state)
  next.money -= cost
  const target = branchById(next, branch.id)
  if (target === undefined) return reject(state, cmd, 'no such branch')
  target.blueprint = blueprint
  target.expected = expected
  target.blueprintDay = next.day
  target.refits += 1
  next.events.push({ type: 'branchRefit', tick: next.tick, id: branch.id, cost })
  return { state: next, result: { ok: true } }
}

/**
 * Close branch `id` (GAME_DESIGN 8.1): part of its kitchen value comes back (the opening fee is lost). Like
 * selling a building the refund only raises the money: it is no day's profit and `chainProfit` is unchanged.
 * Closing the last branch removes `branches` (absent, as before the first opening). Done goals stay done.
 */
function closeBranch(state: GameState, cmd: Extract<Command, { type: 'closeBranch' }>): ApplyOutcome {
  const why = closeProblem(state, cmd.id)
  const branch = branchById(state, cmd.id)
  if (why !== null || branch === undefined) return reject(state, cmd, why ?? 'no such branch')
  const refund = closeRefund(branch)
  const next = structuredClone(state)
  const left = (next.branches ?? []).filter((b) => b.id !== branch.id)
  if (left.length === 0) delete next.branches
  else next.branches = left
  next.money += refund
  next.events.push({ type: 'branchClosed', tick: next.tick, id: branch.id, areaId: branch.areaId, refund })
  return { state: next, result: { ok: true } }
}

/**
 * Buy the next grid size (`defs.expansions[state.expansion]`). Buildings and the items inside
 * them stay at their coordinates; only the tile index is rebuilt for the new width.
 */
function buyExpansion(state: GameState, defs: Defs, cmd: Command): ApplyOutcome {
  const why = expansionProblem(state, defs)
  const step = nextExpansion(state, defs)
  if (why !== null || step === null) return reject(state, cmd, why ?? 'no more expansions')
  const next = structuredClone(state)
  const tiles = new Array<number | null>(step.width * step.height).fill(null)
  for (let i = 0; i < state.tiles.length; i += 1) {
    const id = state.tiles[i]
    if (id === null) continue
    tiles[Math.floor(i / state.width) * step.width + (i % state.width)] = id
  }
  next.tiles = tiles
  next.width = step.width
  next.height = step.height
  next.expansion += 1
  next.money -= step.cost
  next.events.push({ type: 'expanded', tick: next.tick, width: step.width, height: step.height, cost: step.cost })
  return { state: next, result: { ok: true } }
}

/**
 * Add `cents` so the player can afford the suggested salad line. Build or service only.
 * The UI asks once, for the shortfall; anything above TUTORIAL_HELP_CAP is refused.
 */
function tutorialHelp(state: GameState, cmd: Extract<Command, { type: 'tutorialHelp' }>): ApplyOutcome {
  if (state.phase !== 'build' && state.phase !== 'service') return reject(state, cmd, 'wrong phase')
  if (!Number.isInteger(cmd.cents) || cmd.cents < 1 || cmd.cents > TUTORIAL_HELP_CAP) return reject(state, cmd, 'invalid command')
  const next = structuredClone(state)
  next.money += cmd.cents
  next.events.push({ type: 'tutorialHelp', tick: next.tick, cents: cmd.cents })
  return { state: next, result: { ok: true } }
}

/** summary or won -> build: the next day starts (day + 1, clock back to 0). */
function dismissSummary(state: GameState, cmd: Command): ApplyOutcome {
  if (state.phase !== 'summary' && state.phase !== 'won') return reject(state, cmd, 'wrong phase')
  const next = structuredClone(state)
  next.phase = 'build'
  next.day += 1
  next.dayTick = 0
  return { state: next, result: { ok: true } }
}

function dispatchCommand(state: GameState, defs: Defs, cmd: Command): ApplyOutcome {
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
    case 'setPantriesPaused':
      return setPantriesPaused(state, cmd)
    case 'setMenu':
      return setMenu(state, defs, cmd)
    case 'setPrice':
      return setPrice(state, defs, cmd)
    case 'unlockRecipe':
      return unlockRecipe(state, defs, cmd)
    case 'openService':
      return openService(state, cmd)
    case 'dismissSummary':
      return dismissSummary(state, cmd)
    case 'buyExpansion':
      return buyExpansion(state, defs, cmd)
    case 'upgradeTier':
      return upgradeTier(state, defs, cmd)
    case 'buyUpgrade':
      return buyUpgrade(state, defs, cmd)
    case 'tutorialHelp':
      return tutorialHelp(state, cmd)
    case 'openBranch':
      return openBranch(state, defs, cmd)
    case 'refitBranch':
      return refitBranch(state, defs, cmd)
    case 'closeBranch':
      return closeBranch(state, cmd)
    default:
      return reject(state, cmd, 'invalid command')
  }
}

/** Apply a command. A command that goes through also re-checks the goals (e.g. 5 dishes on the menu). */
export function applyCommand(state: GameState, defs: Defs, cmd: Command): ApplyOutcome {
  const out = dispatchCommand(state, defs, cmd)
  if (out.result.ok) updateGoals(out.state, defs)
  return out
}
