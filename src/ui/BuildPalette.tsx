// Build palette (right panel): undo and sell-mode controls, then one button per placeable
// building with glyph, name, hotkey and cost. A disabled button shows its reason as a
// visible line ("Needs $40.00", "Restaurant tier"), never only a tooltip. The fast belt is a
// second entry right after the belt (same drag tool, its own cost and tier); it has no number
// hotkey, so 1-9 and 0 keep mapping to the buildings in DEFS order.

import { selectTool, undoAction } from './actions.ts'
import type { Ctx } from './actions.ts'
import { formatMoney } from './format.ts'
import { labelForIndex } from './hotkeys.ts'
import { hasFastVariant, paletteCost, paletteKinds, paletteReason } from './palette.ts'
import type { Snapshot } from './store.ts'
import type { UiState } from './uiState.ts'

export default function BuildPalette({ ctx, snap, ui }: { ctx: Ctx; snap: Snapshot; ui: UiState }) {
  const { defs } = ctx.store
  const entries = paletteKinds(defs).flatMap((kind, i) => {
    const base = { key: kind, kind, fast: false, hotkey: labelForIndex(i), name: defs.buildings[kind].name }
    return hasFastVariant(defs, kind) ? [base, { ...base, key: `${kind}-fast`, fast: true, hotkey: '', name: 'Fast belt' }] : [base]
  })
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
        {entries.map(({ key, kind, fast, hotkey, name }) => {
          const def = defs.buildings[kind]
          const reason = paletteReason(snap.state, defs, kind, fast)
          const cost = paletteCost(defs, kind, fast)
          return (
            <button
              key={key}
              type="button"
              className="btn pal-btn"
              aria-pressed={ui.tool === kind && (kind !== 'belt' || ui.fast === fast)}
              disabled={reason !== null}
              onClick={() => selectTool(ctx, kind, fast)}
            >
              <span className="btn-main">
                <span className="pal-glyph" aria-hidden="true">
                  {fast ? '⏩' : def.emoji}
                </span>
                <span className="pal-name">{name}</span>
              </span>
              <span className="btn-main">
                <span className="btn-sub num pal-cost">{formatMoney(cost)}</span>
                {hotkey !== '' && <kbd>{hotkey}</kbd>}
              </span>
              <span className="pal-reason">{reason === null ? '' : `⚠ ${reason}`}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
