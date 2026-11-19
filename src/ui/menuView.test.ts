// Tests for the menu panel's view model: margin text, price text validation (an invalid
// value is reported and never reaches the sim), rows for locked / on / off-menu dishes,
// the cap reason, unlock affordability and the read-only note per phase.

import { describe, expect, it } from 'vitest'
import { ingredientCostOf } from '../content/dishes.ts'
import { DEFS } from '../content/index.ts'
import { applyCommand } from '../sim/commands.ts'
import { createGame } from '../sim/game.ts'
import type { Command, GameState } from '../sim/types.ts'
import { checkPriceText, lockNote, marginView, menuView } from './menuView.ts'

function run(state: GameState, ...cmds: Command[]): GameState {
  let s = state
  for (const cmd of cmds) {
    const out = applyCommand(s, DEFS, cmd)
    expect(out.result.ok, JSON.stringify(cmd)).toBe(true)
    s = out.state
  }
  return s
}

const view = (s: GameState) => menuView(s, DEFS, ingredientCostOf)
const rowOf = (s: GameState, id: string) => view(s).rows.find((r) => r.id === id)!

describe('marginView', () => {
  it('shows direction, sign and a word, not only colour', () => {
    expect(marginView(300, 30)).toEqual({ kind: 'up', arrow: '▲', text: '+$2.70', word: 'profit' })
    expect(marginView(100, 130)).toEqual({ kind: 'down', arrow: '▼', text: '-$0.30', word: 'loss' })
    expect(marginView(80, 80)).toEqual({ kind: 'even', arrow: '=', text: '$0.00', word: 'break-even' })
  })
})

describe('checkPriceText', () => {
  it('accepts dollars inside the 50% to 300% range, including the bounds', () => {
    expect(checkPriceText('3.50', 300)).toEqual({ ok: true, cents: 350 })
    expect(checkPriceText('$1.50', 300)).toEqual({ ok: true, cents: 150 })
    expect(checkPriceText('9', 300)).toEqual({ ok: true, cents: 900 })
  })

  it('explains every invalid value', () => {
    expect(checkPriceText('', 300)).toEqual({ ok: false, error: 'Enter a price' })
    expect(checkPriceText('abc', 300).ok).toBe(false)
    expect(checkPriceText('-1', 300).ok).toBe(false)
    expect(checkPriceText('3.555', 300)).toEqual({ ok: false, error: 'Use at most 2 decimals' })
    expect(checkPriceText('3.55', 300)).toEqual({ ok: false, error: 'Use 10-cent steps, like 3.50' })
    expect(checkPriceText('1.40', 300)).toEqual({ ok: false, error: 'Between $1.50 and $9.00' })
    expect(checkPriceText('9.10', 300)).toEqual({ ok: false, error: 'Between $1.50 and $9.00' })
    expect(checkPriceText('0', 300)).toEqual({ ok: false, error: 'Between $1.50 and $9.00' })
  })
})

describe('lockNote', () => {
  it('is null only in the build phase', () => {
    expect(lockNote('build')).toBeNull()
    expect(lockNote('service')).toBe('Locked during service')
    expect(lockNote('summary')).not.toBeNull()
    expect(lockNote('won')).not.toBeNull()
  })
})

describe('menuView', () => {
  it('lists one row per dish with prices, costs and margins for the starting game', () => {
    const v = view(createGame(DEFS, 'view'))
    expect(v.rows.map((r) => r.id)).toEqual(['fries', 'salad', 'soup', 'sandwich', 'burger', 'riceBowl'])
    expect([v.count, v.cap, v.readOnly, v.note]).toEqual([1, 4, false, null])
    const fries = v.rows[0]
    expect(fries).toMatchObject({ locked: false, onMenu: true, price: 300, refPrice: 300, cost: 30, served: 0 })
    expect(fries.margin).toMatchObject({ kind: 'up', text: '+$2.70' })
    expect(fries.bounds).toEqual({ min: 150, max: 900 })
    expect(v.rows[1]).toMatchObject({ id: 'salad', locked: false, onMenu: false, price: null, margin: null, cost: 80 })
    expect(v.rows[2]).toMatchObject({ id: 'soup', locked: true, unlockCost: 4000 })
  })

  it('reports the shortfall on a locked dish the player cannot afford', () => {
    const s = createGame(DEFS, 'view')
    s.money = 5000
    expect(rowOf(s, 'soup').unlockReason).toBeNull() // $50 >= $40
    expect(rowOf(s, 'burger').unlockReason).toBe('Needs $30.00 more') // $80 - $50
    expect(rowOf(s, 'fries').unlockReason).toBeNull() // not locked
  })

  it('shows "Menu full" on the remaining toggles at the cap, never on dishes already on the menu or locked ones', () => {
    let s = createGame(DEFS, 'view')
    s.money = 100000
    s = run(s, { type: 'unlockRecipe', dish: 'soup' }, { type: 'unlockRecipe', dish: 'sandwich' })
    s = run(s, { type: 'setMenu', dishes: ['fries', 'salad', 'soup', 'sandwich'] })
    const v = view(s)
    expect(v.count).toBe(4)
    expect(v.rows.map((r) => r.toggleReason)).toEqual([null, null, null, null, null, null])
    s = run(s, { type: 'unlockRecipe', dish: 'burger' })
    expect(rowOf(s, 'burger').toggleReason).toBe('Menu full (4 / 4)')
    expect(rowOf(s, 'fries').toggleReason).toBeNull()
    expect(rowOf(s, 'riceBowl').toggleReason).toBeNull() // locked: its button is Unlock, not a toggle
  })

  it('is read-only outside the build phase and counts only today\'s served dishes', () => {
    let s = createGame(DEFS, 'view')
    s = run(s, { type: 'openService' })
    const v = view(s)
    expect([v.readOnly, v.note]).toEqual([true, 'Locked during service'])
    const served = structuredClone(s)
    served.today.byDish['fries'] = { served: 7, lost: 0, sales: 2100 }
    expect(rowOf(served, 'fries').served).toBe(7)
    served.day += 1 // the next day has not opened yet: yesterday's numbers are not "today"
    expect(rowOf(served, 'fries').served).toBe(0)
  })
})
