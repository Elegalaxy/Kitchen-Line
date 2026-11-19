// Milestone goals (plan 2.5, GAME_DESIGN 8). Goals are data: `check` reads the state and
// returns progress; the sim records a goal as done the first time `check(...).done` is true
// (sim/goals.ts). Thresholds are provisional. Profit counts sales minus ingredient cost
// (building and expansion spending is excluded). Totals only grow at day end, so the profit
// of a day in progress is added while service is open.

import { reputationOf } from '../sim/customers.ts'
import { profitOf } from '../sim/economy.ts'
import type { GameState, GoalDef, GoalProgress } from '../sim/types.ts'

/** Plan 2.5 stall goals. */
export const STALL_SERVE_TARGET = 100
export const STALL_RATING_TARGET = 4.0
/** Cents ($300). */
export const STALL_PROFIT_TARGET = 30000
/** Plan 2.5 restaurant goals. */
export const RESTAURANT_MENU_TARGET = 5
/** Cents ($300 in a single day). */
export const RESTAURANT_DAY_PROFIT_TARGET = 30000
/** At least 90% of the day's customers served, at an average rating of at least 4.2 stars. */
export const RESTAURANT_SERVED_PERCENT = 90
export const RESTAURANT_RATING_TARGET = 4.2

function count(current: number, target: number): GoalProgress {
  return { done: current >= target, current: Math.min(current, target), target }
}

/** Total profit so far: finished days plus the day in progress while service is open. */
function totalProfit(state: GameState): number {
  return state.totals.profit + (state.phase === 'service' ? profitOf(state.today) : 0)
}

/**
 * Restaurant goal 6 judges a finished day, so it can only be done at day end (phase `summary`,
 * which `endDay` sets before it checks the goals). In any other phase it just shows the last
 * day's numbers, so upgrading right after a great stall day does not complete it.
 */
function bestDay(state: GameState): GoalProgress {
  const day = state.lastDay
  const target = RESTAURANT_DAY_PROFIT_TARGET
  if (day === null) return { done: false, current: 0, target, note: 'No day finished yet' }
  const profit = profitOf(day)
  const servedOk = day.customers > 0 && day.served * 100 >= day.customers * RESTAURANT_SERVED_PERCENT
  const rep = reputationOf(state)
  const repOk = rep >= RESTAURANT_RATING_TARGET
  const pct = day.customers === 0 ? 0 : Math.floor((day.served * 100) / day.customers)
  return {
    done: state.phase === 'summary' && profit >= target && servedOk && repOk,
    current: Math.max(0, Math.min(profit, target)),
    target,
    note: `Last day: ${pct}% served (need ${RESTAURANT_SERVED_PERCENT}%), ${(Math.floor(rep * 10 + 1e-9) / 10).toFixed(1)}★ (need ${RESTAURANT_RATING_TARGET.toFixed(1)}★)`,
  }
}

export const GOALS: GoalDef[] = [
  {
    id: 'first-dish',
    tier: 'stall',
    label: 'Serve your first dish',
    unit: 'count',
    check: (s) => count(s.totals.served, 1),
  },
  {
    id: 'serve-100',
    tier: 'stall',
    label: 'Serve 100 dishes in total',
    unit: 'count',
    check: (s) => count(s.totals.served, STALL_SERVE_TARGET),
  },
  {
    id: 'rating-4',
    tier: 'stall',
    label: 'Reach 4.0★ reputation',
    unit: 'stars',
    check: (s) => {
      const rep = reputationOf(s)
      return { done: rep >= STALL_RATING_TARGET, current: Math.min(rep, STALL_RATING_TARGET), target: STALL_RATING_TARGET }
    },
  },
  {
    id: 'profit-300',
    tier: 'stall',
    label: 'Earn $300 total profit',
    unit: 'cents',
    check: (s) => {
      const profit = totalProfit(s)
      return { done: profit >= STALL_PROFIT_TARGET, current: Math.max(0, Math.min(profit, STALL_PROFIT_TARGET)), target: STALL_PROFIT_TARGET }
    },
  },
  {
    id: 'menu-5',
    tier: 'restaurant',
    label: 'Have 5 dishes on the menu',
    unit: 'count',
    check: (s) => count(s.menu.length, RESTAURANT_MENU_TARGET),
  },
  {
    id: 'great-day',
    tier: 'restaurant',
    label: 'Earn $300 in one day, 90% served, at 4.2★',
    unit: 'cents',
    check: bestDay,
  },
]
