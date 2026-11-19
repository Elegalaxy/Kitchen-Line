// First-goal checklist card (plan Step 18, decision Q4), shown above the side tabs for a new
// game until the first dish is served. Four rows, each with a mark and a word (never colour
// alone); the current step is highlighted and gets its hint plus one button that does it
// (pick the tool, or open for service). "Hide hints" toggles the ghost hint tiles on the grid.
// Progress comes from tutorial.ts (derived from the state, nothing is saved).

import { selectTool } from './actions.ts'
import type { Ctx } from './actions.ts'
import { paletteReason } from './palette.ts'
import type { Snapshot } from './store.ts'
import { tutorialView } from './tutorial.ts'
import type { TutorialStepId } from './tutorial.ts'
import type { UiState } from './uiState.ts'

const TOOL_FOR_STEP: Partial<Record<TutorialStepId, 'chopper' | 'fryer' | 'belt'>> = {
  chopper: 'chopper',
  fryer: 'fryer',
  connect: 'belt',
}

export default function TutorialCard({ ctx, snap, ui }: { ctx: Ctx; snap: Snapshot; ui: UiState }) {
  const { store } = ctx
  const view = tutorialView(snap.state)
  if (!view.open) return null
  const current = view.current === -1 ? null : view.steps[view.current]
  const tool = current === null ? undefined : TOOL_FOR_STEP[current.id]
  const toolName = tool === undefined ? '' : store.defs.buildings[tool].name
  const toolReason = tool === undefined ? null : paletteReason(snap.state, store.defs, tool)
  const toolActive = tool !== undefined && ui.tool === tool && !ui.fast
  const openReason = snap.state.phase === 'build' ? null : 'Service is already open'

  return (
    <section className="panel tutorial" aria-label="Getting started">
      <h2 className="panel-title goal-title">
        <span>Getting started</span>
        <span className="num goal-total">
          {view.doneCount} / {view.steps.length}
        </span>
      </h2>
      <ol className="tut-list">
        {view.steps.map((s, i) => {
          const isCurrent = i === view.current
          return (
            <li key={s.id} className={`tut-step${s.done ? ' done' : ''}${isCurrent ? ' current' : ''}`}>
              <span className="tut-mark" aria-hidden="true">
                {s.done ? '✓' : isCurrent ? '▶' : '○'}
              </span>
              <span className="tut-label">
                {s.label}
                <span className="sr-only">{s.done ? ' (done)' : isCurrent ? ' (current step)' : ' (not done)'}</span>
              </span>
            </li>
          )
        })}
      </ol>
      {current === null ? (
        <p className="tut-hint">All steps done. Your first customer pays as soon as a dish reaches the pass.</p>
      ) : (
        <>
          <p className="tut-hint">{current.hint}</p>
          {current.id === 'open' ? (
            <button
              type="button"
              className="btn-primary tut-btn"
              disabled={openReason !== null}
              onClick={() => store.dispatch({ type: 'openService' })}
            >
              <span aria-hidden="true">▶</span> Open for service
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary tut-btn"
              disabled={toolReason !== null || toolActive}
              onClick={() => tool !== undefined && selectTool(ctx, tool)}
            >
              {toolActive ? `${toolName} selected` : `Pick ${toolName}`}
            </button>
          )}
          {(toolReason !== null || openReason !== null) && (
            <p className="goal-reason">⚠ {current.id === 'open' ? openReason : toolReason}</p>
          )}
        </>
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
