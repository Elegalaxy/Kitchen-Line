// Tests for the pro station UI helpers (palette entries, variant names, speed text) and for undoing the
// sale of a pro station (it must come back as a pro station). Uses the real content defs.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { refundOf } from '../sim/commands.ts'
import { createGame } from '../sim/game.ts'
import type { GameState } from '../sim/types.ts'
import { formatMoney } from './format.ts'
import { hasVariant, paletteCost, paletteReason, speedText, variantConfig, variantName } from './palette.ts'
import { createStore } from './store.ts'

const noTimers = { now: () => 0, setTimer: () => undefined }
const restaurant = (money = 50000): GameState => ({ ...createGame(DEFS, 'pro-ui'), tier: 'restaurant', money })

describe('pro palette entries', () => {
  it('only the fryer, stove, assembler and belt have a variant entry', () => {
    for (const kind of ['belt', 'fryer', 'stove', 'assembler'] as const) expect(hasVariant(DEFS, kind)).toBe(true)
    for (const kind of ['chopper', 'pantry', 'splitter', 'merger', 'filter', 'bin', 'pass'] as const) {
      expect(hasVariant(DEFS, kind)).toBe(false)
    }
  })

  it('names, costs and config follow the content defs', () => {
    expect(variantName(DEFS, 'fryer')).toBe('Pro fryer')
    expect(variantName(DEFS, 'belt')).toBe('Fast belt')
    expect(variantConfig('stove')).toEqual({ pro: true })
    expect(variantConfig('belt')).toEqual({ fast: true })
    expect(paletteCost(DEFS, 'fryer', true)).toBe(8000)
    expect(paletteCost(DEFS, 'stove', true)).toBe(12000)
    expect(paletteCost(DEFS, 'assembler', true)).toBe(10000)
    expect(paletteCost(DEFS, 'fryer')).toBe(4000)
  })

  it('is locked with the visible reason "Restaurant tier" at the stall, then by money', () => {
    const stall = createGame(DEFS, 'pro-ui')
    expect(paletteReason(stall, DEFS, 'fryer', true)).toBe('Restaurant tier')
    expect(paletteReason(stall, DEFS, 'fryer', false)).toBeNull()
    expect(paletteReason(restaurant(100), DEFS, 'fryer', true)).toBe(`Needs ${formatMoney(8000)}`)
    expect(paletteReason(restaurant(8000), DEFS, 'fryer', true)).toBeNull()
  })

  it('shows the speed in seconds per item, base and pro', () => {
    expect(speedText(DEFS, 'fryer', false)).toBe('6 s per item')
    expect(speedText(DEFS, 'fryer', true)).toBe('4 s per item')
    expect(speedText(DEFS, 'stove', true)).toBe('4 s per item')
    expect(speedText(DEFS, 'assembler', false)).toBe('3 s per item')
    expect(speedText(DEFS, 'assembler', true)).toBe('2 s per item')
    expect(speedText(DEFS, 'chopper', false)).toBeNull()
  })
})

describe('pro stations in the store', () => {
  it('sells for the full pro price and undo puts a pro station back', () => {
    const store = createStore(DEFS, restaurant(), noTimers)
    expect(store.dispatch({ type: 'place', kind: 'fryer', x: 3, y: 3, dir: 1, config: { pro: true } }).ok).toBe(true)
    const placed = store.getState()
    const fryer = Object.values(placed.buildings).find((b) => b.kind === 'fryer')
    expect(fryer && refundOf(DEFS, fryer)).toBe(8000)
    expect(store.dispatch({ type: 'remove', x: 3, y: 3 }).ok).toBe(true)
    expect(store.getState().money).toBe(placed.money + 8000)
    expect(store.undo().ok).toBe(true)
    expect(store.getState().money).toBe(placed.money)
    const back = Object.values(store.getState().buildings).find((b) => b.kind === 'fryer')
    expect(back).toMatchObject({ kind: 'fryer', pro: true })
  })

  it('undo of placing a pro station refunds the pro price', () => {
    const store = createStore(DEFS, restaurant(), noTimers)
    const before = store.getState().money
    store.dispatch({ type: 'place', kind: 'assembler', x: 2, y: 4, dir: 1, config: { pro: true } })
    expect(store.undo().ok).toBe(true)
    expect(store.getState().money).toBe(before)
  })
})
