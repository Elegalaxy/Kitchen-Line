// Tests for the Goals panel view helpers (plan Step 16): progress text per unit, bar percent,
// the visible reasons for the upgrade and expansion buttons and the dev cheat states.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { createGame } from '../sim/game.ts'
import { expansionView, goalRows, goalStage, starsFloor, upgradeView, valueText } from './goalsView.ts'
import { applyCheat } from './store.ts'

describe('goalsView', () => {
  it('formats values per unit and cuts stars instead of rounding', () => {
    expect(valueText('count', 63)).toBe('63')
    expect(valueText('cents', 12000)).toBe('$120.00')
    expect(valueText('stars', 3.96)).toBe('3.9★')
    expect(starsFloor(4)).toBe('4.0')
    expect(starsFloor(4.2)).toBe('4.2')
  })

  it('builds rows with progress text and a percent bar', () => {
    const s = createGame(DEFS, 'v')
    s.totals.served = 63
    const rows = goalRows(s, DEFS, 'stall')
    const row = rows.find((r) => r.id === 'serve-100')
    expect(row).toMatchObject({ text: '63 / 100', pct: 63, done: false })
    expect(rows.find((r) => r.id === 'first-dish')).toMatchObject({ text: '1 / 1', pct: 100, done: false })
    s.goalsDone = ['first-dish']
    expect(goalRows(s, DEFS, 'stall').find((r) => r.id === 'first-dish')?.done).toBe(true)
  })

  it('shows goal 5 as dishes at 10+ out of 5 with the best day in the note', () => {
    const s = createGame(DEFS, 'v')
    s.tier = 'restaurant'
    s.phase = 'build'
    s.lastDay = structuredClone(s.today)
    s.lastDay.byDish = { fries: { served: 12, lost: 0, sales: 3600 }, salad: { served: 10, lost: 0, sales: 4500 } }
    const row = goalRows(s, DEFS, 'restaurant').find((r) => r.id === 'menu-5')
    expect(row).toMatchObject({ label: 'Sell 5 different dishes, 10+ of each, in one day', text: '2 / 5', pct: 40, done: false })
    expect(row?.note).toBe('Best day: 2 dishes at 10+ (Fries 12, Salad 10)')
  })

  it('gives the upgrade a visible reason until it is available', () => {
    const s = createGame(DEFS, 'v')
    expect(upgradeView(s, DEFS).reason).toBe('Finish the stall goals first (4 left)')
    const ready = applyCheat(DEFS, s, 'goals')
    expect(upgradeView(ready, DEFS).reason).toBeNull()
    ready.money = 100
    expect(upgradeView(ready, DEFS).reason).toBe('Needs $250.00')
    ready.money = 100000
    ready.phase = 'service'
    expect(upgradeView(ready, DEFS).reason).toMatch(/between days/)
  })

  it('shows the next expansion with its cost and the reason when it is locked', () => {
    const s = createGame(DEFS, 'v')
    s.money = 9999
    expect(expansionView(s, DEFS)).toMatchObject({ size: '8 × 6', nextText: '10 × 8', costText: '$100.00', reason: 'Needs $100.00' })
    s.money = 10000
    expect(expansionView(s, DEFS).reason).toBeNull()
    s.expansion = 1
    expect(expansionView(s, DEFS).reason).toBe('Needs the restaurant tier')
    s.expansion = 4
    expect(expansionView(s, DEFS).next).toBeNull()
  })

  it('cheats reach the goal states and ignore unknown names', () => {
    const s = createGame(DEFS, 'v')
    expect(applyCheat(DEFS, s, 'restaurant').tier).toBe('restaurant')
    const won = applyCheat(DEFS, s, 'won')
    expect(won.phase).toBe('won')
    expect(won.goalsDone).toHaveLength(7)
    expect(applyCheat(DEFS, s, 'nope')).toBe(s)
  })

  it('shows the chain goals once the restaurant end screen was seen', () => {
    const s = createGame(DEFS, 'v')
    expect(goalStage(s, DEFS)).toEqual({ tier: 'stall', label: 'stall' })
    const chain = applyCheat(DEFS, s, 'chain')
    expect(chain.phase).toBe('build')
    expect(chain.won).toBe(true)
    expect(goalStage(chain, DEFS)).toEqual({ tier: 'chain', label: 'chain' })
    const rows = goalRows(chain, DEFS, 'chain')
    expect(rows.map((r) => r.id)).toEqual(['branches-3', 'chain-profit', 'chain-day'])
    expect(rows[0]).toMatchObject({ text: '0 / 3', pct: 0, done: false })
  })
})
