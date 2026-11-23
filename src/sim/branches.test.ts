// Tests for the chain stage test day (GAME_DESIGN 8.1): blueprintOf snapshots a kitchen with empty
// buffers, and branchDayResult runs one deterministic headless day without touching the flagship state.

import { describe, expect, it } from 'vitest'
import { blueprintOf, sameBlueprint } from './blueprint.ts'
import { branchDayResult, branchSeed } from './branches.ts'
import type { BranchContext } from './branches.ts'
import { applyCommand } from './commands.ts'
import { criticDay } from './critic.ts'
import { createGame } from './game.ts'
import { stateHash } from './hash.ts'
import { runTicks } from './tick.ts'
import type { BranchAreaDef, BuildingDef, BuildingKind, Command, Defs, GameState } from './types.ts'

function bd(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

// Sim tests may not import src/content, so the fixture is inline (a fries line like content's friesLine).
export const DEFS: Defs = {
  items: {
    potato: { id: 'potato', name: 'Potato', emoji: '', kind: 'raw', cost: 30 },
    potatoStrips: { id: 'potatoStrips', name: 'Strips', emoji: '', kind: 'processed' },
    fries: { id: 'fries', name: 'Fries', emoji: '', kind: 'dish', spoilTicks: 600 },
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
  stationRecipes: [
    { station: 'chopper', input: 'potato', output: 'potatoStrips', ticks: 20 },
    { station: 'fryer', input: 'potatoStrips', output: 'fries', ticks: 60 },
  ],
  dishes: {
    fries: { id: 'fries', name: 'Fries', emoji: '', refPrice: 300, popularity: 3, startsUnlocked: true, unlockCost: 0 },
  },
}

export function area(demandPercent: number, rent = 0): BranchAreaDef {
  return { id: `a${demandPercent}`, name: 'Area', emoji: '', demandPercent, rent }
}

function must(s: GameState, cmd: Command): GameState {
  const out = applyCommand(s, DEFS, cmd)
  if (!out.result.ok) throw new Error(`rejected ${JSON.stringify(cmd)}: ${out.result.reason}`)
  return out.state
}

/** pantry -> belt -> chopper -> belt -> fryer -> 2 belts -> pass, like content's friesLine, in the restaurant tier, mid-service. */
export function friesKitchen(): GameState {
  let s = createGame(DEFS, 'demo')
  s.money = 1_000_000
  const east = (kind: BuildingKind, x: number): Command => ({ type: 'place', kind, x, y: 2, dir: 1 })
  for (const [kind, x] of [['belt', 1], ['chopper', 2], ['belt', 3], ['fryer', 4], ['belt', 5], ['belt', 6]] as const) s = must(s, east(kind, x))
  s.tier = 'restaurant'
  s = must(s, { type: 'openService' })
  return runTicks(s, DEFS, 700) // items on the belts, pantry cooldowns mid-way, a few ratings
}

function ctxOf(s: GameState, id = 1): BranchContext {
  return { seed: branchSeed(s.seed, id), day: s.day, ratings: s.ratings }
}

describe('blueprintOf', () => {
  it('empties buffers, resets status and drops the pause flag', () => {
    const s = friesKitchen()
    expect(Object.values(s.buildings).some((b) => b.kind === 'belt' && b.slots.some((x) => x !== null))).toBe(true)
    const paused = must(s, { type: 'setPantriesPaused', paused: true })
    const bp = blueprintOf(paused, DEFS)
    for (const b of Object.values(bp.buildings)) {
      expect(b.status).toBe('idle')
      expect(b.onlineAt).toBe(0)
      if (b.kind === 'belt') expect(b.slots).toEqual([null, null])
      if (b.kind === 'pantry') {
        expect(b.cooldown).toBe(0)
        expect('paused' in b).toBe(false)
      }
      if (b.kind === 'chopper' || b.kind === 'fryer') {
        expect(b.input).toEqual([])
        expect(b.output).toBeNull()
      }
      if (b.kind === 'pass') expect(b.shelf).toEqual([])
    }
    // pantry (1000) + 4 belts (400) + chopper (2500) + fryer (4000) + the pass (0)
    expect(bp.value).toBe(1000 + 400 + 2500 + 4000)
    expect(bp.menu).toEqual(s.menu)
  })
  it('does not touch the state and is the same for an unchanged kitchen at another moment', () => {
    const s = friesKitchen()
    const before = stateHash(s)
    const a = blueprintOf(s, DEFS)
    expect(stateHash(s)).toBe(before)
    const later = runTicks(s, DEFS, 300)
    expect(sameBlueprint(a, blueprintOf(later, DEFS))).toBe(true)
  })
  it('differs when the kitchen or the menu changes', () => {
    const s = friesKitchen()
    const a = blueprintOf(s, DEFS)
    const t = structuredClone(s)
    t.menu[0].price += 10
    expect(sameBlueprint(a, blueprintOf(t, DEFS))).toBe(false)
    const closed = must(runTicks(s, DEFS, 5000), { type: 'dismissSummary' })
    const more = must(closed, { type: 'place', kind: 'belt', x: 1, y: 4, dir: 1 })
    expect(sameBlueprint(a, blueprintOf(more, DEFS))).toBe(false)
  })
})

describe('branchDayResult', () => {
  it('gives the same result for the same inputs', () => {
    const s = friesKitchen()
    const bp = blueprintOf(s, DEFS)
    const a = branchDayResult(bp, area(100), ctxOf(s), DEFS)
    const b = branchDayResult(structuredClone(bp), area(100), ctxOf(s), DEFS)
    expect(b).toEqual(a)
    expect(a.customers).toBeGreaterThan(0)
    expect(a.served).toBeGreaterThan(0)
    expect(a.sales).toBeGreaterThan(0)
  })
  it('leaves the flagship state, the blueprint and the ratings untouched', () => {
    const s = friesKitchen()
    const bp = blueprintOf(s, DEFS)
    const bpJson = JSON.stringify(bp)
    const ratings = [...s.ratings]
    const before = stateHash(s)
    const ctx = ctxOf(s)
    branchDayResult(bp, area(100), ctx, DEFS)
    expect(stateHash(s)).toBe(before) // includes the flagship rng streams
    expect(JSON.stringify(bp)).toBe(bpJson)
    expect(ctx.ratings).toEqual(ratings)
  })
  it('more demand gives more customers', () => {
    const s = friesKitchen()
    const bp = blueprintOf(s, DEFS)
    const low = branchDayResult(bp, area(80), ctxOf(s), DEFS)
    const high = branchDayResult(bp, area(140), ctxOf(s), DEFS)
    expect(high.customers).toBeGreaterThan(low.customers)
  })
  it('has no critic even when the day would be a critic day', () => {
    const s = friesKitchen()
    const bp = blueprintOf(s, DEFS)
    let day = 2
    while (!criticDay('crit', day)) day += 1
    const critic = branchDayResult(bp, area(100), { seed: 'crit', day, ratings: s.ratings }, DEFS)
    // The same seed on a day that is no critic day: the day number only changes the trend, never adds a customer.
    let quiet = 2
    while (criticDay('crit', quiet)) quiet += 1
    const other = branchDayResult(bp, area(100), { seed: 'crit', day: quiet, ratings: s.ratings }, DEFS)
    // Only one dish exists, so the trend is off and both days draw the same customers: a critic would add one.
    expect(critic.customers).toBe(other.customers)
  })
  it('starts from the blueprint, not from what the live line held', () => {
    const s = friesKitchen()
    const fresh = branchDayResult(blueprintOf(s, DEFS), area(100), ctxOf(s), DEFS)
    const later = runTicks(s, DEFS, 400)
    expect(branchDayResult(blueprintOf(later, DEFS), area(100), ctxOf(s), DEFS)).toEqual(fresh)
  })
})
