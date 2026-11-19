// Inspector (right panel): details of the selected building as key-value rows (kind,
// facing, status as icon plus word, held items, progress) plus config controls that send
// `configure` commands, and Rotate / Sell buttons. Reads the throttled snapshot, so the
// numbers refresh about 5 times a second.

import type { ReactNode } from 'react'
import { ASSEMBLER_TICKS, PANTRY_INTERVALS } from '../sim/constants.ts'
import type { Building, ConfigFields, Defs, Item } from '../sim/types.ts'
import { removeAt, report, rotateAction } from './actions.ts'
import type { Ctx } from './actions.ts'
import { DIR_ARROW, dirName, formatMoney, STATUS_TEXT } from './format.ts'
import type { Snapshot } from './store.ts'

const TICKS_PER_SECOND = 10

function heldItems(b: Building): Item[] {
  switch (b.kind) {
    case 'belt':
      return b.slots.filter((s): s is Item => s !== null)
    case 'splitter':
    case 'merger':
    case 'filter':
      return b.buf === null ? [] : [b.buf]
    case 'chopper':
    case 'fryer':
    case 'stove':
      return [...b.input, ...(b.output === null ? [] : [b.output])]
    case 'assembler':
      return [...Object.values(b.inputs).flat(), ...(b.output === null ? [] : [b.output])]
    case 'pass':
      return b.shelf
    default:
      return []
  }
}

function heldText(defs: Defs, items: Item[]): string {
  if (items.length === 0) return 'Empty'
  const counts = new Map<string, number>()
  for (const it of items) counts.set(it.type, (counts.get(it.type) ?? 0) + 1)
  return [...counts]
    .map(([type, n]) => `${defs.items[type]?.emoji ?? '?'} ${defs.items[type]?.name ?? type}${n > 1 ? ` ×${n}` : ''}`)
    .join(', ')
}

/** Progress 0..100, or null when it does not apply. Station and assembler progress count up from 0. */
function progressPct(defs: Defs, b: Building): number | null {
  if (b.kind === 'pantry') return Math.round((100 * (b.interval - b.cooldown)) / b.interval)
  if (b.kind === 'chopper' || b.kind === 'fryer' || b.kind === 'stove') {
    const first = b.input[0]
    const recipe =
      first === undefined ? undefined : defs.stationRecipes.find((r) => r.station === b.kind && r.input === first.type)
    return recipe === undefined ? null : Math.min(100, Math.round((100 * b.progress) / recipe.ticks))
  }
  if (b.kind === 'assembler') return Math.min(100, Math.round((100 * b.progress) / ASSEMBLER_TICKS))
  return null
}

function refund(defs: Defs, b: Building): number {
  const def = defs.buildings[b.kind]
  return b.kind === 'belt' && b.fast && def.fast !== undefined ? def.fast.cost : def.cost
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="kv-row">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function Inspector({ ctx, snap, selectedId }: { ctx: Ctx; snap: Snapshot; selectedId: number | null }) {
  const { defs } = ctx.store
  const b = selectedId === null ? undefined : snap.state.buildings[selectedId]
  if (b === undefined) {
    return (
      <section className="panel" aria-label="Inspector">
        <h2 className="panel-title">Inspector</h2>
        <div className="empty-state">
          <p className="empty-title">Select a building</p>
          <p className="empty">
            Click a building on the grid, or move the tile cursor with the arrow keys and press Enter, to see its status,
            items and settings.
          </p>
        </div>
      </section>
    )
  }
  const def = defs.buildings[b.kind]
  const status = STATUS_TEXT[b.status]
  const pct = progressPct(defs, b)
  const configure = (fields: ConfigFields): void => {
    report(ctx, ctx.store.dispatch({ type: 'configure', x: b.x, y: b.y, ...fields }))
  }
  const rawItems = Object.values(defs.items).filter((i) => i.kind === 'raw')
  const recipes = Object.values(defs.dishes).filter((d) => d.inputs !== undefined && snap.state.unlocked.includes(d.id))
  const isPass = b.kind === 'pass'
  return (
    <section className="panel" aria-label="Inspector">
      <h2 className="panel-title">Inspector</h2>
      <dl className="kv">
        <Row k="Building">
          <span aria-hidden="true">{def.emoji}</span> {def.name}
        </Row>
        <Row k="Position">
          <span className="num">
            {b.x}, {b.y}
          </span>
        </Row>
        <Row k="Facing">
          <span aria-hidden="true">{DIR_ARROW[b.dir]}</span> {dirName(b.dir)}
        </Row>
        <Row k="Status">
          <span aria-hidden="true">{status.icon}</span> {status.word}
        </Row>
        <Row k="Holding">{heldText(defs, heldItems(b))}</Row>
        {b.kind === 'pass' && (
          <Row k="Delivered">
            <span className="num">{b.delivered}</span>
          </Row>
        )}
        <Row k="Progress">{pct === null ? '—' : <span className="num">{pct}%</span>}</Row>
      </dl>

      {b.kind === 'pantry' && (
        <div className="controls">
          <label className="field">
            <span>Ingredient</span>
            <select value={b.ingredient} onChange={(e) => configure({ ingredient: e.target.value })}>
              {rawItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.emoji} {i.name} ({formatMoney(i.cost ?? 0)})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Emit every</span>
            <select value={b.interval} onChange={(e) => configure({ interval: Number(e.target.value) })}>
              {PANTRY_INTERVALS.map((t) => (
                <option key={t} value={t}>
                  {t / TICKS_PER_SECOND} s
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {b.kind === 'filter' && (
        <div className="controls">
          <label className="field">
            <span>Filter item</span>
            <select
              value={b.filterItem ?? ''}
              onChange={(e) => configure({ filterItem: e.target.value === '' ? null : e.target.value })}
            >
              <option value="">None</option>
              {Object.values(defs.items).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.emoji} {i.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {b.kind === 'assembler' && (
        <div className="controls">
          <label className="field">
            <span>Recipe</span>
            <select
              value={b.recipe ?? ''}
              onChange={(e) => configure({ recipe: e.target.value === '' ? null : e.target.value })}
            >
              <option value="">None</option>
              {recipes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.emoji} {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="actions">
        <button type="button" className="btn act-btn" onClick={() => rotateAction(ctx)}>
          <span className="btn-main">
            <span aria-hidden="true">🔄</span> Rotate <kbd>R</kbd>
          </span>
        </button>
        <button type="button" className="btn act-btn" disabled={isPass} onClick={() => removeAt(ctx, { x: b.x, y: b.y })}>
          <span className="btn-main">
            <span aria-hidden="true">💰</span> Sell <span className="num">+{formatMoney(refund(defs, b))}</span>
          </span>
          {isPass && <span className="pal-reason">⚠ The pass cannot be removed</span>}
        </button>
      </div>
    </section>
  )
}
