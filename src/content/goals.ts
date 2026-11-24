// Milestone goals (plan 2.5, GAME_DESIGN 8). Goals are data: `check` reads the state and
// returns progress; the sim records a goal as done the first time `check(...).done` is true
// (sim/goals.ts). Thresholds are provisional. Profit counts sales minus ingredient cost
// (building and expansion spending is excluded). Totals only grow at day end, so the profit
// of a day in progress is added while service is open.

import { BRANCH_MAX, GOAL_DISH_SALES } from '../sim/constants.ts'
import { reputationOf } from '../sim/customers.ts'
import { profitOf } from '../sim/economy.ts'
import type { DayStats, GameState, GoalDef, GoalProgress } from '../sim/types.ts'

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
/**
 * Restaurant goal 7 (GAME_DESIGN 8): profit made at the restaurant tier, in cents ($5,000). Provisional; tuned
 * with the restaurant upgrades so the journey ends around day 17 to 20 (plan 2026-11-23-restaurant-growth).
 */
export const RESTAURANT_TOTAL_PROFIT_TARGET = 500000

/** Chain goals (GAME_DESIGN 8.1, provisional): branches earn this much net in total, in cents ($5,000). */
export const CHAIN_TOTAL_PROFIT_TARGET = 500000
/** Cents ($1,000 in one day: flagship profit plus the branch nets of that day). Was $1,200: three of 20 journey seeds then needed 40+ days (plan 2026-11-24-chain, steps 7/8). */
export const CHAIN_DAY_TARGET = 100000

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

/** Dishes that served at least GOAL_DISH_SALES customers in `day` (most served first), as [dish id, served]. */
function bigSellers(day: DayStats): [string, number][] {
  return Object.entries(day.byDish)
    .map(([dish, v]): [string, number] => [dish, v.served])
    .filter(([, served]) => served >= GOAL_DISH_SALES)
    .sort((a, b) => b[1] - a[1])
}

/** "riceBowl" -> "Rice bowl". */
function dishLabel(id: string): string {
  const words = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Restaurant goal 5: RESTAURANT_MENU_TARGET different dishes with GOAL_DISH_SALES or more served each, in ONE
 * day. The day in progress counts as it happens; a finished day counts at day end only (phase `summary`, like
 * bestDay), so a day that ended before the check is not lost. The row shows the better of today and the last day.
 */
function dishSales(state: GameState): GoalProgress {
  const target = RESTAURANT_MENU_TARGET
  const today = bigSellers(state.today)
  const last = state.lastDay === null ? [] : bigSellers(state.lastDay)
  const best = today.length >= last.length ? today : last
  const done = today.length >= target || (state.phase === 'summary' && last.length >= target)
  const sold = best.map(([dish, n]) => `${dishLabel(dish)} ${n}`).join(', ')
  return {
    done,
    current: Math.min(best.length, target),
    target,
    note: `Best day: ${best.length} dishes at ${GOAL_DISH_SALES}+${sold === '' ? '' : ` (${sold})`}`,
  }
}

/**
 * Restaurant goal 7: profit since the upgrade to restaurant (`tierProfitStart`; an old restaurant save without
 * it counts all its profit). Like goals 5 and 6 it is only DONE at day end (phase `summary`), so the end screen
 * never appears in the middle of a service day; the row still shows the day in progress while service is open.
 */
function restaurantProfit(state: GameState): GoalProgress {
  const target = RESTAURANT_TOTAL_PROFIT_TARGET
  const profit = totalProfit(state) - (state.tierProfitStart ?? 0)
  return {
    done: state.phase === 'summary' && profit >= target,
    current: Math.max(0, Math.min(profit, target)),
    target,
  }
}

/** Chain goal 1: branches opened. Done at once (a command re-checks the goals). */
function branchCount(state: GameState): GoalProgress {
  return count(state.branches?.length ?? 0, BRANCH_MAX)
}

/**
 * Chain goal 2: net earned by the branches in total (`chainProfit`). Like restaurant goal 7 it is only DONE at
 * day end (phase `summary`), so the end screen never appears in the middle of a service day.
 */
function chainProfit(state: GameState): GoalProgress {
  const target = CHAIN_TOTAL_PROFIT_TARGET
  const profit = state.chainProfit ?? 0
  return { done: state.phase === 'summary' && profit >= target, current: Math.max(0, Math.min(profit, target)), target }
}

/** Chain goal 3: the last finished day's profit at the flagship plus the branch nets of that day; judged at day end only. */
function chainDay(state: GameState): GoalProgress {
  const target = CHAIN_DAY_TARGET
  const day = state.lastDay
  if (day === null) return { done: false, current: 0, target, note: 'No day finished yet' }
  const branchNet = (day.branches ?? []).reduce((sum, b) => sum + b.net, 0)
  const total = profitOf(day) + branchNet
  return {
    done: state.phase === 'summary' && total >= target,
    current: Math.max(0, Math.min(total, target)),
    target,
    note: `Last day: ${dollars(Math.max(0, profitOf(day)))} at the restaurant, ${dollars(Math.max(0, branchNet))} from the branches`,
  }
}

const dollars = (cents: number): string => `$${(cents / 100).toLocaleString('en-US')}`

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
    id: 'menu-5', // id kept from the old 'have 5 dishes' goal so saves with it in goalsDone still load
    tier: 'restaurant',
    label: 'Sell 5 different dishes, 10+ of each, in one day',
    unit: 'count',
    check: dishSales,
  },
  {
    id: 'great-day',
    tier: 'restaurant',
    label: 'Earn $300 in one day, 90% served, at 4.2★',
    unit: 'cents',
    check: bestDay,
  },
  {
    id: 'restaurant-profit',
    tier: 'restaurant',
    label: `Earn ${dollars(RESTAURANT_TOTAL_PROFIT_TARGET)} profit as a restaurant`,
    unit: 'cents',
    check: restaurantProfit,
  },
  {
    id: 'branches-3',
    tier: 'chain',
    label: `Open ${BRANCH_MAX} branches`,
    unit: 'count',
    check: branchCount,
  },
  {
    id: 'chain-profit',
    tier: 'chain',
    label: `Earn ${dollars(CHAIN_TOTAL_PROFIT_TARGET)} net from the branches`,
    unit: 'cents',
    check: chainProfit,
  },
  {
    id: 'chain-day',
    tier: 'chain',
    label: `Earn ${dollars(CHAIN_DAY_TARGET)} in one day across the chain`,
    unit: 'cents',
    check: chainDay,
  },
]
