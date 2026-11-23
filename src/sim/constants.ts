// Rule constants for the sim. Every number here is provisional (plan section 2.5).
// Content numbers (costs, prices, recipes) live in src/content, not here.

import type { Dir, Tier } from './types.ts'

/** GAME_DESIGN 5.1: start grid 8 x 6 (stall). */
export const START_WIDTH = 8
export const START_HEIGHT = 6
/** GAME_DESIGN 7 / plan 2.5: starting money, integer cents ($150). */
export const START_MONEY = 15000
/**
 * GAME_DESIGN 13: one tutorial top-up so a bad day cannot leave the suggested salad line
 * unaffordable. The UI asks for the shortfall only; the command refuses anything above this.
 */
export const TUTORIAL_HELP_CAP = 40000
export const START_TIER: Tier = 'stall'
/** Plan Step 2: pre-placed pass (facing W) and potato pantry (facing E). */
export const PASS_POS = { x: 7, y: 2 } as const
export const PASS_DIR: Dir = 3
export const PANTRY_POS = { x: 0, y: 2 } as const
export const PANTRY_DIR: Dir = 1
export const START_INGREDIENT = 'potato'
/** GAME_DESIGN 5.3: at most this many passes (the pre-placed one plus one bought at the restaurant tier). */
export const PASS_MAX = 2
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
/**
 * GAME_DESIGN 5.3: when the shelf holds PASS_SHELF_CAP of a dish, a new copy is refused (the belt
 * backs up and the pantries stop buying) unless a different dish waits behind it on the feeding
 * belt, or the oldest copy is at least this old (45 s); then the oldest is thrown away.
 */
export const PASS_DROP_AGE_TICKS = 450
/** Plan 2.5 / GAME_DESIGN 5.3: an assembler takes 30 ticks per dish and holds up to 2 of each input. */
export const ASSEMBLER_TICKS = 30
export const ASSEMBLER_INPUT_CAP = 2
/** Plan 2.5 / GAME_DESIGN 4: a day is 2400 ticks of service (4 min at 1x). Clock shows 11:00 to 22:00. */
export const DAY_TICKS = 2400
/**
 * UI only (no sim rule uses it): the closing-time warning shows in the last 600 ticks (60 s at 1x) of service,
 * and the harness player pauses its pantries at the same point. GAME_DESIGN 4 (overnight cleanup).
 */
export const CLOSING_SOON_TICKS = 600
/** Plan 2.5: phase start ticks within a day (GAME_DESIGN 4). Each phase runs until the next start. */
export const DAY_PHASE_STARTS = [
  { phase: 'open', from: 0 },
  { phase: 'lunchRush', from: 240 },
  { phase: 'quiet', from: 840 },
  { phase: 'dinnerRush', from: 1380 },
  { phase: 'quiet', from: 1980 },
  { phase: 'closing', from: 2280 },
] as const

/**
 * Plan 2.5 / GAME_DESIGN 6.2: mean ticks between arrivals at 3 stars, stall: 100 when quiet, 30 in a rush
 * (about 51 customers a day). Step 18 balance: was 150 / 50 (about 31 a day). With 4 dishes the real
 * demand per dish is only 30 to 45 percent of customers, so 31 a day gave a fries-only stall $25 a
 * day and made the 100-dishes goal take 7+ days.
 */
export const ARRIVAL_GAP_QUIET = 100
export const ARRIVAL_GAP_RUSH = 30
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
/**
 * Plan 2.5 / GAME_DESIGN 6.2: budget = reference price of the first-choice dish x a uniform 100 to 160
 * percent. Step 18 balance: was 90 to 140. With 90 to 140, 41 percent of first-choice customers had a
 * budget under the price / 0.9 and rated the dish at its REFERENCE price -1 (overpriced), and a
 * fries-first customer (budget 270 to 420) could never afford salad (450).
 */
export const BUDGET_PERCENT_MIN = 100
export const BUDGET_PERCENT_MAX = 160

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

/**
 * GAME_DESIGN 8 (restaurant goal 5, provisional): a dish counts toward goal 5 when it served at least this many
 * customers in one day. Goal 5 wants RESTAURANT_MENU_TARGET (content/goals.ts) such dishes in the same day.
 */
export const GOAL_DISH_SALES = 10

/** Plan 2.5 / GAME_DESIGN 6.1: at most this many dishes on the menu (stall 4, restaurant 6). */
export const MENU_CAP: Record<Tier, number> = { stall: 4, restaurant: 6 }
/** Plan 2.5: a price may be 50% to 300% of the dish's reference price, in 10-cent steps. */
export const PRICE_MIN_PERCENT = 50
export const PRICE_MAX_PERCENT = 300
export const PRICE_STEP = 10

/** Ticks per second at 1x (plan 2.5). Used to show waits in seconds. */
export const TICKS_PER_SECOND = 10

/** Plan 2.5: "Upgrade to restaurant" costs $250 once every stall goal is done. */
export const UPGRADE_COST = 25000
