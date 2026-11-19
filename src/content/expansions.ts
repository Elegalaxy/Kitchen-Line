// Grid expansion steps in order (plan 2.5, GAME_DESIGN 5.1). Costs in cents are provisional.
// The start grid is 8 x 6; `state.expansion` counts the steps bought. Sizes from 12 x 9 up
// need the restaurant tier.

import type { ExpansionDef } from '../sim/types.ts'

export const EXPANSIONS: ExpansionDef[] = [
  { width: 10, height: 8, cost: 10000, requiresTier: 'stall' },
  { width: 12, height: 9, cost: 20000, requiresTier: 'restaurant' },
  { width: 14, height: 11, cost: 35000, requiresTier: 'restaurant' },
  { width: 16, height: 12, cost: 50000, requiresTier: 'restaurant' },
]
