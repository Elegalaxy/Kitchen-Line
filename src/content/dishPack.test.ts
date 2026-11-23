// Dish pack tests (GAME_DESIGN 5.4, 6.2): the two restaurant-tier dishes unlock only at the restaurant
// tier, customers want them only there and only once unlocked, stall draws are identical to a content set
// without them, trends and saves cope with them. Uses the real DEFS.

import { describe, expect, it } from 'vitest'
import { applyCommand } from '../sim/commands.ts'
import { stepArrivals } from '../sim/customers.ts'
import { createGame } from '../sim/game.ts'
import { stateHash } from '../sim/hash.ts'
import { runTicks } from '../sim/tick.ts'
import { trendCandidates } from '../sim/trend.ts'
import type { Defs, GameState } from '../sim/types.ts'
import { DEFS } from './index.ts'

const NEW_DISHES = ['fishAndChips', 'cheeseburger']

/** The same content without the two dish-pack dishes (the pre-pack definitions). */
function oldDefs(): Defs {
  const dishes = Object.fromEntries(Object.entries(DEFS.dishes).filter(([id]) => !NEW_DISHES.includes(id)))
  return { ...DEFS, dishes }
}

/** A service-phase state with every dish on the menu, to sample whom customers want. */
function rushState(tier: 'stall' | 'restaurant', unlocked: string[], defs: Defs = DEFS): GameState {
  const s = createGame(defs, 'pack')
  s.tier = tier
  s.phase = 'service'
  s.dayTick = 1000 // a rush phase would be better, but any open phase draws arrivals
  s.unlocked = unlocked
  s.menu = Object.values(defs.dishes).map((d) => ({ dish: d.id, price: d.refPrice }))
  return s
}

function wanted(s: GameState, defs: Defs, draws: number): Set<string> {
  const seen = new Set<string>()
  for (let i = 0; i < draws; i += 1) {
    s.tick += 1
    s.waiting = []
    s.events = []
    // force an arrival every tick by retrying the chance: call until an arrival event appears
    for (let guard = 0; guard < 400 && s.events.length === 0; guard += 1) {
      s.tick += 1
      stepArrivals(s, defs)
    }
    for (const e of s.events) if (e.type === 'customerArrived') for (const p of e.prefs) seen.add(p)
  }
  return seen
}

describe('dish pack content', () => {
  it('both dishes need the restaurant tier and use known buildings', () => {
    for (const id of NEW_DISHES) expect(DEFS.dishes[id].requiresTier).toBe('restaurant')
    expect(DEFS.dishes['fishAndChips'].inputs).toEqual(['friedFish', 'fries'])
    expect(DEFS.dishes['cheeseburger'].inputs).toEqual(['bun', 'cookedPatty', 'cheese'])
    expect(DEFS.stationRecipes).toContainEqual({ station: 'fryer', input: 'fish', output: 'friedFish', ticks: 60 })
    expect(DEFS.items['fish'].spoilTicks).toBe(DEFS.items['tomato'].spoilTicks)
    expect(DEFS.items['cheese'].spoilTicks).toBeUndefined()
  })
})

describe('tier gating', () => {
  it('unlockRecipe is rejected at the stall and works at the restaurant', () => {
    const stall = createGame(DEFS, 'g')
    stall.money = 99999
    const no = applyCommand(stall, DEFS, { type: 'unlockRecipe', dish: 'fishAndChips' })
    expect(no.result).toMatchObject({ ok: false, reason: 'locked by tier' })
    const rest = { ...stall, tier: 'restaurant' as const }
    const yes = applyCommand(rest, DEFS, { type: 'unlockRecipe', dish: 'fishAndChips' })
    expect(yes.result.ok).toBe(true)
    expect(yes.state.unlocked).toContain('fishAndChips')
    expect(yes.state.money).toBe(99999 - DEFS.dishes['fishAndChips'].unlockCost)
  })

  it('customers never want a tiered dish at the stall, even if it were unlocked', () => {
    const s = rushState('stall', ['fries', 'salad', ...NEW_DISHES])
    const seen = wanted(s, DEFS, 300)
    for (const id of NEW_DISHES) expect(seen.has(id)).toBe(false)
    expect(seen.has('fries')).toBe(true)
  })

  it('at the restaurant a tiered dish is wanted only once unlocked', () => {
    const locked = wanted(rushState('restaurant', ['fries', 'salad']), DEFS, 300)
    for (const id of NEW_DISHES) expect(locked.has(id)).toBe(false)
    const open = wanted(rushState('restaurant', ['fries', 'salad', ...NEW_DISHES]), DEFS, 300)
    for (const id of NEW_DISHES) expect(open.has(id)).toBe(true)
  })

  it('stall runs are identical to the content without the dish pack', () => {
    const run = (defs: Defs): string => {
      let s = createGame(defs, 'stall-hash')
      s.money = 100000
      s = applyCommand(s, defs, { type: 'openService' }).state
      s.menu = [{ dish: 'fries', price: 300 }]
      return stateHash(runTicks(s, defs, 4000))
    }
    expect(run(DEFS)).toBe(run(oldDefs()))
  })
})

describe('trends', () => {
  it('a tiered dish joins the trend pool once unlocked', () => {
    const s = rushState('restaurant', ['fries', 'salad'])
    expect(trendCandidates(s, DEFS)).toEqual(['fries', 'salad'])
    s.unlocked.push('fishAndChips')
    expect(trendCandidates(s, DEFS)).toEqual(['fries', 'salad', 'fishAndChips'])
  })
})
