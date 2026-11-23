// Tests for the pro stations (GAME_DESIGN 5.3, plan doc/plans/2026-11-24-pro-stations.md). Inline Defs
// (sim tests import only vitest and src/sim). Checked: a pro fryer / stove / assembler needs 2/3 of the
// base ticks (rounded up), costs the pro price, is locked until the restaurant tier, only exists for those
// three kinds, is refunded in full, and a game without pro buildings has no `pro` field at all (so hashes
// cannot change).

import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { createGame } from './game.ts'
import { stateHash } from './hash.ts'
import { stationTicks } from './stations.ts'
import { runTicks } from './tick.ts'
import { tryInsert } from './transfer.ts'
import type { Building, BuildingDef, BuildingKind, Command, Defs, GameState } from './types.ts'

function b(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}
const PRO = { requiresTier: 'restaurant' } as const

const DEFS: Defs = {
  items: {
    potato: { id: 'potato', name: 'Potato', emoji: '', kind: 'raw', cost: 30 },
    potatoStrips: { id: 'potatoStrips', name: 'Strips', emoji: '', kind: 'processed' },
    fries: { id: 'fries', name: 'Fries', emoji: '', kind: 'dish' },
    choppedLettuce: { id: 'choppedLettuce', name: 'Chopped', emoji: '', kind: 'processed' },
    slicedTomato: { id: 'slicedTomato', name: 'Sliced', emoji: '', kind: 'processed' },
    salad: { id: 'salad', name: 'Salad', emoji: '', kind: 'dish' },
  },
  buildings: {
    belt: b('belt', 100, { fast: { cost: 300, requiresTier: 'restaurant' } }),
    pantry: b('pantry', 1000),
    splitter: b('splitter', 800),
    merger: b('merger', 800),
    filter: b('filter', 1200),
    chopper: b('chopper', 2500),
    fryer: b('fryer', 4000, { pro: { cost: 8000, ...PRO } }),
    stove: b('stove', 6000, { pro: { cost: 12000, ...PRO } }),
    assembler: b('assembler', 5000, { tiles: 2, pro: { cost: 10000, ...PRO } }),
    pass: b('pass', 0, { placeable: false }),
    bin: b('bin', 500),
  },
  stationRecipes: [
    { station: 'chopper', input: 'potato', output: 'potatoStrips', ticks: 20 },
    { station: 'fryer', input: 'potatoStrips', output: 'fries', ticks: 60 },
  ],
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
  },
}

function restaurant(): GameState {
  return { ...createGame(DEFS, 'pro'), tier: 'restaurant' as const }
}

function run(s: GameState, cmd: Command): GameState {
  const out = applyCommand(s, DEFS, cmd)
  if (!out.result.ok) throw new Error(`command failed: ${out.result.reason}`)
  return out.state
}

function reason(s: GameState, cmd: Command): string {
  const out = applyCommand(s, DEFS, cmd)
  return out.result.ok ? 'ok' : out.result.reason
}

function find<K extends BuildingKind>(s: GameState, kind: K): Building & { kind: K } {
  const f = Object.values(s.buildings).find((x) => x.kind === kind)
  if (f === undefined) throw new Error(`no ${kind}`)
  return f as Building & { kind: K }
}

const place = (kind: BuildingKind, x: number, config?: { pro?: boolean; recipe?: 'salad' }): Command => ({
  type: 'place',
  kind,
  x,
  y: 2,
  dir: 1,
  ...(config === undefined ? {} : { config }),
})

describe('pro placement', () => {
  it('is locked at the stall tier and charges the pro price at the restaurant tier', () => {
    for (const [kind, cost] of [
      ['fryer', 8000],
      ['stove', 12000],
      ['assembler', 10000],
    ] as const) {
      expect(reason(createGame(DEFS, 't'), place(kind, 3, { pro: true }))).toBe('locked by tier')
      const s = run(restaurant(), place(kind, 3, { pro: true }))
      expect(s.money).toBe(15000 - cost)
      expect(find(s, kind).pro).toBe(true)
    }
  })

  it('a base station costs the base price and has no pro field, even at the restaurant tier', () => {
    const s = run(restaurant(), place('fryer', 3))
    expect(s.money).toBe(15000 - 4000)
    expect('pro' in find(s, 'fryer')).toBe(false)
    expect('pro' in find(run(restaurant(), place('fryer', 3, { pro: false })), 'fryer')).toBe(false)
  })

  it('refuses pro for kinds that have no pro variant or a non-boolean pro', () => {
    for (const kind of ['chopper', 'belt', 'pantry', 'bin'] as const) {
      expect(reason(restaurant(), place(kind, 3, { pro: true }))).toBe('invalid config')
    }
    const bad = { type: 'place', kind: 'fryer', x: 3, y: 2, dir: 1, config: { pro: 'yes' } } as unknown as Command
    expect(reason(restaurant(), bad)).toBe('invalid config')
  })

  it('refuses a pro station you cannot afford', () => {
    const s = { ...restaurant(), money: 7999 }
    expect(reason(s, place('fryer', 3, { pro: true }))).toBe('cannot afford')
  })

  it('selling refunds the full pro price', () => {
    for (const [kind, cost] of [
      ['fryer', 8000],
      ['stove', 12000],
      ['assembler', 10000],
    ] as const) {
      const placed = run(restaurant(), place(kind, 3, { pro: true }))
      const sold = run(placed, { type: 'remove', x: 3, y: 2 })
      expect(sold.money).toBe(15000)
      expect(placed.money).toBe(15000 - cost)
    }
  })

  it('applies pro together with an assembler recipe', () => {
    const s = run(restaurant(), place('assembler', 3, { pro: true, recipe: 'salad' }))
    expect(find(s, 'assembler')).toMatchObject({ pro: true, recipe: 'salad' })
  })
})

describe('pro speed', () => {
  it('stationTicks is 2/3 of the base, rounded up', () => {
    expect(stationTicks(60, true)).toBe(40)
    expect(stationTicks(30, true)).toBe(20)
    expect(stationTicks(20, true)).toBe(14)
    expect(stationTicks(60, false)).toBe(60)
    expect(stationTicks(60, undefined)).toBe(60)
  })

  function friesLine(pro: boolean): GameState {
    let s = restaurant()
    s = run(s, place('belt', 1))
    s = run(s, place('chopper', 2))
    s = run(s, place('belt', 3))
    s = run(s, place('fryer', 4, pro ? { pro: true } : undefined))
    s = run(s, place('belt', 5))
    s = run(s, place('belt', 6))
    s.menu = []
    s.phase = 'service'
    return s
  }

  function fryTicks(s0: GameState): number[] {
    const fried: number[] = []
    let s = s0
    for (let t = 0; t < 600; t += 1) {
      s = runTicks(s, DEFS, 1)
      for (const e of s.events) if (e.type === 'stationDone' && e.output === 'fries') fried.push(e.tick)
      find(s, 'pass').shelf = []
    }
    return fried
  }

  it('a pro fryer makes fries every 40 ticks where the base fryer needs 60', () => {
    const base = fryTicks(friesLine(false))
    const pro = fryTicks(friesLine(true))
    for (let i = 1; i < base.length; i += 1) expect((base[i] ?? 0) - (base[i - 1] ?? 0)).toBe(60)
    for (let i = 1; i < pro.length; i += 1) expect((pro[i] ?? 0) - (pro[i - 1] ?? 0)).toBe(40)
    expect(pro.length).toBeGreaterThan(base.length)
    expect((pro[0] ?? 0) + 20).toBe(base[0])
  })

  it('a pro assembler makes the dish after 20 ticks (base 30)', () => {
    for (const [pro, ticks] of [
      [false, 30],
      [true, 20],
    ] as const) {
      let s = run(restaurant(), place('assembler', 4, { recipe: 'salad', ...(pro ? { pro: true } : {}) }))
      s = run(s, place('belt', 5))
      s = run(s, place('belt', 6))
      s.phase = 'service'
      const asm = find(s, 'assembler')
      const item = (id: number, type: string) => ({ id, type, bornTick: 0 })
      tryInsert(s, DEFS, asm, item(1, 'slicedTomato'), 3)
      tryInsert(s, DEFS, asm, item(2, 'choppedLettuce'), 3)
      expect(runTicks(s, DEFS, ticks - 1).events.some((e) => e.type === 'assembled')).toBe(false)
      expect(runTicks(s, DEFS, ticks).events.some((e) => e.type === 'assembled')).toBe(true)
    }
  })

  it('a game with no pro buildings has the same hash as one that never heard of pro', () => {
    const a = run(restaurant(), place('fryer', 3))
    const c = run(restaurant(), place('fryer', 3, { pro: false }))
    expect(stateHash(a)).toBe(stateHash(c))
    expect(JSON.stringify(a)).not.toContain('"pro":')
  })
})
