// Build palette (right panel): undo and sell-mode controls, then one button per placeable
// building with glyph, name, hotkey and cost. A disabled button shows its reason as a
// visible line ("Needs $40.00", "Restaurant tier"), never only a tooltip.

import { placeCost } from '../sim/grid.ts'
import { selectTool, undoAction } from './actions.ts'
import type { Ctx } from './actions.ts'
import { formatMoney } from './format.ts'
import { labelForIndex } from './hotkeys.ts'
import { paletteKinds, paletteReason } from './palette.ts'
import type { Snapshot } from './store.ts'
import type { UiState } from './uiState.ts'

export default function BuildPalette({ ctx, snap, ui }: { ctx: Ctx; snap: Snapshot; ui: UiState }) {
  const { defs } = ctx.store
  const kinds = paletteKinds(defs)
  const undo = snap.undo
  return (
    <section className="panel" aria-label="Build palette">
      <h2 className="panel-title">Build</h2>
      <div className="tool-row">
        <button
          type="button"
          className="btn tool-btn"
          disabled={undo.count === 0}
          onClick={() => undoAction(ctx)}
        >
          <span className="btn-main">
            <span aria-hidden="true">↩️</span> Undo <kbd>Ctrl+Z</kbd>
          </span>
          <span className="btn-sub">{undo.label ?? 'Nothing to undo'}</span>
        </button>
        <button
          type="button"
          className="btn tool-btn"
          aria-pressed={ui.tool === 'remove'}
          onClick={() => selectTool(ctx, 'remove')}
        >
          <span className="btn-main">
            <span aria-hidden="true">💰</span> Sell <kbd>X</kbd>
          </span>
          <span className="btn-sub">{ui.tool === 'remove' ? 'Click a building' : 'Right-click also sells'}</span>
        </button>
      </div>
      <div className="palette">
        {kinds.map((kind, i) => {
          const def = defs.buildings[kind]
          const reason = paletteReason(snap.state, defs, kind)
          const cost = placeCost(defs, { type: 'place', kind, x: 0, y: 0, dir: 0 })
          return (
            <button
              key={kind}
              type="button"
              className="btn pal-btn"
              aria-pressed={ui.tool === kind}
              disabled={reason !== null}
              onClick={() => selectTool(ctx, kind)}
            >
              <span className="btn-main">
                <span className="pal-glyph" aria-hidden="true">
                  {def.emoji}
                </span>
                <span className="pal-name">{def.name}</span>
              </span>
              <span className="btn-main">
                <span className="btn-sub num pal-cost">{formatMoney(cost)}</span>
                <kbd>{labelForIndex(i)}</kbd>
              </span>
              <span className="pal-reason">{reason === null ? '' : `⚠ ${reason}`}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
