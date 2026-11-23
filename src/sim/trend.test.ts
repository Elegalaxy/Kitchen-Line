// Tests for daily trends (GAME_DESIGN 9): the pick is deterministic and hash based, the stall has no
// trend, the trend dish is drawn more often at the restaurant tier, and a stall run is byte-identical
// to a run where the trend code does not apply (same hash with and without a trend pool).

import { describe, expect, it } from 'vitest'
import { TREND_MIN_CANDIDATES } from './constants.ts'
import { stepArrivals } from './customers.ts'
import { createGame } from './game.ts'
import { stateHash } from './hash.ts'
import { currentTrend, trendCandidates, trendFor } from './trend.ts'
import type { Defs, GameState } from './types.ts'

const DEFS = {
  items: {},
  buildings: {},
  stationRecipes: [],
  dishes: {
    fries: { id: 'fries', name: 'Fries', emoji: '', refPrice: 300, popularity: 3, startsUnlocked: true, unlockCost: 0 },
    salad: { id: 'salad', name: 'Salad', emoji: '', refPrice: 450, popularity: 3, startsUnlocked: true, unlockCost: 0 },
    soup: { id: 'soup', name: 'Soup', emoji: '', refPrice: 500, popularity: 3, startsUnlocked: true, unlockCost: 0 },
    burger: { id: 'burger', name: 'Burger', emoji: '', refPrice: 800, popularity: 3, startsUnlocked: false, unlockCost: 8000 },
  },
} as unknown as Defs

describe('trendFor', () => {
  it('is deterministic for the same seed, day and candidates', () => {
    const c = ['fries', 'salad', 'soup']
    expect(trendFor('demo', 4, c)).toBe(trendFor('demo', 4, c))
  })
  it('returns a candidate and varies over days and seeds', () => {
    const c = ['fries', 'salad', 'soup']
    const seen = new Set<string | null>()
    for (let day = 1; day <= 30; day += 1) {
      const t = trendFor('demo', day, c)
      expect(c).toContain(t)
      seen.add(t)
    }
    expect(seen.size).toBe(3)
    const other = Array.from({ length: 30 }, (_, i) => trendFor('other', i + 1, c))
    const same = Array.from({ length: 30 }, (_, i) => trendFor('demo', i + 1, c))
    expect(other).not.toEqual(same)
  })
  it('needs enough candidates', () => {
    expect(TREND_MIN_CANDIDATES).toBe(2)
    expect(trendFor('demo', 1, [])).toBeNull()
    expect(trendFor('demo', 1, ['fries'])).toBeNull()
  })
})

describe('currentTrend', () => {
  it('is null at the stall and uses unlocked dishes at the restaurant', () => {
    const s = createGame(DEFS, 'demo')
    expect(trendCandidates(s, DEFS)).toEqual(['fries', 'salad', 'soup'])
    expect(currentTrend(s, DEFS)).toBeNull()
    s.tier = 'restaurant'
    const t = currentTrend(s, DEFS)
    expect(['fries', 'salad', 'soup']).toContain(t)
    s.unlocked = ['fries']
    expect(currentTrend(s, DEFS)).toBeNull()
  })
})

/** Share of arriving customers whose first taste is `dish`, over many arrivals. */
function firstChoiceShare(tier: 'stall' | 'restaurant', dish: string, day: number): { share: number; hash: string } {
  const s: GameState = createGame(DEFS, 'demo')
  s.tier = tier
  s.day = day
  s.phase = 'service'
  s.menu = ['fries', 'salad', 'soup'].map((d) => ({ dish: d, price: DEFS.dishes[d].refPrice }))
  let n = 0
  let hits = 0
  for (let i = 0; i < 40000; i += 1) {
    s.tick = i
    s.dayTick = 0
    s.waiting = []
    stepArrivals(s, DEFS)
    const c = s.waiting[0]
    if (c !== undefined) {
      n += 1
      if (c.prefs.includes(dish)) hits += 1
    }
  }
  return { share: hits / n, hash: stateHash({ ...s, day: 0 }) }
}

describe('trend weighting', () => {
  const day = 3
  const s = createGame(DEFS, 'demo')
  s.tier = 'restaurant'
  s.day = day
  const trend = currentTrend(s, DEFS) as string

  it('makes the trend dish liked by more customers than at the stall', () => {
    const rest = firstChoiceShare('restaurant', trend, day)
    const stall = firstChoiceShare('stall', trend, day)
    expect(rest.share).toBeGreaterThan(stall.share + 0.03)
  })
  it('does not change the stall: the run is identical whatever the day (day field aside)', () => {
    expect(firstChoiceShare('stall', trend, 3).hash).toBe(firstChoiceShare('stall', trend, 9).hash)
  })
})
