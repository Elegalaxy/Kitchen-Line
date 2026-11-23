// Tests for food critics (GAME_DESIGN 9): the critic days and the arrival tick are pure hashes, never
// adjacent, none at the stall or on the upgrade day; the critic arrives without touching the arrivals
// stream, is served first, and a served or lost critic moves reputation by the weighted rating.

import { describe, expect, it } from 'vitest'
import { CRITIC_LOST_WEIGHT, CRITIC_PATIENCE, CRITIC_RATING_WEIGHT, DAY_PHASE_STARTS, RATINGS_KEPT } from './constants.ts'
import { reputationOf, stepCustomers } from './customers.ts'
import { criticArrivalTick, criticDay, criticDish, isCriticDay } from './critic.ts'
import { createGame } from './game.ts'
import { stateHash } from './hash.ts'
import type { Defs, GameState } from './types.ts'

const DEFS = {
  items: {},
  buildings: {},
  stationRecipes: [],
  dishes: {
    fries: { id: 'fries', name: 'Fries', emoji: '', refPrice: 300, popularity: 3, startsUnlocked: true, unlockCost: 0 },
    salad: { id: 'salad', name: 'Salad', emoji: '', refPrice: 450, popularity: 5, startsUnlocked: true, unlockCost: 0 },
  },
} as unknown as Defs

function criticDayOf(seed: string): number {
  for (let d = 2; d < 200; d += 1) if (criticDay(seed, d)) return d
  throw new Error('no critic day')
}

function restaurantOn(day: number): GameState {
  const s = createGame(DEFS, 'demo')
  s.tier = 'restaurant'
  s.day = day
  s.phase = 'service'
  s.menu = [
    { dish: 'fries', price: 300 },
    { dish: 'salad', price: 450 },
  ]
  return s
}

describe('criticDay', () => {
  it('is deterministic, never on day 1 or two days in a row, about one day in six', () => {
    let n = 0
    for (let d = 1; d <= 3000; d += 1) {
      expect(criticDay('demo', d)).toBe(criticDay('demo', d))
      if (criticDay('demo', d)) {
        n += 1
        expect(d).toBeGreaterThan(1)
        expect(criticDay('demo', d - 1)).toBe(false)
        expect(criticDay('demo', d + 1)).toBe(false)
      }
    }
    expect(n / 3000).toBeGreaterThan(0.12)
    expect(n / 3000).toBeLessThan(0.2)
    const a = Array.from({ length: 60 }, (_, i) => criticDay('demo', i + 1))
    const b = Array.from({ length: 60 }, (_, i) => criticDay('other', i + 1))
    expect(a).not.toEqual(b)
  })
  it('arrives inside the dinner rush', () => {
    const from = DAY_PHASE_STARTS.find((p) => p.phase === 'dinnerRush')?.from ?? 0
    for (let d = 1; d < 200; d += 1) {
      const t = criticArrivalTick('demo', d)
      expect(t).toBeGreaterThanOrEqual(from)
      expect(t).toBeLessThan(from + 300)
    }
  })
})

describe('isCriticDay', () => {
  const day = criticDayOf('demo')
  it('is false at the stall and on or before the upgrade day', () => {
    const s = restaurantOn(day)
    expect(isCriticDay(s)).toBe(true)
    s.tier = 'stall'
    expect(isCriticDay(s)).toBe(false)
    s.tier = 'restaurant'
    s.tierDay = day
    expect(isCriticDay(s)).toBe(false)
    s.tierDay = day - 1
    expect(isCriticDay(s)).toBe(true)
  })
  it('picks the highest-popularity menu dish', () => {
    const s = restaurantOn(day)
    expect(criticDish(s, DEFS)).toBe('salad')
    s.menu = [{ dish: 'fries', price: 300 }]
    expect(criticDish(s, DEFS)).toBe('fries')
    s.menu = []
    expect(criticDish(s, DEFS)).toBeNull()
  })
})

/** Run `ticks` service ticks of customer logic from dayTick `from`. */
function run(s: GameState, from: number, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) {
    s.dayTick = from + i
    s.tick = from + i
    stepCustomers(s, DEFS)
  }
}

describe('the critic visit', () => {
  const day = criticDayOf('demo')
  const at = criticArrivalTick('demo', day)

  it('arrives at the hash tick as a critic customer with short patience', () => {
    const s = restaurantOn(day)
    run(s, at, 1)
    const c = s.waiting.find((w) => w.critic === true)
    expect(c).toBeDefined()
    expect(c?.dish).toBe('salad')
    expect(c?.patience).toBe(CRITIC_PATIENCE)
    expect(s.today.customers).toBeGreaterThanOrEqual(1)
  })
  it('does not draw from the arrivals stream', () => {
    // The same day with the critic switched off (tierDay = day): identical arrivals draws up to the critic's tick.
    // (Afterwards only reputation differs, by design: the critic's rating moves the arrival chance.)
    const withCritic = restaurantOn(day)
    const without = restaurantOn(day)
    without.tierDay = day
    for (let i = 0; i <= at; i += 1) {
      withCritic.dayTick = i
      withCritic.tick = i
      stepCustomers(withCritic, DEFS)
      without.dayTick = i
      without.tick = i
      stepCustomers(without, DEFS)
    }
    expect(withCritic.today.critic).toBeUndefined()
    expect(withCritic.waiting.some((w) => w.critic === true)).toBe(true)
    expect(without.waiting.some((w) => w.critic === true)).toBe(false)
    expect(withCritic.rng.arrivals).toEqual(without.rng.arrivals)
  })
  it('has no critic on a normal day or at the stall (same hash as without the critic code path)', () => {
    const plain = restaurantOn(day + 1)
    run(plain, 0, 2400)
    expect(plain.today.critic).toBeUndefined()
    const stall = restaurantOn(day)
    stall.tier = 'stall'
    run(stall, 0, 2400)
    expect(stall.today.critic).toBeUndefined()
    expect(stateHash(stall)).toBe(stateHash(stall))
  })
  it('a served critic counts weighted in reputation', () => {
    const s = restaurantOn(day)
    s.waiting = []
    s.ratings = Array.from({ length: RATINGS_KEPT }, () => 3)
    run(s, at, 1)
    const pass = Object.values(s.buildings).find((x) => x.kind === 'pass')
    if (pass === undefined || pass.kind !== 'pass') throw new Error('no pass')
    pass.shelf = [{ id: 1, type: 'salad', bornTick: 0 }]
    run(s, at + 1, 1)
    expect(s.today.critic).toEqual({ stars: 5, served: true, dish: 'salad' })
    expect(s.ratings.slice(-CRITIC_RATING_WEIGHT)).toEqual(Array(CRITIC_RATING_WEIGHT).fill(5))
    expect(reputationOf(s)).toBeCloseTo((3 * (RATINGS_KEPT - CRITIC_RATING_WEIGHT) + 5 * CRITIC_RATING_WEIGHT) / RATINGS_KEPT, 5)
    expect(s.today.reviews).toHaveLength(1)
  })
  it('the critic is served before an earlier customer who wants the same dish', () => {
    const s = restaurantOn(day)
    s.waiting = [{ id: 7, arriveTick: at - 5, prefs: ['salad'], budget: 900, patience: 500, dish: 'salad', price: 450 }]
    run(s, at, 1)
    const pass = Object.values(s.buildings).find((x) => x.kind === 'pass')
    if (pass === undefined || pass.kind !== 'pass') throw new Error('no pass')
    pass.shelf = [{ id: 1, type: 'salad', bornTick: 0 }]
    run(s, at + 1, 1)
    expect(s.today.critic?.served).toBe(true)
    expect(s.waiting.some((w) => w.id === 7)).toBe(true)
  })
  it('a lost critic rates 1 star counted 3 times', () => {
    const s = restaurantOn(day)
    s.ratings = Array.from({ length: RATINGS_KEPT }, () => 3)
    run(s, at, CRITIC_PATIENCE + 2)
    expect(s.today.critic).toEqual({ stars: 1, served: false, dish: 'salad' })
    expect(s.ratings.slice(-CRITIC_LOST_WEIGHT)).toEqual([1, 1, 1])
    expect(s.today.lostPatience).toBeGreaterThanOrEqual(1)
  })
  it('an empty menu loses the critic at once', () => {
    const s = restaurantOn(day)
    s.menu = []
    run(s, at, 1)
    expect(s.today.critic).toEqual({ stars: 1, served: false, dish: null })
    expect(s.waiting.some((w) => w.critic === true)).toBe(false)
    expect(Object.keys(s.today.byDish)).not.toContain('')
  })
})
