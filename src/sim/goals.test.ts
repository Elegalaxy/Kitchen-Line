// Tests for the goals engine, the tier upgrade, expansions and the win trigger (plan Step 16).
// Fixtures are inline Defs with simple goals (sim tests may import only vitest and src/sim);
// the real thresholds are tested in src/content/goals.test.ts. Checked: a goal is recorded the
// moment its check passes and stays done, restaurant goals wait for the restaurant tier,
// totals.profit grows at day end, upgradeTier is rejected (state unchanged, same stateHash)
// before all stall goals are done, without $250 and outside the build phase, the upgrade
// effects (menu cap 6, waiting cap 10, fast belts, arrival factor), an expansion keeps every
// building and item at its coordinates, is gated by tier / money / phase, and the end screen
// ("won") triggers exactly once.

import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { DAY_TICKS, MENU_CAP, UPGRADE_COST, WAITING_CAP } from './constants.ts'
import { arrivalChance } from './customers.ts'
import { profitOf } from './economy.ts'
import { createGame } from './game.ts'
import { allGoalsDone, updateGoals } from './goals.ts'
import { stateHash } from './hash.ts'
import { runTicks } from './tick.ts'
import type { BuildingDef, BuildingKind, Command, Defs, GameState, GoalDef, RejectReason } from './types.ts'

function b(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

const SERVED_GOAL: GoalDef = {
  id: 'served-3',
  tier: 'stall',
  label: 'Serve 3',
  unit: 'count',
  check: (s) => ({ done: s.totals.served >= 3, current: Math.min(s.totals.served, 3), target: 3 }),
}
const MONEY_GOAL: GoalDef = {
  id: 'money-high',
  tier: 'stall',
  label: 'Hold $200',
  unit: 'cents',
  check: (s) => ({ done: s.money >= 20000, current: Math.min(s.money, 20000), target: 20000 }),
}
const RESTAURANT_GOAL: GoalDef = {
  id: 'rest-days',
  tier: 'restaurant',
  label: 'Finish a day',
  unit: 'count',
  check: (s) => ({ done: s.totals.days >= 1, current: Math.min(s.totals.days, 1), target: 1 }),
}

const DEFS: Defs = {
  items: { potato: { id: 'potato', name: 'Potato', emoji: '', kind: 'raw', cost: 30 } },
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
  },
  goals: [SERVED_GOAL, MONEY_GOAL, RESTAURANT_GOAL],
  expansions: [
    { width: 10, height: 8, cost: 10000, requiresTier: 'stall' },
    { width: 12, height: 9, cost: 20000, requiresTier: 'restaurant' },
  ],
}

/** Game in the build phase with every stall goal done and enough money to upgrade. */
function ready(): GameState {
  const s = createGame(DEFS, 'goals')
  s.goalsDone = ['served-3', 'money-high']
  s.money = 100000
  return s
}

function rejected(state: GameState, cmd: Command, reason: RejectReason): void {
  const before = stateHash(state)
  const out = applyCommand(state, DEFS, cmd)
  expect(out.result.ok).toBe(false)
  if (!out.result.ok) {
    expect(out.result.reason).toBe(reason)
    expect(out.result.event).toMatchObject({ type: 'commandRejected', reason })
  }
  expect(out.state).toBe(state)
  expect(stateHash(out.state)).toBe(before)
}

describe('updateGoals', () => {
  it('records a goal at its threshold and not one below it, and keeps it', () => {
    const s = createGame(DEFS, 'g')
    s.totals.served = 2
    updateGoals(s, DEFS)
    expect(s.goalsDone).toEqual([])
    s.totals.served = 3
    updateGoals(s, DEFS)
    expect(s.goalsDone).toEqual(['served-3'])
    expect(s.events).toEqual([{ type: 'goalDone', tick: 0, id: 'served-3' }])
    s.totals.served = 0
    updateGoals(s, DEFS)
    expect(s.goalsDone).toEqual(['served-3'])
  })

  it('does not watch restaurant goals while the tier is stall', () => {
    const s = createGame(DEFS, 'g')
    s.totals.days = 5
    updateGoals(s, DEFS)
    expect(s.goalsDone).toEqual([])
    s.tier = 'restaurant'
    updateGoals(s, DEFS)
    expect(s.goalsDone).toEqual(['rest-days'])
  })

  it('is checked at the end of a service tick', () => {
    const s = createGame(DEFS, 'g')
    s.totals.served = 3
    s.phase = 'service'
    expect(runTicks(s, DEFS, 1).goalsDone).toContain('served-3')
  })

  it('is re-checked after an accepted command, not after a rejected one', () => {
    const s = createGame(DEFS, 'g')
    s.totals.served = 3
    expect(applyCommand(s, DEFS, { type: 'setMenu', dishes: ['nope'] }).state.goalsDone).toEqual([])
    expect(applyCommand(s, DEFS, { type: 'setMenu', dishes: ['fries'] }).state.goalsDone).toEqual(['served-3'])
  })

  it('adds the day profit to totals.profit at day end', () => {
    const s = createGame(DEFS, 'g')
    s.phase = 'service'
    s.totals.profit = 500
    s.today.sales = 900
    s.today.ingredientCost = 400
    const over = runTicks(s, DEFS, DAY_TICKS)
    expect(over.phase).toBe('summary')
    expect(over.lastDay).not.toBeNull()
    expect(over.totals.profit).toBe(500 + profitOf(over.lastDay ?? over.today))
    expect(over.totals.profit).not.toBe(500)
  })

  it('allGoalsDone is true for a tier without goals', () => {
    const none: Defs = { ...DEFS, goals: [] }
    expect(allGoalsDone(createGame(none, 'g'), none, 'stall')).toBe(true)
  })
})

describe('upgradeTier', () => {
  it('is rejected before all stall goals are done, with the state unchanged', () => {
    const s = ready()
    s.goalsDone = ['served-3']
    rejected(s, { type: 'upgradeTier' }, 'goals not done')
    s.goalsDone = []
    rejected(s, { type: 'upgradeTier' }, 'goals not done')
  })

  it('is rejected without $250 (one cent short) and works at exactly $250', () => {
    const s = ready()
    s.money = UPGRADE_COST - 1
    rejected(s, { type: 'upgradeTier' }, 'cannot afford')
    s.money = UPGRADE_COST
    const out = applyCommand(s, DEFS, { type: 'upgradeTier' })
    expect(out.result.ok).toBe(true)
    expect(out.state.tier).toBe('restaurant')
    expect(out.state.money).toBe(0)
  })

  it('is rejected outside the build phase and when already a restaurant', () => {
    for (const phase of ['service', 'summary', 'won'] as const) {
      const s = ready()
      s.phase = phase
      rejected(s, { type: 'upgradeTier' }, 'wrong phase')
    }
    const r = ready()
    r.tier = 'restaurant'
    rejected(r, { type: 'upgradeTier' }, 'already restaurant')
  })

  it('raises the menu cap, the waiting capacity and the arrival chance and allows fast belts', () => {
    const s = ready()
    const before = arrivalChance({ ...s, dayTick: 300 })
    expect(MENU_CAP[s.tier]).toBe(4)
    rejected(s, { type: 'place', kind: 'belt', x: 1, y: 1, dir: 1, config: { fast: true } }, 'locked by tier')
    const up = applyCommand(s, DEFS, { type: 'upgradeTier' }).state
    expect(MENU_CAP[up.tier]).toBe(6)
    expect(WAITING_CAP[up.tier]).toBe(10)
    expect(arrivalChance({ ...up, dayTick: 300 })).toBeCloseTo(before * 1.5, 10)
    const fast = applyCommand(up, DEFS, { type: 'place', kind: 'belt', x: 1, y: 1, dir: 1, config: { fast: true } })
    expect(fast.result.ok).toBe(true)
  })
})

describe('buyExpansion', () => {
  function withBuildings(): GameState {
    let s = createGame(DEFS, 'exp')
    const cmds: Command[] = [
      { type: 'place', kind: 'belt', x: 1, y: 2, dir: 1 },
      { type: 'place', kind: 'chopper', x: 2, y: 2, dir: 1 },
      { type: 'place', kind: 'assembler', x: 3, y: 4, dir: 1 },
      { type: 'place', kind: 'bin', x: 6, y: 5, dir: 0 },
      { type: 'place', kind: 'belt', x: 6, y: 2, dir: 1 },
    ]
    for (const c of cmds) {
      const out = applyCommand(s, DEFS, c)
      if (!out.result.ok) throw new Error(out.result.reason)
      s = out.state
    }
    s.money = 100000
    s.phase = 'service'
    s = runTicks(s, DEFS, 200) // items now sit on belts and in the chopper
    s.phase = 'build'
    return s
  }

  it('keeps every building and item at its coordinates and re-indexes the tiles', () => {
    const s = withBuildings()
    expect(JSON.stringify(Object.values(s.buildings))).toContain('"type":"potato"')
    const out = applyCommand(s, DEFS, { type: 'buyExpansion' })
    expect(out.result.ok).toBe(true)
    const n = out.state
    expect(n.width).toBe(10)
    expect(n.height).toBe(8)
    expect(n.expansion).toBe(1)
    expect(n.tiles.length).toBe(80)
    expect(n.money).toBe(s.money - 10000)
    expect(n.buildings).toEqual(s.buildings)
    // Every tile of the old grid points at the same building (or none) at the same x, y.
    for (let y = 0; y < s.height; y += 1) {
      for (let x = 0; x < s.width; x += 1) {
        expect(n.tiles[y * n.width + x]).toBe(s.tiles[y * s.width + x])
      }
    }
    // New tiles are empty: the footprint count is unchanged (the assembler fills 2).
    expect(n.tiles.filter((t) => t !== null).length).toBe(s.tiles.filter((t) => t !== null).length)
    // The input state is untouched.
    expect(s.width).toBe(8)
  })

  it('respects the tier gate, money, the phase and the end of the list', () => {
    const s = withBuildings()
    const first = applyCommand(s, DEFS, { type: 'buyExpansion' }).state
    rejected(first, { type: 'buyExpansion' }, 'locked by tier')
    const rest = structuredClone(first)
    rest.tier = 'restaurant'
    rest.money = 19999
    rejected(rest, { type: 'buyExpansion' }, 'cannot afford')
    rest.money = 20000
    const second = applyCommand(rest, DEFS, { type: 'buyExpansion' })
    expect(second.result.ok).toBe(true)
    expect(second.state.width).toBe(12)
    rejected(second.state, { type: 'buyExpansion' }, 'no more expansions')
    for (const phase of ['service', 'summary', 'won'] as const) {
      const p = structuredClone(s)
      p.phase = phase
      rejected(p, { type: 'buyExpansion' }, 'wrong phase')
    }
  })

  it('lets a building be placed in the new area', () => {
    const grown = applyCommand(withBuildings(), DEFS, { type: 'buyExpansion' }).state
    const out = applyCommand(grown, DEFS, { type: 'place', kind: 'bin', x: 9, y: 7, dir: 0 })
    expect(out.result.ok).toBe(true)
  })
})

describe('win', () => {
  function restaurantDay(): GameState {
    const s = createGame(DEFS, 'win')
    s.tier = 'restaurant'
    s.goalsDone = ['served-3', 'money-high']
    return applyCommand(s, DEFS, { type: 'openService' }).state
  }

  it('turns the phase to won at the day end once, and "Keep playing" does not re-trigger it', () => {
    let s = runTicks(restaurantDay(), DEFS, DAY_TICKS)
    expect(s.goalsDone).toContain('rest-days')
    expect(s.phase).toBe('won')
    expect(s.won).toBe(true)
    expect(s.events.filter((e) => e.type === 'won')).toHaveLength(1)
    const keep = applyCommand(s, DEFS, { type: 'dismissSummary' })
    expect(keep.result.ok).toBe(true)
    s = keep.state
    expect(s.phase).toBe('build')
    expect(s.day).toBe(2)
    expect(s.goalsDone).toContain('rest-days')
    s = runTicks(applyCommand(s, DEFS, { type: 'openService' }).state, DEFS, DAY_TICKS)
    expect(s.phase).toBe('summary')
    expect(s.events.some((e) => e.type === 'won')).toBe(false)
  })

  it('does not win in the stall tier or while a restaurant goal is open', () => {
    const stall = createGame(DEFS, 'win')
    stall.goalsDone = ['served-3', 'money-high', 'rest-days']
    expect(runTicks(applyCommand(stall, DEFS, { type: 'openService' }).state, DEFS, DAY_TICKS).phase).toBe('summary')
    const never: GoalDef = { ...RESTAURANT_GOAL, id: 'never', check: () => ({ done: false, current: 0, target: 1 }) }
    const open: Defs = { ...DEFS, goals: [...(DEFS.goals ?? []), never] }
    const s = createGame(open, 'win')
    s.tier = 'restaurant'
    expect(runTicks(applyCommand(s, open, { type: 'openService' }).state, open, DAY_TICKS).phase).toBe('summary')
  })

  it('dismissSummary is still rejected in the build phase', () => {
    rejected(createGame(DEFS, 'x'), { type: 'dismissSummary' }, 'wrong phase')
  })
})
