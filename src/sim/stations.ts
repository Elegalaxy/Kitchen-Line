// Processing stations: chopper, fryer, stove (plan Step 6). One input item at a time:
//   - A held output is pushed out the front with tryInsert; while it cannot be pushed the
//     station is `blocked` and does not progress.
//   - With an empty output and at least one input, `progress` counts up from 0 by one per
//     tick for the first input. At the recipe's `ticks` the input is consumed and the
//     output (new item id, bornTick = now) is made, then pushed the same tick.
//   - Status: `blocked` (output stuck), `ok` (working), `idle` (nothing to do).
// Assembler (plan Step 8): `recipe` names a dish whose `inputs` it needs (up to 3). With
// no recipe the status is `noRecipe`. It starts when the output is empty and every input
// holds at least 1 item; `progress` then counts up and at ASSEMBLER_TICKS one of each
// input is consumed and the dish is made (new id, bornTick = now) and pushed out the
// front of the anchor. Status: `noRecipe`, `blocked` (dish stuck), `ok` (working),
// `idle` (an input is missing). A missing input never produces anything.
// Acceptance of inputs lives in transfer.ts. The tick loop skips warming stations.

import { buildingAt, neighbor } from './grid.ts'
import { ASSEMBLER_TICKS, PRO_TICKS_DEN, PRO_TICKS_NUM } from './constants.ts'
import { findStationRecipe, opposite, tryInsert } from './transfer.ts'
import type { Building, Defs, GameState } from './types.ts'

type StationBuilding = Extract<Building, { kind: 'chopper' | 'fryer' | 'stove' }>
type AssemblerBuilding = Extract<Building, { kind: 'assembler' }>

function pushOutput(state: GameState, defs: Defs, b: StationBuilding, moved: Set<number>): void {
  const out = b.output
  if (out === null) return
  const n = neighbor(b.x, b.y, b.dir)
  const targetId = buildingAt(state, n.x, n.y)
  const target = targetId === null ? undefined : state.buildings[targetId]
  if (target !== undefined && tryInsert(state, defs, target, out, opposite(b.dir))) {
    b.output = null
    moved.add(out.id)
  }
}

/** Ticks a station needs per item: the base ticks, or 2/3 of them (rounded up) for the pro variant. */
export function stationTicks(base: number, pro: boolean | undefined): number {
  return pro === true ? Math.ceil((base * PRO_TICKS_NUM) / PRO_TICKS_DEN) : base
}

/** True for a pro fryer, stove or assembler. */
export function isPro(b: Building): boolean {
  return (b.kind === 'fryer' || b.kind === 'stove' || b.kind === 'assembler') && b.pro === true
}

export function stepStation(state: GameState, defs: Defs, b: StationBuilding, moved: Set<number>): void {
  pushOutput(state, defs, b, moved)
  const first = b.input[0]
  if (b.output === null && first !== undefined) {
    const recipe = findStationRecipe(defs, b.kind, first.type)
    if (recipe === undefined) {
      // Cannot happen via tryInsert; drop the stuck item rather than wedge the station.
      b.input.shift()
      b.progress = 0
    } else {
      b.progress += 1
      if (b.progress >= stationTicks(recipe.ticks, b.kind === 'chopper' ? undefined : b.pro)) {
        b.input.shift()
        b.progress = 0
        b.output = { id: state.nextItemId, type: recipe.output, bornTick: state.tick }
        state.nextItemId += 1
        state.events.push({
          type: 'stationDone',
          tick: state.tick,
          x: b.x,
          y: b.y,
          input: recipe.input,
          output: recipe.output,
        })
        pushOutput(state, defs, b, moved)
      }
    }
  }
  if (b.output !== null) b.status = 'blocked'
  else b.status = b.input.length > 0 ? 'ok' : 'idle'
}

function pushAssemblerOutput(state: GameState, defs: Defs, b: AssemblerBuilding, moved: Set<number>): void {
  const out = b.output
  if (out === null) return
  const n = neighbor(b.x, b.y, b.dir)
  const targetId = buildingAt(state, n.x, n.y)
  const target = targetId === null ? undefined : state.buildings[targetId]
  if (target !== undefined && tryInsert(state, defs, target, out, opposite(b.dir))) {
    b.output = null
    moved.add(out.id)
  }
}

export function stepAssembler(state: GameState, defs: Defs, b: AssemblerBuilding, moved: Set<number>): void {
  const dish = b.recipe === null ? undefined : defs.dishes[b.recipe]
  const needs = dish?.inputs
  if (b.recipe === null || dish === undefined || needs === undefined) {
    b.status = 'noRecipe'
    b.progress = 0
    return
  }
  pushAssemblerOutput(state, defs, b, moved)
  const ready = needs.every((type) => (b.inputs[type]?.length ?? 0) >= 1)
  if (b.output === null && ready) {
    b.progress += 1
    if (b.progress >= stationTicks(ASSEMBLER_TICKS, b.pro)) {
      for (const type of needs) b.inputs[type]?.shift()
      b.progress = 0
      b.output = { id: state.nextItemId, type: dish.id, bornTick: state.tick }
      state.nextItemId += 1
      state.events.push({ type: 'assembled', tick: state.tick, x: b.x, y: b.y, dish: dish.id })
      pushAssemblerOutput(state, defs, b, moved)
    }
  }
  if (b.output !== null) b.status = 'blocked'
  else b.status = ready ? 'ok' : 'idle'
}
