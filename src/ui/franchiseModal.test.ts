// Markup tests for the Franchise modal, its confirm dialog and the chain end screen (GAME_DESIGN 8.2).

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { emptyMeta } from '../sim/franchise.ts'
import EndScreen from './EndScreen.tsx'
import FranchiseConfirm from './FranchiseConfirm.tsx'
import FranchiseModal from './FranchiseModal.tsx'
import { applyCheat, newGameState } from './store.ts'

const won = applyCheat(DEFS, newGameState(DEFS, 'friesSaladLine'), 'chainwon')
const noop = (): void => undefined

describe('franchise markup', () => {
  it('the modal shows points rows, perk cards and the primary button', () => {
    const html = renderToStaticMarkup(
      createElement(FranchiseModal, { state: won, meta: emptyMeta(), defs: DEFS, onClose: noop, onFranchise: () => ({ ok: true as const }) }),
    )
    expect(html).toContain('Sell chain and start run 2')
    expect(html).toContain('Chain built')
    expect(html).toContain('Seed money')
    expect(html).toContain('Level 0 / 3')
    expect(html).toContain('Recipe book')
  })

  it('the confirm is an alertdialog with the kept text', () => {
    const html = renderToStaticMarkup(createElement(FranchiseConfirm, { run: 2, error: null, onCancel: noop, onConfirm: noop }))
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('Your current game is replaced. Points, perks and recipe book are kept.')
  })

  it('the chain end screen makes Franchise out the primary action and keeps a quiet Keep playing', () => {
    const html = renderToStaticMarkup(
      createElement(EndScreen, { state: won, defs: DEFS, meta: emptyMeta(), onKeepPlaying: noop, onFranchise: noop }),
    )
    expect(html).toContain('Franchise out…')
    expect(html).toContain('Keep playing')
    expect(html.indexOf('Keep playing')).toBeLessThan(html.indexOf('Franchise out…'))
  })

  it('the restaurant end screen is unchanged: no franchise preview', () => {
    const restaurant = applyCheat(DEFS, newGameState(DEFS, 'friesLine'), 'won')
    const html = renderToStaticMarkup(
      createElement(EndScreen, { state: restaurant, defs: DEFS, meta: emptyMeta(), onKeepPlaying: noop, onFranchise: noop }),
    )
    expect(html).not.toContain('Franchise')
    expect(html).toContain('Keep playing')
  })
})
