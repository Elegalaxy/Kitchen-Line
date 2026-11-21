// Tests for the Step 18 polish: the first-goal checklist and its hint tiles, item freshness
// for the hover tooltip, compact money, review clipping, the fast belt palette entry and the
// empty-orders note. The hint positions are checked end to end: building exactly what the
// hints show must yield a served fries dish.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { applyCommand } from '../sim/commands.ts'
import { createGame, emptyDayStats } from '../sim/game.ts'
import { runTicks } from '../sim/tick.ts'
import type { Command, GameState } from '../sim/types.ts'
import { beginDrag, endDrag, placeAt, selectTool } from './actions.ts'
import { planBeltDrag } from './canvas/input.ts'
import { clipText, formatMoney, formatMoneyCompact } from './format.ts'
import { ordersNote } from './orders.ts'
import { hasFastVariant, paletteCost, paletteReason } from './palette.ts'
import { createStore } from './store.ts'
import { freshnessSeconds, tileItems, tileSummary, tileTooltip } from './tileInfo.ts'
import { lineReachesPass, tutorialHints, tutorialView } from './tutorial.ts'
import { clearTutorialDone, readTutorialDone, writeTutorialDone } from './tutorialLatch.ts'
import { createUiStore } from './uiState.ts'

const fresh = (): GameState => createGame(DEFS, 'polish')

function run(state: GameState, cmd: Command): GameState {
  const out = applyCommand(state, DEFS, cmd)
  if (!out.result.ok) throw new Error(`rejected: ${JSON.stringify(cmd)}: ${out.result.reason}`)
  return out.state
}

const place = (kind: 'belt' | 'chopper' | 'fryer', x: number, dir: 0 | 1 | 2 | 3 = 1): Command => ({
  type: 'place',
  kind,
  x,
  y: 2,
  dir,
})

describe('tutorial checklist', () => {
  it('starts open with nothing done and the chopper step current', () => {
    const v = tutorialView(fresh())
    expect(v.open).toBe(true)
    expect(v.steps.map((s) => s.id)).toEqual(['chopper', 'fryer', 'connect', 'open', 'day', 'summary', 'menu', 'salad'])
    expect(v.steps.every((s) => !s.done)).toBe(true)
    expect(v.current).toBe(0)
    expect(v.doneCount).toBe(0)
  })

  it('derives each step from the buildings and the phase', () => {
    let s = run(fresh(), place('chopper', 2))
    expect(tutorialView(s)).toMatchObject({ doneCount: 1, current: 1 })
    s = run(s, place('fryer', 4))
    expect(tutorialView(s)).toMatchObject({ doneCount: 2, current: 2 })
    for (const x of [1, 3, 5]) s = run(s, place('belt', x))
    expect(lineReachesPass(s)).toBe(false) // belt at (6, 2) missing
    expect(tutorialView(s).steps[2].done).toBe(false)
    s = run(s, place('belt', 6))
    expect(lineReachesPass(s)).toBe(true)
    expect(tutorialView(s)).toMatchObject({ doneCount: 3, current: 3 })
    s = run(s, { type: 'openService' })
    expect(tutorialView(s)).toMatchObject({ open: true, doneCount: 4, current: 4 })
  })

  it('does not count a belt that faces back against the flow as connected', () => {
    let s = run(fresh(), place('chopper', 2))
    s = run(s, place('fryer', 4))
    for (const x of [1, 3, 5, 6]) s = run(s, place('belt', x))
    expect(lineReachesPass(s)).toBe(true)
    s = run(s, { type: 'rotate', x: 5, y: 2 }) // faces south
    s = run(s, { type: 'rotate', x: 5, y: 2 }) // faces west: back against the flow
    expect(lineReachesPass(s)).toBe(false)
  })

  it('stays open after the first dish and walks through the summary, the menu and a salad', () => {
    let s = run(fresh(), place('chopper', 2))
    s = run(s, place('fryer', 4))
    for (const x of [1, 3, 5, 6]) s = run(s, place('belt', x))
    s = run(s, { type: 'openService' })
    s.tick = 1
    s.totals.served = 1
    expect(tutorialView(s).steps.find((step) => step.id === 'day')?.done).toBe(false)
    s.phase = 'summary'
    s.lastDay = emptyDayStats(1)
    s.totals.days = 1
    expect(tutorialView(s).steps[tutorialView(s).current]?.id).toBe('summary')
    s.phase = 'build'
    expect(tutorialView(s).steps.find((step) => step.id === 'summary')?.done).toBe(true)
    s.phase = 'summary'
    s.totals.days = 2
    expect(tutorialView(s).steps.find((step) => step.id === 'summary')?.done).toBe(true)
    s.phase = 'build'
    s = run(s, { type: 'setMenu', dishes: ['fries', 'salad'] })
    expect(tutorialView(s).steps[tutorialView(s).current]?.id).toBe('salad')
    s.today.byDish['salad'] = { served: 1, lost: 0, sales: 450 }
    expect(tutorialView(s).open).toBe(false)
    expect(tutorialHints(s)).toEqual([])
  })

  it('hints the chopper and fryer first, then belts in the gaps, and drops placed ones', () => {
    let s = fresh()
    expect(tutorialHints(s).map((h) => [h.kind, h.x, h.y])).toEqual([
      ['chopper', 2, 2],
      ['fryer', 4, 2],
    ])
    s = run(s, place('chopper', 2))
    expect(tutorialHints(s).map((h) => h.kind)).toEqual(['fryer'])
    s = run(s, place('fryer', 4))
    expect(tutorialHints(s).map((h) => [h.kind, h.x])).toEqual([
      ['belt', 1],
      ['belt', 3],
      ['belt', 5],
      ['belt', 6],
    ])
    s = run(s, place('belt', 3))
    expect(tutorialHints(s).map((h) => h.x)).toEqual([1, 5, 6])
  })

  it('building exactly what the hints show serves a fries dish', () => {
    let s = fresh()
    for (const h of tutorialHints(s)) s = run(s, place(h.kind as 'chopper' | 'fryer', h.x, h.dir))
    for (const h of tutorialHints(s)) s = run(s, place('belt', h.x, h.dir))
    expect(tutorialHints(s)).toEqual([])
    s = run(s, { type: 'openService' })
    let ticks = 0
    while (s.totals.served === 0 && ticks < 2400) {
      s = runTicks(s, DEFS, 10)
      ticks += 10
    }
    expect(s.totals.served).toBeGreaterThan(0)
    expect(tutorialView(s).open).toBe(true)
    expect(tutorialView(s).steps[tutorialView(s).current]?.id).toBe('day')
    expect(tutorialHints(s)).toEqual([])
  })

  it('stages salad ghosts, and clicking one places its facing and ingredient or recipe', () => {
    let s = run(fresh(), place('chopper', 2))
    s = run(s, place('fryer', 4))
    for (const x of [1, 3, 5, 6]) s = run(s, place('belt', x))
    s.phase = 'build'
    s.tick = 1
    s.lastDay = emptyDayStats(1)
    s.totals.days = 1
    s.money = 50000
    s = run(s, { type: 'setMenu', dishes: ['fries', 'salad'] })
    expect(tutorialHints(s).map((h) => [h.kind, h.ingredient])).toEqual([
      ['pantry', 'lettuce'],
      ['pantry', 'tomato'],
    ])
    const store = createStore(DEFS, s)
    const ui = createUiStore({ setTimer: () => undefined })
    const ctx = { store, ui }
    let guard = 0
    while (tutorialHints(store.getState()).length > 0 && guard < 20) {
      const h = tutorialHints(store.getState())[0]
      ui.set({ tool: h.kind, dir: 0, fast: false })
      expect(placeAt(ctx, { x: h.x, y: h.y })).toBe(true)
      guard += 1
    }
    expect(guard).toBeGreaterThan(0)
    expect(tutorialHints(store.getState())).toEqual([])
    const built = store.getState()
    const find = (x: number, y: number) => {
      const id = Object.values(built.buildings).find((b) => b.x === x && b.y === y)
      if (id === undefined) throw new Error(`nothing at ${x},${y}`)
      return id
    }
    expect(find(0, 0)).toMatchObject({ kind: 'pantry', ingredient: 'lettuce', dir: 1 })
    expect(find(0, 1)).toMatchObject({ kind: 'pantry', ingredient: 'tomato', dir: 1 })
    expect(find(4, 0)).toMatchObject({ kind: 'assembler', recipe: 'salad', dir: 1 })
    expect(find(7, 0)).toMatchObject({ kind: 'belt', dir: 2 })
    expect(find(7, 1)).toMatchObject({ kind: 'belt', dir: 2 })
    let playing = run(built, { type: 'openService' })
    let ticks = 0
    while ((playing.today.byDish['salad']?.served ?? 0) === 0 && ticks < 4800) {
      playing = runTicks(playing, DEFS, 20)
      ticks += 20
    }
    expect(playing.today.byDish['salad']?.served ?? 0).toBeGreaterThan(0)
    expect(tutorialView(playing).open).toBe(false)
  })

  it('remembers a finished guide and a new game clears that memory', () => {
    const storage = new Map<string, string>()
    const box = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    }
    expect(readTutorialDone(box)).toBe(false)
    writeTutorialDone(box)
    expect(readTutorialDone(box)).toBe(true)
    expect(readTutorialDone(null)).toBe(false)
    clearTutorialDone(box)
    expect(readTutorialDone(box)).toBe(false)
  })
})

describe('item freshness for the tooltip', () => {
  it('counts whole seconds left from spoilTicks and bornTick, rounding up', () => {
    const life = DEFS.items['fries'].spoilTicks as number
    const item = { id: 1, type: 'fries', bornTick: 100 }
    expect(freshnessSeconds(DEFS, item, 100)).toBe(Math.ceil(life / 10))
    expect(freshnessSeconds(DEFS, item, 100 + life - 1)).toBe(1)
    expect(freshnessSeconds(DEFS, item, 100 + life - 11)).toBe(2)
    expect(freshnessSeconds(DEFS, { id: 2, type: 'potato', bornTick: 0 }, 50)).toBeNull()
  })

  it('lists the items on a tile with name and seconds, and nothing for empty tiles', () => {
    const s = structuredClone(run(fresh(), place('belt', 1)))
    expect(tileItems(s, DEFS, 1, 2)).toEqual([])
    expect(tileItems(s, DEFS, 5, 5)).toEqual([])
    expect(tileSummary(s, DEFS, 5, 5)).toBeNull()
    const b = Object.values(s.buildings).find((x) => x.kind === 'belt')
    if (b === undefined || b.kind !== 'belt') throw new Error('no belt')
    s.tick = 40
    b.slots[0] = { id: 9, type: 'potato', bornTick: 0 }
    b.slots[1] = { id: 10, type: 'fries', bornTick: 30 }
    const life = DEFS.items['fries'].spoilTicks as number
    expect(tileTooltip(s, DEFS, 1, 2)).toEqual(['Potato: does not spoil', `Fries: fresh for ${Math.ceil((life - 10) / 10)} s`])
    expect(tileSummary(s, DEFS, 1, 2)).toContain('Belt at 1, 2')
  })
})

describe('compact money and text clipping', () => {
  it('keeps full values below $1M and compacts above', () => {
    expect(formatMoneyCompact(150000)).toBe('$1,500.00')
    expect(formatMoneyCompact(99_999_999)).toBe(formatMoney(99_999_999))
    expect(formatMoneyCompact(100_000_000)).toBe('$1.0M')
    expect(formatMoneyCompact(123_456_789)).toBe('$1.2M')
    expect(formatMoneyCompact(-123_456_789)).toBe('-$1.2M')
    expect(formatMoneyCompact(9_990_000_000)).toBe('$99.9M')
    expect(formatMoneyCompact(99_995_000_000)).toBe('$1.0B') // $999.95M rounds up to the next unit
    expect(formatMoneyCompact(99_996_000_000)).toBe('$1.0B')
    expect(formatMoneyCompact(5_000_000_000_000)).toBe('$50.0B')
    expect(formatMoneyCompact(2.5e16)).toBe('$250.0T')
  })

  it('clips long text with an ellipsis and leaves short text alone', () => {
    expect(clipText('short', 10)).toBe('short')
    expect(clipText('exactly10!', 10)).toBe('exactly10!')
    expect(clipText('this review is far too long', 10)).toBe('this revi…')
    expect(clipText('this review is far too long', 10).length).toBe(10)
  })
})

describe('orders note', () => {
  it('explains an empty strip before and during service, and stays quiet otherwise', () => {
    const s = fresh()
    expect(ordersNote(s)).toBe('Open for service to get customers.')
    s.phase = 'service'
    expect(ordersNote(s)).toContain('No customers yet today')
    s.today.customers = 3
    expect(ordersNote(s)).toBe('')
    s.today.customers = 0
    s.waiting = [{ id: 1, arriveTick: 0, prefs: [], budget: 0, patience: 10, dish: 'fries', price: 100 }]
    expect(ordersNote(s)).toBe('')
  })
})

describe('fast belt palette entry', () => {
  const noTimers = { now: () => 0, setTimer: () => undefined }

  it('is locked with the visible reason "Restaurant tier" until the upgrade, and costs per DEFS', () => {
    const s = fresh()
    expect(hasFastVariant(DEFS, 'belt')).toBe(true)
    expect(hasFastVariant(DEFS, 'chopper')).toBe(false)
    expect(paletteReason(s, DEFS, 'belt', true)).toBe('Restaurant tier')
    expect(paletteReason(s, DEFS, 'belt', false)).toBeNull()
    expect(paletteCost(DEFS, 'belt', true)).toBe(DEFS.buildings.belt.fast?.cost)
    expect(paletteCost(DEFS, 'belt')).toBe(DEFS.buildings.belt.cost)
    s.tier = 'restaurant'
    s.money = 100
    expect(paletteReason(s, DEFS, 'belt', true)).toBe(`Needs ${formatMoney(DEFS.buildings.belt.fast?.cost ?? 0)}`)
    s.money = 10000
    expect(paletteReason(s, DEFS, 'belt', true)).toBeNull()
  })

  it('is refused before the upgrade, then picks the belt tool in fast mode and switches with the plain belt', () => {
    const state = fresh()
    const store = createStore(DEFS, state, noTimers)
    const ui = createUiStore({ setTimer: () => undefined })
    const ctx = { store, ui }
    selectTool(ctx, 'belt', true)
    expect(ui.get().tool).toBeNull()
    expect(ui.get().toast?.text).toContain('Restaurant tier')
    store.replaceState({ ...structuredClone(state), tier: 'restaurant', money: 10000 }, 1)
    selectTool(ctx, 'belt', true)
    expect(ui.get()).toMatchObject({ tool: 'belt', fast: true })
    selectTool(ctx, 'belt', false)
    expect(ui.get()).toMatchObject({ tool: 'belt', fast: false })
    selectTool(ctx, 'belt', true)
    selectTool(ctx, 'belt', true)
    expect(ui.get().tool).toBeNull()
  })

  it('drags fast belts as one undoable action at the fast cost, and undo refunds it', () => {
    const state = { ...fresh(), tier: 'restaurant' as const, money: 10000 }
    const store = createStore(DEFS, state, noTimers)
    const ui = createUiStore({ setTimer: () => undefined })
    const ctx = { store, ui }
    selectTool(ctx, 'belt', true)
    const plan = planBeltDrag(store.getState(), DEFS, { x: 1, y: 2 }, { x: 3, y: 2 }, 1, true)
    expect(plan.reason).toBeNull()
    expect(plan.cost).toBe(3 * (DEFS.buildings.belt.fast?.cost ?? 0))
    beginDrag(ctx, { x: 1, y: 2 })
    ui.setCursor({ x: 3, y: 2 }, false)
    expect(endDrag(ctx)).toBe(true)
    const belts = Object.values(store.getState().buildings).filter((b) => b.kind === 'belt')
    expect(belts).toHaveLength(3)
    expect(belts.every((b) => b.kind === 'belt' && b.fast)).toBe(true)
    expect(store.getState().money).toBe(10000 - plan.cost)
    expect(store.undo().ok).toBe(true)
    expect(store.getState().money).toBe(10000)
    expect(Object.values(store.getState().buildings).filter((b) => b.kind === 'belt')).toHaveLength(0)
    expect(placeAt(ctx, { x: 4, y: 2 })).toBe(true)
    const placed = Object.values(store.getState().buildings).find((b) => b.kind === 'belt')
    expect(placed?.kind === 'belt' && placed.fast).toBe(true)
  })
})
