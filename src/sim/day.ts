// Day cycle (plan Step 10). A day is DAY_TICKS ticks of service. `stepTick` advances
// `dayTick` after every tick; when it reaches DAY_TICKS the day ends: today's stats become
// `lastDay`, `totals.days` goes up and the phase becomes `summary`. `dismissSummary`
// (commands.ts) then starts the next build phase. `phaseAt` names the part of the day.

import { DAY_PHASE_STARTS, DAY_TICKS } from './constants.ts'
import { dropLeftovers } from './economy.ts'
import type { DayPhase, GameState } from './types.ts'

/** The part of the day at `dayTick` (ticks since service opened). Out of range clamps. */
export function phaseAt(dayTick: number): DayPhase {
  let current: DayPhase = 'open'
  for (const p of DAY_PHASE_STARTS) {
    if (dayTick >= p.from) current = p.phase
  }
  return current
}

/** Mutates `state`: end the day (service -> summary). Called when dayTick reaches DAY_TICKS. */
export function endDay(state: GameState): void {
  dropLeftovers(state) // Q6: still-waiting customers leave unrated and uncounted
  state.prevDay = state.lastDay
  state.lastDay = state.today
  state.totals.days += 1
  state.phase = 'summary'
}

/** Mutates `state`: advance the day clock by one tick and end the day when it is over. */
export function advanceDayClock(state: GameState): void {
  state.dayTick += 1
  if (state.dayTick >= DAY_TICKS) endDay(state)
}
