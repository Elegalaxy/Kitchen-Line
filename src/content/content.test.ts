// Content sanity tests (plan Step 2): every recipe input exists, every dish can be made
// from pantry ingredients through station recipes and assembler recipes, and every cost
// is a positive integer in cents. Also a smoke test that the sim runs on the real DEFS.

import { describe, expect, it } from 'vitest'
import { applyCommand } from '../sim/commands.ts'
import { createGame } from '../sim/game.ts'
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
    expect(Object.values(DEFS.dishes).filter((d) => d.startsUnlocked).map((d) => d.id)).toEqual(['fries', 'salad'])
    expect(Object.keys(DEFS.dishes)).toHaveLength(6)
  })

  it('the sim places and refunds with the real defs', () => {
    const s0 = createGame(DEFS, 'content')
    const placed = applyCommand(s0, DEFS, { type: 'place', kind: 'fryer', x: 3, y: 2, dir: 1 })
    expect(placed.state.money).toBe(15000 - 4000)
    const removed = applyCommand(placed.state, DEFS, { type: 'remove', x: 3, y: 2 })
    expect(removed.state.money).toBe(15000)
  })
})
