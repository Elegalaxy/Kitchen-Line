// View helper for the closing-time cue in the top bar. Pure: it reads the state only.
// Overnight cleanup (GAME_DESIGN 4) throws away everything left on the line at close, so in the
// last CLOSING_SOON_TICKS of service the bar warns the player and offers a one-click pantry pause.

import { CLOSING_SOON_TICKS, DAY_TICKS, TICKS_PER_SECOND } from '../sim/constants.ts'
import type { GameState } from '../sim/types.ts'
import { pantryPauseView } from './pantryPause.ts'

export type ClosingSoonView = {
  active: boolean
  /** Whole seconds left in the day (rounded up); 0 when not active. */
  secondsLeft: number
  text: string
  /** True when the one-click "Pause pantries" button should show (pantries exist and not all are paused). */
  showPauseButton: boolean
  /** Shown instead of the button when every pantry is already paused. */
  pausedNote: string | null
}

const INACTIVE: ClosingSoonView = { active: false, secondsLeft: 0, text: '', showPauseButton: false, pausedNote: null }

export function closingSoonView(state: GameState): ClosingSoonView {
  if (state.phase !== 'service') return INACTIVE
  const remaining = DAY_TICKS - state.dayTick
  if (remaining > CLOSING_SOON_TICKS || remaining <= 0) return INACTIVE
  const pantries = pantryPauseView(state)
  const allPaused = pantries.total > 0 && pantries.paused === pantries.total
  return {
    active: true,
    secondsLeft: Math.ceil(remaining / TICKS_PER_SECOND),
    text: 'Closing soon: items left on the line will be thrown away',
    showPauseButton: pantries.total > 0 && !allPaused,
    pausedNote: allPaused ? 'Pantries paused' : null,
  }
}
