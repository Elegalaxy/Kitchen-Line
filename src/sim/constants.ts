// Rule constants for the sim. Every number here is provisional (plan section 2.5).
// Content numbers (costs, prices, recipes) live in src/content, not here.

import type { Dir, Tier } from './types.ts'

/** GAME_DESIGN 5.1: start grid 8 x 6 (stall). */
export const START_WIDTH = 8
export const START_HEIGHT = 6
/** GAME_DESIGN 7 / plan 2.5: starting money, integer cents ($150). */
export const START_MONEY = 15000
export const START_TIER: Tier = 'stall'
/** Plan Step 2: pre-placed pass (facing W) and potato pantry (facing E). */
export const PASS_POS = { x: 7, y: 2 } as const
export const PASS_DIR: Dir = 3
export const PANTRY_POS = { x: 0, y: 2 } as const
export const PANTRY_DIR: Dir = 1
export const START_INGREDIENT = 'potato'
/** GAME_DESIGN 5.3: pantry emit interval choices in ticks, default 20. */
export const PANTRY_INTERVALS: readonly number[] = [10, 20, 40, 80]
export const PANTRY_DEFAULT_INTERVAL = 20
/** GAME_DESIGN 6.3: reputation is seeded with 10 virtual ratings of 3. */
export const INITIAL_RATING_COUNT = 10
export const INITIAL_RATING_VALUE = 3
/** Plan 2.5: a building placed during service is offline for 30 ticks. */
export const WARMUP_TICKS = 30
