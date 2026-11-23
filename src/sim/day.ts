// Day cycle (plan Step 10). A day is DAY_TICKS ticks of service. `stepTick` advances
// `dayTick` after every tick; when it reaches DAY_TICKS the day ends: today's stats become
// `lastDay`, `totals.days` goes up and the phase becomes `summary`. `dismissSummary`
// (commands.ts) then starts the next build phase. `phaseAt` names the part of the day.
// At day end `totals.profit` also grows by the day's profit (Step 16: goals read it), goals are
// checked once more and, if every restaurant goal is done for the first time, the phase is
// `won` (the end screen) instead of `summary`. Before the stats are archived, everything still
// held on the line is thrown away (spoil.ts `clearOvernight`, GAME_DESIGN section 4). Branch nights (nights.ts)
// are booked into the money and today's stats right before the archive.

import { DAY_PHASE_STARTS, DAY_TICKS } from './constants.ts'
import { dropLeftovers, profitOf } from './economy.ts'
import { checkWin, updateGoals } from './goals.ts'
import { runBranchNights } from './nights.ts'
import { clearOvernight } from './spoil.ts'
import type { DayPhase, Defs, GameState } from './types.ts'

/** The part of the day at `dayTick` (ticks since service opened). Out of range clamps. */
export function phaseAt(dayTick: number): DayPhase {
  let current: DayPhase = 'open'
  for (const p of DAY_PHASE_STARTS) {
    if (dayTick >= p.from) current = p.phase
  }
  return current
}

/** Mutates `state`: end the day (service -> summary). Called when dayTick reaches DAY_TICKS. */
export function endDay(state: GameState, defs: Defs): void {
  dropLeftovers(state) // Q6: still-waiting customers leave unrated and uncounted
  clearOvernight(state) // everything still on the line is thrown away and counts as waste of this day
  runBranchNights(state, defs) // GAME_DESIGN 8.1: each branch's night, before the day is archived and the goals read it
  state.prevDay = state.lastDay
  state.lastDay = state.today
  state.totals.days += 1
  state.totals.profit += profitOf(state.today)
  state.phase = 'summary'
  updateGoals(state, defs)
  checkWin(state, defs)
}

/** Mutates `state`: advance the day clock by one tick and end the day when it is over. */
export function advanceDayClock(state: GameState, defs: Defs): void {
  state.dayTick += 1
  if (state.dayTick >= DAY_TICKS) endDay(state, defs)
}
