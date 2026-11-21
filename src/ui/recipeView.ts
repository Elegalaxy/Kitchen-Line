// Recipe shown from the menu: the chain from the finished dish back to pantry ingredients.
// A station dish is one machine (chopper, fryer, stove). An assembler dish lists each input,
// then that input's own chain. Times are whole seconds when the tick count divides evenly.

import { ASSEMBLER_TICKS, TICKS_PER_SECOND } from '../sim/constants.ts'
import type { Defs, DishId } from '../sim/types.ts'

export type RecipeStep = {
  id: string
  name: string
  emoji: string
  /** 0 is the finished dish; each input is one deeper. */
  depth: number
  /** "Pantry", "Chopper, 2 s" or "Assembler, 3 s". */
  made: string
}

function seconds(ticks: number): string {
  const s = ticks / TICKS_PER_SECOND
  return Number.isInteger(s) ? `${s} s` : `${s.toFixed(1)} s`
}

/** Steps in reading order: the dish, then each input's chain before the next input. Unknown ids are empty. */
export function recipeSteps(defs: Defs, dishId: DishId): RecipeStep[] {
  if (defs.dishes[dishId] === undefined) return []
  const steps: RecipeStep[] = []

  const walk = (id: string, depth: number): void => {
    if (depth > 8) return
    const item = defs.items[id]
    const dish = defs.dishes[id]
    const station = defs.stationRecipes.find((r) => r.output === id)
    const inputs = dish?.inputs
    let made = 'Pantry'
    let children: string[] = []
    if (inputs !== undefined && inputs.length > 0) {
      made = `${defs.buildings.assembler.name}, ${seconds(ASSEMBLER_TICKS)}`
      children = inputs
    } else if (station !== undefined) {
      made = `${defs.buildings[station.station].name}, ${seconds(station.ticks)}`
      children = [station.input]
    }
    steps.push({
      id,
      name: item?.name ?? dish?.name ?? id,
      emoji: item?.emoji ?? dish?.emoji ?? '',
      depth,
      made,
    })
    for (const child of children) walk(child, depth + 1)
  }

  walk(dishId, 0)
  return steps
}
