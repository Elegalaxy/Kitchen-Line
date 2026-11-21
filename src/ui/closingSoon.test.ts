// Tests for the closing-time cue view helper.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { applyCommand } from '../sim/commands.ts'
import { CLOSING_SOON_TICKS, DAY_TICKS } from '../sim/constants.ts'
import { createGame } from '../sim/game.ts'
import type { GameState } from '../sim/types.ts'
import { closingSoonView } from './closingSoon.ts'

function service(dayTick: number): GameState {
  const open = applyCommand(createGame(DEFS, 'cs'), DEFS, { type: 'openService' }).state
  return { ...open, dayTick }
}

describe('closingSoonView', () => {
  it('is off outside service and before the lead window', () => {
    expect(closingSoonView(createGame(DEFS, 'cs')).active).toBe(false)
    expect(closingSoonView(service(0)).active).toBe(false)
    expect(closingSoonView(service(DAY_TICKS - CLOSING_SOON_TICKS - 1)).active).toBe(false)
  })

  it('turns on at the lead and shows the seconds left and the pause button', () => {
    const v = closingSoonView(service(DAY_TICKS - CLOSING_SOON_TICKS))
    expect(v.active).toBe(true)
    expect(v.secondsLeft).toBe(Math.ceil(CLOSING_SOON_TICKS / 10))
    expect(v.text).toContain('thrown away')
    expect(v.showPauseButton).toBe(true)
    expect(v.pausedNote).toBeNull()
  })

  it('swaps the button for a note once every pantry is paused', () => {
    const paused = applyCommand(service(DAY_TICKS - 100), DEFS, { type: 'setPantriesPaused', paused: true }).state
    const v = closingSoonView(paused)
    expect(v.active).toBe(true)
    expect(v.showPauseButton).toBe(false)
    expect(v.pausedNote).toBe('Pantries paused')
  })

  it('has no button when there are no pantries', () => {
    const none = service(DAY_TICKS - 100)
    const empty: GameState = { ...none, buildings: Object.fromEntries(Object.entries(none.buildings).filter(([, b]) => b.kind !== 'pantry')) }
    const v = closingSoonView(empty)
    expect(v.active).toBe(true)
    expect(v.showPauseButton).toBe(false)
    expect(v.pausedNote).toBeNull()
  })
})
