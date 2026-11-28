// Tests for the feedback effects: where a sale happened, expiry, bounds, reset, reduced motion.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../../content/index.ts'
import { DAY_TICKS } from '../../sim/constants.ts'
import { createGame } from '../../sim/game.ts'
import { footprint } from '../../sim/grid.ts'
import { runTicks } from '../../sim/tick.ts'
import type { Building, Dir, GameState, SimEvent } from '../../sim/types.ts'
import { createStore, newGameState } from '../store.ts'
import type { Feedback } from '../store.ts'
import { drawWorkPulses, isWorking } from './drawEffects.ts'
import { createEffects, MAX_EFFECTS, MONEY_MERGE_MS, MONEY_MS, salesAt, SERVE_MS, SPOIL_MS } from './effects.ts'

/** A fresh game with passes (ids 100, 101) at (1, 0) and (3, 0). */
function twoPasses(): GameState {
  const state = createGame(DEFS, 'fx')
  state.buildings = {}
  for (const [id, x] of [[100, 1], [101, 3]]) {
    state.buildings[id] = { id, x, y: 0, dir: 3, onlineAt: 0, status: 'idle', kind: 'pass', shelf: [], delivered: 0 }
  }
  return state
}

const delivered = (x: number): SimEvent => ({ type: 'delivered', tick: 1, x, y: 0, item: 'fries' })
const served = (price: number): SimEvent => ({ type: 'served', tick: 1, id: 1, dish: 'fries', price, wait: 1 })
const spoiled = (x: number, y = 0): SimEvent => ({ type: 'spoiled', tick: 1, x, y, item: 'fries' })
const ticks = (before: GameState, events: SimEvent[]): Feedback => ({ type: 'ticks', before, events, dayEnded: false })

describe('salesAt', () => {
  it('places a sale at the pass that received the dish', () => {
    expect(salesAt(twoPasses(), [delivered(3), served(500)])).toEqual([{ x: 3, y: 0, cents: 500 }])
  })

  it('lets the lowest-id pass holding the dish serve first, counting shelf stock and drops', () => {
    const state = twoPasses()
    const first = state.buildings[100]
    if (first.kind === 'pass') first.shelf = [{ id: 1, type: 'fries', bornTick: 0 }]
    const events = [delivered(3), served(100), served(200), delivered(1), spoiled(1), delivered(3), served(300)]
    expect(salesAt(state, events).map((s) => s.x)).toEqual([1, 3, 3])
  })

  it('agrees with a real run: every sale lands on a pass and the cents match the day', () => {
    const start = newGameState(DEFS, 'friesSaladLine')
    const events: SimEvent[] = []
    const end = runTicks(start, DEFS, DAY_TICKS, (tick) => events.push(...tick))
    const sales = salesAt(start, events)
    expect(sales.length).toBeGreaterThan(0)
    expect(sales.reduce((n, s) => n + s.cents, 0)).toBe(end.lastDay?.sales)
  })
})

describe('createEffects', () => {
  it('adds a flash and a money label for a sale and a flash for spoiled food, then expires them', () => {
    const fx = createEffects()
    fx.ingest(ticks(twoPasses(), [delivered(1), served(1250), spoiled(5, 2)]), 1000, true)
    expect(fx.list().map((e) => e.kind).sort()).toEqual(['money', 'serve', 'spoil'])
    expect(fx.list().find((e) => e.kind === 'money')?.label).toBe('+$12.50')
    fx.prune(1000 + SERVE_MS)
    expect(fx.list().map((e) => e.kind).sort()).toEqual(['money', 'spoil'])
    fx.prune(1000 + SPOIL_MS)
    expect(fx.list().map((e) => e.kind)).toEqual(['money'])
    fx.prune(1000 + MONEY_MS)
    expect(fx.list()).toEqual([])
  })

  it('adds up sales close together on one pass and starts a new label later', () => {
    const fx = createEffects()
    const batch = ticks(twoPasses(), [delivered(1), served(300)])
    fx.ingest(batch, 0, true)
    fx.ingest(batch, 100, true)
    expect(fx.list().filter((e) => e.kind === 'money').map((e) => e.label)).toEqual(['+$6.00'])
    fx.ingest(batch, MONEY_MERGE_MS, true)
    expect(fx.list().filter((e) => e.kind === 'money')).toHaveLength(2)
  })

  it('stays bounded', () => {
    const fx = createEffects()
    const events = Array.from({ length: MAX_EFFECTS * 3 }, (_, i) => spoiled(i % 16, Math.floor(i / 16)))
    fx.ingest(ticks(twoPasses(), events), 0, true)
    expect(fx.list()).toHaveLength(MAX_EFFECTS)
  })

  it('clears on a replaced state and creates nothing with reduced motion', () => {
    const fx = createEffects()
    const batch = ticks(twoPasses(), [delivered(1), served(300)])
    fx.ingest(batch, 0, true)
    fx.ingest({ type: 'reset' }, 1, true)
    expect(fx.list()).toEqual([])
    fx.ingest(batch, 2, false)
    expect(fx.list()).toEqual([])
    // Switching reduced motion on while effects are alive drops them with the next batch.
    fx.ingest(batch, 3, true)
    fx.ingest(batch, 4, false)
    expect(fx.list()).toEqual([])
  })

  it('is cleared through the store on a new game', () => {
    const store = createStore(DEFS, newGameState(DEFS, 'friesLine'), { now: () => 0, setTimer: () => undefined })
    const fx = createEffects()
    store.onFeedback((f) => fx.ingest(f, 0, true))
    for (let i = 0; i < 100 && fx.list().length === 0; i += 1) store.advance(10)
    expect(fx.list().length).toBeGreaterThan(0)
    store.replaceState(newGameState(DEFS, null), 1)
    expect(fx.list()).toEqual([])
  })
})

describe('working pulse', () => {
  it('marks only processing stations', () => {
    const base = { id: 1, x: 0, y: 0, dir: 1 as Dir, onlineAt: 0 }
    const fryer: Building = { ...base, status: 'ok', kind: 'fryer', input: [], output: null, progress: 1 }
    expect(isWorking(fryer)).toBe(true)
    expect(isWorking({ ...fryer, status: 'blocked' })).toBe(false)
    expect(isWorking({ ...base, status: 'ok', kind: 'pass', shelf: [], delivered: 0 })).toBe(false)
  })

  it('rings both tiles of an assembler in every direction', () => {
    for (const dir of [0, 1, 2, 3] as Dir[]) {
      const state = createGame(DEFS, 'fx')
      state.buildings = {
        1: { id: 1, x: 3, y: 3, dir, onlineAt: 0, status: 'ok', kind: 'assembler', recipe: 'burger', inputs: {}, output: null, progress: 1 },
      }
      const tiles: { x: number; y: number }[] = []
      const noop = (): void => undefined
      const ctx = {
        save: noop,
        restore: noop,
        beginPath: noop,
        stroke: noop,
        roundRect: (x: number, y: number) => tiles.push({ x: Math.floor(x / 100), y: Math.floor(y / 100) }),
      } as unknown as CanvasRenderingContext2D
      drawWorkPulses(ctx, state, 100, { good: 'g' } as never, 0)
      expect(tiles).toEqual(footprint('assembler', 3, 3, dir))
    }
  })
})
