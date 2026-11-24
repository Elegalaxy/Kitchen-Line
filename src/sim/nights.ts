// Branch nights (GAME_DESIGN 8.1, chain stage). At every day end each branch adds its expected profit
// (from its stored test day) x a noise of 90 to 110 percent, minus the site's rent, to the money. The noise is
// an FNV hash of the seed, the branch and the day (and scaled by the season of the night against the season of
// the branch's test day, season.ts: x1 without seasons or when both seasons have the same percent): no random stream, nothing stored except the day's summary
// row (`DayStats.branches`), so the flagship's draws never change. The cost is O(branches) arithmetic. With
// no branches this does nothing at all (the state and its hash are untouched). It lives apart from
// branches.ts (which runs whole test days) so day.ts can import it without an import cycle through tick.ts.

import { BRANCH_NOISE_PERCENT } from './constants.ts'
import { hashText } from './fnv.ts'
import { branchSeasonPercent } from './season.ts'
import type { Branch, Defs, GameState } from './types.ts'

/** The night's noise in percent (90 to 110) for `branch` on `day`. */
export function nightNoisePercent(seed: string, branchId: number, day: number): number {
  return 100 - BRANCH_NOISE_PERCENT + (hashText(`${seed}|night|${branchId}|${day}`) % (2 * BRANCH_NOISE_PERCENT + 1))
}

/** Rent of the branch's site per night (cents); 0 when the site is missing from the defs. */
export function rentOf(branch: Pick<Branch, 'areaId'>, defs: Defs): number {
  return defs.branchAreas?.find((a) => a.id === branch.areaId)?.rent ?? 0
}

/** A branch's net for `day` (cents, after rent). */
export function branchNet(seed: string, branch: Branch, day: number, defs: Defs): number {
  const noise = nightNoisePercent(seed, branch.id, day)
  // Season ratio (season.ts): the night's season against the season of the branch's test day. Equal percents keep the plain expression.
  const now = branchSeasonPercent(defs, day)
  const tested = branchSeasonPercent(defs, branch.blueprintDay)
  const profit =
    now === tested
      ? Math.round((branch.expected.profit * noise) / 100)
      : Math.round((branch.expected.profit * noise * now) / (100 * tested))
  return profit - rentOf(branch, defs)
}

/** Mutates `state`: book every branch's night into the money, `chainProfit` and today's stats. */
export function runBranchNights(state: GameState, defs: Defs): void {
  const branches = state.branches
  if (branches === undefined || branches.length === 0) return
  const rows: { id: number; net: number; rent: number }[] = []
  let total = 0
  for (const b of branches) {
    const rent = rentOf(b, defs)
    const net = branchNet(state.seed, b, state.day, defs)
    rows.push({ id: b.id, net, rent })
    total += net
  }
  state.money += total
  state.chainProfit = (state.chainProfit ?? 0) + total
  state.today.branches = rows
}
