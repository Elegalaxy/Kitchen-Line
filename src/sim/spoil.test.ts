// Tests for spoilage (plan Step 9). Inline Defs fixture (sim tests import only src/sim).
// Items are placed straight into buildings with a known bornTick. Checked: a sliced
// tomato on a dead-end belt spoils at exactly 600 ticks of age, a dish on the pass shelf
// at 300 (the pass serves at once today, so the dish is put on the shelf directly),
// potatoes never spoil, removal works in every kind of holder, wasteSpoiled and the
// `spoiled` event (with position) are recorded, the bin still counts wasteBinned, and
// spoilage is deterministic.

import { describe, expect, it } from 'vitest'
import { createGame, newBuilding } from './game.ts'
import { tileIndex } from './grid.ts'
import { stateHash } from './hash.ts'
import { buildingItems } from './spoil.ts'
import { runTicks } from './tick.ts'
import type { BuildingDef, BuildingKind, Defs, GameState, Item } from './types.ts'

function bd(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

const DEFS: Defs = {
  items: {
    potato: { id: 'potato', name: 'Potato', emoji: '', kind: 'raw', cost: 30 },
    tomato: { id: 'tomato', name: 'Tomato', emoji: '', kind: 'raw', cost: 40, spoilTicks: 600 },
    slicedTomato: { id: 'slicedTomato', name: 'Sliced tomato', emoji: '', kind: 'processed', spoilTicks: 600 },
    fries: { id: 'fries', name: 'Fries', emoji: '', kind: 'dish', spoilTicks: 300 },
  },
  buildings: {
    belt: bd('belt', 100),
    pantry: bd('pantry', 1000),
    splitter: bd('splitter', 800),
    merger: bd('merger', 800),
    filter: bd('filter', 1200),
    chopper: bd('chopper', 2500),
    fryer: bd('fryer', 4000),
    stove: bd('stove', 6000),
    assembler: bd('assembler', 5000, { tiles: 2 }),
    pass: bd('pass', 0, { placeable: false }),
    bin: bd('bin', 500),
  },
  stationRecipes: [{ station: 'chopper', input: 'tomato', output: 'slicedTomato', ticks: 20 }],
  dishes: {
    fries: { id: 'fries', name: 'Fries', emoji: '', refPrice: 300, popularity: 3, startsUnlocked: true, unlockCost: 0 },
  },
}

/** An empty 9 x 9 game. */
function empty(): GameState {
  const s = createGame(DEFS, 'test')
  s.width = 9
  s.height = 9
  s.tiles = new Array<number | null>(81).fill(null)
  s.buildings = {}
  s.nextId = 1
  s.phase = 'service' // time only passes in service (Step 10)
  s.menu = [] // Step 11: every arriving customer leaves at once, so none ever buys the dish on the shelf
  return s
}

function add(s: GameState, kind: BuildingKind, x: number, y: number, dir: 0 | 1 | 2 | 3 = 1) {
  const b = newBuilding(kind, s.nextId++, x, y, dir, 0, { ingredient: 'potato' })
  s.buildings[b.id] = b
  s.tiles[tileIndex(s, x, y)] = b.id
  return b
}

const item = (id: number, type: string, bornTick = 0): Item => ({ id, type, bornTick })

/** Run until `state.tick` equals `until` (ticks 0 .. until-1 have been stepped). */
function runTo(s: GameState, until: number): GameState {
  return runTicks(s, DEFS, until - s.tick)
}

describe('spoilage', () => {
  it('spoils a sliced tomato on a dead-end belt at exactly 600 ticks', () => {
    const s = empty()
    // Dead end: the belt faces east into an empty tile, so the item stays in slot 1.
    const belt = add(s, 'belt', 3, 4, 1)
    if (belt.kind !== 'belt') throw new Error('belt')
    belt.slots[1] = item(1, 'slicedTomato', 0)
    // After stepping ticks 0..599 the oldest step saw age 599: the item is still there.
    const before = runTo(s, 600)
    expect(buildingItems(before.buildings[belt.id]).length).toBe(1)
    expect(before.today.wasteSpoiled).toBe(0)
    // The step at tick 600 (age 600) removes it.
    const after = runTo(s, 601)
    expect(buildingItems(after.buildings[belt.id]).length).toBe(0)
    expect(after.today.wasteSpoiled).toBe(1)
    expect(after.today.spoiledByItem).toEqual({ slicedTomato: 1 })
    // (a customer may also arrive and leave in this tick, so only the spoiled events are compared)
    expect(after.events.filter((e) => e.type === 'spoiled')).toEqual([{ type: 'spoiled', tick: 600, x: 3, y: 4, item: 'slicedTomato' }])
    // The event lives only in the tick it happened; the count stays 1.
    expect(runTo(s, 602).events.filter((e) => e.type === 'spoiled')).toEqual([])
    expect(runTo(s, 900).today.wasteSpoiled).toBe(1)
  })

  it('spoils a dish on the pass shelf with no customer at exactly 300 ticks', () => {
    // The dish is placed on the shelf directly; the fixture's menu is empty, so no customer
    // ever waits for it.
    const s = empty()
    const pass = add(s, 'pass', 2, 2, 1)
    if (pass.kind !== 'pass') throw new Error('pass')
    pass.shelf = [item(1, 'fries', 10)]
    const alive = runTo(s, 310)
    expect(buildingItems(alive.buildings[pass.id]).length).toBe(1)
    const gone = runTo(s, 311)
    const p = gone.buildings[pass.id]
    expect(p.kind === 'pass' && p.shelf.length).toBe(0)
    expect(gone.today.wasteSpoiled).toBe(1)
    expect(gone.events).toEqual([{ type: 'spoiled', tick: 310, x: 2, y: 2, item: 'fries' }])
  })

  it('never spoils potatoes', () => {
    const s = empty()
    const belt = add(s, 'belt', 3, 4, 1)
    if (belt.kind !== 'belt') throw new Error('belt')
    belt.slots[1] = item(1, 'potato', 0)
    // Well past any spoil time but before the day ends (day end throws everything away).
    const out = runTo(s, 2000)
    expect(buildingItems(out.buildings[belt.id]).length).toBe(1)
    expect(out.today.wasteSpoiled).toBe(0)
  })

  it('removes spoiled items from stations, assemblers and routing buffers', () => {
    const s = empty()
    // Every building faces east into an empty tile, so nothing can leave.
    const chopper = add(s, 'chopper', 1, 1, 1)
    const fryer = add(s, 'fryer', 1, 3, 1)
    const asm = add(s, 'assembler', 1, 5, 1)
    const split = add(s, 'splitter', 5, 1, 1)
    const merge = add(s, 'merger', 5, 3, 1)
    const filt = add(s, 'filter', 5, 5, 1)
    if (chopper.kind !== 'chopper' || fryer.kind !== 'fryer' || asm.kind !== 'assembler') throw new Error('kinds')
    if (split.kind !== 'splitter' || merge.kind !== 'merger' || filt.kind !== 'filter') throw new Error('kinds')
    // A held (stuck) output keeps the chopper from working, so its inputs just age.
    chopper.input = [item(1, 'tomato', 0), item(2, 'tomato', 500)]
    chopper.output = item(3, 'slicedTomato', 0)
    fryer.output = item(4, 'fries', 0)
    asm.inputs = { tomato: [item(5, 'tomato', 0)], potato: [item(6, 'potato', 0)] }
    asm.output = item(7, 'fries', 0)
    split.buf = item(8, 'tomato', 0)
    merge.buf = item(9, 'slicedTomato', 0)
    filt.buf = item(10, 'potato', 0)
    const out = runTo(s, 601)
    const b = out.buildings
    const c = b[chopper.id]
    expect(c.kind === 'chopper' && c.input.map((i) => i.id)).toEqual([2])
    expect(c.kind === 'chopper' && c.output).toBe(null)
    expect(buildingItems(b[fryer.id])).toEqual([])
    expect(buildingItems(b[asm.id]).map((i) => i.id)).toEqual([6])
    expect(buildingItems(b[split.id])).toEqual([])
    expect(buildingItems(b[merge.id])).toEqual([])
    expect(buildingItems(b[filt.id]).map((i) => i.id)).toEqual([10])
    // chopper: tomato + sliced, fryer: fries, assembler: tomato + fries, splitter, merger.
    expect(out.today.wasteSpoiled).toBe(7)
  })

  it('records spoiled events with positions at the tick they happen', () => {
    const s = empty()
    const fryer = add(s, 'fryer', 1, 3, 1)
    const split = add(s, 'splitter', 5, 1, 1)
    if (fryer.kind !== 'fryer' || split.kind !== 'splitter') throw new Error('kinds')
    fryer.output = item(1, 'fries', 0)
    split.buf = item(2, 'tomato', 0)
    const seen: { tick: number; x: number; y: number; item: string }[] = []
    runTicks(s, DEFS, 700, (events) => {
      for (const e of events) if (e.type === 'spoiled') seen.push({ tick: e.tick, x: e.x, y: e.y, item: e.item })
    })
    expect(seen).toEqual([
      { tick: 300, x: 1, y: 3, item: 'fries' },
      { tick: 600, x: 5, y: 1, item: 'tomato' },
    ])
  })

  it('still counts binned items as wasteBinned, not spoiled', () => {
    const s = empty()
    const belt = add(s, 'belt', 3, 4, 1)
    add(s, 'bin', 4, 4, 1)
    if (belt.kind !== 'belt') throw new Error('belt')
    belt.slots[1] = item(1, 'tomato', 0)
    const out = runTo(s, 20)
    expect(out.today.wasteBinned).toBe(1)
    expect(out.today.wasteSpoiled).toBe(0)
  })

  it('is deterministic: same inputs give the same hash, input untouched', () => {
    const make = (): GameState => {
      const s = empty()
      const belt = add(s, 'belt', 3, 4, 1)
      const pass = add(s, 'pass', 2, 2, 1)
      if (belt.kind !== 'belt' || pass.kind !== 'pass') throw new Error('kinds')
      belt.slots[1] = item(1, 'slicedTomato', 0)
      pass.shelf = [item(2, 'fries', 0)]
      return s
    }
    const s = make()
    const a = runTicks(s, DEFS, 650)
    const c = runTicks(s, DEFS, 650)
    expect(stateHash(a)).toBe(stateHash(c))
    expect(stateHash(s)).toBe(stateHash(make()))
    // Two batches equal one batch.
    expect(stateHash(runTicks(runTicks(s, DEFS, 320), DEFS, 330))).toBe(stateHash(a))
    expect(a.today.wasteSpoiled).toBe(2)
  })
})
