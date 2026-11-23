// Tests for the real goal thresholds (plan 2.5 and Step 16): each goal kind is checked one
// below and exactly at its threshold. Content tests may import sim, so the real DEFS are used.

import { describe, expect, it } from 'vitest'
import { applyCommand } from '../sim/commands.ts'
import { createGame } from '../sim/game.ts'
import type { GameState } from '../sim/types.ts'
import { CHAIN_DAY_TARGET, CHAIN_TOTAL_PROFIT_TARGET, RESTAURANT_TOTAL_PROFIT_TARGET } from './goals.ts'
import { DEFS } from './index.ts'

function goal(id: string) {
  const g = DEFS.goals?.find((x) => x.id === id)
  if (g === undefined) throw new Error(`no goal ${id}`)
  return g
}

function fresh(): GameState {
  return createGame(DEFS, 'goals')
}

describe('goal data', () => {
  it('has four stall goals, three restaurant goals and three chain goals with unique ids', () => {
    const goals = DEFS.goals ?? []
    expect(goals.filter((g) => g.tier === 'stall')).toHaveLength(4)
    expect(goals.filter((g) => g.tier === 'restaurant')).toHaveLength(3)
    expect(goals.filter((g) => g.tier === 'chain').map((g) => g.id)).toEqual(['branches-3', 'chain-profit', 'chain-day'])
    expect(new Set(goals.map((g) => g.id)).size).toBe(goals.length)
  })

  it('has the expansion table from plan 2.5', () => {
    expect((DEFS.expansions ?? []).map((e) => [e.width, e.height, e.cost, e.requiresTier])).toEqual([
      [10, 8, 10000, 'stall'],
      [12, 9, 20000, 'restaurant'],
      [14, 11, 35000, 'restaurant'],
      [16, 12, 50000, 'restaurant'],
    ])
  })
})

describe('stall goals', () => {
  it('serve the first dish: 0 is not done, 1 is', () => {
    const s = fresh()
    expect(goal('first-dish').check(s)).toMatchObject({ done: false, current: 0, target: 1 })
    s.totals.served = 1
    expect(goal('first-dish').check(s)).toMatchObject({ done: true, current: 1, target: 1 })
  })

  it('serve 100 dishes: 99 is not done, 100 is', () => {
    const s = fresh()
    s.totals.served = 99
    expect(goal('serve-100').check(s)).toMatchObject({ done: false, current: 99, target: 100 })
    s.totals.served = 100
    expect(goal('serve-100').check(s)).toMatchObject({ done: true, current: 100, target: 100 })
  })

  it('reach 4.0 stars: an average of 3.98 is not done, 4.0 is', () => {
    const s = fresh()
    s.ratings = [...new Array<number>(49).fill(4), 3] // 199 / 50 = 3.98
    expect(goal('rating-4').check(s).done).toBe(false)
    s.ratings = new Array<number>(50).fill(4)
    expect(goal('rating-4').check(s)).toMatchObject({ done: true, current: 4, target: 4 })
  })

  it('earn $300 total profit: $299.99 is not done, $300.00 is (day in progress counts)', () => {
    const s = fresh()
    s.totals.profit = 29999
    expect(goal('profit-300').check(s)).toMatchObject({ done: false, current: 29999, target: 30000 })
    s.totals.profit = 30000
    expect(goal('profit-300').check(s).done).toBe(true)
    // During service the day in progress is added; outside service it is not (it is in totals).
    const live = fresh()
    live.phase = 'service'
    live.totals.profit = 29000
    live.today.sales = 1500
    live.today.ingredientCost = 501
    expect(goal('profit-300').check(live).done).toBe(false)
    live.today.ingredientCost = 500
    expect(goal('profit-300').check(live).done).toBe(true)
    live.phase = 'summary'
    expect(goal('profit-300').check(live).done).toBe(false)
  })

  it('building spending does not count as profit', () => {
    const s = fresh()
    s.totals.profit = 0
    s.money = 10_000_000
    expect(goal('profit-300').check(s).done).toBe(false)
  })
})

describe('restaurant goals', () => {
  /** Stats of a day in which each listed dish served the given number of customers. */
  function sold(served: Record<string, number>): GameState['today'] {
    const day = fresh().today
    for (const [dish, n] of Object.entries(served)) day.byDish[dish] = { served: n, lost: 0, sales: n * 300 }
    return day
  }
  const FIVE = { fries: 12, salad: 10, soup: 11, riceBowl: 10, sandwich: 14 }

  it('sell 5 different dishes, 10+ of each, in one day: 4 dishes at 10 is not done, 5 is', () => {
    expect(goal('menu-5').label).toBe('Sell 5 different dishes, 10+ of each, in one day')
    const s = fresh()
    s.tier = 'restaurant'
    s.phase = 'service'
    s.today = sold({ ...FIVE, sandwich: 9 }) // the fifth dish is one short
    expect(goal('menu-5').check(s)).toMatchObject({ done: false, current: 4, target: 5 })
    s.today = sold(FIVE)
    expect(goal('menu-5').check(s)).toMatchObject({ done: true, current: 5, target: 5 })
    // Listing 5 dishes on the menu is no longer enough.
    const listed = fresh()
    listed.menu = ['a', 'b', 'c', 'd', 'e'].map((dish) => ({ dish, price: 100 }))
    expect(goal('menu-5').check(listed).done).toBe(false)
  })

  it('goal 5 counts a finished day at day end (summary phase), not just the day in progress', () => {
    const s = fresh()
    s.phase = 'summary'
    s.lastDay = sold(FIVE)
    expect(goal('menu-5').check(s)).toMatchObject({ done: true, current: 5 })
    // Between days (build phase) the last day only shows progress; it does not complete the goal.
    s.phase = 'build'
    expect(goal('menu-5').check(s)).toMatchObject({ done: false, current: 5 })
    // 4 dishes on the last day is not done.
    s.phase = 'summary'
    s.lastDay = sold({ ...FIVE, soup: 3 })
    expect(goal('menu-5').check(s).done).toBe(false)
  })

  it('goal 5 shows the dishes of the best day in its note', () => {
    const s = fresh()
    s.phase = 'build'
    s.lastDay = sold({ fries: 12, riceBowl: 10, salad: 9 })
    expect(goal('menu-5').check(s).note).toBe('Best day: 2 dishes at 10+ (Fries 12, Rice bowl 10)')
    expect(goal('menu-5').check(fresh()).note).toBe('Best day: 0 dishes at 10+')
  })

  /** A finished day (summary phase) with the given customers, served and profit. */
  function dayEnd(customers: number, served: number, profit: number, ratings: number[]): GameState {
    const s = fresh()
    s.phase = 'summary'
    s.tier = 'restaurant'
    s.ratings = ratings
    s.lastDay = { ...s.today, customers, served, sales: profit + 1000, ingredientCost: 1000 }
    return s
  }
  const GOOD = new Array<number>(50).fill(4).map((r, i) => (i < 10 ? 5 : r)) // 210 / 50 = 4.2

  it('$300 in one day at 90% served and 4.2 stars: every threshold at and just below', () => {
    expect(goal('great-day').check(dayEnd(20, 18, 30000, GOOD)).done).toBe(true)
    expect(goal('great-day').check(dayEnd(20, 18, 29999, GOOD)).done).toBe(false)
    expect(goal('great-day').check(dayEnd(20, 17, 30000, GOOD)).done).toBe(false)
    const low = [...GOOD.slice(0, 49), 4 - 1] // 209 / 50 = 4.18
    expect(goal('great-day').check(dayEnd(20, 18, 30000, low)).done).toBe(false)
  })

  it('cannot finish outside the day-end summary phase and is not done with no customers', () => {
    const s = dayEnd(20, 20, 30000, GOOD)
    s.phase = 'service'
    expect(goal('great-day').check(s).done).toBe(false)
    s.phase = 'build'
    expect(goal('great-day').check(s).done).toBe(false)
    expect(goal('great-day').check(dayEnd(0, 0, 30000, GOOD)).done).toBe(false)
    expect(goal('great-day').check(fresh()).done).toBe(false)
  })
})

describe('restaurant goal 7 (restaurant-profit)', () => {
  const T = RESTAURANT_TOTAL_PROFIT_TARGET
  /** A restaurant at day end with `profit` made since the upgrade (and `before` made at the stall). */
  function atDayEnd(profit: number, before = 0): GameState {
    const s = fresh()
    s.tier = 'restaurant'
    s.tierProfitStart = before
    s.totals = { served: 500, profit: before + profit, days: 10 }
    s.phase = 'summary'
    return s
  }

  it('is done at and not just below the target, at day end', () => {
    expect(goal('restaurant-profit').check(atDayEnd(T)).done).toBe(true)
    expect(goal('restaurant-profit').check(atDayEnd(T - 1)).done).toBe(false)
    expect(goal('restaurant-profit').check(atDayEnd(T - 1))).toMatchObject({ current: T - 1, target: T })
  })

  it('only counts profit made after the upgrade', () => {
    expect(goal('restaurant-profit').check(atDayEnd(T - 100, 50000)).done).toBe(false)
    expect(goal('restaurant-profit').check(atDayEnd(T, 50000)).done).toBe(true)
    expect(goal('restaurant-profit').check(atDayEnd(0, 50000)).current).toBe(0)
  })

  it('an old restaurant save without tierProfitStart counts all its profit', () => {
    const s = atDayEnd(0)
    delete s.tierProfitStart
    s.totals.profit = T
    expect(goal('restaurant-profit').check(s).done).toBe(true)
  })

  it('is never done outside the day-end summary phase', () => {
    for (const phase of ['build', 'service', 'won'] as const) {
      const s = atDayEnd(T * 2)
      s.phase = phase
      expect(goal('restaurant-profit').check(s).done, phase).toBe(false)
    }
  })

  it('upgradeTier records the profit made so far', () => {
    const s = fresh()
    s.goalsDone = ['first-dish', 'serve-100', 'rating-4', 'profit-300']
    s.money = 100000
    s.totals = { served: 120, profit: 31234, days: 5 }
    const up = applyCommand(s, DEFS, { type: 'upgradeTier' })
    expect(up.result.ok).toBe(true)
    expect(up.state.tierProfitStart).toBe(31234)
    expect(goal('restaurant-profit').check(up.state)).toMatchObject({ done: false, current: 0 })
  })
})

describe('chain goals', () => {
  function atSummary(mut: (s: GameState) => void): GameState {
    const s = fresh()
    s.phase = 'summary'
    mut(s)
    return s
  }

  it('branches-3 counts the branches opened', () => {
    const s = fresh()
    expect(goal('branches-3').check(s)).toMatchObject({ done: false, current: 0, target: 3 })
    s.branches = [{}, {}] as unknown as GameState['branches']
    expect(goal('branches-3').check(s)).toMatchObject({ done: false, current: 2 })
    s.branches = [{}, {}, {}] as unknown as GameState['branches']
    expect(goal('branches-3').check(s).done).toBe(true)
  })

  it('chain-profit is done at day end once the branches earned the target', () => {
    expect(goal('chain-profit').check(atSummary((s) => (s.chainProfit = CHAIN_TOTAL_PROFIT_TARGET - 1))).done).toBe(false)
    expect(goal('chain-profit').check(atSummary((s) => (s.chainProfit = CHAIN_TOTAL_PROFIT_TARGET))).done).toBe(true)
    for (const phase of ['build', 'service', 'won'] as const) {
      const s = atSummary((x) => (x.chainProfit = CHAIN_TOTAL_PROFIT_TARGET * 2))
      s.phase = phase
      expect(goal('chain-profit').check(s).done, phase).toBe(false)
    }
  })

  it('chain-day adds the flagship profit and the branch nets of the last day, at day end only', () => {
    const day = (net: number, sales: number): GameState['lastDay'] => ({
      ...createGame(DEFS, 'x').today,
      sales,
      ingredientCost: 0,
      branches: [{ id: 1, net, rent: 0 }],
    })
    const below = atSummary((s) => (s.lastDay = day(CHAIN_DAY_TARGET - 1001, 1000)))
    expect(goal('chain-day').check(below).done).toBe(false)
    const exact = atSummary((s) => (s.lastDay = day(CHAIN_DAY_TARGET - 1000, 1000)))
    expect(goal('chain-day').check(exact)).toMatchObject({ done: true, current: CHAIN_DAY_TARGET })
    exact.phase = 'build'
    expect(goal('chain-day').check(exact).done).toBe(false)
    expect(goal('chain-day').check(fresh()).done).toBe(false)
  })
})
