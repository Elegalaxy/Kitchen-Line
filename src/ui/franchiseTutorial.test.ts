// Tests for the tutorial latch in franchised runs (GAME_DESIGN 8.2 and 13, user decision 2026-11-24): the
// guide and the salad top-up belong to the first ever run only. A run-2 state shows no TutorialCard and
// no ghost hints, and "New game" re-arms the guide only while no run has been franchised.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { createRun, emptyMeta } from '../sim/franchise.ts'
import type { MetaState } from '../sim/types.ts'
import type { Ctx } from './actions.ts'
import { createStore } from './store.ts'
import { tutorialHints } from './tutorial.ts'
import TutorialCard from './TutorialCard.tsx'
import { guideHiddenForRun, newGameRearmsGuide } from './tutorialLatch.ts'
import { createUiStore } from './uiState.ts'

const meta2: MetaState = { ...emptyMeta(), runsCompleted: 1, points: 5, recipeBook: ['fries'] }

function cardMarkup(runsCompleted: number): string {
  const store = createStore(DEFS, createRun(DEFS, undefined, { ...meta2, runsCompleted }))
  const ui = createUiStore()
  ui.set({ guideDone: guideHiddenForRun(runsCompleted) })
  const ctx: Ctx = { store, ui }
  return renderToStaticMarkup(createElement(TutorialCard, { ctx, snap: store.getSnapshot(), ui: ui.get() }))
}

describe('tutorial in franchised runs', () => {
  it('hides the guide from run 2 on', () => {
    expect(guideHiddenForRun(0)).toBe(false)
    expect(guideHiddenForRun(1)).toBe(true)
    expect(guideHiddenForRun(4)).toBe(true)
  })

  it('shows no TutorialCard in a run-2 state, and still shows it in run 1', () => {
    expect(cardMarkup(1)).toBe('')
    expect(cardMarkup(0)).toContain('Getting started')
  })

  it('draws no ghost hints in run 2 (the canvas needs guideDone to be false)', () => {
    // GridCanvas draws hints only when !hintsHidden && !guideDone; run 2 sets guideDone.
    const ui = createUiStore()
    ui.set({ guideDone: guideHiddenForRun(1) })
    const u = ui.get()
    expect(!u.hintsHidden && !u.guideDone).toBe(false)
    // Run 1 still has hints to draw.
    expect(tutorialHints(createRun(DEFS, undefined, emptyMeta())).length).toBeGreaterThan(0)
  })

  it('New game re-arms the guide only before the first franchise', () => {
    expect(newGameRearmsGuide(0)).toBe(true)
    expect(newGameRearmsGuide(1)).toBe(false)
  })
})
