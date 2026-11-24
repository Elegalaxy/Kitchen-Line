// Tests for the season hooks (GAME_DESIGN 9): the pantry charge, the taste pool and weights, the critic's
// choice, the trend pool and the branch night ratio. Without season defs (or with all-100 seasons and no
// seasonal dish) nothing changes: same rng state and same hash.

import { describe, expect, it } from 'vitest'
import { stepArrivals } from './customers.ts'
import { criticDish } from './critic.ts'
import { createGame, newBuilding } from './game.ts'
import { tileIndex } from './grid.ts'
import { stateHash } from './hash.ts'
import { branchNet, nightNoisePercent } from './nights.ts'
import { runTicks } from './tick.ts'
import { trendCandidates } from './trend.ts'
import type { Branch, BuildingDef, BuildingKind, Defs, DishDef, GameState, SeasonDef } from './types.ts'

function bd(kind: BuildingKind, cost: number): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true }
}

const dish = (id: string, extra: Partial<DishDef> = {}): DishDef => ({
  id,
  name: id,
  emoji: '',
  refPrice: 500,
  popularity: 3,
  startsUnlocked: true,
  unlockCost: 0,
  ...extra,
})

const season = (id: string, extra: Partial<SeasonDef> = {}): SeasonDef => ({
  id,
  name: id,
  emoji: '',
  costPercent: {},
  tastePercent: {},
  branchPercent: 100,
  ...extra,
})

const SEASONS: SeasonDef[] = [
  season('spring'),
  season('summer', { costPercent: { tomato: 75 }, tastePercent: { salad: 150 }, branchPercent: 105 }),
  season('autumn'),
  season('winter', { branchPercent: 95 }),
]

const BASE: Defs = {
  items: { tomato: { id: 'tomato', name: 'Tomato', emoji: '', kind: 'raw', cost: 40 } },
  buildings: { belt: bd('belt', 100), pantry: bd('pantry', 1000), pass: bd('pass', 0) } as Defs['buildings'],
  stationRecipes: [],
  dishes: {
    fries: dish('fries'),
    salad: dish('salad'),
    soup: dish('soup'),
    burger: dish('burger'),
    fishTaco: dish('fishTaco', { startsUnlocked: false, requiresTier: 'restaurant', season: 'summer', popularity: 5 }),
  },
}
const WITH: Defs = { ...BASE, seasons: SEASONS }

const SUMMER = 8
const WINTER = 22

function restaurant(defs: Defs, day: number): GameState {
  const s = createGame(defs, 'demo')
  s.tier = 'restaurant'
  s.day = day
  s.phase = 'service'
  s.unlocked = [...s.unlocked, 'fishTaco']
  return s
}

/** One pantry facing a belt at the middle of the grid; the first emit happens on tick 0. */
function pantryLine(defs: Defs, tier: 'stall' | 'restaurant', day: number): GameState {
  const s = createGame(defs, 'test')
  s.tier = tier
  s.day = day
  s.width = 9
  s.height = 9
  s.tiles = new Array<number | null>(81).fill(null)
  s.buildings = {}
  s.nextId = 1
  for (const [kind, x] of [['pantry', 4], ['belt', 5]] as const) {
    const bld = newBuilding(kind, s.nextId++, x, 4, 1, 0, { ingredient: 'tomato' })
    s.buildings[bld.id] = bld
    s.tiles[tileIndex(s, x, 4)] = bld.id
  }
  s.phase = 'service'
  return s
}

/** Liked dishes of `n` arrivals, with a fresh waiting list each time (the trend test pattern). */
function drawn(s: GameState, defs: Defs, n: number): Set<string> {
  const seen = new Set<string>()
  for (let i = 0; i < n; i += 1) {
    s.tick = i
    s.dayTick = 0
    s.waiting = []
    stepArrivals(s, defs)
    for (const p of s.waiting[0]?.prefs ?? []) seen.add(p)
  }
  return seen
}

describe('pantry charge', () => {
  it('charges the season price at the restaurant (summer tomato 30) and the base price at the stall (40)', () => {
    const rest = runTicks(pantryLine(WITH, 'restaurant', SUMMER), WITH, 1)
    expect(rest.today.ingredientCost).toBe(30)
    const stall = runTicks(pantryLine(WITH, 'stall', SUMMER), WITH, 1)
    expect(stall.today.ingredientCost).toBe(40)
    const none = runTicks(pantryLine(BASE, 'restaurant', SUMMER), BASE, 1)
    expect(none.today.ingredientCost).toBe(40)
  })
})

describe('taste pool', () => {
  it('never draws an unlocked seasonal dish out of season, and draws it in season', () => {
    expect(drawn(restaurant(WITH, WINTER), WITH, 3000).has('fishTaco')).toBe(false)
    expect(drawn(restaurant(WITH, SUMMER), WITH, 3000).has('fishTaco')).toBe(true)
  })
  it('draw count and order are unchanged: the arrivals rng state matches with and without seasons', () => {
    // 4 non-seasonal dishes keep the pool above PREFS_MAX in every season, so only weights and members differ.
    for (const day of [1, SUMMER, 15, WINTER]) {
      const a = restaurant(BASE, day)
      const b = restaurant(WITH, day)
      drawn(a, BASE, 1500)
      drawn(b, WITH, 1500)
      expect(JSON.stringify(b.rng.arrivals), `day ${day}`).toBe(JSON.stringify(a.rng.arrivals))
    }
  })
  it('without seasonal effects the hash is unchanged', () => {
    const NEUTRAL: Defs = {
      ...BASE,
      dishes: { ...BASE.dishes, fishTaco: dish('fishTaco', { startsUnlocked: false, requiresTier: 'restaurant', popularity: 5 }) },
    }
    const flat: Defs = { ...NEUTRAL, seasons: ['spring', 'summer', 'autumn', 'winter'].map((id) => season(id)) }
    const a = restaurant(NEUTRAL, SUMMER)
    const b = restaurant(flat, SUMMER)
    drawn(a, NEUTRAL, 800)
    drawn(b, flat, 800)
    expect(stateHash(b)).toBe(stateHash(a))
  })
})

describe('trend pool and critic', () => {
  it('leaves a seasonal dish out of the trend pool off season', () => {
    expect(trendCandidates(restaurant(WITH, WINTER), WITH)).not.toContain('fishTaco')
    expect(trendCandidates(restaurant(WITH, SUMMER), WITH)).toContain('fishTaco')
    expect(trendCandidates(restaurant(WITH, WINTER), WITH, SUMMER)).toContain('fishTaco')
    expect(trendCandidates(restaurant(BASE, WINTER), BASE)).toContain('fishTaco')
  })
  it('skips an out-of-season dish when the critic picks', () => {
    const s = restaurant(WITH, WINTER)
    s.menu = [
      { dish: 'fishTaco', price: 500 },
      { dish: 'fries', price: 300 },
    ]
    expect(criticDish(s, WITH)).toBe('fries')
    s.day = SUMMER
    expect(criticDish(s, WITH)).toBe('fishTaco')
    s.day = WINTER
    s.menu = [{ dish: 'fishTaco', price: 500 }]
    expect(criticDish(s, WITH)).toBeNull()
  })
})

describe('branch night season ratio', () => {
  const branch = { id: 1, areaId: 'none', blueprintDay: WINTER, expected: { profit: 10000, sales: 0, served: 0, customers: 0 } } as unknown as Branch

  it('scales by the night season over the test-day season (tested in winter, night in spring: x100/95)', () => {
    const noise = nightNoisePercent('demo', 1, 1)
    expect(branchNet('demo', branch, 1, WITH)).toBe(Math.round((10000 * noise * 100) / (100 * 95)))
    expect(branchNet('demo', branch, 1, WITH)).toBeGreaterThan(Math.round((10000 * noise) / 100))
  })
  it('keeps the plain expression for equal percents and without seasons', () => {
    const noise = nightNoisePercent('demo', 1, 23)
    expect(branchNet('demo', branch, 23, WITH)).toBe(Math.round((10000 * noise) / 100))
    expect(branchNet('demo', branch, 1, BASE)).toBe(Math.round((10000 * nightNoisePercent('demo', 1, 1)) / 100))
  })
})
