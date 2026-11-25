// Tests for the chain stage commands and nights (GAME_DESIGN 8.1): openBranch / refitBranch reject reasons and
// costs, the fixed next site, the nightly net with its 90 to 110 percent noise, and that a game without
// branches is untouched.

import { describe, expect, it } from 'vitest'
import { blueprintOf } from './blueprint.ts'
import { closeProblem, closeRefund, nextArea, nextBranchId, openBranchCost, openBranchProblem, refitCost } from './branches.ts'
import { applyCommand } from './commands.ts'
import { chainReady, DEFS, must } from './chainKit.ts'
import {
  BRANCH_CLOSE_REFUND_PERCENT,
  BRANCH_MAX,
  BRANCH_NOISE_PERCENT,
  BRANCH_OPEN_FEES,
  BRANCH_REFIT_FEE,
} from './constants.ts'
import { stateHash } from './hash.ts'
import { branchNet, nightNoisePercent } from './nights.ts'
import { runTicks } from './tick.ts'
import type { Command, Defs, GameState, RejectReason } from './types.ts'

function reasonOf(s: GameState, cmd: Command, defs: Defs = DEFS): RejectReason | null {
  const out = applyCommand(s, defs, cmd)
  return out.result.ok ? null : out.result.reason
}

const OPEN: Command = { type: 'openBranch' }

describe('openBranch rejections', () => {
  it('chain locked until the restaurant end screen has been seen', () => {
    const s = chainReady()
    s.won = false
    expect(reasonOf(s, OPEN)).toBe('chain locked')
    expect(reasonOf(s, { type: 'refitBranch', id: 1 })).toBe('chain locked')
  })
  it('wrong phase outside the build phase', () => {
    const s = must(chainReady(), { type: 'openService' })
    expect(reasonOf(s, OPEN)).toBe('wrong phase')
    const summary = runTicks(s, DEFS, 2400)
    expect(summary.phase).toBe('summary')
    expect(reasonOf(summary, OPEN)).toBe('wrong phase')
  })
  it('cannot afford', () => {
    const s = chainReady()
    s.money = openBranchCost(s, DEFS) - 1
    expect(reasonOf(s, OPEN)).toBe('cannot afford')
  })
  it('branch limit after BRANCH_MAX', () => {
    let s = chainReady()
    for (let i = 0; i < BRANCH_MAX; i += 1) s = must(s, OPEN)
    expect(s.branches).toHaveLength(BRANCH_MAX)
    expect(reasonOf(s, OPEN)).toBe('branch limit')
  })
  it('branch limit when no site is left', () => {
    const s = chainReady()
    const few: Defs = { ...DEFS, branchAreas: [] }
    expect(reasonOf(s, OPEN, few)).toBe('branch limit')
  })
  it('branch would lose money when the rent is above the test day profit', () => {
    const s = chainReady()
    const pricey: Defs = { ...DEFS, branchAreas: DEFS.branchAreas?.map((a) => ({ ...a, rent: 10_000_000 })) }
    expect(reasonOf(s, OPEN, pricey)).toBe('branch would lose money')
  })
  it('a rejected open leaves the state as it was', () => {
    const s = chainReady()
    s.money = 5
    const out = applyCommand(s, DEFS, OPEN)
    expect(out.result.ok).toBe(false)
    expect(out.state).toBe(s)
  })
})

describe('openBranch', () => {
  it('charges the blueprint value plus the fee for that branch number and opens it at the shown site', () => {
    let s = chainReady()
    for (let n = 0; n < BRANCH_MAX; n += 1) {
      const area = nextArea(s, DEFS)
      expect(area).not.toBeNull()
      expect(nextArea(s, DEFS)).toEqual(area) // fixed: asking again gives the same site
      expect(openBranchProblem(s, DEFS)).toBeNull()
      const value = blueprintOf(s, DEFS).value
      const before = s.money
      s = must(s, OPEN)
      expect(before - s.money).toBe(value + BRANCH_OPEN_FEES[n])
      expect(s.branches?.[n].areaId).toBe(area?.id)
      expect(s.branches?.[n].id).toBe(n + 1)
      expect(s.branches?.[n].expected.profit).toBeGreaterThan(0)
      expect(s.events.some((e) => e.type === 'branchOpened')).toBe(true)
    }
    expect(new Set(s.branches?.map((b) => b.areaId)).size).toBe(BRANCH_MAX)
  })
  it('does not touch the flagship streams or its kitchen', () => {
    const s = chainReady()
    const next = must(s, OPEN)
    expect(next.rng).toEqual(s.rng)
    expect(next.buildings).toEqual(s.buildings)
    expect(next.tick).toBe(s.tick)
    expect(next.ratings).toEqual(s.ratings)
  })
  it('the same state gives the same branch', () => {
    const a = must(chainReady(), OPEN)
    const b = must(chainReady(), OPEN)
    expect(stateHash(a)).toBe(stateHash(b))
  })
})

describe('refitBranch', () => {
  it('is refused with no such branch, and while the kitchen is unchanged', () => {
    const s = must(chainReady(), OPEN)
    expect(reasonOf(s, { type: 'refitBranch', id: 9 })).toBe('no such branch')
    expect(reasonOf(s, { type: 'refitBranch', id: 1 })).toBe('blueprint unchanged')
  })
  it('costs the fee plus the value increase and replaces the blueprint and the expectation', () => {
    let s = must(chainReady(), OPEN)
    const branch = s.branches?.[0]
    if (branch === undefined) throw new Error('no branch')
    s = must(s, { type: 'place', kind: 'belt', x: 1, y: 4, dir: 1 }) // +$1 of kitchen
    expect(refitCost(s, DEFS, branch)).toBe(BRANCH_REFIT_FEE + 100)
    const before = s.money
    s = must(s, { type: 'refitBranch', id: 1 })
    expect(before - s.money).toBe(BRANCH_REFIT_FEE + 100)
    expect(s.branches?.[0].refits).toBe(1)
    expect(s.branches?.[0].blueprintDay).toBe(s.day)
    expect(s.branches?.[0].blueprint.value).toBe(branch.blueprint.value + 100)
    expect(s.branches?.[0].areaId).toBe(branch.areaId)
    expect(reasonOf(s, { type: 'refitBranch', id: 1 })).toBe('blueprint unchanged')
  })
  it('a cheaper kitchen costs only the fee', () => {
    let s = must(chainReady(), { type: 'place', kind: 'belt', x: 1, y: 4, dir: 1 })
    s = must(s, OPEN)
    const branch = s.branches?.[0]
    if (branch === undefined) throw new Error('no branch')
    s = must(s, { type: 'remove', x: 1, y: 4 })
    expect(refitCost(s, DEFS, branch)).toBe(BRANCH_REFIT_FEE)
  })
  it('cannot afford', () => {
    let s = must(chainReady(), OPEN)
    s = must(s, { type: 'place', kind: 'belt', x: 1, y: 4, dir: 1 })
    s.money = BRANCH_REFIT_FEE
    expect(reasonOf(s, { type: 'refitBranch', id: 1 })).toBe('cannot afford')
  })
})

describe('branch nights', () => {
  it('book expected x noise minus rent into the money, chainProfit and the day summary', () => {
    const s = must(chainReady(), OPEN)
    const branch = s.branches?.[0]
    if (branch === undefined) throw new Error('no branch')
    const rent = DEFS.branchAreas?.find((a) => a.id === branch.areaId)?.rent ?? 0
    const open = must(s, { type: 'openService' })
    const day = runTicks(open, DEFS, 2400)
    const row = day.lastDay?.branches?.[0]
    expect(day.lastDay?.branches).toHaveLength(1)
    expect(row?.id).toBe(1)
    expect(row?.rent).toBe(rent)
    const lo = Math.round((branch.expected.profit * (100 - BRANCH_NOISE_PERCENT)) / 100) - rent
    const hi = Math.round((branch.expected.profit * (100 + BRANCH_NOISE_PERCENT)) / 100) - rent
    expect(row?.net).toBeGreaterThanOrEqual(lo)
    expect(row?.net).toBeLessThanOrEqual(hi)
    expect(row?.net).toBe(branchNet(day.seed, branch, open.day, DEFS))
    expect(day.chainProfit).toBe(row?.net)
    // money: flagship sales minus ingredient costs plus the branch net
    const flagship = (day.lastDay?.sales ?? 0) - (day.lastDay?.ingredientCost ?? 0)
    expect(day.money - open.money).toBe(flagship + (row?.net ?? 0))
    // the flagship profit total does not include the branches
    expect(day.totals.profit - open.totals.profit).toBe(flagship)
  })
  it('noise stays within 90 to 110 percent, is stable, and varies', () => {
    const seen = new Set<number>()
    for (let day = 1; day <= 200; day += 1) {
      const n = nightNoisePercent('demo', 1, day)
      expect(n).toBeGreaterThanOrEqual(100 - BRANCH_NOISE_PERCENT)
      expect(n).toBeLessThanOrEqual(100 + BRANCH_NOISE_PERCENT)
      expect(nightNoisePercent('demo', 1, day)).toBe(n)
      seen.add(n)
    }
    expect(seen.size).toBeGreaterThan(10)
    expect(nightNoisePercent('demo', 2, 5) === nightNoisePercent('demo', 1, 5) && nightNoisePercent('demo', 3, 5) === nightNoisePercent('demo', 1, 5)).toBe(false)
  })
  it('with no branches nothing is added: same state, same hash', () => {
    const s = chainReady()
    const open = must(s, { type: 'openService' })
    const day = runTicks(open, DEFS, 2400)
    expect(day.branches).toBeUndefined()
    expect(day.chainProfit).toBeUndefined()
    expect(day.lastDay?.branches).toBeUndefined()
    expect('branches' in (day.lastDay ?? {})).toBe(false)
    expect(JSON.stringify(day)).not.toContain('chainProfit')
  })
  it('the flagship streams and sales are the same with or without a branch', () => {
    const without = runTicks(must(chainReady(), { type: 'openService' }), DEFS, 2400)
    const withBranch = runTicks(must(must(chainReady(), OPEN), { type: 'openService' }), DEFS, 2400)
    expect(withBranch.rng).toEqual(without.rng)
    expect(withBranch.lastDay?.sales).toBe(without.lastDay?.sales)
    expect(withBranch.lastDay?.customers).toBe(without.lastDay?.customers)
  })
  it('two branches add up', () => {
    const s = must(must(chainReady(), OPEN), OPEN)
    const day = runTicks(must(s, { type: 'openService' }), DEFS, 2400)
    const rows = day.lastDay?.branches ?? []
    expect(rows.map((r) => r.id)).toEqual([1, 2])
    expect(day.chainProfit).toBe(rows[0].net + rows[1].net)
  })
})

describe('chain goals and the chain end screen', () => {
  const always = (done: boolean) => (): { done: boolean; current: number; target: number } => ({ done, current: 1, target: 1 })
  const goalsDefs: Defs = {
    ...DEFS,
    goals: [
      { id: 'r1', tier: 'restaurant', label: 'r1', unit: 'count', check: (s) => ({ done: s.phase === 'summary', current: 1, target: 1 }) },
      { id: 'c1', tier: 'chain', label: 'c1', unit: 'count', check: (s) => ({ done: s.phase === 'summary', current: 1, target: 1 }) },
      { id: 'c2', tier: 'chain', label: 'c2', unit: 'count', check: always(true) },
    ],
  }
  const playDay = (s: GameState): GameState => runTicks(must(s, { type: 'openService' }, goalsDefs), goalsDefs, 2400)

  it('the restaurant end screen is unaffected: chain goals are not watched and do not count', () => {
    const s = chainReady()
    s.won = false
    const day = playDay(s)
    expect(day.won).toBe(true)
    expect(day.phase).toBe('won')
    expect(day.goalsDone).toContain('r1')
    expect(day.goalsDone).not.toContain('c1')
    expect(day.goalsDone).not.toContain('c2')
    expect(day.chainWon).toBeUndefined()
  })

  it('without chain goals the restaurant end screen is as before', () => {
    const s = chainReady()
    s.won = false
    const day = runTicks(must(s, { type: 'openService' }), { ...goalsDefs, goals: [goalsDefs.goals?.[0] as NonNullable<Defs['goals']>[number]] }, 2400)
    expect(day.phase).toBe('won')
    expect(day.chainWon).toBeUndefined()
  })

  it('the chain end screen fires once, after the restaurant one', () => {
    const s = chainReady() // won is already true
    const events: string[] = []
    let day = runTicks(must(s, { type: 'openService' }, goalsDefs), goalsDefs, 2400, (ev) => {
      for (const e of ev) events.push(e.type)
    })
    expect(day.phase).toBe('won')
    expect(day.chainWon).toBe(true)
    expect(day.goalsDone).toEqual(expect.arrayContaining(['c1', 'c2']))
    expect(events.filter((t) => t === 'chainWon')).toHaveLength(1)
    expect(day.events.some((e) => e.type === 'won')).toBe(false)
    day = must(day, { type: 'dismissSummary' }, goalsDefs)
    expect(day.phase).toBe('build')
    const again: string[] = []
    const next = runTicks(must(day, { type: 'openService' }, goalsDefs), goalsDefs, 2400, (ev) => {
      for (const e of ev) again.push(e.type)
    })
    expect(next.phase).toBe('summary')
    expect(again).not.toContain('chainWon')
  })

  it('does not fire while a chain goal is open', () => {
    const open: Defs = {
      ...goalsDefs,
      goals: [...(goalsDefs.goals ?? []), { id: 'c3', tier: 'chain', label: 'c3', unit: 'count', check: always(false) }],
    }
    const day = runTicks(must(chainReady(), { type: 'openService' }, open), open, 2400)
    expect(day.phase).toBe('summary')
    expect(day.chainWon).toBeUndefined()
  })
})

describe('closeBranch', () => {
  const close = (id: number): Command => ({ type: 'closeBranch', id })
  const three = (): GameState => {
    let s = chainReady()
    for (let i = 0; i < BRANCH_MAX; i += 1) s = must(s, OPEN)
    return s
  }
  const oneNight = (s: GameState): GameState => must(runTicks(must(s, { type: 'openService' }), DEFS, 2400), { type: 'dismissSummary' })

  it('is refused while the chain is locked, outside the build phase and for unknown ids, leaving the state as it was', () => {
    const s = must(chainReady(), OPEN)
    expect(reasonOf({ ...s, won: false }, close(1))).toBe('chain locked')
    const service = must(s, { type: 'openService' })
    expect(reasonOf(service, close(1))).toBe('wrong phase')
    expect(reasonOf(runTicks(service, DEFS, 2400), close(1))).toBe('wrong phase')
    expect(reasonOf(s, close(2))).toBe('no such branch')
    expect(reasonOf(s, { type: 'closeBranch', id: '1' } as unknown as Command)).toBe('no such branch')
    expect(reasonOf(chainReady(), close(1))).toBe('no such branch')
    expect(closeProblem(s, 1)).toBeNull()
    const out = applyCommand(s, DEFS, close(9))
    expect(out.state).toBe(s)
  })

  it('pays back the percent of the blueprint value rounded down, in money only', () => {
    expect(BRANCH_CLOSE_REFUND_PERCENT).toBe(50)
    const s = oneNight(must(chainReady(), OPEN))
    const branch = s.branches?.[0]
    if (branch === undefined) throw new Error('no branch')
    const refund = closeRefund(branch)
    expect(refund).toBe(Math.floor(branch.blueprint.value / 2))
    expect(closeRefund({ blueprint: { ...branch.blueprint, value: 101 } })).toBe(50)
    const next = must(s, close(branch.id))
    expect(next.money - s.money).toBe(refund)
    expect(next.chainProfit).toBe(s.chainProfit)
    expect(next.totals).toEqual(s.totals)
    expect(next.today).toEqual(s.today)
    expect(next.lastDay).toEqual(s.lastDay)
    expect(next.rng).toEqual(s.rng)
    expect(next.buildings).toEqual(s.buildings)
    expect(next.events.at(-1)).toEqual({ type: 'branchClosed', tick: s.tick, id: branch.id, areaId: branch.areaId, refund })
  })

  it('refunds the value of the kitchen the branch runs now, not of the flagship', () => {
    let s = must(chainReady(), OPEN)
    const before = closeRefund(s.branches![0])
    s = must(s, { type: 'place', kind: 'belt', x: 1, y: 4, dir: 1 })
    expect(closeRefund(s.branches![0])).toBe(before)
    s = must(s, { type: 'refitBranch', id: 1 })
    expect(closeRefund(s.branches![0])).toBe(before + 50)
  })

  it('removes the branches field with the last branch, and no branch runs that night', () => {
    const s = must(must(chainReady(), OPEN), close(1))
    expect('branches' in s).toBe(false)
    const night = runTicks(must(s, { type: 'openService' }), DEFS, 2400)
    expect(night.lastDay?.branches).toBeUndefined()
    expect(night.chainProfit).toBeUndefined()
  })

  it('frees the slot: the fee follows the open branches and only their areas are excluded', () => {
    const full = three()
    const closed = full.branches![1]
    const s = must(full, close(closed.id))
    expect(s.branches?.map((b) => b.id)).toEqual([1, 3])
    expect(openBranchProblem(s, DEFS)).toBeNull()
    expect(openBranchCost(s, DEFS)).toBe(blueprintOf(s, DEFS).value + BRANCH_OPEN_FEES[2])
    const site = nextArea(s, DEFS)
    expect(s.branches?.map((b) => b.areaId)).not.toContain(site?.id)
    const again = must(s, OPEN)
    expect(again.branches?.map((b) => b.id)).toEqual([1, 3, 4])
    expect(new Set(again.branches?.map((b) => b.areaId)).size).toBe(3)
  })

  it('never gives a new branch an id that is open or still in a day record', () => {
    // close the last id after a night: the records still name it, so it is skipped
    const s = must(oneNight(three()), close(3))
    expect(nextBranchId(s)).toBe(4)
    const reopened = must(s, OPEN)
    expect(reopened.branches?.map((b) => b.id)).toEqual([1, 2, 4])
    // two finished days later no record names 3 or 4 any more; closing 4 lets 3 come back
    const later = must(oneNight(oneNight(s)), OPEN)
    expect(later.branches?.map((b) => b.id)).toEqual([1, 2, 3])
    // closed before its first night: the same id and the same test result come back (no reroll)
    const first = must(chainReady(), OPEN)
    const second = must(must(first, close(1)), OPEN)
    expect(second.branches?.[0]).toEqual(first.branches?.[0])
  })

  it('keeps done chain goals done and never shows the chain end screen twice', () => {
    const goals: Defs = {
      ...DEFS,
      goals: [{ id: 'three', tier: 'chain', label: 'Open 3', unit: 'count', check: (st) => ({ done: (st.branches?.length ?? 0) >= 3, current: st.branches?.length ?? 0, target: 3 }) }],
    }
    let s = chainReady()
    for (let i = 0; i < BRANCH_MAX; i += 1) s = must(s, OPEN, goals)
    expect(s.goalsDone).toContain('three')
    s = runTicks(must(s, { type: 'openService' }, goals), goals, 2400)
    expect(s.chainWon).toBe(true)
    s = must(s, { type: 'dismissSummary' }, goals)
    for (const id of [1, 2, 3]) s = must(s, close(id), goals)
    s.money = 1_000_000
    expect(s.goalsDone).toContain('three')
    expect(s.chainWon).toBe(true)
    for (let i = 0; i < BRANCH_MAX; i += 1) s = must(s, OPEN, goals)
    s = runTicks(must(s, { type: 'openService' }, goals), goals, 2400)
    expect(s.phase).toBe('summary')
    expect(s.events.some((e) => e.type === 'chainWon')).toBe(false)
  })
})
