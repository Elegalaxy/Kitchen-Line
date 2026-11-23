// Station recipes (chopper, fryer, stove). Ticks per item are provisional
// (plan 2.5: chopper 20, fryer 60, stove 60). Step 18 balance (GAME_DESIGN 5.3): fryer was 40; at
// 60 one fryer is busy for the whole rush from about 4 stars and is the visible bottleneck at the
// restaurant tier (about 38 of the 40 fries it can make in a day, orders waiting 10 to 17 s). Assembler recipes are the dishes'
// `inputs` in dishes.ts (plan 2.6).

import type { StationRecipe } from '../sim/types.ts'

const CHOP_TICKS = 20
const FRY_TICKS = 60
const COOK_TICKS = 60

export const STATION_RECIPES: StationRecipe[] = [
  { station: 'chopper', input: 'potato', output: 'potatoStrips', ticks: CHOP_TICKS },
  { station: 'chopper', input: 'tomato', output: 'slicedTomato', ticks: CHOP_TICKS },
  { station: 'chopper', input: 'lettuce', output: 'choppedLettuce', ticks: CHOP_TICKS },
  { station: 'fryer', input: 'potatoStrips', output: 'fries', ticks: FRY_TICKS },
  // Dish pack (GAME_DESIGN 5.4): fish shares the fryer with fries, same time.
  { station: 'fryer', input: 'fish', output: 'friedFish', ticks: FRY_TICKS },
  { station: 'stove', input: 'patty', output: 'cookedPatty', ticks: COOK_TICKS },
  { station: 'stove', input: 'rice', output: 'cookedRice', ticks: COOK_TICKS },
  { station: 'stove', input: 'slicedTomato', output: 'soup', ticks: COOK_TICKS },
]
