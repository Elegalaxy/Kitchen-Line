// Plain-language reason a building is stuck (Inspector "Why" row). Pure: it reads the state
// and asks the sim's own `tryInsert` (on a throwaway copy) whether the neighbour would take
// the stuck item, then explains the refusal, so the text can never disagree with the rules.
// Returns null when there is nothing to explain (building working, idle, or able to move on).

import { ASSEMBLER_INPUT_CAP, PASS_DROP_AGE_TICKS, PASS_SHELF_CAP, STATION_INPUT_CAP } from '../sim/constants.ts'
import { buildingAt, inBounds, neighbor } from '../sim/grid.ts'
import { findStationRecipe, opposite, tryInsert } from '../sim/transfer.ts'
import type { Building, Defs, Dir, GameState, Item } from '../sim/types.ts'
import { dirName } from './format.ts'
import { shownStatus } from './shownStatus.ts'

type Stuck = { item: Item; dir: Dir; what: string }

/** The item a blocked building is trying to push and the side it pushes it to. */
function stuck(state: GameState, b: Building): Stuck | null {
  switch (b.kind) {
    case 'belt':
      return b.slots[1] === null ? null : { item: b.slots[1], dir: b.dir, what: 'The belt is full' }
    case 'pantry':
      return {
        item: { id: -1, type: b.ingredient, bornTick: state.tick },
        dir: b.dir,
        what: 'The pantry cannot hand out its ingredient',
      }
    case 'chopper':
    case 'fryer':
    case 'stove':
    case 'assembler':
      return b.output === null ? null : { item: b.output, dir: b.dir, what: 'The finished item cannot leave' }
    case 'splitter':
    case 'merger':
    case 'filter':
      return b.buf === null ? null : { item: b.buf, dir: b.dir, what: 'The held item cannot leave' }
    default:
      return null
  }
}

/** Why `target` refuses `item` coming from the building on its `fromDir` side. */
function refusal(state: GameState, defs: Defs, target: Building, item: Item, fromDir: Dir): string {
  const name = defs.buildings[target.kind].name
  const itemName = defs.items[item.type]?.name ?? item.type
  if (target.onlineAt > state.tick) return `The ${name} ahead is still warming up.`
  const facesBack = fromDir === target.dir
  switch (target.kind) {
    case 'belt':
      return facesBack
        ? 'The belt ahead faces back at it; a belt does not take items from its front. Turn one of them around.'
        : 'The belt ahead is full. The line is backed up further along: look for the first blocked building.'
    case 'chopper':
    case 'fryer':
    case 'stove':
      if (facesBack) return `The ${name} ahead faces back at it, and a station does not take items from its front.`
      if (findStationRecipe(defs, target.kind, item.type) === undefined) {
        return `The ${name} ahead has no recipe for ${itemName}.`
      }
      if (target.input.length >= STATION_INPUT_CAP) {
        return `The ${name} ahead is busy and its input is full (${STATION_INPUT_CAP} items).`
      }
      return `The ${name} ahead does not take it.`
    case 'assembler': {
      if (facesBack) return 'The assembler ahead faces back at it, so it does not take items from its front.'
      if (target.recipe === null) return 'The assembler ahead has no dish selected. Select it and pick a dish.'
      const dish = defs.dishes[target.recipe]
      if (!(dish?.inputs ?? []).includes(item.type)) {
        return `The assembler's dish (${dish?.name ?? target.recipe}) does not use ${itemName}.`
      }
      return `The assembler ahead already has enough ${itemName} (${ASSEMBLER_INPUT_CAP}).`
    }
    case 'pass':
      if (defs.items[item.type]?.kind !== 'dish') return `The pass only takes finished dishes, not ${itemName}.`
      return `The pass shelf already holds ${PASS_SHELF_CAP} ${itemName}: nobody is buying it. The line waits (or drops the oldest after about ${PASS_DROP_AGE_TICKS / 10} s). Change the menu or the price.`
    case 'splitter':
    case 'filter':
      return fromDir === opposite(target.dir)
        ? `The ${name} ahead is holding another item.`
        : `The ${name} ahead only takes items from its back, but this feeds its ${facesBack ? 'front' : 'side'}.`
    case 'merger':
      return facesBack
        ? 'The merger ahead faces back at it; it does not take items from its front.'
        : 'The merger ahead is holding another item.'
    default:
      return `The ${name} ahead does not take it.`
  }
}

/** Reason the item cannot go from `b` towards `dir`, or null if the neighbour would take it now. */
function exitProblem(state: GameState, defs: Defs, b: Building, item: Item, dir: Dir): string | null {
  const n = neighbor(b.x, b.y, dir)
  if (!inBounds(state, n.x, n.y)) return 'it faces the edge of the grid.'
  const id = buildingAt(state, n.x, n.y)
  const target = id === null ? undefined : state.buildings[id]
  if (target === undefined) {
    return `nothing is on the tile it faces (${dirName(dir)}). Put a belt or a station there.`
  }
  // Would the neighbour take it right now? Then it is only about to move, not stuck.
  const copy = structuredClone(state)
  const copyTarget = copy.buildings[target.id]
  if (copyTarget !== undefined && tryInsert(copy, defs, copyTarget, item, opposite(dir))) return null
  return refusal(state, defs, target, item, opposite(dir))
}

function splitterReason(state: GameState, defs: Defs, b: Extract<Building, { kind: 'splitter' }>, item: Item): string | null {
  const left = exitProblem(state, defs, b, item, ((b.dir + 3) % 4) as Dir)
  const right = exitProblem(state, defs, b, item, ((b.dir + 1) % 4) as Dir)
  if (left === null || right === null) return null
  return `Neither exit can take the item (a splitter never pushes forward). Left: ${left} Right: ${right}`
}

/** Hint added to a blocked pantry whose output is refused only because the line ahead is full (not a layout mistake). */
export const PANTRY_BACKUP_HINT = 'Output is backing up: pause this pantry to stop buying ingredients.'
/** Refusal texts above that mean "full", as opposed to "wrong direction / nothing there / no recipe". */
const BACKED_UP = /is full|already has enough|already holds|holding another item|input is full/

/** The text for the Inspector "Why" row, or null. */
export function blockReason(state: GameState, defs: Defs, b: Building): string | null {
  // A pantry shown as "Ready" (build phase) has nothing to explain.
  if (shownStatus(state.phase, b) === 'ready') return null
  if (b.status === 'warming') return 'Just placed: it starts working in a moment.'
  if (b.status === 'paused') return "Paused by you. Resume it in the Inspector or with 'Resume pantries'."
  if (b.status === 'noCash') {
    return b.kind === 'pantry'
      ? `Not enough money for the next ${defs.items[b.ingredient]?.name ?? 'ingredient'}.`
      : 'Not enough money.'
  }
  if (b.status === 'noRecipe') {
    return b.kind === 'assembler'
      ? 'No dish selected. Pick one below.'
      : 'The held item has no recipe at this station. Remove it or send items it can process.'
  }
  if (b.status !== 'blocked') return null
  if (b.kind === 'splitter') return b.buf === null ? null : splitterReason(state, defs, b, b.buf)
  const s = stuck(state, b)
  if (s === null) return null
  const dir =
    b.kind === 'filter' && b.filterItem !== null && s.item.type === b.filterItem ? (((b.dir + 3) % 4) as Dir) : s.dir
  const problem = exitProblem(state, defs, b, s.item, dir)
  if (problem === null) return null
  const text = `${s.what}: ${problem}`
  return b.kind === 'pantry' && BACKED_UP.test(problem) ? `${text} ${PANTRY_BACKUP_HINT}` : text
}
