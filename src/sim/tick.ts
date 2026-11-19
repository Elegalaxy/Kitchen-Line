// The tick loop (plan Step 3). `runTicks` clones the state once and steps the clone.
// Each tick: events are cleared, buildings update in `updateOrder` order, then
// `state.tick` advances. Rules:
//   - Belt: every 3 ticks (fast belt: 2) on the global tick, slot 1 pushes to the front
//     neighbour with tryInsert, then slot 0 moves to slot 1 if empty. An item moves at
//     most once per tick. `stalled` is true when slot 1 was full and could not push.
//   - Pantry: cooldown counts down; at 0 it emits if money >= cost and its front accepts,
//     charging the cost to today.ingredientCost and resetting the cooldown. Otherwise the
//     status is noCash or blocked and it retries next tick (the first emit is at tick 0).
//   - Chopper/fryer/stove (stations.ts): push a held output out the front, else count
//     progress up for the first input; the output pushes the tick it is made. Stations
//     update with the other non-belts, before the belts.
//   - Splitter/merger/filter (logistics.ts): push the one-item buffer out, non-belts first.
//   - Pass and bin accept items via transfer.ts. Buildings still warming up are skipped.
// Updates depend on belt chains only, never on coordinates, so every facing behaves alike.

import { BELT_STEP_TICKS, FAST_BELT_STEP_TICKS } from './constants.ts'
import { buildingAt, neighbor } from './grid.ts'
import { stepRouting } from './logistics.ts'
import { updateOrder } from './order.ts'
import { stepStation } from './stations.ts'
import { opposite, tryInsert } from './transfer.ts'
import type { Building, Defs, GameState } from './types.ts'

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
  if (b.cooldown > 0) b.cooldown -= 1
  if (b.cooldown > 0) {
    b.status = 'ok'
    return
  }
  const cost = defs.items[b.ingredient]?.cost
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
  state.tick += 1
}

/** Run `n` ticks on a clone of `state`. The input is never mutated. */
export function runTicks(state: GameState, defs: Defs, n: number): GameState {
  const draft = structuredClone(state)
  if (!Number.isInteger(n) || n < 0) return draft
  for (let i = 0; i < n; i += 1) stepTick(draft, defs)
  return draft
}
