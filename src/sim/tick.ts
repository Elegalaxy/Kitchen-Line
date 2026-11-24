// The tick loop (plan Step 3). `runTicks` clones the state once and steps the clone.
// Each tick, in this order: (1) events are cleared, (2) spoiled items are removed (spoil.ts),
// (3) buildings update in `updateOrder` order (dishes land on the pass shelf), (4) customers
// (customers.ts): patience, arrival with its RNG draws, shelf matching, (5) `state.tick`
// and `dayTick` advance and the day may end. Goals are checked after the customers (goals.ts). Rules:
//   - Belt: every 3 ticks (fast belt: 2) on the global tick, slot 1 pushes to the front
//     neighbour with tryInsert, then slot 0 moves to slot 1 if empty. An item moves at
//     most once per tick. `stalled` is true when slot 1 was full and could not push.
//   - Pantry: cooldown counts down; at 0 it emits if money >= cost and its front accepts,
//     charging the cost (the season's price at the restaurant tier, season.ts) to today.ingredientCost and resetting the cooldown. Otherwise the
//     status is noCash or blocked and it retries next tick (the first emit is at tick 0).
//     A pantry paused by the player skips all of that: status `paused`, cooldown frozen.
//   - Chopper/fryer/stove (stations.ts): push a held output out the front, else count
//     progress up for the first input; the output pushes the tick it is made. Stations
//     update with the other non-belts, before the belts.
//   - Assembler (stations.ts): same pattern with a recipe; 30 ticks once every input is held.
//   - Splitter/merger/filter (logistics.ts): push the one-item buffer out, non-belts first.
//   - Pass and bin accept items via transfer.ts. Buildings still warming up are skipped.
// Time only passes in the `service` phase (day.ts): `runTicks` does nothing otherwise and
// stops the tick the day ends. Updates depend on belt chains only, never on coordinates, so every facing behaves alike.

import { BELT_STEP_TICKS, FAST_BELT_STEP_TICKS } from './constants.ts'
import { stepCustomers } from './customers.ts'
import { advanceDayClock } from './day.ts'
import { updateGoals } from './goals.ts'
import { buildingAt, neighbor } from './grid.ts'
import { stepRouting } from './logistics.ts'
import { updateOrder } from './order.ts'
import { itemCost } from './season.ts'
import { stepSpoilage } from './spoil.ts'
import { stepAssembler, stepStation } from './stations.ts'
import { opposite, tryInsert } from './transfer.ts'
import type { Building, Defs, GameState, SimEvent } from './types.ts'

type BeltBuilding = Extract<Building, { kind: 'belt' }>
type PantryBuilding = Extract<Building, { kind: 'pantry' }>

function stepBelt(state: GameState, defs: Defs, b: BeltBuilding, moved: Set<number>): void {
  const period = b.fast ? FAST_BELT_STEP_TICKS : BELT_STEP_TICKS
  if (state.tick % period === 0) {
    const front = b.slots[1]
    let stalled = false
    if (front !== null) {
      const n = neighbor(b.x, b.y, b.dir)
      const targetId = buildingAt(state, n.x, n.y)
      const target = targetId === null ? undefined : state.buildings[targetId]
      if (target !== undefined && !moved.has(front.id) && tryInsert(state, defs, target, front, opposite(b.dir))) {
        b.slots[1] = null
        moved.add(front.id)
      } else {
        stalled = true
      }
    }
    const back = b.slots[0]
    if (back !== null && b.slots[1] === null && !moved.has(back.id)) {
      b.slots[1] = back
      b.slots[0] = null
      moved.add(back.id)
    }
    b.stalled = stalled
  }
  if (b.stalled) b.status = 'blocked'
  else b.status = b.slots[0] !== null || b.slots[1] !== null ? 'ok' : 'idle'
}

function stepPantry(state: GameState, defs: Defs, b: PantryBuilding, moved: Set<number>): void {
  // Paused by the player: no emit, no charge, and the cooldown stays frozen.
  if (b.paused === true) {
    b.status = 'paused'
    return
  }
  if (b.cooldown > 0) b.cooldown -= 1
  if (b.cooldown > 0) {
    b.status = 'ok'
    return
  }
  // Seasonal price at the restaurant tier (season.ts); the base cost at the stall or without season defs.
  const cost = itemCost(state, defs, b.ingredient)
  if (cost === undefined) {
    b.status = 'blocked'
    return
  }
  if (state.money < cost) {
    b.status = 'noCash'
    return
  }
  const n = neighbor(b.x, b.y, b.dir)
  const targetId = buildingAt(state, n.x, n.y)
  const target = targetId === null ? undefined : state.buildings[targetId]
  const item = { id: state.nextItemId, type: b.ingredient, bornTick: state.tick }
  if (target === undefined || !tryInsert(state, defs, target, item, opposite(b.dir))) {
    b.status = 'blocked'
    return
  }
  state.nextItemId += 1
  moved.add(item.id)
  state.money -= cost
  state.today.ingredientCost += cost
  b.cooldown = b.interval
  b.status = 'ok'
  state.events.push({ type: 'emit', tick: state.tick, x: b.x, y: b.y, item: item.type, cost })
}

/** Advance the (already cloned) state by one tick. Mutates `state`. */
export function stepTick(state: GameState, defs: Defs): void {
  state.events = []
  stepSpoilage(state, defs)
  const moved = new Set<number>()
  for (const id of updateOrder(state)) {
    const b = state.buildings[id]
    if (b === undefined) continue
    if (b.onlineAt > state.tick) {
      b.status = 'warming'
      continue
    }
    if (b.status === 'warming') b.status = 'idle'
    switch (b.kind) {
      case 'belt':
        stepBelt(state, defs, b, moved)
        break
      case 'pantry':
        stepPantry(state, defs, b, moved)
        break
      case 'chopper':
      case 'fryer':
      case 'stove':
        stepStation(state, defs, b, moved)
        break
      case 'assembler':
        stepAssembler(state, defs, b, moved)
        break
      case 'splitter':
      case 'merger':
      case 'filter':
        stepRouting(state, defs, b, moved)
        break
      case 'pass':
      case 'bin':
        // Reset first; tryInsert sets 'ok' when a belt pushes an item in this tick.
        b.status = 'idle'
        break
      default:
        break
    }
  }
  // Customers last: patience, arrival (RNG), then shelf matching; see customers.ts.
  stepCustomers(state, defs)
  updateGoals(state, defs)
  state.tick += 1
  advanceDayClock(state, defs)
}

/**
 * Run up to `n` ticks of service on a clone of `state` (none outside the service phase). The input is never mutated. `onTickEvents`, if
 * given, is called after every tick with that tick's events (`state.events` only keeps
 * the last tick's), so a caller running a batch can still see every event.
 */
export function runTicks(state: GameState, defs: Defs, n: number, onTickEvents?: (events: SimEvent[]) => void): GameState {
  const draft = structuredClone(state)
  if (!Number.isInteger(n) || n < 0) return draft
  // Time only passes during service; the loop stops when the day ends (phase -> summary).
  for (let i = 0; i < n && draft.phase === 'service'; i += 1) {
    stepTick(draft, defs)
    if (onTickEvents !== undefined && draft.events.length > 0) onTickEvents(draft.events)
  }
  return draft
}
