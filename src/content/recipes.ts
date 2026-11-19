// Station recipes (chopper, fryer, stove). Ticks per item are provisional
// (plan 2.5: chopper 20, fryer 40, stove 60). Assembler recipes are the dishes'
// `inputs` in dishes.ts (plan 2.6).

import type { StationRecipe } from '../sim/types.ts'

const CHOP_TICKS = 20
const FRY_TICKS = 40
const COOK_TICKS = 60

export const STATION_RECIPES: StationRecipe[] = [
  { station: 'chopper', input: 'potato', output: 'potatoStrips', ticks: CHOP_TICKS },
  { station: 'chopper', input: 'tomato', output: 'slicedTomato', ticks: CHOP_TICKS },
  { station: 'chopper', input: 'lettuce', output: 'choppedLettuce', ticks: CHOP_TICKS },
  { station: 'fryer', input: 'potatoStrips', output: 'fries', ticks: FRY_TICKS },
  { station: 'stove', input: 'patty', output: 'cookedPatty', ticks: COOK_TICKS },
  { station: 'stove', input: 'rice', output: 'cookedRice', ticks: COOK_TICKS },
  { station: 'stove', input: 'slicedTomato', output: 'soup', ticks: COOK_TICKS },
]
