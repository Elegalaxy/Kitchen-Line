// Tests for the scripted journey player (harness only): it drives the sim only through
// applyCommand, is deterministic, and one seed gets from the empty start to the end screen.
// Kept small: two full journeys (about 18 days each) plus short runs.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { formatJourneyTable, stat } from './journey.ts'
import { applyCommand } from '../sim/commands.ts'
import { DAY_TICKS } from '../sim/constants.ts'
import { PAUSE_LEAD_TICKS, resumeAfterDay, runServiceDay } from './pausePolicy.ts'
import { runJourney } from './player.ts'
import { buildLayoutState } from './run.ts'

describe('pantry pause policy', () => {
  it('pauses the pantries near closing, resumes them next day, and changes the run', () => {
    const on = runJourney(DEFS, 'journey-1', { maxDays: 3 })
    const off = runJourney(DEFS, 'journey-1', { maxDays: 3, pausePantries: false })
    expect(on.failures).toEqual([])
    expect(on.hash).not.toBe(off.hash)
    // Resumed in the build phase after dismissing the summary: no pantry is left paused.
    expect(Object.values(on.state.buildings).some((b) => b.kind === 'pantry' && b.paused === true)).toBe(false)
  })

  it('runServiceDay pauses for the last PAUSE_LEAD_TICKS ticks only', () => {
    const start = buildLayoutState(DEFS, 'friesLine', 'demo')
    const open = applyCommand(start, DEFS, { type: 'openService' })
    if (!open.result.ok) throw new Error('open rejected')
    const end = runServiceDay(open.state, DEFS, true)
    const pantries = Object.values(end.buildings).filter((b) => b.kind === 'pantry')
    expect(pantries.length).toBeGreaterThan(0)
    expect(pantries.every((b) => b.paused === true)).toBe(true)
    expect(Object.values(resumeAfterDay(end, DEFS).buildings).some((b) => b.kind === 'pantry' && b.paused === true)).toBe(false)
    expect(PAUSE_LEAD_TICKS).toBeLessThan(DAY_TICKS)
  })
})

describe('runJourney', () => {
  it('reaches the first goals in a few days without a rejected command', () => {
    const r = runJourney(DEFS, 'journey-1', { maxDays: 4 })
    expect(r.days).toHaveLength(4)
    expect(r.goalDay['first-dish']).toBe(1)
    expect(r.failures).toEqual([])
    expect(r.days[0].bought).toContain('fries')
    expect(r.days[3].menuSize).toBeGreaterThanOrEqual(2)
  })

  it('is deterministic: same seed, same hash', () => {
    const a = runJourney(DEFS, 'journey-2', { maxDays: 3 })
    const b = runJourney(DEFS, 'journey-2', { maxDays: 3 })
    expect(a.hash).toBe(b.hash)
    expect(runJourney(DEFS, 'journey-3', { maxDays: 3 }).hash).not.toBe(a.hash)
  })

  it('one seed goes from the stall to the end screen with all goals done', () => {
    const r = runJourney(DEFS, 'journey-1', { maxDays: 30 })
    expect(r.failures).toEqual([])
    expect(r.upgradeDay).not.toBeNull()
    expect(r.wonDay).not.toBeNull()
    expect(r.wonDay as number).toBeGreaterThan(r.upgradeDay as number)
    expect(r.state.phase).toBe('won')
    expect(r.state.tier).toBe('restaurant')
    expect(r.state.menu.length).toBeGreaterThanOrEqual(5)
    for (const id of ['first-dish', 'serve-100', 'rating-4', 'profit-300', 'menu-5', 'great-day', 'restaurant-profit']) {
      expect(r.goalDay[id], id).not.toBeNull()
    }
    expect(r.goalDay['restaurant-profit'] as number).toBeGreaterThanOrEqual(r.goalDay['great-day'] as number)
  }, 30_000)

  it('buys the second pass, the second fryer line into it and all four restaurant upgrades', () => {
    const r = runJourney(DEFS, 'journey-1', { maxDays: 30 })
    const passes = Object.values(r.state.buildings).filter((b) => b.kind === 'pass')
    expect(passes.map((p) => [p.x, p.y])).toEqual([[7, 2], [9, 2]])
    const feed = r.state.buildings[r.state.tiles[3 * r.state.width + 9] as number]
    expect(feed).toMatchObject({ kind: 'belt', dir: 0 }) // (9,3) faces north into the second pass
    expect(r.state.upgrades).toEqual(['tables', 'sign', 'music', 'plates'])
    expect(r.restaurantSpent).toBeGreaterThan(0)
    expect(r.days.some((d) => d.bought.includes('pass2'))).toBe(true)
    expect(r.failures).toEqual([])
  }, 30_000)

  it('--no-pass2 and --no-upgrades keep the old east join and buy no upgrade', () => {
    const r = runJourney(DEFS, 'journey-1', { maxDays: 30, pass2: false, upgrades: false })
    expect(Object.values(r.state.buildings).filter((b) => b.kind === 'pass')).toHaveLength(1)
    const feed = r.state.buildings[r.state.tiles[3 * r.state.width + 9] as number]
    expect(feed).toMatchObject({ kind: 'belt', dir: 3 })
    expect('upgrades' in r.state).toBe(false)
    expect(r.wonDay).not.toBeNull()
    expect(r.failures).toEqual([])
  }, 30_000)
})

describe('pro fryer', () => {
  it('swaps the fries fryer for a pro fryer after fries customers gave up, and --no-pro never does', () => {
    const r = runJourney(DEFS, 'journey-1', { maxDays: 30 })
    expect(r.proFryerDay).not.toBeNull()
    expect(r.days.filter((d) => d.bought.includes('pro:fryer'))).toHaveLength(1)
    const fryer = r.state.buildings[r.state.tiles[2 * r.state.width + 4] as number]
    expect(fryer).toMatchObject({ kind: 'fryer', pro: true })
    expect(r.failures).toEqual([])
    const off = runJourney(DEFS, 'journey-1', { maxDays: 30, pro: false })
    expect(off.proFryerDay).toBeNull()
    expect(Object.values(off.state.buildings).some((b) => b.kind === 'fryer' && b.pro === true)).toBe(false)
  }, 60_000)
})

describe('journey table', () => {
  it('stat takes the lower median and ignores nulls', () => {
    expect(stat([3, null, 1, 2, 10])).toEqual({ median: 2, min: 1, max: 10, n: 4 })
    expect(stat([null])).toBeNull()
  })

  it('formats one row per seed and the aggregate rows', () => {
    const lines = formatJourneyTable([runJourney(DEFS, 'journey-1', { maxDays: 2 })])
    expect(lines[0]).toMatch(/^seed\s+dish1/)
    expect(lines[1]).toMatch(/^journey-1\s+1\s/)
    expect(lines.some((l) => l.startsWith('median'))).toBe(true)
    expect(lines[0]).toContain('goal7')
    expect(lines.some((l) => l.startsWith('reached the end screen: 0/1'))).toBe(true)
  })
})
