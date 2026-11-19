// Goals engine (plan Step 16). The goal list comes from `defs.goals` (content/goals.ts);
// the sim only runs it. `updateGoals` records newly reached goals in `state.goalsDone`
// (a goal once done stays done, even if the numbers later drop). Stall goals are always
// watched; restaurant goals only once the tier is restaurant. It runs at the end of every
// service tick and at day end. `checkWin` runs at day end: when every restaurant goal is
// done and the end screen has not shown yet, `won` is set and the phase becomes `won`
// (once only: `won` stays true after "Keep playing").

import { UPGRADE_COST } from './constants.ts'
import type { Defs, ExpansionDef, GameState, GoalDef, RejectReason, Tier } from './types.ts'

export function goalsOfTier(defs: Defs, tier: Tier): GoalDef[] {
  return (defs.goals ?? []).filter((g) => g.tier === tier)
}

/** True when every goal of `tier` is in `goalsDone` (also true when the tier has no goals). */
export function allGoalsDone(state: GameState, defs: Defs, tier: Tier): boolean {
  return goalsOfTier(defs, tier).every((g) => state.goalsDone.includes(g.id))
}

/** Mutates `state`: record goals that are reached now. */
export function updateGoals(state: GameState, defs: Defs): void {
  const goals = defs.goals
  if (goals === undefined) return
  for (const g of goals) {
    if (state.goalsDone.includes(g.id)) continue
    if (g.tier === 'restaurant' && state.tier !== 'restaurant') continue
    if (g.check(state).done) {
      state.goalsDone.push(g.id)
      state.events.push({ type: 'goalDone', tick: state.tick, id: g.id })
    }
  }
}

/** Mutates `state`: at day end, trigger the end screen the first time all restaurant goals are done. */
export function checkWin(state: GameState, defs: Defs): void {
  if (state.won || state.tier !== 'restaurant') return
  if (goalsOfTier(defs, 'restaurant').length === 0 || !allGoalsDone(state, defs, 'restaurant')) return
  state.won = true
  state.phase = 'won'
  state.events.push({ type: 'won', tick: state.tick })
}

/** Why `upgradeTier` would be rejected right now, or null. The UI shows the same reason. */
export function upgradeProblem(state: GameState, defs: Defs): RejectReason | null {
  if (state.phase !== 'build') return 'wrong phase'
  if (state.tier === 'restaurant') return 'already restaurant'
  if (!allGoalsDone(state, defs, 'stall')) return 'goals not done'
  if (state.money < UPGRADE_COST) return 'cannot afford'
  return null
}

/** The next grid size on offer, or null when fully expanded. */
export function nextExpansion(state: GameState, defs: Defs): ExpansionDef | null {
  return defs.expansions?.[state.expansion] ?? null
}

/** Why `buyExpansion` would be rejected right now, or null. The UI shows the same reason. */
export function expansionProblem(state: GameState, defs: Defs): RejectReason | null {
  if (state.phase !== 'build') return 'wrong phase'
  const step = nextExpansion(state, defs)
  if (step === null) return 'no more expansions'
  if (step.requiresTier === 'restaurant' && state.tier !== 'restaurant') return 'locked by tier'
  if (state.money < step.cost) return 'cannot afford'
  return null
}
