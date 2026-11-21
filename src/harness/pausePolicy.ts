// Pause-aware service day for the scripted harness players (harness only, not sim rules).
// Overnight cleanup throws away whatever is left on the line at close, so a careful player
// pauses all pantries shortly before closing time (the line drains into customers) and
// resumes them when the next build phase starts. It uses the same commands as the UI.

import { applyCommand } from '../sim/commands.ts'
import { CLOSING_SOON_TICKS, DAY_TICKS } from '../sim/constants.ts'
import { runTicks } from '../sim/tick.ts'
import type { Defs, GameState, SimEvent } from '../sim/types.ts'

/** Ticks before closing at which the player pauses the pantries: the same lead as the UI closing warning. */
export const PAUSE_LEAD_TICKS = CLOSING_SOON_TICKS

function setPaused(state: GameState, defs: Defs, paused: boolean): GameState {
  const out = applyCommand(state, defs, { type: 'setPantriesPaused', paused })
  // A rejection means there is nothing to pause (no pantries): keep the state as it is.
  return out.result.ok ? out.state : state
}

/**
 * Run one service day (the state is in the 'service' phase). With `pause` the pantries are
 * paused for the last PAUSE_LEAD_TICKS ticks. They stay paused through the summary:
 * call `resumeAfterDay` when the next build phase starts.
 */
export function runServiceDay(state: GameState, defs: Defs, pause: boolean, onEvents?: (events: SimEvent[]) => void): GameState {
  if (!pause) return runTicks(state, defs, DAY_TICKS, onEvents)
  let s = runTicks(state, defs, DAY_TICKS - PAUSE_LEAD_TICKS, onEvents)
  s = setPaused(s, defs, true)
  return runTicks(s, defs, PAUSE_LEAD_TICKS, onEvents)
}

/** Resume all pantries (call after dismissSummary, in the build phase). A no-op when none are paused. */
export function resumeAfterDay(state: GameState, defs: Defs): GameState {
  return setPaused(state, defs, false)
}
