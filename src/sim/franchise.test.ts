// Tests for franchise prestige (GAME_DESIGN 8.2): points and their caps on hand-made states, the
// guards of canFranchise / recordFranchise, perk buying, the recipe book (stall dishes only), seed
// naming and createRun (empty meta equals createGame; perks change the starting state only).

import { describe, expect, it } from 'vitest'
import { DEFS as BASE } from './chainKit.ts'
import {
  applyFranchiseStart,
  buyPerk,
  canFranchise,
  createRun,
  emptyMeta,
  franchisePoints,
  perkCost,
  recordFranchise,
  runSeed,
} from './franchise.ts'
import { createGame } from './game.ts'
import { stateHash } from './hash.ts'
import type { Defs, GameState, MetaState } from './types.ts'

const DEFS: Defs = {
  ...BASE,
  dishes: {
    ...BASE.dishes,
    salad: { id: 'salad', name: 'Salad', emoji: '', refPrice: 450, popularity: 2, startsUnlocked: false, unlockCost: 1000 },
    fish: { id: 'fish', name: 'Fish', emoji: '', refPrice: 800, popularity: 2, startsUnlocked: false, unlockCost: 2000, requiresTier: 'restaurant' },
  },
  expansions: [
    { width: 10, height: 8, cost: 10000, requiresTier: 'stall' },
    { width: 12, height: 9, cost: 20000, requiresTier: 'restaurant' },
  ],
  perks: [
    { id: 'seedMoney', name: 'Seed', emoji: '', costs: [6, 9, 12], effect: { startMoney: 25000 } },
    { id: 'goodName', name: 'Name', emoji: '', costs: [5, 8], effect: { goodRatings: 4 } },
    { id: 'biggerStall', name: 'Bigger', emoji: '', costs: [10], effect: { startExpansion: 1 } },
  ],
}

function won(over: Partial<GameState> = {}): GameState {
  const s = createGame(DEFS, 'kitchen-line')
  s.chainWon = true
  s.won = true
  s.phase = 'build'
  return Object.assign(s, over)
}

function meta(over: Partial<MetaState> = {}): MetaState {
  return { ...emptyMeta(), ...over }
}

const part = (s: GameState, id: string): number => franchisePoints(s).parts.find((p) => p.id === id)?.points ?? -1

describe('franchisePoints', () => {
  it('a typical run: chain 10, earnings 1 per $1,000, speed, reputation', () => {
    const s = won({ totals: { served: 900, profit: 1_200_000, days: 31 }, chainProfit: 1_800_000 })
    s.ratings = new Array<number>(10).fill(4)
    expect(part(s, 'chain')).toBe(10)
    expect(part(s, 'earnings')).toBe(25)
    expect(part(s, 'speed')).toBe(9)
    expect(part(s, 'reputation')).toBe(2)
    expect(franchisePoints(s).total).toBe(10 + 25 + 9 + 2)
  })

  it('earnings count whole $1,000 of profit plus chain profit', () => {
    const s = won({ totals: { served: 0, profit: 600_000, days: 50 }, chainProfit: 650_000 })
    expect(part(s, 'earnings')).toBe(12)
  })

  it('caps: earnings 25, speed 10, a perfect run is 49', () => {
    const s = won({ totals: { served: 0, profit: 99_000_000, days: 1 }, chainProfit: 5_000_000 })
    s.ratings = new Array<number>(10).fill(5)
    expect(part(s, 'earnings')).toBe(25)
    expect(part(s, 'speed')).toBe(10)
    expect(part(s, 'reputation')).toBe(4)
    expect(franchisePoints(s).total).toBe(49)
  })

  it('floors: no negative parts, nothing for the chain before it is built', () => {
    const s = won({ totals: { served: 0, profit: -500_000, days: 90 } })
    delete s.chainWon
    s.ratings = new Array<number>(10).fill(2)
    expect(franchisePoints(s).total).toBe(0)
    expect(franchisePoints(s).parts.map((p) => p.id)).toEqual(['chain', 'earnings', 'speed', 'reputation'])
  })

  it('reputation counts only full stars above 3', () => {
    const s = won()
    s.ratings = [4, 4, 4, 4, 4, 4, 4, 4, 4, 3] // 3.9
    expect(part(s, 'reputation')).toBe(0)
    s.ratings = [5, 5, 5, 5, 5, 5, 5, 5, 4, 4] // 4.8
    expect(part(s, 'reputation')).toBe(2)
  })
})

describe('canFranchise / recordFranchise', () => {
  it('needs chainWon and the build or won phase', () => {
    expect(canFranchise(won())).toBe(true)
    expect(canFranchise(won({ phase: 'won' }))).toBe(true)
    expect(canFranchise(won({ phase: 'service' }))).toBe(false)
    expect(canFranchise(won({ phase: 'summary' }))).toBe(false)
    const s = won()
    delete s.chainWon
    expect(canFranchise(s)).toBe(false)
  })

  it('books points, history and the run counter', () => {
    const s = won({ totals: { served: 0, profit: 300_000, days: 35 } })
    const r = recordFranchise(emptyMeta(), s, DEFS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const pts = franchisePoints(s).total
    expect(r.meta.points).toBe(pts)
    expect(r.meta.runsCompleted).toBe(1)
    expect(r.meta.history).toEqual([{ run: 1, seed: 'kitchen-line', days: 35, profit: 300_000, chainProfit: 0, points: pts }])
  })

  it('refuses an unfinished chain and a duplicate seed', () => {
    const s = won()
    delete s.chainWon
    expect(recordFranchise(emptyMeta(), s, DEFS)).toEqual({ ok: false, reason: 'chain not built yet' })
    const first = recordFranchise(emptyMeta(), won(), DEFS)
    if (!first.ok) throw new Error('first franchise refused')
    const again = recordFranchise(first.meta, won(), DEFS)
    expect(again.ok).toBe(false)
  })

  it('the recipe book keeps stall dishes and drops restaurant-tier ones', () => {
    const s = won()
    s.unlocked = ['fries', 'salad', 'fish']
    const r = recordFranchise(meta({ recipeBook: ['fries'] }), s, DEFS)
    if (!r.ok) throw new Error('refused')
    expect(r.meta.recipeBook).toEqual(['fries', 'salad'])
  })

  it('the history keeps the newest 100 runs', () => {
    const history = Array.from({ length: 100 }, (_, i) => ({ run: i + 1, seed: `s${i}`, days: 30, profit: 0, chainProfit: 0, points: 1 }))
    const r = recordFranchise(meta({ runsCompleted: 100, history }), won(), DEFS)
    if (!r.ok) throw new Error('refused')
    expect(r.meta.history).toHaveLength(100)
    expect(r.meta.history[0]?.run).toBe(2)
    expect(r.meta.history[99]?.run).toBe(101)
  })
})

describe('perks', () => {
  it('buys level by level, spending points', () => {
    let m = meta({ points: 30 })
    expect(perkCost(m, DEFS, 'seedMoney')).toBe(6)
    for (const cost of [6, 9, 12]) {
      const r = buyPerk(m, DEFS, 'seedMoney')
      if (!r.ok) throw new Error(r.reason)
      expect(m.points - r.meta.points).toBe(cost)
      m = r.meta
    }
    expect(m.perks['seedMoney']).toBe(3)
    expect(m.points).toBe(3)
  })

  it('refuses past the top level, without enough points and for unknown perks', () => {
    expect(buyPerk(meta({ points: 99, perks: { biggerStall: 1 } }), DEFS, 'biggerStall')).toEqual({ ok: false, reason: 'already at the top level' })
    expect(perkCost(meta({ perks: { biggerStall: 1 } }), DEFS, 'biggerStall')).toBeNull()
    expect(buyPerk(meta({ points: 9 }), DEFS, 'biggerStall')).toEqual({ ok: false, reason: 'needs 10 points' })
    expect(buyPerk(meta({ points: 99 }), DEFS, 'nope')).toEqual({ ok: false, reason: 'unknown perk' })
  })

  it('does not mutate the meta it was given', () => {
    const m = meta({ points: 20 })
    buyPerk(m, DEFS, 'goodName')
    expect(m).toEqual(meta({ points: 20 }))
  })
})

describe('runSeed / createRun', () => {
  it('names seeds: run 1 is the base, run N adds -runN', () => {
    expect(runSeed('kitchen-line', 1)).toBe('kitchen-line')
    expect(runSeed('kitchen-line', 2)).toBe('kitchen-line-run2')
    expect(runSeed('kitchen-line', 11)).toBe('kitchen-line-run11')
  })

  it('an empty meta gives exactly createGame (same stateHash)', () => {
    expect(stateHash(createRun(DEFS, 'kitchen-line', emptyMeta()))).toBe(stateHash(createGame(DEFS, 'kitchen-line')))
  })

  it('uses the seed of the next run', () => {
    expect(createRun(DEFS, 'kitchen-line', meta({ runsCompleted: 1 })).seed).toBe('kitchen-line-run2')
  })

  it('Seed money adds $250 a level', () => {
    expect(createRun(DEFS, 'k', meta({ perks: { seedMoney: 1 } })).money).toBe(40000)
    expect(createRun(DEFS, 'k', meta({ perks: { seedMoney: 3 } })).money).toBe(90000)
  })

  it('Good name turns 4 then 8 starting ratings into 4 stars', () => {
    const r1 = createRun(DEFS, 'k', meta({ perks: { goodName: 1 } }))
    expect(r1.ratings.filter((r) => r === 4)).toHaveLength(4)
    expect(r1.repAtDayStart).toBeCloseTo(3.4)
    const r2 = createRun(DEFS, 'k', meta({ perks: { goodName: 2 } }))
    expect(r2.repAtDayStart).toBeCloseTo(3.8)
  })

  it('Bigger stall gives 10 x 8 with the buildings in place and the money unchanged', () => {
    const base = createGame(DEFS, 'k')
    const s = createRun(DEFS, 'k', meta({ perks: { biggerStall: 1 } }))
    expect([s.width, s.height, s.expansion]).toEqual([10, 8, 1])
    expect(s.tiles).toHaveLength(80)
    expect(s.money).toBe(base.money)
    for (const b of Object.values(s.buildings)) expect(s.tiles[b.y * s.width + b.x]).toBe(b.id)
  })

  it('book dishes start unlocked; restaurant-tier and unknown ids are ignored; events are cleared', () => {
    const s = createRun(DEFS, 'k', meta({ recipeBook: ['fries', 'salad', 'fish', 'ghost'] }))
    expect(s.unlocked).toEqual(['fries', 'salad'])
    expect(s.events).toEqual([])
  })

  it('applyFranchiseStart ignores levels past the perk top', () => {
    const s = createGame(DEFS, 'k')
    applyFranchiseStart(s, DEFS, meta({ perks: { seedMoney: 9 } }))
    expect(s.money).toBe(15000 + 3 * 25000)
  })
})
