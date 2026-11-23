// Branch test day (GAME_DESIGN 8.1, chain stage). `branchDayResult` runs ONE full headless day of a
// blueprint at a site and returns what the branch is expected to make on a normal night. It is pure: the
// same blueprint, area and context give the same result, and the flagship state, its random streams and its
// draw order are never touched (the test day has its own state and its own streams, seeded from `ctx.seed`).
// The test state is a fresh `createGame` with the blueprint's kitchen put in, restaurant tier, plenty of cash,
// no goals, no critic (`tierDay` = the day) and no `branches` field (no recursion). The site's demand reuses
// the upgrade effects: one synthetic upgrade adds `demandPercent - 100` to the arrival chance, so customers.ts
// needs no change. The flagship's own upgrades do not carry over (kitchen only). Like the harness player, the
// pantries are paused for the last `CLOSING_SOON_TICKS` so the overnight cleanup throws little away.
// The rest of the file is the chain-stage rules the commands share with the UI: the fixed next site, the costs
// and the reasons `openBranch` / `refitBranch` would be rejected (the cheap ones; the test day adds
// 'branch would lose money'). The nightly booking is in nights.ts.

import { blueprintOf, sameBlueprint } from './blueprint.ts'
import { BRANCH_MAX, BRANCH_OPEN_FEES, BRANCH_REFIT_FEE, CLOSING_SOON_TICKS, DAY_TICKS } from './constants.ts'
import { profitOf } from './economy.ts'
import { createGame, emptyDayStats } from './game.ts'
import { reputationOf } from './customers.ts'
import { hashText } from './fnv.ts'
import { runTicks } from './tick.ts'
import type { Blueprint, Branch, BranchAreaDef, BranchExpected, Defs, GameState, RejectReason } from './types.ts'

/** Cash the test state starts with: enough that no pantry ever runs out (the test measures the kitchen, not the wallet). */
const TEST_MONEY = 1_000_000

/** What a test day needs besides the blueprint and the site. */
export type BranchContext = {
  /** The seed of the test state (its random streams); the caller derives it from the game seed and the branch id. */
  seed: string
  /** The flagship's current day (menu trends follow the day). */
  day: number
  /** A snapshot of the flagship's ratings (reputation drives arrivals). Not mutated. */
  ratings: readonly number[]
}

/** The seed of the test day of branch `id`: its own streams, separate from the flagship's. */
export function branchSeed(seed: string, id: number): string {
  return `${seed}|branch|${id}`
}

function testState(bp: Blueprint, ctx: BranchContext, defs: Defs): GameState {
  const state = createGame(defs, ctx.seed)
  const buildings = structuredClone(bp.buildings)
  state.width = bp.width
  state.height = bp.height
  state.expansion = bp.expansion
  state.tiles = [...bp.tiles]
  state.buildings = buildings
  state.nextId = Math.max(0, ...Object.keys(buildings).map(Number)) + 1
  state.menu = bp.menu.map((m) => ({ dish: m.dish, price: m.price }))
  state.unlocked = [...bp.unlocked]
  state.tier = 'restaurant'
  state.day = ctx.day
  state.tierDay = ctx.day
  state.money = TEST_MONEY
  state.ratings = [...ctx.ratings]
  state.upgrades = ['area']
  state.phase = 'service'
  state.dayTick = 0
  state.today = emptyDayStats(ctx.day)
  state.repAtDayStart = reputationOf(state)
  return state
}

/** Pause every pantry of a test state (the same effect as the `setPantriesPaused` command). */
function pausePantries(state: GameState): void {
  for (const b of Object.values(state.buildings)) {
    if (b.kind !== 'pantry') continue
    b.paused = true
    b.status = 'paused'
  }
}

/** Run one full day of `bp` at `area` and return the result (cents and counts). */
export function branchDayResult(bp: Blueprint, area: BranchAreaDef, ctx: BranchContext, defs: Defs): BranchExpected {
  const testDefs: Defs = {
    ...defs,
    goals: [],
    upgrades: [
      {
        id: 'area',
        name: '',
        emoji: '',
        cost: 0,
        requiresTier: 'restaurant',
        effect: { arrivalPercent: area.demandPercent - 100 },
      },
    ],
  }
  let s = runTicks(testState(bp, ctx, testDefs), testDefs, DAY_TICKS - CLOSING_SOON_TICKS)
  pausePantries(s)
  s = runTicks(s, testDefs, CLOSING_SOON_TICKS)
  const day = s.lastDay
  if (day === null) return { profit: 0, sales: 0, served: 0, customers: 0 }
  return { profit: profitOf(day), sales: day.sales, served: day.served, customers: day.customers }
}

// ---- Sites, costs and problems --------------------------------------------

/** The site the NEXT branch would get (fixed: a hash of seed and branch count among the unused sites), or null when none is left. */
export function nextArea(state: Pick<GameState, 'seed' | 'branches'>, defs: Defs): BranchAreaDef | null {
  const used = (state.branches ?? []).map((b) => b.areaId)
  const free = (defs.branchAreas ?? []).filter((a) => !used.includes(a.id))
  if (free.length === 0) return null
  return free[hashText(`${state.seed}|area|${used.length}`) % free.length]
}

/** The branch with `id`, or undefined. */
export function branchById(state: Pick<GameState, 'branches'>, id: unknown): Branch | undefined {
  return state.branches?.find((b) => b.id === id)
}

/** The id the next branch gets (ids count up and are never reused: there is no close command). */
export function nextBranchId(state: Pick<GameState, 'branches'>): number {
  return Math.max(0, ...(state.branches ?? []).map((b) => b.id)) + 1
}

/** Cents to open the next branch: the blueprint's value plus the fee for this branch number. */
export function openBranchCost(state: GameState, defs: Defs): number {
  const n = state.branches?.length ?? 0
  return blueprintOf(state, defs).value + (BRANCH_OPEN_FEES[Math.min(n, BRANCH_OPEN_FEES.length - 1)] ?? 0)
}

/** Cents to refit: the fee plus any increase in blueprint value over the one the branch runs now. */
export function refitCost(state: GameState, defs: Defs, branch: Branch): number {
  return BRANCH_REFIT_FEE + Math.max(0, blueprintOf(state, defs).value - branch.blueprint.value)
}

function chainProblem(state: GameState): RejectReason | null {
  if (!state.won) return 'chain locked'
  if (state.phase !== 'build') return 'wrong phase'
  return null
}

/** Why `openBranch` would be rejected right now without running the test day, or null. The UI shows the same reason. */
export function openBranchProblem(state: GameState, defs: Defs): RejectReason | null {
  const why = chainProblem(state)
  if (why !== null) return why
  if ((state.branches?.length ?? 0) >= BRANCH_MAX) return 'branch limit'
  if (nextArea(state, defs) === null) return 'branch limit'
  if (state.money < openBranchCost(state, defs)) return 'cannot afford'
  return null
}

/** Why `refitBranch` of `id` would be rejected right now without running the test day, or null. */
export function refitProblem(state: GameState, defs: Defs, id: unknown): RejectReason | null {
  const why = chainProblem(state)
  if (why !== null) return why
  const branch = branchById(state, id)
  if (branch === undefined) return 'no such branch'
  if (sameBlueprint(branch.blueprint, blueprintOf(state, defs))) return 'blueprint unchanged'
  if (state.money < refitCost(state, defs, branch)) return 'cannot afford'
  return null
}

/** The test day of `bp` at `area` for branch `id` with the flagship's current day and ratings. */
export function testBranch(state: GameState, defs: Defs, bp: Blueprint, area: BranchAreaDef, id: number): BranchExpected {
  return branchDayResult(bp, area, { seed: branchSeed(state.seed, id), day: state.day, ratings: state.ratings }, defs)
}

/** True when the test result would make money on a normal night (profit above the rent). */
export function profitable(expected: BranchExpected, area: BranchAreaDef): boolean {
  return expected.profit - area.rent > 0
}
