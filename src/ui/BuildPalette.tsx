// Build palette (right panel): undo and sell-mode controls, then one button per placeable
// building with glyph, name, hotkey and cost. A disabled button shows its reason as a
// visible line ("Needs $40.00", "Restaurant tier"), never only a tooltip. The fast belt and the pro
// fryer, stove and assembler are second entries right after their base building (same tool, own
// cost and tier); they have no number hotkey, so 1-9 and 0 keep mapping to the buildings in DEFS order.

import { selectTool, togglePantriesAction, undoAction } from './actions.ts'
import type { Ctx } from './actions.ts'
import { formatMoney } from './format.ts'
import { labelForIndex } from './hotkeys.ts'
import { hasVariant, paletteCost, paletteKinds, paletteReason, variantName } from './palette.ts'
import { pantryPauseView } from './pantryPause.ts'
import type { BuildingKind } from '../sim/types.ts'
import type { Snapshot } from './store.ts'
import type { UiState } from './uiState.ts'

export type PaletteHover = { kind: BuildingKind; fast: boolean }

export default function BuildPalette({
  ctx,
  snap,
  ui,
  onHover,
}: {
  ctx: Ctx
  snap: Snapshot
  ui: UiState
  onHover: (h: PaletteHover | null) => void
}) {
  const { defs } = ctx.store
  const entries = paletteKinds(defs).flatMap((kind, i) => {
    const base = { key: kind, kind, fast: false, hotkey: labelForIndex(i), name: defs.buildings[kind].name }
    return hasVariant(defs, kind)
      ? [base, { ...base, key: `${kind}-fast`, fast: true, hotkey: '', name: variantName(defs, kind) }]
      : [base]
  })
  const undo = snap.undo
  const pantries = pantryPauseView(snap.state)
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
          <span className="btn-sub">{ui.tool === 'remove' ? 'Click a building' : 'Or press X'}</span>
        </button>
      </div>
      <button
        type="button"
        className="btn pause-all-btn"
        aria-pressed={pantries.total > 0 && pantries.paused === pantries.total}
        disabled={pantries.disabledReason !== null}
        onClick={() => togglePantriesAction(ctx)}
      >
        <span className="btn-main">
          <span aria-hidden="true">{pantries.next === 'resume' ? '▶' : '⏸'}</span> {pantries.label}
        </span>
        <span className="btn-sub">{pantries.disabledReason ?? pantries.summary}</span>
      </button>
      <button
        type="button"
        className="btn pause-all-btn"
        aria-pressed={ui.tool === 'pause'}
        onClick={() => selectTool(ctx, 'pause')}
      >
        <span className="btn-main">
          <span aria-hidden="true">⏸</span> {ui.tool === 'pause' ? 'Clicking pantries' : 'Pause one by one'}
        </span>
        <span className="btn-sub">{ui.tool === 'pause' ? 'Click each pantry. Esc to stop.' : 'Then click pantries on the grid'}</span>
      </button>
      <div
        className="palette"
        onMouseLeave={() => onHover(null)}
        onBlur={(e) => {
          const next = e.relatedTarget
          if (next instanceof Node && e.currentTarget.contains(next)) return
          onHover(null)
        }}
      >
        {entries.map(({ key, kind, fast, hotkey, name }) => {
          const def = defs.buildings[kind]
          const reason = paletteReason(snap.state, defs, kind, fast)
          const cost = paletteCost(defs, kind, fast)
          return (
            <div key={key} className="pal-hit" onMouseEnter={() => onHover({ kind, fast })}>
              <button
                type="button"
                className="btn pal-btn"
                aria-pressed={ui.tool === kind && ui.fast === fast}
                disabled={reason !== null}
                onClick={() => selectTool(ctx, kind, fast)}
                onFocus={() => onHover({ kind, fast })}
              >
                <span className="btn-main">
                  <span className="pal-glyph" aria-hidden="true">
                    {fast && kind === 'belt' ? '⏩' : def.emoji}
                  </span>
                  <span className="pal-name">{name}</span>
                </span>
                <span className="btn-main">
                  <span className="btn-sub num pal-cost">{formatMoney(cost)}</span>
                  {hotkey !== '' && <kbd>{hotkey}</kbd>}
                </span>
                <span className="pal-reason">{reason === null ? '' : `⚠ ${reason}`}</span>
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
