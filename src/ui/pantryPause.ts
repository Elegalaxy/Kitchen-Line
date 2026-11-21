// View helper for the pantry pause controls (Build panel "Pause pantries" button and the
// Inspector toggle text). Pure: it only counts pantries in the state.

import type { GameState } from '../sim/types.ts'

export type PantryPauseView = {
  total: number
  paused: number
  /** What the single bulk button does when pressed: pause everything unless everything is already paused. */
  next: 'pause' | 'resume'
  label: string
  /** "Pantries: 2 of 3 paused", or "Pantries: none paused" / "No pantries". */
  summary: string
  /** Why the button does nothing, or null when it works. */
  disabledReason: string | null
}

export function pantryPauseView(state: GameState): PantryPauseView {
  const pantries = Object.values(state.buildings).filter((b) => b.kind === 'pantry')
  const total = pantries.length
  const paused = pantries.filter((b) => b.kind === 'pantry' && b.paused === true).length
  const next = total > 0 && paused === total ? 'resume' : 'pause'
  const summary = total === 0 ? 'No pantries' : paused === 0 ? `Pantries: none of ${total} paused` : `Pantries: ${paused} of ${total} paused`
  return {
    total,
    paused,
    next,
    label: next === 'resume' ? 'Resume pantries' : 'Pause pantries',
    summary,
    disabledReason: total === 0 ? 'No pantries to pause' : null,
  }
}
