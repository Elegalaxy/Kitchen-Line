// Tests for splitter, merger and filter (plan Step 7). Fixtures are inline Defs (sim
// tests may import only vitest and src/sim). Checked: the splitter alternates 50/50 and
// sends everything to the open side when the other is missing; the merger shares its
// output between saturated inputs (two and three) so none starves; the filter sends only
// the chosen item left and everything else front, and with no filter everything goes
// front; each building holds exactly one item.

import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { createGame } from './game.ts'
import { runTicks } from './tick.ts'
import { tryInsert } from './transfer.ts'
import type { Building, BuildingDef, BuildingKind, Command, Defs, GameState, Item } from './types.ts'

function debug(message: string): void {
  console.log(`[DEBUG logistics] ${message}\n`)
}

function b(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

const DEFS: Defs = {
  items: {
    potato: { id: 'potato', name: 'Potato', emoji: '', kind: 'raw', cost: 30 },
    tomato: { id: 'tomato', name: 'Tomato', emoji: '', kind: 'raw', cost: 40 },
    patty: { id: 'patty', name: 'Patty', emoji: '', kind: 'raw', cost: 120 },
  },
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
  dishes: {},
}

type Kind = 'belt' | 'pantry' | 'splitter' | 'merger' | 'filter' | 'bin'
const at = (kind: Kind, x: number, y: number, dir: 0 | 1 | 2 | 3, config?: Extract<Command, { type: 'place' }>['config']): Command => ({
  type: 'place',
  kind,
  x,
  y,
  dir,
  config,
})

function build(cmds: Command[]): GameState {
  let s = createGame(DEFS, 'test')
  s.money = 1_000_000
  for (const c of cmds) {
    const out = applyCommand(s, DEFS, c)
    if (!out.result.ok) throw new Error(`command failed: ${out.result.reason}`)
    s = out.state
  }
  return s
}

function find<K extends BuildingKind>(s: GameState, kind: K): Building & { kind: K } {
  const f = Object.values(s.buildings).find((x) => x.kind === kind)
  if (f === undefined) throw new Error(`no ${kind}`)
  return f as Building & { kind: K }
}

function setPantries(s: GameState, interval: number): void {
  for (const bd of Object.values(s.buildings)) if (bd.kind === 'pantry') bd.interval = interval
}

type Binned = { x: number; y: number; item: string }

/** Run `n` ticks one at a time, collecting `binned` events. */
function runCollect(s: GameState, n: number): { state: GameState; binned: Binned[] } {
  const binned: Binned[] = []
  let cur = s
  for (let t = 0; t < n; t += 1) {
    cur = runTicks(cur, DEFS, 1)
    for (const e of cur.events) if (e.type === 'binned') binned.push({ x: e.x, y: e.y, item: e.item })
  }
  return { state: cur, binned }
}

const count = (list: Binned[], pred: (e: Binned) => boolean): number => list.filter(pred).length
const mk = (id: number, type = 'potato'): Item => ({ id, type, bornTick: 0 })

describe('splitter', () => {
  const line = [at('belt', 1, 2, 1), at('splitter', 2, 2, 1)]

  it('alternates between two bins, 50/50 within 1', () => {
    const s = build([...line, at('bin', 2, 1, 0), at('bin', 2, 3, 0)])
    const { binned } = runCollect(s, 800)
    const left = count(binned, (e) => e.y === 1)
    const right = count(binned, (e) => e.y === 3)
    debug(`splitter left ${left}, right ${right}`)
    expect(left + right).toBeGreaterThan(30)
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
  })

  it('sends everything to the open side when the other side is blocked', () => {
    const s = build([...line, at('bin', 2, 1, 0)])
    const { binned } = runCollect(s, 800)
    debug(`splitter one side: ${binned.length}`)
    expect(binned.length).toBeGreaterThan(30)
    expect(count(binned, (e) => e.y === 1)).toBe(binned.length)
  })

  it('refuses input from its sides and front, and holds exactly one item', () => {
    const s = build([at('splitter', 4, 4, 1)])
    const sp = find(s, 'splitter')
    expect(tryInsert(s, DEFS, sp, mk(1), 0)).toBe(false)
    expect(tryInsert(s, DEFS, sp, mk(2), 1)).toBe(false)
    expect(tryInsert(s, DEFS, sp, mk(3), 3)).toBe(true)
    expect(tryInsert(s, DEFS, sp, mk(4), 3)).toBe(false)
    expect(sp.buf?.id).toBe(3)
    // Nothing to push into: it keeps the item and reports blocked.
    const after = runTicks(s, DEFS, 5)
    expect(find(after, 'splitter').buf?.id).toBe(3)
    expect(find(after, 'splitter').status).toBe('blocked')
  })
})

describe('merger', () => {
  // Merger at (3,2) facing E; sides: N belt (3,1) facing S, S belt (3,3) facing N,
  // back belt (2,2) facing E. Output belt (4,2) to a bin at (5,2).
  const out = [at('merger', 3, 2, 1), at('belt', 4, 2, 1), at('bin', 5, 2, 1)]

  it('takes 50/50 from two saturated side inputs', () => {
    const s = build([
      at('pantry', 3, 0, 2, { ingredient: 'potato' }),
      at('belt', 3, 1, 2),
      at('pantry', 3, 4, 0, { ingredient: 'tomato' }),
      at('belt', 3, 3, 0),
      ...out,
    ])
    setPantries(s, 1)
    const { binned } = runCollect(s, 600)
    const a = count(binned, (e) => e.item === 'potato')
    const c = count(binned, (e) => e.item === 'tomato')
    debug(`merger two inputs: ${a} / ${c}`)
    expect(a + c).toBeGreaterThan(100)
    expect(Math.abs(a - c)).toBeLessThanOrEqual(1)
  })

  it('shares fairly between three saturated inputs (left, right, back)', () => {
    const s = build([
      at('pantry', 3, 0, 2, { ingredient: 'potato' }),
      at('belt', 3, 1, 2),
      at('pantry', 3, 4, 0, { ingredient: 'tomato' }),
      at('belt', 3, 3, 0),
      at('pantry', 1, 2, 1, { ingredient: 'patty' }),
      at('belt', 2, 2, 1),
      ...out,
    ])
    setPantries(s, 1)
    const { binned } = runCollect(s, 900)
    const n = ['potato', 'tomato', 'patty'].map((t) => count(binned, (e) => e.item === t))
    debug(`merger three inputs: ${n.join(' / ')}`)
    expect(Math.min(...n)).toBeGreaterThan(30)
    expect(Math.max(...n) - Math.min(...n)).toBeLessThanOrEqual(1)
  })

  it('passes everything from a single active input', () => {
    const s = build([at('pantry', 3, 0, 2, { ingredient: 'potato' }), at('belt', 3, 1, 2), ...out])
    setPantries(s, 1)
    const { binned } = runCollect(s, 300)
    expect(binned.length).toBeGreaterThan(50)
  })

  it('refuses input from its front and holds one item', () => {
    const s = build([at('merger', 4, 4, 1)])
    const m = find(s, 'merger')
    expect(tryInsert(s, DEFS, m, mk(1), 1)).toBe(false)
    expect(tryInsert(s, DEFS, m, mk(2), 0)).toBe(true)
    expect(tryInsert(s, DEFS, m, mk(3), 3)).toBe(false)
  })
})

describe('filter', () => {
  // pantry(potato) (0,2) -> belts (1,2),(2,2),(3,2) -> filter (4,2) facing E.
  // A tomato pantry at (2,1) feeds belt (2,2) from the side. Left bin (4,1), front bin (5,2).
  const mixed = (): GameState => {
    const s = build([
      at('belt', 1, 2, 1),
      at('belt', 2, 2, 1),
      at('pantry', 2, 1, 2, { ingredient: 'tomato' }),
      at('belt', 3, 2, 1),
      at('filter', 4, 2, 1),
      at('bin', 4, 1, 0),
      at('bin', 5, 2, 1),
    ])
    setPantries(s, 10)
    return s
  }

  it('sends only tomatoes left and everything else front', () => {
    let s = mixed()
    s = applyCommand(s, DEFS, { type: 'configure', x: 4, y: 2, filterItem: 'tomato' }).state
    const { binned } = runCollect(s, 800)
    const left = binned.filter((e) => e.y === 1)
    const front = binned.filter((e) => e.y === 2)
    debug(`filter left ${left.length}, front ${front.length}`)
    expect(left.length).toBeGreaterThan(20)
    expect(front.length).toBeGreaterThan(20)
    expect(left.every((e) => e.item === 'tomato')).toBe(true)
    expect(front.every((e) => e.item === 'potato')).toBe(true)
  })

  it('sends everything front when no filter is set', () => {
    const { binned } = runCollect(mixed(), 800)
    expect(binned.length).toBeGreaterThan(40)
    expect(binned.every((e) => e.y === 2)).toBe(true)
    expect(binned.some((e) => e.item === 'tomato')).toBe(true)
  })

  it('keeps a held item while its exit is blocked and holds only one', () => {
    let s = build([at('filter', 4, 4, 1)])
    s = applyCommand(s, DEFS, { type: 'configure', x: 4, y: 4, filterItem: 'tomato' }).state
    const f = find(s, 'filter')
    expect(tryInsert(s, DEFS, f, mk(1, 'tomato'), 3)).toBe(true)
    expect(tryInsert(s, DEFS, f, mk(2, 'tomato'), 3)).toBe(false)
    expect(tryInsert(s, DEFS, f, mk(3, 'tomato'), 0)).toBe(false)
    const after = runTicks(s, DEFS, 5)
    expect(find(after, 'filter').buf?.id).toBe(1)
    expect(find(after, 'filter').status).toBe('blocked')
  })
})
