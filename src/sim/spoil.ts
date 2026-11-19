// Spoilage (plan Step 9, GAME_DESIGN 5.2: only fresh produce and finished dishes spoil).
// At the start of every tick (after events are cleared, before anything moves) each item
// whose def has `spoilTicks` and whose age `tick - bornTick` is at least `spoilTicks` is
// removed wherever it is: belt slot, station input or output, assembler input or output,
// routing buffer, pass shelf. Each removal adds 1 to `today.wasteSpoiled` and pushes a
// `spoiled` event at the building's anchor tile. An item born at tick B therefore
// spoils during tick B + spoilTicks. Items without `spoilTicks` (potatoes) never spoil.
// Buildings are visited by id, belt slots back to front, so the order is deterministic.

import type { Building, Defs, GameState, Item } from './types.ts'

/** Every item a building holds, in a fixed order. */
export function buildingItems(b: Building): Item[] {
  switch (b.kind) {
    case 'belt':
      return b.slots.filter((i): i is Item => i !== null)
    case 'splitter':
    case 'merger':
    case 'filter':
      return b.buf === null ? [] : [b.buf]
    case 'chopper':
    case 'fryer':
    case 'stove':
      return b.output === null ? [...b.input] : [...b.input, b.output]
    case 'assembler': {
      const held = Object.keys(b.inputs)
        .sort()
        .flatMap((k) => b.inputs[k] ?? [])
      return b.output === null ? held : [...held, b.output]
    }
    case 'pass':
      return [...b.shelf]
    default:
      return []
  }
}

/** True when `item` has reached its shelf life at tick `tick`. */
export function isSpoiled(defs: Defs, item: Item, tick: number): boolean {
  const life = defs.items[item.type]?.spoilTicks
  return life !== undefined && tick - item.bornTick >= life
}

/** Remove every spoiled item from `b`; returns the removed items. */
function removeSpoiled(b: Building, defs: Defs, tick: number): Item[] {
  const gone: Item[] = []
  const bad = (i: Item | null): boolean => {
    if (i === null || !isSpoiled(defs, i, tick)) return false
    gone.push(i)
    return true
  }
  switch (b.kind) {
    case 'belt':
      if (bad(b.slots[0])) b.slots[0] = null
      if (bad(b.slots[1])) b.slots[1] = null
      break
    case 'splitter':
    case 'merger':
    case 'filter':
      if (bad(b.buf)) b.buf = null
      break
    case 'chopper':
    case 'fryer':
    case 'stove': {
      const kept = b.input.filter((i) => !bad(i))
      if (kept.length !== b.input.length) {
        // The item being worked on is gone: restart progress for the next one.
        if (kept[0] !== b.input[0]) b.progress = 0
        b.input = kept
      }
      if (bad(b.output)) b.output = null
      break
    }
    case 'assembler': {
      for (const k of Object.keys(b.inputs).sort()) {
        const list = b.inputs[k] ?? []
        const kept = list.filter((i) => !bad(i))
        if (kept.length !== list.length) b.inputs[k] = kept
      }
      if (bad(b.output)) b.output = null
      break
    }
    case 'pass':
      if (b.shelf.some((i) => isSpoiled(defs, i, tick))) b.shelf = b.shelf.filter((i) => !bad(i))
      break
    default:
      break
  }
  return gone
}

/** Remove all spoiled items from the state. Mutates `state`. */
export function stepSpoilage(state: GameState, defs: Defs): void {
  for (const key of Object.keys(state.buildings)) {
    const b = state.buildings[Number(key)]
    if (b === undefined) continue
    for (const item of removeSpoiled(b, defs, state.tick)) {
      state.today.wasteSpoiled += 1
      state.events.push({ type: 'spoiled', tick: state.tick, x: b.x, y: b.y, item: item.type })
    }
  }
}
