// Tests for the restaurant upgrades (GAME_DESIGN 6.4). Sim tests may not import src/content, so the
// four upgrades are rebuilt here as an inline fixture. Checked: every reject reason of buyUpgrade,
// the purchase (cost, state.upgrades, event), each effect (arrival chance, waiting places, budget,
// patience), that budget and patience scale AFTER the draws (same random stream, same customers),
// and that a game without upgrades has no `upgrades` key.

import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { WAITING_CAP } from './constants.ts'
import { arrivalChance, stepArrivals } from './customers.ts'
import { createGame } from './game.ts'
import { stateHash } from './hash.ts'
import type { Command, Defs, GameState, UpgradeDef } from './types.ts'
import { upgradeEffects, waitingCap } from './upgrades.ts'

const UPGRADES: UpgradeDef[] = [
  { id: 'tables', name: 'Tables', emoji: '', cost: 30000, requiresTier: 'restaurant', effect: { waitingCapBonus: 3 } },
  { id: 'sign', name: 'Sign', emoji: '', cost: 40000, requiresTier: 'restaurant', effect: { arrivalPercent: 15 } },
  { id: 'music', name: 'Music', emoji: '', cost: 30000, requiresTier: 'restaurant', effect: { patiencePercent: 25 } },
  { id: 'plates', name: 'Plates', emoji: '', cost: 60000, requiresTier: 'restaurant', effect: { budgetPercent: 15 } },
]

const DEFS = {
  items: {},
  buildings: {},
  stationRecipes: [],
  dishes: {
    fries: { id: 'fries', name: 'Fries', emoji: '', refPrice: 300, popularity: 3, startsUnlocked: true, unlockCost: 0 },
    salad: { id: 'salad', name: 'Salad', emoji: '', refPrice: 450, popularity: 2, startsUnlocked: true, unlockCost: 0, inputs: ['x'] },
  },
  upgrades: UPGRADES,
} as unknown as Defs

function restaurant(money = 1_000_000): GameState {
  const s = createGame(DEFS, 'upgrades')
  s.tier = 'restaurant'
  s.money = money
  return s
}

function buy(s: GameState, id: string): GameState {
  const out = applyCommand(s, DEFS, { type: 'buyUpgrade', id })
  expect(out.result).toEqual({ ok: true })
  return out.state
}

function expectRejected(s: GameState, cmd: Command, reason: string): void {
  const before = stateHash(s)
  const out = applyCommand(s, DEFS, cmd)
  expect(out.result.ok).toBe(false)
  if (!out.result.ok) expect(out.result.reason).toBe(reason)
  expect(out.state).toBe(s)
  expect(stateHash(s)).toBe(before)
}

describe('buyUpgrade', () => {
  it('charges the cost, records the id and emits upgradeBought', () => {
    const s = restaurant()
    const out = applyCommand(s, DEFS, { type: 'buyUpgrade', id: 'tables' })
    expect(out.result).toEqual({ ok: true })
    expect(out.state.money).toBe(s.money - 30000)
    expect(out.state.upgrades).toEqual(['tables'])
    expect(out.state.events).toContainEqual({ type: 'upgradeBought', tick: 0, id: 'tables', cost: 30000 })
    expect(buy(out.state, 'sign').upgrades).toEqual(['tables', 'sign'])
  })

  it('a game without upgrades has no upgrades key', () => {
    expect('upgrades' in restaurant()).toBe(false)
  })

  it('rejects an unknown id, a wrong phase, the stall tier, an owned upgrade and a poor player', () => {
    expectRejected(restaurant(), { type: 'buyUpgrade', id: 'moat' }, 'invalid command')
    expectRejected(restaurant(), { type: 'buyUpgrade', id: 7 as unknown as string }, 'invalid command')
    for (const phase of ['service', 'summary', 'won'] as const) {
      expectRejected({ ...restaurant(), phase }, { type: 'buyUpgrade', id: 'tables' }, 'wrong phase')
    }
    expectRejected({ ...restaurant(), tier: 'stall' }, { type: 'buyUpgrade', id: 'tables' }, 'locked by tier')
    expectRejected(buy(restaurant(), 'tables'), { type: 'buyUpgrade', id: 'tables' }, 'already owned')
    expectRejected(restaurant(29999), { type: 'buyUpgrade', id: 'tables' }, 'cannot afford')
    expect(buy(restaurant(30000), 'tables').money).toBe(0)
  })
})

describe('effects', () => {
  it('add up and are zero without upgrades', () => {
    expect(upgradeEffects(restaurant(), DEFS)).toEqual({ arrivalPercent: 0, waitingCapBonus: 0, budgetPercent: 0, patiencePercent: 0 })
    let s = restaurant()
    for (const id of ['tables', 'sign', 'music', 'plates']) s = buy(s, id)
    expect(upgradeEffects(s, DEFS)).toEqual({ arrivalPercent: 15, waitingCapBonus: 3, budgetPercent: 15, patiencePercent: 25 })
  })

  it('Street sign: +15% arrival chance', () => {
    const s = restaurant()
    s.dayTick = 300
    const before = arrivalChance(s, DEFS)
    expect(arrivalChance(buy(s, 'sign'), DEFS)).toBeCloseTo(before * 1.15, 12)
    expect(arrivalChance(buy(s, 'tables'), DEFS)).toBe(before)
  })

  it('More tables: +3 waiting places, in the cap and in who gets turned away', () => {
    const s = restaurant()
    expect(waitingCap(s, DEFS)).toBe(WAITING_CAP.restaurant)
    const t = buy(s, 'tables')
    expect(waitingCap(t, DEFS)).toBe(WAITING_CAP.restaurant + 3)
    t.dayTick = 300
    for (let i = 0; i < 30_000; i += 1) {
      t.tick = i
      stepArrivals(t, DEFS)
    }
    expect(t.waiting.length).toBe(WAITING_CAP.restaurant + 3)
  })

  it('Music and Nice plates scale patience and budget after the draws (same customers, same stream)', () => {
    const plain = restaurant()
    const boosted = buy(buy(restaurant(), 'music'), 'plates')
    const draw = (s: GameState): GameState['waiting'] => {
      s.dayTick = 300
      const seen: GameState['waiting'] = []
      for (let i = 0; i < 4000; i += 1) {
        s.tick = i
        s.waiting = []
        stepArrivals(s, DEFS)
        seen.push(...s.waiting)
      }
      return seen
    }
    const a = draw(plain)
    const b = draw(boosted)
    expect(a.length).toBeGreaterThan(20)
    expect(b.length).toBe(a.length)
    expect(boosted.rng.arrivals).toEqual(plain.rng.arrivals)
    for (let i = 0; i < a.length; i += 1) {
      expect(b[i].prefs).toEqual(a[i].prefs)
      expect(b[i].patience).toBe(Math.round((a[i].patience * 125) / 100))
    }
    // Budgets: scaled by 15% (rounded), so never lower and on average about 15% higher.
    const budget = (list: GameState['waiting']): number => list.reduce((n, c) => n + c.budget, 0)
    expect(budget(b) / budget(a)).toBeGreaterThan(1.1)
    expect(budget(b) / budget(a)).toBeLessThan(1.2)
  })
})
