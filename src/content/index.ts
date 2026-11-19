// All content defs, handed to the sim as `DEFS`.

import type { Defs } from '../sim/types.ts'
import { BUILDINGS } from './buildings.ts'
import { DISHES } from './dishes.ts'
import { EXPANSIONS } from './expansions.ts'
import { GOALS } from './goals.ts'
import { ITEMS } from './items.ts'
import { REVIEW_TEMPLATES } from './reviewText.ts'
import { STATION_RECIPES } from './recipes.ts'

export const DEFS: Defs = {
  items: ITEMS,
  buildings: BUILDINGS,
  stationRecipes: STATION_RECIPES,
  dishes: DISHES,
  reviewTemplates: REVIEW_TEMPLATES,
  goals: GOALS,
  expansions: EXPANSIONS,
}
