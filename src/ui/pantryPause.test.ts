// Tests for the pantry pause view helper and the bulk toggle action.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { applyCommand } from '../sim/commands.ts'
import { createGame } from '../sim/game.ts'
import type { GameState } from '../sim/types.ts'
import { pauseAt, selectTool, togglePantriesAction } from './actions.ts'
import { pantryPauseView } from './pantryPause.ts'
import { createStore } from './store.ts'
import { createUiStore } from './uiState.ts'

const noTimers = { now: () => 0, setTimer: () => undefined }

function withTwoPantries(): GameState {
  return applyCommand(createGame(DEFS, 'pp'), DEFS, { type: 'place', kind: 'pantry', x: 0, y: 4, dir: 1 }).state
}

describe('pantryPauseView', () => {
  it('counts paused pantries and picks the next action', () => {
    const s = withTwoPantries()
    expect(pantryPauseView(s)).toMatchObject({
      total: 2,
      paused: 0,
      next: 'pause',
      label: 'Pause pantries',
      summary: 'Pantries: none of 2 paused',
    })
    const one = applyCommand(s, DEFS, { type: 'configure', x: 0, y: 2, paused: true }).state
    expect(pantryPauseView(one)).toMatchObject({ paused: 1, next: 'pause', summary: 'Pantries: 1 of 2 paused' })
    const all = applyCommand(one, DEFS, { type: 'setPantriesPaused', paused: true }).state
    expect(pantryPauseView(all)).toMatchObject({
      paused: 2,
      next: 'resume',
      label: 'Resume pantries',
      summary: 'Pantries: 2 of 2 paused',
    })
  })

  it('is disabled with a reason when there is no pantry', () => {
    const s = structuredClone(createGame(DEFS, 'pp'))
    for (const b of Object.values(s.buildings)) if (b.kind === 'pantry') delete s.buildings[b.id]
    expect(pantryPauseView(s)).toMatchObject({ total: 0, disabledReason: 'No pantries to pause', summary: 'No pantries' })
  })
})

describe('pauseAt', () => {
  it('toggles one pantry per click and leaves the others running', () => {
    const store = createStore(DEFS, withTwoPantries(), noTimers)
    const ui = createUiStore()
    const ctx = { store, ui }
    selectTool(ctx, 'pause')
    expect(pauseAt(ctx, { x: 0, y: 2 })).toBe(true)
    expect(pauseAt(ctx, { x: 0, y: 4 })).toBe(true)
    expect(pantryPauseView(store.getState()).paused).toBe(2)
    expect(ui.get().tool).toBe('pause')
    expect(pauseAt(ctx, { x: 0, y: 2 })).toBe(true)
    expect(pantryPauseView(store.getState()).paused).toBe(1)
    expect(pauseAt(ctx, { x: 7, y: 2 })).toBe(false)
    expect(ui.get().toast?.text).toBe('Click a pantry')
  })
})

describe('togglePantriesAction', () => {
  it('pauses all, then resumes all', () => {
    const store = createStore(DEFS, withTwoPantries(), noTimers)
    const ctx = { store, ui: createUiStore() }
    expect(togglePantriesAction(ctx)).toBe(true)
    expect(pantryPauseView(store.getState()).paused).toBe(2)
    expect(togglePantriesAction(ctx)).toBe(true)
    expect(pantryPauseView(store.getState()).paused).toBe(0)
  })
})
