// Tests for the day cycle (plan Step 10). Inline Defs fixture (sim tests import only src/sim).
// Checked: phaseAt at every boundary, a day ends at exactly 2400 ticks of service
// (lastDay, totals.days, phase summary), dismissSummary starts the next build phase,
// ticks outside service change nothing, a building placed in service warms up for 30
// ticks, and the menu commands are rejected during service.

import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { DAY_TICKS } from './constants.ts'
import { phaseAt } from './day.ts'
import { createGame, newBuilding } from './game.ts'
import { tileIndex } from './grid.ts'
import { stateHash } from './hash.ts'
import { runTicks } from './tick.ts'
import { buildingItems } from './spoil.ts'
import type { BuildingDef, BuildingKind, Command, Defs, GameState, Item } from './types.ts'

function bd(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

const DEFS: Defs = {
  items: {
    potato: { id: 'potato', name: 'Potato', emoji: '', kind: 'raw', cost: 30 },
    fries: { id: 'fries', name: 'Fries', emoji: '', kind: 'dish' },
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
  stationRecipes: [],
  dishes: {
    fries: { id: 'fries', name: 'Fries', emoji: '', refPrice: 300, popularity: 3, startsUnlocked: true, unlockCost: 0 },
  },
}

function must(s: GameState, cmd: Command): GameState {
  const out = applyCommand(s, DEFS, cmd)
  if (!out.result.ok) throw new Error(`command failed: ${out.result.reason}`)
  return out.state
}

const inService = (): GameState => must(createGame(DEFS, 'day'), { type: 'openService' })

describe('phaseAt', () => {
  it('returns the right phase on both sides of every boundary', () => {
    const cases: [number, string][] = [
      [0, 'open'],
      [239, 'open'],
      [240, 'lunchRush'],
      [839, 'lunchRush'],
      [840, 'quiet'],
      [1379, 'quiet'],
      [1380, 'dinnerRush'],
      [1979, 'dinnerRush'],
      [1980, 'quiet'],
      [2279, 'quiet'],
      [2280, 'closing'],
      [2399, 'closing'],
    ]
    for (const [tick, phase] of cases) expect(phaseAt(tick), `dayTick ${tick}`).toBe(phase)
  })
})

describe('day cycle', () => {
  it('openService starts the clock at 0 with fresh stats, and only from build', () => {
    const build = createGame(DEFS, 'day')
    build.today.served = 5
    const s = must(build, { type: 'openService' })
    expect(s).toMatchObject({ phase: 'service', dayTick: 0, day: 1 })
    expect(s.today.served).toBe(0)
    const again = applyCommand(s, DEFS, { type: 'openService' })
    expect(again.result).toMatchObject({ ok: false, reason: 'wrong phase' })
    expect(again.state).toBe(s)
  })

  it('ends the day at exactly 2400 ticks of service', () => {
    const s0 = inService()
    const before = runTicks(s0, DEFS, DAY_TICKS - 1)
    expect(before).toMatchObject({ phase: 'service', dayTick: 2399, tick: 2399 })
    expect(before.lastDay).toBeNull()
    expect(before.totals.days).toBe(0)
    const end = runTicks(before, DEFS, 1)
    expect(end).toMatchObject({ phase: 'summary', dayTick: 2400, day: 1 })
    expect(end.totals.days).toBe(1)
    expect(end.lastDay).toEqual(end.today)
    expect(end.lastDay?.day).toBe(1)
    // One call asking for more ticks than are left stops at the end of the day.
    const long = runTicks(s0, DEFS, 5000)
    expect(long.tick).toBe(2400)
    expect(stateHash(long)).toBe(stateHash(end))
  })

  it('dismissSummary starts the next build phase on day + 1, only from summary', () => {
    const summary = runTicks(inService(), DEFS, DAY_TICKS)
    const build = must(summary, { type: 'dismissSummary' })
    expect(build).toMatchObject({ phase: 'build', day: 2, dayTick: 0 })
    expect(build.lastDay?.day).toBe(1)
    const bad = applyCommand(build, DEFS, { type: 'dismissSummary' })
    expect(bad.result).toMatchObject({ ok: false, reason: 'wrong phase' })
    // A second day works the same way.
    const day2 = runTicks(must(build, { type: 'openService' }), DEFS, DAY_TICKS)
    expect(day2).toMatchObject({ phase: 'summary', day: 2 })
    expect(day2.totals.days).toBe(2)
    expect(day2.lastDay?.day).toBe(2)
  })

  it('does nothing outside service (hash equal)', () => {
    const build = createGame(DEFS, 'day')
    expect(stateHash(runTicks(build, DEFS, 500))).toBe(stateHash(build))
    const summary = runTicks(inService(), DEFS, DAY_TICKS)
    expect(stateHash(runTicks(summary, DEFS, 500))).toBe(stateHash(summary))
  })

  it('a building placed in service warms up for 30 ticks, in build it is online at once', () => {
    const built = must(createGame(DEFS, 'day'), { type: 'place', kind: 'chopper', x: 3, y: 2, dir: 1 })
    const inBuild = Object.values(built.buildings).find((b) => b.kind === 'chopper')
    expect(inBuild).toMatchObject({ onlineAt: 0, status: 'idle' })

    let s = runTicks(inService(), DEFS, 10)
    s = must(s, { type: 'place', kind: 'chopper', x: 3, y: 2, dir: 1 })
    const find = (g: GameState) => Object.values(g.buildings).find((b) => b.kind === 'chopper')
    expect(find(s)).toMatchObject({ onlineAt: 40, status: 'warming' })
    expect(find(runTicks(s, DEFS, 29))?.status).toBe('warming')
    expect(find(runTicks(s, DEFS, 30))?.status).toBe('warming') // tick 39 stepped, onlineAt 40
    expect(find(runTicks(s, DEFS, 31))?.status).not.toBe('warming')
  })

  it('rejects setMenu, setPrice and unlockRecipe during service, leaving the state unchanged', () => {
    const s = inService()
    const cmds: Command[] = [
      { type: 'setMenu', dishes: ['fries'] },
      { type: 'setPrice', dish: 'fries', cents: 350 },
      { type: 'unlockRecipe', dish: 'fries' },
    ]
    for (const cmd of cmds) {
      const out = applyCommand(s, DEFS, cmd)
      expect(out.result).toMatchObject({ ok: false, reason: 'Menu is locked during service' })
      expect(out.state).toBe(s)
    }
  })
})

describe('overnight cleanup', () => {
  const item = (id: number, type: string): Item => ({ id, type, bornTick: 0 })

  /** One of every holder, full of items, on the start grid, one tick before the day ends. */
  function loaded(): GameState {
    const s = inService()
    s.buildings = {}
    s.tiles = s.tiles.map(() => null)
    s.nextId = 1
    let n = 0
    const add = (kind: BuildingKind, dir: 0 | 1 | 2 | 3 = 2) => {
      const x = n % 4 * 2
      const y = Math.floor(n / 4) * 2
      n += 1
      const b = newBuilding(kind, s.nextId++, x, y, dir, 0, { ingredient: 'potato' })
      s.buildings[b.id] = b
      s.tiles[tileIndex(s, x, y)] = b.id
      return b
    }
    const belt = add('belt')
    if (belt.kind === 'belt') belt.slots = [item(1, 'tomato'), item(2, 'tomato')]
    for (const kind of ['splitter', 'merger', 'filter'] as const) {
      const b = add(kind)
      if (b.kind === kind && 'buf' in b) b.buf = item(10 + n, 'potato')
    }
    for (const kind of ['chopper', 'fryer', 'stove'] as const) {
      const b = add(kind)
      if (b.kind === 'chopper' || b.kind === 'fryer' || b.kind === 'stove') {
        b.input = [item(20 + n, 'potato'), item(30 + n, 'tomato')]
        b.output = item(40 + n, 'fries')
        b.progress = 7
      }
    }
    const asm = add('assembler')
    if (asm.kind === 'assembler') {
      asm.recipe = 'fries'
      asm.inputs = { potato: [item(50, 'potato')], tomato: [item(51, 'tomato')] }
      asm.output = item(52, 'fries')
      asm.progress = 9
    }
    const pantry = add('pantry')
    if (pantry.kind === 'pantry') pantry.cooldown = 7
    const pass = add('pass')
    if (pass.kind === 'pass') pass.shelf = [item(60, 'fries'), item(61, 'fries'), item(62, 'fries')]
    add('bin')
    s.dayTick = DAY_TICKS - 1
    return s
  }

  it('throws away everything held anywhere and counts it as waste of the ending day', () => {
    const s = loaded()
    const held = Object.values(s.buildings).flatMap(buildingItems)
    expect(held.length).toBe(2 + 3 + 9 + 3 + 3)
    const end = runTicks(s, DEFS, 1)
    expect(end.phase).toBe('summary')
    for (const b of Object.values(end.buildings)) expect(buildingItems(b), b.kind).toEqual([])
    expect(end.lastDay?.wasteSpoiled).toBe(held.length)
    expect(end.lastDay?.wasteOvernight).toBe(held.length)
    const byType: Record<string, number> = {}
    for (const i of held) byType[i.type] = (byType[i.type] ?? 0) + 1
    expect(end.lastDay?.spoiledByItem).toEqual(byType)
    expect(end.lastDay?.overnightByItem).toEqual(byType)
    expect(end.lastDay?.wasteBinned).toBe(0)
    expect(end.lastDay?.wasteDestroyed).toBe(0)
  })

  it('resets station progress but leaves pantry cooldowns and settings alone', () => {
    const end = runTicks(loaded(), DEFS, 1)
    for (const b of Object.values(end.buildings)) {
      if (b.kind === 'chopper' || b.kind === 'fryer' || b.kind === 'stove' || b.kind === 'assembler') {
        expect(b.progress, b.kind).toBe(0)
      }
      if (b.kind === 'assembler') expect(b.recipe).toBe('fries')
      if (b.kind === 'pantry') expect(b.cooldown).toBe(6) // 7, one pantry step before the day ended
    }
  })

  it('counts normal spoilage and overnight waste together, with overnight as a part', () => {
    const s = inService()
    const belt = newBuilding('belt', s.nextId++, 3, 4, 1, 0, { ingredient: 'potato' })
    if (belt.kind !== 'belt') throw new Error('belt')
    belt.slots = [null, item(1, 'potato')]
    s.buildings[belt.id] = belt
    s.tiles[tileIndex(s, 3, 4)] = belt.id
    s.today.wasteSpoiled = 2
    s.today.spoiledByItem = { tomato: 2 }
    const end = runTicks({ ...s, dayTick: DAY_TICKS - 1 }, DEFS, 1)
    expect(end.lastDay).toMatchObject({ wasteSpoiled: 3, wasteOvernight: 1, overnightByItem: { potato: 1 } })
    expect(end.lastDay?.spoiledByItem).toEqual({ tomato: 2, potato: 1 })
  })

  it('an empty kitchen wastes nothing at day end', () => {
    const end = runTicks(createGameInService(), DEFS, DAY_TICKS)
    expect(end.lastDay?.wasteOvernight).toBe(0)
  })

  it('the next day starts with an empty kitchen and fresh stats', () => {
    const summary = runTicks(loaded(), DEFS, 1)
    const next = must(must(summary, { type: 'dismissSummary' }), { type: 'openService' })
    expect(next.today.wasteSpoiled).toBe(0)
    expect(next.today.wasteOvernight).toBe(0)
    for (const b of Object.values(next.buildings)) expect(buildingItems(b)).toEqual([])
    expect(next.lastDay?.wasteOvernight).toBeGreaterThan(0)
  })
})

function createGameInService(): GameState {
  return must(createGame(DEFS, 'empty'), { type: 'openService' })
}
