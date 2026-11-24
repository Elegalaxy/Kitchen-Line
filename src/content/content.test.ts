// Content sanity tests (plan Step 2): every recipe input exists, every dish can be made
// from pantry ingredients through station recipes and assembler recipes, and every cost
// is a positive integer in cents. Also a smoke test that the sim runs on the real DEFS.

import { describe, expect, it } from 'vitest'
import { applyCommand } from '../sim/commands.ts'
import { createGame } from '../sim/game.ts'
import { ingredientCostOf } from './dishes.ts'
import { DEFS } from './index.ts'

function debug(message: string): void {
  console.log(`[DEBUG content] ${message}\n`)
}

const isCents = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n > 0

describe('content', () => {
  it('every recipe input and output is a known item', () => {
    for (const r of DEFS.stationRecipes) {
      expect(DEFS.items[r.input], `${r.station} input ${r.input}`).toBeDefined()
      expect(DEFS.items[r.output], `${r.station} output ${r.output}`).toBeDefined()
      expect(Number.isInteger(r.ticks) && r.ticks > 0).toBe(true)
    }
    for (const d of Object.values(DEFS.dishes)) {
      expect(DEFS.items[d.id]?.kind, `dish item ${d.id}`).toBe('dish')
      for (const input of d.inputs ?? []) expect(DEFS.items[input], `${d.id} input ${input}`).toBeDefined()
      expect((d.inputs ?? []).length).toBeLessThanOrEqual(3)
    }
  })

  it('every dish is reachable from pantry ingredients', () => {
    const made = new Set(Object.values(DEFS.items).filter((i) => i.kind === 'raw').map((i) => i.id))
    for (let changed = true; changed; ) {
      changed = false
      const add = (id: string): void => {
        if (!made.has(id)) {
          made.add(id)
          changed = true
        }
      }
      for (const r of DEFS.stationRecipes) if (made.has(r.input)) add(r.output)
      for (const d of Object.values(DEFS.dishes)) {
        if (d.inputs !== undefined && d.inputs.every((i) => made.has(i))) add(d.id)
      }
    }
    debug(`producible items: ${[...made].join(',')}`)
    for (const d of Object.values(DEFS.dishes)) expect(made.has(d.id), `${d.id} reachable`).toBe(true)
    for (const i of Object.values(DEFS.items)) expect(made.has(i.id), `${i.id} reachable`).toBe(true)
  })

  it('costs and prices are positive integers', () => {
    for (const i of Object.values(DEFS.items)) if (i.kind === 'raw') expect(isCents(i.cost), `${i.id} cost`).toBe(true)
    for (const b of Object.values(DEFS.buildings)) {
      if (b.placeable) expect(isCents(b.cost), `${b.kind} cost`).toBe(true)
      if (b.fast !== undefined) expect(isCents(b.fast.cost)).toBe(true)
      if (b.pro !== undefined) expect(isCents(b.pro.cost), `${b.kind} pro cost`).toBe(true)
    }
    for (const d of Object.values(DEFS.dishes)) {
      expect(isCents(d.refPrice), `${d.id} price`).toBe(true)
      if (!d.startsUnlocked) expect(isCents(d.unlockCost), `${d.id} unlock`).toBe(true)
    }
  })

  it('has the plan costs and starting dishes', () => {
    expect(DEFS.buildings.chopper.cost).toBe(2500)
    expect(DEFS.buildings.assembler.tiles).toBe(2)
    expect(DEFS.buildings.belt.fast).toEqual({ cost: 300, requiresTier: 'restaurant' })
    // Pro stations (GAME_DESIGN 5.3): restaurant tier, about twice the base price; no pro chopper, belt or pantry.
    expect(DEFS.buildings.fryer.pro).toEqual({ cost: 8000, requiresTier: 'restaurant' })
    expect(DEFS.buildings.stove.pro).toEqual({ cost: 12000, requiresTier: 'restaurant' })
    expect(DEFS.buildings.assembler.pro).toEqual({ cost: 10000, requiresTier: 'restaurant' })
    for (const b of Object.values(DEFS.buildings)) {
      if (!['fryer', 'stove', 'assembler'].includes(b.kind)) expect(b.pro, `${b.kind} has no pro`).toBeUndefined()
    }
    expect(Object.values(DEFS.dishes).filter((d) => d.startsUnlocked).map((d) => d.id)).toEqual(['fries', 'salad'])
    expect(Object.keys(DEFS.dishes)).toHaveLength(12)
  })

  it('the sim places and refunds with the real defs', () => {
    const s0 = createGame(DEFS, 'content')
    const placed = applyCommand(s0, DEFS, { type: 'place', kind: 'fryer', x: 3, y: 2, dir: 1 })
    expect(placed.state.money).toBe(15000 - 4000)
    const removed = applyCommand(placed.state, DEFS, { type: 'remove', x: 3, y: 2 })
    expect(removed.state.money).toBe(15000)
  })
})

describe('ingredientCostOf', () => {
  it('follows the recipe chain down to pantry prices', () => {
    const cost = (dish: string): number => ingredientCostOf(dish)
    expect(cost('fries')).toBe(30) // potato
    expect(cost('soup')).toBe(40) // tomato
    expect(cost('salad')).toBe(80) // lettuce + tomato
    expect(cost('sandwich')).toBe(120) // bread + tomato + lettuce
    expect(cost('burger')).toBe(210) // bun + patty + tomato
    expect(cost('riceBowl')).toBe(150) // rice + patty
    expect(cost('fishAndChips')).toBe(180) // fish + potato (the fries)
    expect(cost('cheeseburger')).toBe(230) // bun + patty + cheese
    expect(cost('springRoll')).toBe(70) // rice + lettuce
    expect(cost('fishTaco')).toBe(230) // fish + lettuce + tomato
    expect(cost('pumpkinSoup')).toBe(40) // pumpkin
    expect(cost('beefStew')).toBe(150) // patty + potato
  })

  it('uses a price override for raw items only', () => {
    expect(ingredientCostOf('salad', (id) => (id === 'tomato' ? 100 : undefined))).toBe(140)
    expect(ingredientCostOf('salad', () => undefined)).toBe(80)
  })

  it('matches the raw item costs in DEFS, never exceeds the reference price, and is 0 for unknown ids', () => {
    for (const d of Object.values(DEFS.dishes)) {
      expect(ingredientCostOf(d.id), d.id).toBeGreaterThan(0)
      expect(ingredientCostOf(d.id), d.id).toBeLessThan(d.refPrice)
    }
    expect(ingredientCostOf('nope')).toBe(0)
    expect(ingredientCostOf('potato')).toBe(DEFS.items['potato'].cost)
  })
})

describe('seasons', () => {
  const seasons = DEFS.seasons ?? []

  it('has four seasons, each with exactly one seasonal restaurant dish', () => {
    expect(seasons.map((x) => x.id)).toEqual(['spring', 'summer', 'autumn', 'winter'])
    for (const season of seasons) {
      const dishes = Object.values(DEFS.dishes).filter((d) => d.season === season.id)
      expect(dishes, season.id).toHaveLength(1)
      expect(dishes[0].requiresTier, season.id).toBe('restaurant')
    }
  })

  it('every dish.season names a season and every percent key is a known raw item or dish', () => {
    const ids = new Set(seasons.map((x) => x.id))
    for (const d of Object.values(DEFS.dishes)) if (d.season !== undefined) expect(ids.has(d.season), d.id).toBe(true)
    for (const season of seasons) {
      for (const [item, pct] of Object.entries(season.costPercent)) {
        expect(DEFS.items[item]?.kind, `${season.id} ${item}`).toBe('raw')
        expect(pct).toBeGreaterThan(0)
      }
      for (const [dish, pct] of Object.entries(season.tastePercent)) {
        expect(DEFS.dishes[dish], `${season.id} ${dish}`).toBeDefined()
        expect(pct).toBeGreaterThan(0)
      }
      expect(season.branchPercent).toBeGreaterThan(0)
    }
  })

  it('pumpkin is a raw item that does not spoil', () => {
    expect(DEFS.items['pumpkin']).toMatchObject({ kind: 'raw', cost: 40 })
    expect(DEFS.items['pumpkin'].spoilTicks).toBeUndefined()
  })
})
