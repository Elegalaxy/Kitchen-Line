// Tests for the tick loop (plan Step 3): pantry emit, belt movement, pass and bin.
// Lines are built by hand (pantry, 5 belts, pass/bin) on a 9 x 9 grid so they can face
// N, E, S and W. Checked: exact first-delivery tick, equal throughput for every facing,
// belts never hold more than 2 items, a dead-end line fills and the pantry blocks, a
// pantry without money shows noCash, same inputs give the same stateHash, and the input
// state is never mutated (it is deep-frozen).

import { describe, expect, it } from 'vitest'
import { createGame, newBuilding } from './game.ts'
import { neighbor, tileIndex } from './grid.ts'
import { stateHash } from './hash.ts'
import { runTicks } from './tick.ts'
import type { BuildingDef, BuildingKind, Defs, Dir, GameState } from './types.ts'

function debug(message: string): void {
  console.log(`[DEBUG tick] ${message}\n`)
}

function b(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

const DEFS: Defs = {
  items: { potato: { id: 'potato', name: 'Potato', emoji: '', kind: 'raw', cost: 30 } },
  buildings: {
    belt: b('belt', 100),
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
  },
}

const BELTS = 5

/**
 * A line starting at `start` going `dir`: pantry, 5 belts, then `end` (a pass, a bin or
 * nothing, in which case the last belt faces the grid edge). Built directly on the state.
 */
function line(dir: Dir, end: 'pass' | 'bin' | 'none'): GameState {
  const s = createGame(DEFS, 'test')
  s.width = 9
  s.height = 9
  s.tiles = new Array<number | null>(81).fill(null)
  s.buildings = {}
  s.nextId = 1
  let x = dir === 3 ? 7 : dir === 1 ? 1 : 4
  let y = dir === 0 ? 7 : dir === 2 ? 1 : 4
  const put = (kind: BuildingKind): void => {
    const bld = newBuilding(kind, s.nextId++, x, y, dir, 0, { ingredient: 'potato' })
    s.buildings[bld.id] = bld
    s.tiles[tileIndex(s, x, y)] = bld.id
    const n = neighbor(x, y, dir)
    x = n.x
    y = n.y
  }
  put('pantry')
  for (let i = 0; i < BELTS; i += 1) put('belt')
  if (end === 'pass') put('pass')
  if (end === 'bin') put('bin')
  return s
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

function passOf(s: GameState): { delivered: number } {
  const p = Object.values(s.buildings).find((x) => x.kind === 'pass')
  if (p === undefined || p.kind !== 'pass') throw new Error('no pass')
  return p
}

function pantryOf(s: GameState) {
  const p = Object.values(s.buildings).find((x) => x.kind === 'pantry')
  if (p === undefined || p.kind !== 'pantry') throw new Error('no pantry')
  return p
}

function maxBeltItems(s: GameState): number {
  let max = 0
  for (const bld of Object.values(s.buildings)) {
    if (bld.kind === 'belt') max = Math.max(max, bld.slots.filter((i) => i !== null).length)
  }
  return max
}

describe('tick loop', () => {
  it('delivers the first item at tick 30 on a 5-belt line', () => {
    // Emit at tick 0 into belt 1. Each belt takes 2 belt steps (6 ticks): slot 0 -> 1,
    // then push. Belt 5's push is the 5th belt, at tick 6 * 4 + 6 = 30.
    let s = deepFreeze(line(1, 'pass'))
    let first = -1
    for (let t = 0; t < 60 && first < 0; t += 1) {
      s = deepFreeze(runTicks(s, DEFS, 1))
      if (s.events.some((e) => e.type === 'delivered')) {
        const ev = s.events.find((e) => e.type === 'delivered')
        first = ev?.tick ?? -1
      }
    }
    debug(`first delivery at tick ${first}`)
    expect(first).toBe(30)
    expect(passOf(runTicks(line(1, 'pass'), DEFS, 30)).delivered).toBe(0)
    expect(passOf(runTicks(line(1, 'pass'), DEFS, 31)).delivered).toBe(1)
  })

  it('has identical throughput facing N, E, S and W', () => {
    const counts = ([0, 1, 2, 3] as Dir[]).map((d) => passOf(runTicks(line(d, 'pass'), DEFS, 600)).delivered)
    debug(`delivered in 600 ticks (N E S W): ${counts.join(' ')}`)
    // Emits at 0, 20, ...; deliveries at 30 + 20k <= 599 gives 29.
    expect(counts).toEqual([29, 29, 29, 29])
  })

  it('never holds more than 2 items per belt, and the dead-end line fills and blocks', () => {
    let s = line(1, 'none')
    let max = 0
    for (let t = 0; t < 400; t += 1) {
      s = runTicks(s, DEFS, 1)
      max = Math.max(max, maxBeltItems(s))
    }
    expect(max).toBe(2)
    for (const bld of Object.values(s.buildings)) {
      if (bld.kind === 'belt') {
        expect(bld.slots.every((i) => i !== null)).toBe(true)
        expect(bld.stalled).toBe(true)
        expect(bld.status).toBe('blocked')
      }
    }
    expect(pantryOf(s).status).toBe('blocked')
    const money = s.money
    expect(money).toBe(15000 - BELTS * 2 * 30)
    expect(runTicks(s, DEFS, 300).money).toBe(money)
  })

  it('shows noCash and emits nothing when money is below the cost', () => {
    const s = line(1, 'pass')
    s.money = 29
    const out = runTicks(s, DEFS, 100)
    expect(pantryOf(out).status).toBe('noCash')
    expect(out.money).toBe(29)
    expect(out.nextItemId).toBe(1)
    expect(passOf(out).delivered).toBe(0)
  })

  it('charges ingredient cost and counts binned items', () => {
    const out = runTicks(line(1, 'bin'), DEFS, 200)
    expect(out.today.ingredientCost).toBe(15000 - out.money)
    expect(out.today.wasteBinned).toBeGreaterThan(0)
    expect(out.events.length).toBeLessThanOrEqual(2)
  })

  it('is deterministic and never mutates the input', () => {
    const s = deepFreeze(line(2, 'pass'))
    const a = runTicks(s, DEFS, 250)
    const c = runTicks(s, DEFS, 250)
    expect(stateHash(a)).toBe(stateHash(c))
    expect(stateHash(s)).toBe(stateHash(line(2, 'pass')))
    expect(a.tick).toBe(250)
  })

  it('does not step buildings that are still warming up', () => {
    const s = line(1, 'pass')
    const p = pantryOf(s)
    p.onlineAt = 50
    const out = runTicks(s, DEFS, 40)
    expect(pantryOf(out).status).toBe('warming')
    expect(out.nextItemId).toBe(1)
  })
})
