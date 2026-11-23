// Daily trends (GAME_DESIGN 9, restaurant tier only). One unlocked dish a day is "in demand":
// customers draw it with `TREND_WEIGHT_FACTOR` times its taste weight (customers.ts). The trend is a
// pure function of the seed, the day number and the candidate list: an FNV-1a hash picks the index.
// It uses NO random stream and stores nothing, so the RNG draw count and order never change.

import { TREND_MIN_CANDIDATES } from './constants.ts'
import type { Defs, DishId, GameState } from './types.ts'

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

/** The dish in demand on `day`, or null when fewer than `TREND_MIN_CANDIDATES` candidates exist. */
export function trendFor(seed: string, day: number, candidates: readonly DishId[]): DishId | null {
  if (candidates.length < TREND_MIN_CANDIDATES) return null
  const text = `${seed}|trend|${day}`
  let hash = FNV_OFFSET
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  // Final avalanche so neighbouring days do not map to neighbouring dishes.
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  return candidates[(hash >>> 0) % candidates.length]
}

/** Unlocked dishes in defs order (the trend pool). */
export function trendCandidates(state: Pick<GameState, 'unlocked'>, defs: Defs): DishId[] {
  return Object.keys(defs.dishes).filter((id) => state.unlocked.includes(id))
}

/** Today's trend for `state` (restaurant tier only; null at the stall). Uses `day` (the build or service day). */
export function currentTrend(state: Pick<GameState, 'seed' | 'day' | 'tier' | 'unlocked'>, defs: Defs, day = state.day): DishId | null {
  if (state.tier !== 'restaurant') return null
  return trendFor(state.seed, day, trendCandidates(state, defs))
}
