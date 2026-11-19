// All content defs, handed to the sim as `DEFS`.

import type { Defs } from '../sim/types.ts'
import { BUILDINGS } from './buildings.ts'
import { DISHES } from './dishes.ts'
import { ITEMS } from './items.ts'
import { STATION_RECIPES } from './recipes.ts'

export const DEFS: Defs = {
  items: ITEMS,
  buildings: BUILDINGS,
  stationRecipes: STATION_RECIPES,
  dishes: DISHES,
}
