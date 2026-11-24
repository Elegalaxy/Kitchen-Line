// Tests for the franchise view helper (GAME_DESIGN 8.2).

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { emptyMeta, franchisePoints } from '../sim/franchise.ts'
import type { MetaState } from '../sim/types.ts'
import { franchiseView } from './franchiseView.ts'
import { applyCheat, newGameState } from './store.ts'

const won = applyCheat(DEFS, newGameState(DEFS, 'friesSaladLine'), 'chainwon')
const fp = franchisePoints(won).total

describe('franchiseView', () => {
  it('lists the four point parts and the balance', () => {
    const v = franchiseView(won, emptyMeta(), DEFS, [])
    expect(v.rows.map((r) => r.id)).toEqual(['chain', 'earnings', 'speed', 'reputation'])
    expect(v.rows[0].text).toBe('+10')
    expect(v.earned).toBe(fp)
    expect(v.left).toBe(fp)
    expect(v.nextRun).toBe(2)
    expect(v.startLabel).toBe('Sell chain and start run 2')
    expect(v.blocked).toBeNull()
  })

  it('builds a card per perk with level, next cost and next effect', () => {
    const v = franchiseView(won, emptyMeta(), DEFS, [])
    const seed = v.cards.find((c) => c.id === 'seedMoney')
    expect(seed).toMatchObject({ level: 0, maxLevel: 3, nextCost: 6, canBuy: true, reason: null, levelText: 'Level 0 / 3' })
    expect(seed?.nextEffect).toBe('+$250.00 start cash')
    expect(seed?.currentEffect).toBe('None yet')
    expect(v.cards.find((c) => c.id === 'biggerStall')?.nextEffect).toContain('10 × 8')
  })

  it('picks spend points, raise the shown level and the next cost', () => {
    const v = franchiseView(won, emptyMeta(), DEFS, ['seedMoney'])
    const seed = v.cards.find((c) => c.id === 'seedMoney')
    expect(v.spent).toBe(6)
    expect(v.left).toBe(fp - 6)
    expect(seed).toMatchObject({ level: 1, pending: 1, nextCost: 9 })
    expect(v.kept).toContain(`Points left: ${fp - 6}`)
    expect(v.kept.some((k) => k.includes('Seed money level 1'))).toBe(true)
  })

  it('disables Buy with a reason when points run out or the perk is maxed', () => {
    const poor = franchiseView(won, { ...emptyMeta(), points: 0 }, DEFS, ['biggerStall', 'biggerStall'])
    const big = poor.cards.find((c) => c.id === 'biggerStall')
    expect(big?.canBuy).toBe(false)
    expect(big?.reason).toBe('Top level reached')
    expect(big?.levelText).toBe('Maxed (1 / 1)')
    expect(big?.nextEffect).toBeNull()
    const all = franchiseView(won, emptyMeta(), DEFS, ['biggerStall', 'seedMoney', 'seedMoney', 'seedMoney', 'goodName'])
    const good = all.cards.find((c) => c.id === 'goodName')
    if (!good?.canBuy) expect(good?.reason).toMatch(/^Needs \d+ more points$/)
  })

  it('reports the recipe book after this franchise and flags a duplicate or unbuilt chain', () => {
    const v = franchiseView(won, emptyMeta(), DEFS, [])
    expect(v.bookNames.length).toBeGreaterThan(0)
    expect(v.bookText).toMatch(/^Recipe book: \d+ dishes?$/)
    const done: MetaState = { ...emptyMeta(), runsCompleted: 1, history: [{ run: 1, seed: won.seed, days: 1, profit: 0, chainProfit: 0, points: 1 }] }
    expect(franchiseView(won, done, DEFS, []).blocked).toBe('This run is already franchised')
    expect(franchiseView(newGameState(DEFS, null), emptyMeta(), DEFS, []).blocked).toBe('Build the chain first')
    expect(franchiseView(won, done, DEFS, []).nextRun).toBe(3)
  })
})
