// Getting-started card. Shown beside the grid until every step is done, then remembered
// on this machine so it does not return. The current step is highlighted and gets its hint
// plus one button (pick a tool, open service, open the Menu tab, or select a building).
// Finished steps fold into one line (a disclosure) and the later steps come after the button,
// so the current hint and its button stay visible in a short card.
// "Hide hints" toggles the ghost tiles. Progress comes from tutorial.ts.

import { useEffect, useState } from 'react'
import { buildingAt } from '../sim/grid.ts'
import { selectTool } from './actions.ts'
import type { Ctx } from './actions.ts'
import { debugLog } from './debug.ts'
import { formatMoney } from './format.ts'
import { paletteReason } from './palette.ts'
import { getBrowserStorage } from './persistence.ts'
import type { Snapshot } from './store.ts'
import { saladShortfall, tutorialSections, tutorialView } from './tutorial.ts'
import type { TutorialStep } from './tutorial.ts'
import { clearTutorialHelp, readTutorialHelp, writeTutorialDone, writeTutorialHelp } from './tutorialLatch.ts'
import type { UiState } from './uiState.ts'

function Step({ step, isCurrent }: { step: TutorialStep; isCurrent: boolean }) {
  return (
    <li className={`tut-step${step.done ? ' done' : ''}${isCurrent ? ' current' : ''}`}>
      <span className="tut-mark" aria-hidden="true">
        {step.done ? '✓' : isCurrent ? '▶' : '○'}
      </span>
      <span className="tut-label">
        {step.label}
        <span className="sr-only">{step.done ? ' (done)' : isCurrent ? ' (current step)' : ' (not done)'}</span>
      </span>
    </li>
  )
}

export default function TutorialCard({ ctx, snap, ui }: { ctx: Ctx; snap: Snapshot; ui: UiState }) {
  const { store } = ctx
  const view = tutorialView(snap.state)
  const [showDone, setShowDone] = useState(false)
  useEffect(() => {
    if (view.open || ui.guideDone) return
    writeTutorialDone(getBrowserStorage())
    ctx.ui.set({ guideDone: true })
    debugLog('[ui]', 'tutorial finished')
  }, [view.open, ui.guideDone, ctx.ui])
  useEffect(() => {
    if (ui.guideDone || view.steps[view.current]?.id !== 'salad') return
    const cents = saladShortfall(snap.state, store.defs)
    if (cents <= 0 || readTutorialHelp(getBrowserStorage())) return
    writeTutorialHelp(getBrowserStorage())
    const result = store.dispatch({ type: 'tutorialHelp', cents })
    if (!result.ok) {
      clearTutorialHelp(getBrowserStorage())
      debugLog('[ui]', 'tutorial salad help rejected', result.reason)
      return
    }
    ctx.ui.showToast(`Added ${formatMoney(cents)} so you can finish the salad line.`, 'info')
    debugLog('[ui]', 'tutorial salad help', cents)
  }, [ui.guideDone, view, snap.state, store, ctx])
  if (ui.guideDone || !view.open) return null
  const { done, current, upcoming, doneLabel } = tutorialSections(view)
  const coach = view.coach
  const tool = coach?.kind === 'tool' ? coach.tool : undefined
  const toolName = tool === undefined ? '' : tool === 'remove' ? 'Sell' : store.defs.buildings[tool].name
  const toolReason = tool === undefined || tool === 'remove' ? null : paletteReason(snap.state, store.defs, tool)
  const toolActive = tool !== undefined && ui.tool === tool && !ui.fast
  const openReason = snap.state.phase === 'build' ? null : 'Service is already open'
  const menuReason = snap.state.phase === 'build' ? null : 'The menu is locked during service'

  return (
    <section className="panel tutorial" aria-label="Getting started">
      <h2 className="panel-title goal-title">
        <span>Getting started</span>
        <span className="num goal-total">
          {view.doneCount} / {view.steps.length}
        </span>
      </h2>
      {done.length > 0 && (
        <button
          type="button"
          className="btn-quiet tut-done-toggle"
          aria-expanded={showDone}
          aria-controls={showDone ? 'tut-done-list' : undefined}
          onClick={() => setShowDone((o) => !o)}
        >
          <span aria-hidden="true">✓</span>
          <span className="num">{doneLabel}</span>
          <span className="tut-chevron" aria-hidden="true">
            {showDone ? '▾' : '▸'}
          </span>
        </button>
      )}
      {showDone && done.length > 0 && (
        <ol id="tut-done-list" className="tut-list" aria-label="Finished steps">
          {done.map((s) => (
            <Step key={s.id} step={s} isCurrent={false} />
          ))}
        </ol>
      )}
      {current !== null && (
        <ol className="tut-list" aria-label="Current step">
          <Step step={current} isCurrent />
        </ol>
      )}
      {current !== null && <p className="tut-hint">{current.hint}</p>}
      {coach?.kind === 'open' && (
        <button
          type="button"
          className="btn-primary tut-btn"
          disabled={openReason !== null}
          onClick={() => store.dispatch({ type: 'openService' })}
        >
          <span aria-hidden="true">▶</span> Open for service
        </button>
      )}
      {coach?.kind === 'menu' && (
        <button
          type="button"
          className="btn-primary tut-btn"
          disabled={menuReason !== null || ui.tab === 'menu'}
          onClick={() => ctx.ui.set({ tab: 'menu' })}
        >
          {ui.tab === 'menu' ? 'Menu open' : 'Open Menu'}
        </button>
      )}
      {coach?.kind === 'select' && (
        <button
          type="button"
          className="btn-primary tut-btn"
          onClick={() => {
            const id = buildingAt(snap.state, coach.x, coach.y)
            ctx.ui.set({ selectedId: id, tab: 'build', tool: null })
          }}
        >
          Select it
        </button>
      )}
      {coach?.kind === 'tool' && (
        <button
          type="button"
          className="btn-primary tut-btn"
          disabled={toolReason !== null || toolActive}
          onClick={() => tool !== undefined && selectTool(ctx, tool)}
        >
          {toolActive ? `${toolName} selected` : `Pick ${toolName}`}
        </button>
      )}
      {coach?.kind === 'tool' && toolReason !== null && <p className="goal-reason">⚠ {toolReason}</p>}
      {coach?.kind === 'open' && openReason !== null && <p className="goal-reason">⚠ {openReason}</p>}
      {coach?.kind === 'menu' && menuReason !== null && <p className="goal-reason">⚠ {menuReason}</p>}
      {upcoming.length > 0 && (
        <ol className="tut-list" aria-label="Next steps">
          {upcoming.map((s) => (
            <Step key={s.id} step={s} isCurrent={false} />
          ))}
        </ol>
      )}
      <button
        type="button"
        className="btn tut-toggle"
        aria-pressed={ui.hintsHidden}
        onClick={() => ctx.ui.set({ hintsHidden: !ui.hintsHidden })}
      >
        {ui.hintsHidden ? 'Show hints on the grid' : 'Hide hints'}
      </button>
    </section>
  )
}
