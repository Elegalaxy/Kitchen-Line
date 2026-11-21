// Menu tab (plan Step 14): one table row per dish. Columns: on-menu toggle, glyph and name,
// price input, reference price, ingredient cost, margin (arrow, sign and word) and served
// today. A locked dish shows an "Unlock $X" button instead of the toggle and price. Each
// row has a Recipe button that opens that dish's steps (pantry ingredients and stations).
// The panel is read-only outside the build phase. Rows are laid out as small cards (the side
// panel is narrow) with the table roles kept for assistive tech.
//
// Price input: type dollars, Enter or leaving the field commits, Escape reverts. Invalid
// text shows an inline error and is NOT dispatched. The hint line under the input (allowed
// range) and the error share one reserved line, so nothing shifts.

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ingredientCostOf } from '../content/dishes.ts'
import { report } from './actions.ts'
import type { Ctx } from './actions.ts'
import { formatMoney, reasonText } from './format.ts'
import { debugLog } from './debug.ts'
import { checkPriceText, menuView } from './menuView.ts'
import type { MenuRow } from './menuView.ts'
import { centsToInput } from './money.ts'
import { recipeSteps } from './recipeView.ts'
import type { RecipeStep } from './recipeView.ts'
import type { Snapshot } from './store.ts'

function PriceInput({ ctx, row, disabled }: { ctx: Ctx; row: MenuRow; disabled: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const committed = row.price === null ? '' : centsToInput(row.price)
  const hintId = `price-hint-${row.id}`

  const commit = (): void => {
    if (draft === null || row.price === null) return
    const checked = checkPriceText(draft, row.refPrice)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    if (checked.cents !== row.price) {
      const result = ctx.store.dispatch({ type: 'setPrice', dish: row.id, cents: checked.cents })
      if (!result.ok) {
        setError(reasonText(result.reason))
        report(ctx, result)
        return
      }
    }
    setDraft(null)
    setError(null)
  }
  const revert = (): void => {
    setDraft(null)
    setError(null)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      revert()
    }
  }
  return (
    <div className="price-cell">
      <label className="price-field">
        <span className="sr-only">Price of {row.name}</span>
        <span className="price-prefix" aria-hidden="true">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          className="price-input num"
          value={draft ?? committed}
          placeholder="—"
          disabled={disabled}
          aria-invalid={error !== null}
          aria-describedby={hintId}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
      </label>
      <p id={hintId} className={`price-hint num${error === null ? '' : ' price-error'}`} role={error === null ? undefined : 'alert'}>
        {error !== null
          ? `⚠ ${error}`
          : row.onMenu
            ? `${formatMoney(row.bounds.min)} – ${formatMoney(row.bounds.max)}`
            : ''}
      </p>
    </div>
  )
}

function RecipeList({ dishId, steps }: { dishId: string; steps: RecipeStep[] }) {
  return (
    <ol id={`recipe-${dishId}`} className="recipe-list">
      {steps.map((step, i) => (
        <li key={`${step.id}-${i}`} className="recipe-step" style={{ paddingLeft: step.depth * 12 }}>
          <span className="recipe-item">
            <span aria-hidden="true">{step.emoji}</span> {step.name}
          </span>
          <span className="recipe-made">{step.made}</span>
        </li>
      ))}
    </ol>
  )
}

function Row({
  ctx,
  row,
  readOnly,
  recipeOpen,
  onToggleRecipe,
  onUnlocked,
}: {
  ctx: Ctx
  row: MenuRow
  readOnly: boolean
  recipeOpen: boolean
  onToggleRecipe: (id: string) => void
  onUnlocked: (id: string) => void
}) {
  const { store } = ctx
  const state = store.getState()
  const toggle = (on: boolean): void => {
    const dishes = state.menu.map((m) => m.dish).filter((d) => d !== row.id)
    if (on) dishes.push(row.id)
    report(ctx, store.dispatch({ type: 'setMenu', dishes }))
  }
  const unlock = (): void => {
    if (report(ctx, store.dispatch({ type: 'unlockRecipe', dish: row.id }))) onUnlocked(row.id)
  }
  const toggleDisabled = readOnly || row.toggleReason !== null
  const reason = row.locked ? row.unlockReason : row.toggleReason
  return (
    <tr className={`menu-row${row.locked ? ' menu-locked' : ''}`} role="row" data-dish={row.id}>
      <td className="cell-toggle" role="cell">
        {row.locked ? (
          <span className="lock-glyph" role="img" aria-label="Locked">
            🔒
          </span>
        ) : (
          <label className="toggle-hit">
            <input
              type="checkbox"
              className="toggle"
              checked={row.onMenu}
              disabled={toggleDisabled}
              onChange={(e) => toggle(e.target.checked)}
            />
            <span className="sr-only">{row.name} on the menu</span>
          </label>
        )}
      </td>
      <td className="cell-dish" role="cell">
        <span className="dish-name">
          <span aria-hidden="true">{row.emoji}</span> {row.name}
        </span>
        <button
          type="button"
          className="btn-quiet recipe-btn"
          aria-label={`Recipe for ${row.name}`}
          aria-expanded={recipeOpen}
          aria-controls={recipeOpen ? `recipe-${row.id}` : undefined}
          onClick={() => onToggleRecipe(row.id)}
        >
          Recipe
        </button>
        <span className="pal-reason">{reason === null ? '' : `⚠ ${reason}`}</span>
      </td>
      <td className="cell-price" role="cell">
        {row.locked ? (
          <button type="button" className="btn unlock-btn" disabled={readOnly || row.unlockReason !== null} onClick={unlock}>
            <span className="btn-main">
              Unlock <span className="num">{formatMoney(row.unlockCost)}</span>
            </span>
          </button>
        ) : (
          <PriceInput
            key={`${readOnly}-${row.onMenu}`}
            ctx={ctx}
            row={row}
            disabled={readOnly || !row.onMenu}
          />
        )}
      </td>
      <td className="cell-stat cell-ref num" role="cell" data-label="Ref.">
        {formatMoney(row.refPrice)}
      </td>
      <td className="cell-stat cell-cost num" role="cell" data-label="Cost">
        {formatMoney(row.cost)}
      </td>
      <td className="cell-stat cell-margin num" role="cell" data-label="Margin">
        {row.margin === null ? (
          <span className="faint" aria-label="Not on the menu">
            —
          </span>
        ) : (
          <span className={`margin margin-${row.margin.kind}`}>
            <span aria-hidden="true">{row.margin.arrow}</span> {row.margin.text}
            <span className="sr-only"> {row.margin.word}</span>
          </span>
        )}
      </td>
      <td className="cell-stat cell-served num" role="cell" data-label="Served">
        {row.locked ? <span className="faint">—</span> : row.served}
      </td>
      {recipeOpen && (
        <td className="cell-recipe" role="cell">
          <RecipeList dishId={row.id} steps={recipeSteps(store.defs, row.id)} />
        </td>
      )}
    </tr>
  )
}

export default function MenuPanel({ ctx, snap }: { ctx: Ctx; snap: Snapshot }) {
  const view = menuView(snap.state, ctx.store.defs, ingredientCostOf)
  const [focusDish, setFocusDish] = useState<string | null>(null)
  const [openRecipe, setOpenRecipe] = useState<string | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)

  const toggleRecipe = (id: string): void => {
    const next = openRecipe === id ? null : id
    debugLog('[ui]', 'menu recipe', id, next === null ? 'closed' : 'open')
    setOpenRecipe(next)
  }

  // After an unlock the Unlock button is replaced by the toggle: keep keyboard focus in the row.
  useEffect(() => {
    if (focusDish === null) return
    const toggle = tableRef.current?.querySelector<HTMLInputElement>(`tr[data-dish="${focusDish}"] input[type="checkbox"]`)
    if (toggle !== null && toggle !== undefined) {
      toggle.focus()
      setFocusDish(null)
    }
  }, [focusDish, snap])

  const full = view.count >= view.cap
  return (
    <section className="panel" aria-label="Menu and prices">
      <h2 className="panel-title menu-title">
        <span>Menu</span>
        <span className="num menu-count" aria-live="polite">
          {view.count} / {view.cap} on menu{full ? ' ⚠ full' : ''}
        </span>
      </h2>
      <p className={`menu-note${view.readOnly ? ' menu-note-locked' : ''}`} role="status">
        {view.note === null ? 'Edit the menu and prices, then open for service.' : `🔒 ${view.note}`}
      </p>
      <table className="menu-table" role="table" aria-label="Dishes" ref={tableRef}>
        <thead className="sr-only" role="rowgroup">
          <tr role="row">
            <th role="columnheader">On menu</th>
            <th role="columnheader">Dish</th>
            <th role="columnheader">Price</th>
            <th role="columnheader">Reference price</th>
            <th role="columnheader">Ingredient cost</th>
            <th role="columnheader">Margin</th>
            <th role="columnheader">Served today</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {view.rows.map((row) => (
            <Row
              key={row.id}
              ctx={ctx}
              row={row}
              readOnly={view.readOnly}
              recipeOpen={openRecipe === row.id}
              onToggleRecipe={toggleRecipe}
              onUnlocked={setFocusDish}
            />
          ))}
        </tbody>
      </table>
      {view.count === 0 && (
        <p className="empty empty-warn" role="status">
          ⚠ No dishes on the menu: customers will leave.
        </p>
      )}
    </section>
  )
}
