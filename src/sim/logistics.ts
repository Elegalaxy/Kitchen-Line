// Routing buildings: splitter, merger, filter (plan Step 7). Each holds one item in `buf`.
// "left" and "right" are relative to the building's facing: left = dir + 3, right = dir + 1.
//   - Splitter: takes items from its back only. It pushes the held item to its left or
//     right neighbour, alternating (`rr`: 0 = left next, 1 = right next). If the preferred
//     side refuses, the other side is tried; after a push `rr` points at the side not used.
//   - Merger: takes items from its left, right and back (never the front) and pushes to
//     the front. `rr` indexes MERGER_SIDES and names the side that is served first; after
//     taking from side i, `rr` becomes i + 1. A side is only refused while a side that is
//     ahead of it in that order has an item waiting, so no input starves.
//   - Filter: takes items from its back only. An item equal to `filterItem` goes left,
//     everything else goes front; with no filter set everything goes front. A held item
//     waits for its own exit (no fallback), so a blocked exit blocks the filter.
// Status: `idle` (empty), `ok` (holding or moving), `blocked` (held item cannot leave).
// Acceptance lives in `acceptRouting`, called from transfer.ts. Held items move at most
// once per tick (the `moved` set). Tick order: non-belts first, so an item taken during a
// tick leaves on a later tick.

import { buildingAt, neighbor } from './grid.ts'
import { opposite, tryInsert } from './transfer.ts'
import type { Building, Defs, Dir, GameState, Item } from './types.ts'

type RoutingBuilding = Extract<Building, { kind: 'splitter' | 'merger' | 'filter' }>
type MergerBuilding = Extract<Building, { kind: 'merger' }>

/** Direction to the left of a building facing `dir`. */
export function leftOf(dir: Dir): Dir {
  return ((dir + 3) % 4) as Dir
}
/** Direction to the right of a building facing `dir`. */
export function rightOf(dir: Dir): Dir {
  return ((dir + 1) % 4) as Dir
}

/** Merger input sides in round-robin order, as directions from the merger. */
function mergerSides(b: MergerBuilding): Dir[] {
  return [leftOf(b.dir), rightOf(b.dir), opposite(b.dir)]
}

function targetAt(state: GameState, b: RoutingBuilding, dir: Dir): Building | undefined {
  const n = neighbor(b.x, b.y, dir)
  const id = buildingAt(state, n.x, n.y)
  return id === null ? undefined : state.buildings[id]
}

/** True when the building on `side` of the merger faces it and holds an item ready to push. */
function senderWaiting(state: GameState, b: MergerBuilding, side: Dir): boolean {
  const s = targetAt(state, b, side)
  if (s === undefined || s.onlineAt > state.tick || s.dir !== opposite(side)) return false
  switch (s.kind) {
    case 'belt':
      return s.slots[1] !== null
    case 'splitter':
    case 'merger':
    case 'filter':
      return s.buf !== null
    case 'chopper':
    case 'fryer':
    case 'stove':
      return s.output !== null
    case 'pantry':
      return s.cooldown <= 1
    default:
      return false
  }
}

/** Does the routing building take `item` arriving from `fromDir` (direction toward the sender)? */
export function acceptRouting(state: GameState, b: RoutingBuilding, item: Item, fromDir: Dir): boolean {
  if (b.buf !== null) return false
  if (b.kind !== 'merger') {
    if (fromDir !== opposite(b.dir)) return false
  } else {
    const sides = mergerSides(b)
    const idx = sides.indexOf(fromDir)
    if (idx < 0) return false
    for (let k = 0; k < sides.length; k += 1) {
      const i = (b.rr + k) % sides.length
      const side = sides[i]
      if (side === undefined) continue
      if (i === idx) break
      if (senderWaiting(state, b, side)) return false
    }
    b.rr = (idx + 1) % sides.length
  }
  b.buf = item
  b.status = 'ok'
  return true
}

function pushTo(state: GameState, defs: Defs, b: RoutingBuilding, item: Item, dir: Dir): boolean {
  const target = targetAt(state, b, dir)
  return target !== undefined && tryInsert(state, defs, target, item, opposite(dir))
}

export function stepRouting(state: GameState, defs: Defs, b: RoutingBuilding, moved: Set<number>): void {
  const item = b.buf
  if (item === null) {
    b.status = 'idle'
    return
  }
  if (moved.has(item.id)) {
    b.status = 'ok'
    return
  }
  let sent = false
  if (b.kind === 'splitter') {
    const first = b.rr === 0 ? leftOf(b.dir) : rightOf(b.dir)
    const second = b.rr === 0 ? rightOf(b.dir) : leftOf(b.dir)
    if (pushTo(state, defs, b, item, first)) {
      sent = true
      b.rr = b.rr === 0 ? 1 : 0
    } else if (pushTo(state, defs, b, item, second)) {
      sent = true
      b.rr = b.rr === 0 ? 0 : 1
    }
  } else if (b.kind === 'filter') {
    const out = b.filterItem !== null && item.type === b.filterItem ? leftOf(b.dir) : b.dir
    sent = pushTo(state, defs, b, item, out)
  } else {
    sent = pushTo(state, defs, b, item, b.dir)
  }
  if (sent) {
    b.buf = null
    moved.add(item.id)
    b.status = 'idle'
  } else {
    b.status = 'blocked'
  }
}
