// View helpers for daily trends (GAME_DESIGN 9): the build-phase announcement and the summary line.
// Restaurant tier only (both return null at the stall). Pure, so they are unit-tested.

import { TREND_WEIGHT_FACTOR } from '../sim/constants.ts'
import { currentTrend } from '../sim/trend.ts'
import type { Defs, GameState } from '../sim/types.ts'

export type TrendView = {
  dish: string
  name: string
  emoji: string
  /** "Today's trend: Fries, 2x demand" */
  text: string
  /** Short form for the top bar: "Fries ×2". */
  short: string
  onMenu: boolean
  /** Extra hint line: add it to the menu (build phase only) or null. */
  hint: string | null
}

/** The trend of the day in progress (build or service), or null at the stall / with fewer than 2 unlocked dishes. */
export function trendView(state: GameState, defs: Defs): TrendView | null {
  const dish = currentTrend(state, defs)
  if (dish === null) return null
  const def = defs.dishes[dish]
  const name = def?.name ?? dish
  const onMenu = state.menu.some((m) => m.dish === dish)
  return {
    dish,
    name,
    emoji: def?.emoji ?? '',
    text: `Today's trend: ${name}, ${TREND_WEIGHT_FACTOR}x demand`,
    short: `${name} ×${TREND_WEIGHT_FACTOR}`,
    onMenu,
    hint: onMenu ? null : state.phase === 'build' ? `Not on your menu yet: add ${name} to catch the demand.` : null,
  }
}

export type TrendSummary = { name: string; emoji: string; served: number; lost: number; onMenu: boolean }

/** How the finished day's trend dish did, or null at the stall. The pool is the unlocked dishes (they cannot change between service and summary). */
export function trendSummary(state: GameState, defs: Defs): TrendSummary | null {
  const last = state.lastDay
  if (last === null) return null
  const dish = currentTrend(state, defs, last.day)
  if (dish === null) return null
  const def = defs.dishes[dish]
  const stats = last.byDish[dish]
  return {
    name: def?.name ?? dish,
    emoji: def?.emoji ?? '',
    served: stats?.served ?? 0,
    lost: stats?.lost ?? 0,
    onMenu: state.menu.some((m) => m.dish === dish),
  }
}
