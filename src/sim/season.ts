// Seasons (GAME_DESIGN 9, restaurant tier only). The season is a pure function of the day number:
// `floor((day - 1) / SEASON_DAYS) mod 4` indexes `defs.seasons`. It uses NO random stream and stores
// nothing, so the RNG draw count and order never change. Without `defs.seasons`, or at the stall, there
// is no season and every helper returns the base value (costs, weights and menus behave as before).
// A season only scales numbers: pantry prices (rounded to whole cents), taste weights and the branch
// night ratio. Unlisted ids count as 100 percent.

import { SEASON_DAYS } from './constants.ts'
import type { Defs, DishDef, DishId, GameState, ItemId, SeasonDef } from './types.ts'

type SeasonView = Pick<GameState, 'tier' | 'day'>

/** Index (0 to 3) of the season on `day` (day 1 is the first day of season 0). */
export function seasonIndex(day: number): number {
  return Math.floor((Math.max(day, 1) - 1) / SEASON_DAYS) % 4
}

/** The season on `day` (default: the state's day); null at the stall or when the defs have no seasons. */
export function currentSeason(state: SeasonView, defs: Defs, day = state.day): SeasonDef | null {
  if (state.tier !== 'restaurant') return null
  const seasons = defs.seasons
  if (seasons === undefined || seasons.length === 0) return null
  return seasons[seasonIndex(day) % seasons.length]
}

/** Pantry price of `itemId` in cents, scaled by the season (rounded); undefined for an unknown item. */
export function itemCost(state: SeasonView, defs: Defs, itemId: ItemId): number | undefined {
  const base = defs.items[itemId]?.cost
  if (base === undefined) return undefined
  const pct = currentSeason(state, defs)?.costPercent[itemId]
  return pct === undefined ? base : Math.round((base * pct) / 100)
}

/** The season's taste percent for `dishId` (100 when unlisted or without a season). */
export function tastePercent(state: SeasonView, defs: Defs, dishId: DishId): number {
  return currentSeason(state, defs)?.tastePercent[dishId] ?? 100
}

/** Is `dish` wanted on `day`? A dish with no season always is; a seasonal one only in its own season (when seasons apply). */
export function inSeason(state: SeasonView, defs: Defs, dish: Pick<DishDef, 'season'>, day = state.day): boolean {
  if (dish.season === undefined) return true
  const season = currentSeason(state, defs, day)
  return season === null || season.id === dish.season
}

/** The branch night percent of the season on `day`, whatever the tier (100 without seasons). */
export function branchSeasonPercent(defs: Defs, day: number): number {
  const seasons = defs.seasons
  if (seasons === undefined || seasons.length === 0) return 100
  return seasons[seasonIndex(day) % seasons.length].branchPercent
}
