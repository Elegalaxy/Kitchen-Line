// Tests for the chain stage commands and nights (GAME_DESIGN 8.1): openBranch / refitBranch reject reasons and
// costs, the fixed next site, the nightly net with its 90 to 110 percent noise, and that a game without
// branches is untouched.

import { describe, expect, it } from 'vitest'
import { blueprintOf } from './blueprint.ts'
import { nextArea, openBranchCost, openBranchProblem, refitCost } from './branches.ts'
import { applyCommand } from './commands.ts'
import { chainReady, DEFS, must } from './chainKit.ts'
import { BRANCH_MAX, BRANCH_NOISE_PERCENT, BRANCH_OPEN_FEES, BRANCH_REFIT_FEE } from './constants.ts'
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
