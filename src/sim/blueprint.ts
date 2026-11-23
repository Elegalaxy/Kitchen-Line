// Blueprints (GAME_DESIGN 8.1, chain stage): a snapshot of the flagship kitchen that a branch runs.
// It is a copy of the kitchen across locations, NOT grid copy/paste. `blueprintOf` clones the buildings
// with every buffer emptied, status idle, `onlineAt` 0 and the pause flag dropped, so two snapshots of an
// unchanged kitchen are identical whatever happened on the line in between (`sameBlueprint`).
// Pure: the state is never mutated.

import { refundOf } from './economy.ts'
import type { Blueprint, Building, Defs, GameState } from './types.ts'

/** A copy of `b` as it would be bought new: empty buffers, idle, online at once, not paused. */
function cleaned(b: Building): Building {
  const c = structuredClone(b)
  c.status = 'idle'
  c.onlineAt = 0
  switch (c.kind) {
    case 'belt':
      c.slots = [null, null]
      c.stalled = false
      break
    case 'pantry':
      c.cooldown = 0
      delete c.paused
      break
    case 'splitter':
    case 'merger':
      c.buf = null
      c.rr = 0
      break
    case 'filter':
      c.buf = null
      break
    case 'chopper':
    case 'fryer':
    case 'stove':
      c.input = []
      c.output = null
      c.progress = 0
      break
    case 'assembler':
      c.inputs = {}
      c.output = null
      c.progress = 0
      break
    case 'pass':
      c.shelf = []
      c.delivered = 0
      break
    case 'bin':
      break
  }
  return c
}

/** Snapshot the kitchen of `state`. `value` is the sum of the selling prices of its buildings (cents). */
export function blueprintOf(state: GameState, defs: Defs): Blueprint {
  const buildings: Record<number, Building> = {}
  let value = 0
  for (const b of Object.values(state.buildings)) {
    buildings[b.id] = cleaned(b)
    value += refundOf(defs, b)
  }
  return {
    width: state.width,
    height: state.height,
    expansion: state.expansion,
    tiles: [...state.tiles],
    buildings,
    menu: state.menu.map((m) => ({ dish: m.dish, price: m.price })),
    unlocked: [...state.unlocked],
    value,
  }
}

/** True when two blueprints describe the same kitchen and menu (the value follows from the buildings). */
export function sameBlueprint(a: Blueprint, b: Blueprint): boolean {
  const strip = ({ value: _value, ...rest }: Blueprint): string => JSON.stringify(rest)
  return strip(a) === strip(b)
}
