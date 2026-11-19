// Tests for grid placement and money (plan Step 2). Sim tests may not import
// src/content, so this file uses a small hand-built Defs fixture with the same costs.
// Rules checked: place charges the cost, remove refunds 100%, the assembler covers 2
// tiles and rotates its footprint, every rejection leaves the state unchanged (same
// stateHash), and the input state is never mutated (it is deep-frozen).

import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { createGame } from './game.ts'
import { footprint, inBounds, neighbor, tileIndex } from './grid.ts'
import { stateHash } from './hash.ts'
import type { BuildingDef, BuildingKind, Command, Defs, GameState } from './types.ts'

function debug(message: string): void {
  console.log(`[DEBUG grid] ${message}\n`)
}

function b(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

const DEFS: Defs = {
  items: {
    potato: { id: 'potato', name: 'Potato', emoji: '', kind: 'raw', cost: 30 },
    tomato: { id: 'tomato', name: 'Tomato', emoji: '', kind: 'raw', cost: 40 },
    lettuce: { id: 'lettuce', name: 'Lettuce', emoji: '', kind: 'raw', cost: 40 },
    slicedTomato: { id: 'slicedTomato', name: 'Sliced', emoji: '', kind: 'processed' },
    choppedLettuce: { id: 'choppedLettuce', name: 'Chopped', emoji: '', kind: 'processed' },
    fries: { id: 'fries', name: 'Fries', emoji: '', kind: 'dish' },
    salad: { id: 'salad', name: 'Salad', emoji: '', kind: 'dish' },
  },
  buildings: {
    belt: b('belt', 100, { fast: { cost: 300, requiresTier: 'restaurant' } }),
    pantry: b('pantry', 1000),
    splitter: b('splitter', 800),
    merger: b('merger', 800),
    filter: b('filter', 1200),
    chopper: b('chopper', 2500),
    fryer: b('fryer', 4000),
    stove: b('stove', 6000),
    assembler: b('assembler', 5000, { tiles: 2 }),
    pass: b('pass', 0, { placeable: false }),
    bin: b('bin', 500),
  },
  stationRecipes: [],
  dishes: {
    fries: { id: 'fries', name: 'Fries', emoji: '', refPrice: 300, popularity: 3, startsUnlocked: true, unlockCost: 0 },
    salad: {
      id: 'salad',
      name: 'Salad',
      emoji: '',
      refPrice: 450,
      popularity: 2,
      startsUnlocked: true,
      unlockCost: 0,
      inputs: ['choppedLettuce', 'slicedTomato'],
    },
    burger: {
      id: 'burger',
      name: 'Burger',
      emoji: '',
      refPrice: 800,
      popularity: 3,
      startsUnlocked: false,
      unlockCost: 8000,
      inputs: ['slicedTomato'],
    },
  },
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

function fresh(): GameState {
  return deepFreeze(createGame(DEFS, 'test'))
}

function ok(state: GameState, cmd: Command): GameState {
  const out = applyCommand(state, DEFS, cmd)
  expect(out.result).toEqual({ ok: true })
  return out.state
}

function expectRejected(state: GameState, cmd: Command, reason: string): void {
  const before = stateHash(state)
  const out = applyCommand(state, DEFS, cmd)
  debug(`rejected ${cmd.type}: ${out.result.ok ? 'OK?!' : out.result.reason}`)
  expect(out.result.ok).toBe(false)
  if (!out.result.ok) {
    expect(out.result.reason).toBe(reason)
    expect(out.result.event).toMatchObject({ type: 'commandRejected', reason })
  }
  expect(stateHash(out.state)).toBe(before)
  expect(stateHash(state)).toBe(before)
}

describe('createGame', () => {
  it('builds the starting kitchen', () => {
    const s = createGame(DEFS, 'seed')
    expect([s.width, s.height, s.money, s.phase]).toEqual([8, 6, 15000, 'build'])
    expect(s.tiles[tileIndex(s, 7, 2)]).not.toBeNull()
    expect(s.tiles[tileIndex(s, 0, 2)]).not.toBeNull()
    const kinds = Object.values(s.buildings).map((x) => x.kind)
    expect(kinds.sort()).toEqual(['pantry', 'pass'])
    expect(s.menu).toEqual([{ dish: 'fries', price: 300 }])
    expect(s.unlocked).toEqual(['fries', 'salad'])
    expect(s.ratings).toHaveLength(10)
    expect(stateHash(createGame(DEFS, 'seed'))).toBe(stateHash(s))
    expect(stateHash(createGame(DEFS, 'other'))).not.toBe(stateHash(s))
  })
})

describe('geometry', () => {
  it('neighbor, bounds and assembler footprint', () => {
    expect(neighbor(3, 3, 0)).toEqual({ x: 3, y: 2 })
    expect(neighbor(3, 3, 1)).toEqual({ x: 4, y: 3 })
    expect(inBounds({ width: 8, height: 6 }, 7, 5)).toBe(true)
    expect(inBounds({ width: 8, height: 6 }, 8, 0)).toBe(false)
    expect(inBounds({ width: 8, height: 6 }, 1.5, 0)).toBe(false)
    expect(footprint('assembler', 2, 2, 0)).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }])
    expect(footprint('assembler', 2, 2, 1)).toEqual([{ x: 2, y: 2 }, { x: 2, y: 3 }])
    expect(footprint('assembler', 2, 2, 2)).toEqual([{ x: 2, y: 2 }, { x: 1, y: 2 }])
    expect(footprint('assembler', 2, 2, 3)).toEqual([{ x: 2, y: 2 }, { x: 2, y: 1 }])
    expect(footprint('belt', 2, 2, 3)).toEqual([{ x: 2, y: 2 }])
  })
})

describe('place and remove', () => {
  it('charges the cost on place and refunds 100% on remove', () => {
    const s0 = fresh()
    const s1 = ok(s0, { type: 'place', kind: 'chopper', x: 3, y: 2, dir: 1 })
    debug(`money after chopper ${s1.money}`)
    expect(s1.money).toBe(15000 - 2500)
    expect(s1.tiles[tileIndex(s1, 3, 2)]).not.toBeNull()
    expect(s0.money).toBe(15000)
    const s2 = ok(deepFreeze(s1), { type: 'remove', x: 3, y: 2 })
    expect(s2.money).toBe(15000)
    expect(s2.tiles[tileIndex(s2, 3, 2)]).toBeNull()
    expect(Object.keys(s2.buildings)).toHaveLength(2)
  })

  it('applies place config and charges fast belts at the fast cost', () => {
    const s = ok(fresh(), { type: 'place', kind: 'pantry', x: 0, y: 4, dir: 1, config: { ingredient: 'tomato', interval: 40 } })
    const pantry = Object.values(s.buildings).find((x) => x.kind === 'pantry' && x.y === 4)
    expect(pantry).toMatchObject({ ingredient: 'tomato', interval: 40 })
    expectRejected(fresh(), { type: 'place', kind: 'belt', x: 1, y: 1, dir: 1, config: { fast: true } }, 'locked by tier')
    const restaurant = deepFreeze({ ...structuredClone(createGame(DEFS, 't')), tier: 'restaurant' as const })
    const f = ok(restaurant, { type: 'place', kind: 'belt', x: 1, y: 1, dir: 1, config: { fast: true } })
    expect(f.money).toBe(15000 - 300)
    expect(ok(deepFreeze(f), { type: 'remove', x: 1, y: 1 }).money).toBe(15000)
  })

  it('the assembler fills 2 tiles and rotates its footprint', () => {
    const s1 = ok(fresh(), { type: 'place', kind: 'assembler', x: 3, y: 3, dir: 0 })
    expect(s1.money).toBe(10000)
    const id = s1.tiles[tileIndex(s1, 3, 3)]
    expect(id).not.toBeNull()
    expect(s1.tiles[tileIndex(s1, 4, 3)]).toBe(id)
    const s2 = ok(deepFreeze(s1), { type: 'rotate', x: 4, y: 3 })
    expect(s2.buildings[id as number].dir).toBe(1)
    expect(s2.tiles[tileIndex(s2, 3, 3)]).toBe(id)
    expect(s2.tiles[tileIndex(s2, 4, 3)]).toBeNull()
    expect(s2.tiles[tileIndex(s2, 3, 4)]).toBe(id)
    const s3 = ok(deepFreeze(s2), { type: 'remove', x: 3, y: 4 })
    expect(s3.money).toBe(15000)
    expect(s3.tiles.filter((t) => t === id)).toHaveLength(0)
  })

  it('rejects a blocked or out-of-bounds assembler rotation', () => {
    let s = ok(fresh(), { type: 'place', kind: 'assembler', x: 3, y: 3, dir: 0 })
    s = ok(deepFreeze(s), { type: 'place', kind: 'bin', x: 3, y: 4, dir: 0 })
    expectRejected(deepFreeze(s), { type: 'rotate', x: 3, y: 3 }, 'occupied')
    const edge = ok(fresh(), { type: 'place', kind: 'assembler', x: 3, y: 5, dir: 0 })
    expectRejected(deepFreeze(edge), { type: 'rotate', x: 3, y: 5 }, 'out of bounds')
  })

  it('rejects invalid placements and leaves state unchanged', () => {
    expectRejected(fresh(), { type: 'place', kind: 'bin', x: 8, y: 0, dir: 0 }, 'out of bounds')
    expectRejected(fresh(), { type: 'place', kind: 'bin', x: -1, y: 0, dir: 0 }, 'out of bounds')
    expectRejected(fresh(), { type: 'place', kind: 'assembler', x: 7, y: 5, dir: 0 }, 'out of bounds')
    expectRejected(fresh(), { type: 'place', kind: 'bin', x: 0, y: 2, dir: 0 }, 'occupied')
    expectRejected(fresh(), { type: 'place', kind: 'assembler', x: 6, y: 2, dir: 0 }, 'occupied')
    expectRejected(fresh(), { type: 'place', kind: 'pass', x: 1, y: 1, dir: 0 }, 'pass cannot be placed')
    expectRejected(fresh(), { type: 'place', kind: 'bin', x: 1.5, y: 1, dir: 0 }, 'invalid command')
    expectRejected(fresh(), { type: 'place', kind: 'oven' as BuildingKind, x: 1, y: 1, dir: 0 }, 'invalid command')
    expectRejected(fresh(), { type: 'place', kind: 'bin', x: 1, y: 1, dir: 7 as 0 }, 'invalid command')
    expectRejected(fresh(), { type: 'place', kind: 'pantry', x: 1, y: 1, dir: 0, config: { interval: 33 } }, 'invalid config')
    expectRejected(fresh(), { type: 'place', kind: 'bin', x: 1, y: 1, dir: 0, config: { interval: 20 } }, 'invalid config')
  })

  it('rejects when the player cannot afford it', () => {
    const poor = deepFreeze({ ...structuredClone(createGame(DEFS, 't')), money: 2499 })
    expectRejected(poor, { type: 'place', kind: 'chopper', x: 3, y: 2, dir: 1 }, 'cannot afford')
    const exact = deepFreeze({ ...structuredClone(createGame(DEFS, 't')), money: 2500 })
    expect(ok(exact, { type: 'place', kind: 'chopper', x: 3, y: 2, dir: 1 }).money).toBe(0)
  })

  it('rejects removing the pass or an empty tile', () => {
    expectRejected(fresh(), { type: 'remove', x: 7, y: 2 }, 'pass cannot be removed')
    expectRejected(fresh(), { type: 'remove', x: 4, y: 4 }, 'nothing there')
    expectRejected(fresh(), { type: 'remove', x: 99, y: 4 }, 'nothing there')
  })

  it('rejects commands in the wrong phase and not-yet-built commands', () => {
    const summary = deepFreeze({ ...structuredClone(createGame(DEFS, 't')), phase: 'summary' as const })
    expectRejected(summary, { type: 'place', kind: 'bin', x: 1, y: 1, dir: 0 }, 'wrong phase')
    expectRejected(fresh(), { type: 'buyExpansion' }, 'not implemented')
  })

  it('counts destroyed items on remove and warms up non-belt buildings during service', () => {
    const base = structuredClone(createGame(DEFS, 't'))
    base.phase = 'service'
    base.tick = 100
    const s1 = ok(deepFreeze(base), { type: 'place', kind: 'chopper', x: 3, y: 2, dir: 1 })
    const chopper = Object.values(s1.buildings).find((x) => x.kind === 'chopper')
    expect(chopper).toMatchObject({ onlineAt: 130, status: 'warming' })
    const s2 = ok(deepFreeze(s1), { type: 'place', kind: 'belt', x: 1, y: 2, dir: 1 })
    expect(Object.values(s2.buildings).find((x) => x.kind === 'belt')?.onlineAt).toBe(100)
    const loaded = structuredClone(s2)
    const c = Object.values(loaded.buildings).find((x) => x.kind === 'chopper')
    if (c?.kind !== 'chopper') throw new Error('chopper missing')
    c.input.push({ id: 1, type: 'potato', bornTick: 0 }, { id: 2, type: 'potato', bornTick: 0 })
    c.output = { id: 3, type: 'potatoStrips', bornTick: 0 }
    const s3 = ok(deepFreeze(loaded), { type: 'remove', x: 3, y: 2 })
    expect(s3.today.wasteDestroyed).toBe(3)
    expect(s3.money).toBe(s2.money + 2500)
  })
})

describe('rotate and configure', () => {
  it('rotates a belt in place and configures a filter and assembler', () => {
    let s = ok(fresh(), { type: 'place', kind: 'belt', x: 2, y: 2, dir: 0 })
    s = ok(deepFreeze(s), { type: 'rotate', x: 2, y: 2 })
    expect(Object.values(s.buildings).find((x) => x.kind === 'belt')?.dir).toBe(1)
    s = ok(deepFreeze(s), { type: 'place', kind: 'filter', x: 3, y: 2, dir: 1 })
    s = ok(deepFreeze(s), { type: 'configure', x: 3, y: 2, filterItem: 'tomato' })
    expect(Object.values(s.buildings).find((x) => x.kind === 'filter')).toMatchObject({ filterItem: 'tomato' })
    s = ok(deepFreeze(s), { type: 'place', kind: 'assembler', x: 4, y: 3, dir: 0 })
    s = ok(deepFreeze(s), { type: 'configure', x: 5, y: 3, recipe: 'salad' })
    expect(Object.values(s.buildings).find((x) => x.kind === 'assembler')).toMatchObject({ recipe: 'salad' })
    expectRejected(deepFreeze(s), { type: 'configure', x: 4, y: 3, recipe: 'burger' }, 'locked recipe')
    expectRejected(deepFreeze(s), { type: 'configure', x: 4, y: 3, recipe: 'fries' }, 'invalid config')
    expectRejected(deepFreeze(s), { type: 'configure', x: 4, y: 3, interval: 20 }, 'invalid config')
    expectRejected(deepFreeze(s), { type: 'configure', x: 4, y: 3 }, 'invalid config')
    expectRejected(deepFreeze(s), { type: 'configure', x: 6, y: 5, recipe: 'salad' }, 'nothing there')
  })

  it('configures the pre-placed pantry', () => {
    const s = ok(fresh(), { type: 'configure', x: 0, y: 2, ingredient: 'lettuce', interval: 80 })
    expect(Object.values(s.buildings).find((x) => x.kind === 'pantry')).toMatchObject({ ingredient: 'lettuce', interval: 80 })
    expectRejected(fresh(), { type: 'configure', x: 0, y: 2, ingredient: 'fries' }, 'invalid config')
  })
})
