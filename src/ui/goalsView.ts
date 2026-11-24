// View helpers for the Goals panel and the end screen (plan Step 16): goal rows with the
// progress text and bar percent, and the upgrade / expansion availability with a visible
// reason. Reasons come from the sim's own checks (upgradeProblem, expansionProblem), so the
// buttons and the commands can never disagree.

import { UPGRADE_COST } from '../sim/constants.ts'
import { expansionProblem, goalsOfTier, nextExpansion, upgradeProblem } from '../sim/goals.ts'
import type { Defs, ExpansionDef, GameState, GoalTier, GoalUnit, RejectReason } from '../sim/types.ts'
import { formatMoney, reasonText } from './format.ts'

/** Stars cut (not rounded) to one decimal, so "3.96" never reads as a reached "4.0". */
export function starsFloor(stars: number): string {
  return (Math.floor(stars * 10 + 1e-9) / 10).toFixed(1)
}

/** "63", "$120.00" or "3.4★" for a value in a goal's unit. */
export function valueText(unit: GoalUnit, value: number): string {
  if (unit === 'cents') return formatMoney(value)
  if (unit === 'stars') return `${starsFloor(value)}★`
  return String(Math.floor(value))
}

export type GoalRow = {
  id: string
  label: string
  done: boolean
  /** "63 / 100", "$120.00 / $300.00" or "3.4★ / 4.0★". */
  text: string
  /** 0 to 100. */
  pct: number
  note: string | null
}

/** Rows for the goals of `tier`. `done` is the recorded state (a goal once done stays done). */
export function goalRows(state: GameState, defs: Defs, tier: GoalTier): GoalRow[] {
  return goalsOfTier(defs, tier).map((g) => {
    const p = g.check(state)
    const done = state.goalsDone.includes(g.id)
    const current = done ? p.target : p.current
    const pct = p.target <= 0 ? 100 : Math.max(0, Math.min(100, Math.floor((current / p.target) * 100)))
    return {
      id: g.id,
      label: g.label,
      done,
      text: `${valueText(g.unit, current)} / ${valueText(g.unit, p.target)}`,
      pct,
      note: p.note ?? null,
    }
  })
}

/** The goal group the tracker shows: the chain goals once the restaurant end screen was seen, else the current tier's. */
export function goalStage(state: GameState, defs: Defs): { tier: GoalTier; label: string } {
  if (state.won === true && goalsOfTier(defs, 'chain').length > 0) return { tier: 'chain', label: 'chain' }
  return { tier: state.tier, label: state.tier }
}

export function goalsLeft(state: GameState, defs: Defs, tier: GoalTier): number {
  return goalsOfTier(defs, tier).filter((g) => !state.goalsDone.includes(g.id)).length
}

/** Visible text for why a goal-panel action is unavailable. */
function problemText(reason: RejectReason, state: GameState, defs: Defs, cost: number): string {
  if (reason === 'cannot afford') return `Needs ${formatMoney(cost)}`
  if (reason === 'wrong phase') return 'Only between days: wait for the day to end'
  if (reason === 'goals not done') {
    const n = goalsLeft(state, defs, 'stall')
    return `Finish the stall goals first (${n} left)`
  }
  return reasonText(reason)
}

export type ActionView = { label: string; costText: string; reason: string | null }

/** The "Upgrade to restaurant" button: always shown while the tier is stall. */
export function upgradeView(state: GameState, defs: Defs): ActionView {
  const why = upgradeProblem(state, defs)
  return {
    label: 'Upgrade to restaurant',
    costText: formatMoney(UPGRADE_COST),
    reason: why === null ? null : problemText(why, state, defs, UPGRADE_COST),
  }
}

export type ExpansionView = {
  /** Current size, "8 × 6". */
  size: string
  next: ExpansionDef | null
  nextText: string | null
  costText: string | null
  reason: string | null
}

export function expansionView(state: GameState, defs: Defs): ExpansionView {
  const next = nextExpansion(state, defs)
  const size = `${state.width} × ${state.height}`
  if (next === null) return { size, next: null, nextText: null, costText: null, reason: null }
  const why = expansionProblem(state, defs)
  return {
    size,
    next,
    nextText: `${next.width} × ${next.height}`,
    costText: formatMoney(next.cost),
    reason: why === null ? null : problemText(why, state, defs, next.cost),
  }
}
