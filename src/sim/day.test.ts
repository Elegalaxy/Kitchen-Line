// Tests for the day cycle (plan Step 10). Inline Defs fixture (sim tests import only src/sim).
// Checked: phaseAt at every boundary, a day ends at exactly 2400 ticks of service
// (lastDay, totals.days, phase summary), dismissSummary starts the next build phase,
// ticks outside service change nothing, a building placed in service warms up for 30
// ticks, and the menu commands are rejected during service.

import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { DAY_TICKS } from './constants.ts'
import { phaseAt } from './day.ts'
import { createGame } from './game.ts'
import { stateHash } from './hash.ts'
import { runTicks } from './tick.ts'
import type { BuildingDef, BuildingKind, Command, Defs, GameState } from './types.ts'

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
