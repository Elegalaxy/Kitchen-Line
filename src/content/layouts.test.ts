// Layout tests (plan Step 8): every dish has a complete working line on the real content.
// Each named layout loads with no rejected command, fits the 8 x 6 start grid, and serves
// at least 5 of its dish within 1200 ticks, with nothing else reaching the pass. Layouts
// that need unlocked recipes or extra money get them from LAYOUT_SETUP (dev loader).

import { describe, expect, it } from 'vitest'
import { createGame } from '../sim/game.ts'
import { applyLayout } from '../sim/layout.ts'
import { runTicks } from '../sim/tick.ts'
import type { GameState } from '../sim/types.ts'
import { DEFS } from './index.ts'
import { LAYOUTS, LAYOUT_SETUP } from './layouts.ts'

function debug(message: string): void {
  console.log(`[DEBUG layouts] ${message}\n`)
}

function load(name: string): GameState {
  const commands = LAYOUTS[name]
  if (commands === undefined) throw new Error(`no layout ${name}`)
  const out = applyLayout(createGame(DEFS, 'test'), DEFS, commands, LAYOUT_SETUP[name])
  expect(out.rejected, `${name} rejected commands`).toEqual([])
  return out.state
}

const DISH_LINES: [layout: string, dish: string][] = [
  ['friesLine', 'fries'],
  ['saladLine', 'salad'],
  ['burgerLine', 'burger'],
  ['soupLine', 'soup'],
  ['sandwichLine', 'sandwich'],
  ['riceBowlLine', 'riceBowl'],
]

describe('dish lines', () => {
  for (const [layout, dish] of DISH_LINES) {
    it(`${layout} serves at least 5 ${dish} in 1200 ticks`, () => {
      let s = load(layout)
      const served: { tick: number; item: string }[] = []
      const assemblers = Object.values(s.buildings).filter((b) => b.kind === 'assembler')
      for (let t = 0; t < 1200; t += 1) {
        s = runTicks(s, DEFS, 1)
        for (const e of s.events) if (e.type === 'delivered') served.push({ tick: e.tick, item: e.item })
      }
      debug(`${layout}: first ${dish} at ${served[0]?.tick}, total ${served.length}, money ${s.money}`)
      expect(served.length).toBeGreaterThanOrEqual(5)
      expect(served.every((x) => x.item === dish)).toBe(true)
      expect(s.today.served).toBe(served.length)
      for (const b of assemblers) expect(b.kind === 'assembler' && b.recipe).toBe(dish)
      expect(s.width).toBe(8)
      expect(s.height).toBe(6)
    })
  }

  it('an assembler layout with a missing ingredient produces nothing and shows idle', () => {
    // burgerLine without its tomato pantry (4, 0): the assembler never has all 3 inputs.
    let s = load('burgerLine')
    const pantry = Object.values(s.buildings).find((b) => b.kind === 'pantry' && b.x === 4 && b.y === 0)
    expect(pantry).toBeDefined()
    if (pantry?.kind === 'pantry') pantry.ingredient = 'bun'
    s = runTicks(s, DEFS, 1200)
    const asm = Object.values(s.buildings).find((b) => b.kind === 'assembler')
    expect(asm?.status).toBe('idle')
    expect(s.today.served).toBe(0)
  })
})
