// View helper for the "Restaurant upgrades" section of the Upgrades tab (GAME_DESIGN 6.4): one row
// per upgrade with its effect text, cost, whether it is owned, and a visible reason when it cannot
// be bought. The reason comes from the sim's own check (buyUpgradeProblem), so the button and the
// command cannot disagree.

import { buyUpgradeProblem } from '../sim/upgrades.ts'
import type { Defs, GameState, UpgradeDef } from '../sim/types.ts'
import { formatMoney, reasonText } from './format.ts'

export type UpgradeRow = {
  id: string
  name: string
  emoji: string
  /** "+15% arrivals", "+3 waiting places". */
  effectText: string
  cost: number
  costText: string
  owned: boolean
  /** Why the Buy button is disabled, or null when it can be used. Null for an owned upgrade. */
  reason: string | null
}

/** Short effect text; several effects are joined with " · ". */
export function effectText(def: UpgradeDef): string {
  const e = def.effect
  const parts: string[] = []
  if (e.waitingCapBonus !== undefined) parts.push(`+${e.waitingCapBonus} waiting places`)
  if (e.arrivalPercent !== undefined) parts.push(`+${e.arrivalPercent}% customers`)
  if (e.patiencePercent !== undefined) parts.push(`+${e.patiencePercent}% patience`)
  if (e.budgetPercent !== undefined) parts.push(`+${e.budgetPercent}% budget`)
  return parts.join(' · ')
}

export function upgradeRows(state: GameState, defs: Defs): UpgradeRow[] {
  return (defs.upgrades ?? []).map((def) => {
    const owned = state.upgrades?.includes(def.id) === true
    const why = owned ? null : buyUpgradeProblem(state, defs, def.id)
    let reason: string | null = null
    if (why === 'cannot afford') reason = `Needs ${formatMoney(def.cost)}`
    else if (why === 'wrong phase') reason = 'Only between days: wait for the day to end'
    else if (why !== null) reason = reasonText(why)
    return {
      id: def.id,
      name: def.name,
      emoji: def.emoji,
      effectText: effectText(def),
      cost: def.cost,
      costText: formatMoney(def.cost),
      owned,
      reason,
    }
  })
}
