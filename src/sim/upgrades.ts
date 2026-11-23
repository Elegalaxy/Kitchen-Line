// Restaurant upgrades (GAME_DESIGN 6.4). `state.upgrades` lists the bought upgrade ids and is
// absent until the first purchase, so a game without upgrades has the same state (and hash) as
// before. Effects add up; every percent effect is applied AFTER the random draws it scales, so
// the draw order never changes.

import { WAITING_CAP } from './constants.ts'
import type { Defs, GameState, RejectReason, UpgradeDef } from './types.ts'

export type UpgradeEffects = {
  arrivalPercent: number
  waitingCapBonus: number
  budgetPercent: number
  patiencePercent: number
}

export const NO_EFFECTS: UpgradeEffects = { arrivalPercent: 0, waitingCapBonus: 0, budgetPercent: 0, patiencePercent: 0 }

/** The upgrades in `defs` the player owns, in defs order. */
export function ownedUpgrades(state: Pick<GameState, 'upgrades'>, defs: Defs): UpgradeDef[] {
  const owned = state.upgrades
  if (owned === undefined || defs.upgrades === undefined) return []
  return defs.upgrades.filter((u) => owned.includes(u.id))
}

/** Summed effects of the owned upgrades (all zero when there are none). */
export function upgradeEffects(state: Pick<GameState, 'upgrades'>, defs: Defs): UpgradeEffects {
  const total = { ...NO_EFFECTS }
  for (const u of ownedUpgrades(state, defs)) {
    total.arrivalPercent += u.effect.arrivalPercent ?? 0
    total.waitingCapBonus += u.effect.waitingCapBonus ?? 0
    total.budgetPercent += u.effect.budgetPercent ?? 0
    total.patiencePercent += u.effect.patiencePercent ?? 0
  }
  return total
}

/** How many orders can wait at once: the tier's capacity plus the bought tables. */
export function waitingCap(state: Pick<GameState, 'tier' | 'upgrades'>, defs: Defs): number {
  return WAITING_CAP[state.tier] + upgradeEffects(state, defs).waitingCapBonus
}

/** Scale `value` by `percent` extra (15 -> x1.15), rounded; unchanged when `percent` is 0. */
export function scalePercent(value: number, percent: number): number {
  return percent === 0 ? value : Math.round((value * (100 + percent)) / 100)
}

/** Why `buyUpgrade` of `id` would be rejected right now, or null. The UI shows the same reason. */
export function buyUpgradeProblem(state: GameState, defs: Defs, id: unknown): RejectReason | null {
  const def = typeof id === 'string' ? defs.upgrades?.find((u) => u.id === id) : undefined
  if (def === undefined) return 'invalid command'
  if (state.phase !== 'build') return 'wrong phase'
  if (def.requiresTier === 'restaurant' && state.tier !== 'restaurant') return 'locked by tier'
  if (state.upgrades?.includes(def.id) === true) return 'already owned'
  if (state.money < def.cost) return 'cannot afford'
  return null
}
