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
/** Plan Step 3 / 2.5: a belt moves a half-tile step every 3 ticks (fast belt: 2). */
export const BELT_STEP_TICKS = 3
export const FAST_BELT_STEP_TICKS = 2
/** Plan 2.5: processors hold at most 2 input items (output 1); the pass shelf holds 4 dishes. */
export const STATION_INPUT_CAP = 2
export const PASS_SHELF_CAP = 4
/** Plan 2.5 / GAME_DESIGN 5.3: an assembler takes 30 ticks per dish and holds up to 2 of each input. */
export const ASSEMBLER_TICKS = 30
export const ASSEMBLER_INPUT_CAP = 2
/** Plan 2.5 / GAME_DESIGN 4: a day is 2400 ticks of service (4 min at 1x). Clock shows 11:00 to 22:00. */
export const DAY_TICKS = 2400
/** Plan 2.5: phase start ticks within a day (GAME_DESIGN 4). Each phase runs until the next start. */
export const DAY_PHASE_STARTS = [
  { phase: 'open', from: 0 },
  { phase: 'lunchRush', from: 240 },
  { phase: 'quiet', from: 840 },
  { phase: 'dinnerRush', from: 1380 },
  { phase: 'quiet', from: 1980 },
  { phase: 'closing', from: 2280 },
] as const

/** Plan 2.5 / GAME_DESIGN 6.2: mean ticks between arrivals at 3 stars, stall: 150 when quiet, 50 in a rush. */
export const ARRIVAL_GAP_QUIET = 150
export const ARRIVAL_GAP_RUSH = 50
/** Plan 2.5: arrival chance scales with 0.4 + 0.2 x reputation (1 star 0.6, 3 stars 1.0, 5 stars 1.4). */
export const REPUTATION_FACTOR_BASE = 0.4
export const REPUTATION_FACTOR_PER_STAR = 0.2
/** Reputation used when there are no ratings at all (cannot happen from createGame; keeps the maths total). */
export const DEFAULT_REPUTATION = 3
/** Plan 2.5: arrival factor per tier. */
export const TIER_ARRIVAL_FACTOR: Record<Tier, number> = { stall: 1.0, restaurant: 1.5 }
/** Plan 2.5 / GAME_DESIGN 6.2: capacity of waiting orders per tier. */
export const WAITING_CAP: Record<Tier, number> = { stall: 6, restaurant: 10 }
/** Plan 2.5: patience is uniform 300 to 600 ticks from the order. */
export const PATIENCE_MIN = 300
export const PATIENCE_MAX = 600
/** Plan 2.5: each customer likes 2 to 3 dishes (capped by how many dishes exist). */
export const PREFS_MIN = 2
export const PREFS_MAX = 3
/** Plan 2.5: budget = reference price of the first-choice dish x a uniform 90 to 140 percent. */
export const BUDGET_PERCENT_MIN = 90
export const BUDGET_PERCENT_MAX = 140

/** Plan 2.5 / GAME_DESIGN 6.3: ratings are integers 1 to 5; a served customer starts at 5. */
export const RATING_MAX = 5
export const RATING_MIN = 1
/** Plan 2.5: wait over 50% of patience -1, over 80% -2 (not added together). */
export const WAIT_LONG_FRACTION = 0.5
export const WAIT_VERY_LONG_FRACTION = 0.8
export const WAIT_LONG_PENALTY = 1
export const WAIT_VERY_LONG_PENALTY = 2
/** Plan 2.5: price over 90% of budget -1; not the first choice -1. */
export const OVERPRICED_FRACTION = 0.9
export const OVERPRICED_PENALTY = 1
export const NOT_FIRST_CHOICE_PENALTY = 1
/** Plan 2.5: patience ran out -> 1; nothing affordable liked, or queue full -> 2. */
export const RATING_GAVE_UP = 1
export const RATING_NO_MATCH = 2
export const RATING_QUEUE_FULL = 2
/** Plan 2.5: reputation is the average of the last 50 ratings. */
export const RATINGS_KEPT = 50
/** Plan Step 12: up to 20 reviews are kept per day (the lowest-rated always, plus a sample). */
export const REVIEWS_PER_DAY = 20
