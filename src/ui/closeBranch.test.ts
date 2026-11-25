// Close branch dialog and panel markup (GAME_DESIGN 8.1), and that closing is not an undo entry.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import BranchesPanel from './BranchesPanel.tsx'
import CloseBranchConfirm from './CloseBranchConfirm.tsx'
import { applyCheat, createStore, newGameState } from './store.ts'
import { createUiStore } from './uiState.ts'

const noop = (): void => undefined

function chainStore() {
  const store = createStore(DEFS, applyCheat(DEFS, newGameState(DEFS, 'friesSaladLine'), 'chain'))
  expect(store.dispatch({ type: 'openBranch' }).ok).toBe(true)
  return store
}

describe('close branch UI', () => {
  it('each branch card has a danger Close button with the refund', () => {
    const store = chainStore()
    const html = renderToStaticMarkup(
      createElement(BranchesPanel, { ctx: { store, ui: createUiStore() }, snap: store.getSnapshot(), onFranchise: noop }),
    )
    expect(html).toContain('btn-danger branch-close')
    expect(html).toMatch(/Close · refunds <span class="num">\$/)
    expect(html).not.toContain('role="alertdialog"')
  })

  it('the confirm is an alertdialog with the refund, what is lost, Cancel first and a danger button', () => {
    const html = renderToStaticMarkup(createElement(CloseBranchConfirm, { name: 'Riverside', refundText: '$775.00', onCancel: noop, onConfirm: noop }))
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('Riverside')
    expect(html).toContain('$775.00')
    expect(html).toContain('The opening fee is lost')
    expect(html.indexOf('Cancel')).toBeLessThan(html.indexOf('btn-danger'))
  })

  it('closing is not an undo entry, like opening', () => {
    const store = chainStore()
    const before = store.getSnapshot().undo.count
    expect(store.dispatch({ type: 'closeBranch', id: 1 }).ok).toBe(true)
    expect(store.getSnapshot().undo.count).toBe(before)
    expect(store.getState().branches).toBeUndefined()
  })
})
