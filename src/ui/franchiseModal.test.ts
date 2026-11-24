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
    expect(html).toContain('Starter kitchen')
    expect(html).toContain('Saved kitchen')
  })

  it('the blueprint library: save choice with slots, and the start choice once the perk is owned', () => {
    const entry = { run: 1, kit: won.stallKit! }
    const props = { state: won, defs: DEFS, onClose: noop, onFranchise: () => ({ ok: true as const }) }
    const owned = { ...emptyMeta(), runsCompleted: 1, perks: { starterKit: 1 }, library: [entry, null, null] }
    const html = renderToStaticMarkup(createElement(FranchiseModal, { ...props, meta: owned }))
    expect(html).toContain("Save this run&#x27;s kitchen")
    expect(html).toContain('Slot 1')
    expect(html).toContain('Slot 3')
    expect(html).toContain('Don&#x27;t save')
    expect(html).toContain('Start run with')
    expect(html).toContain('None (start empty)')
    expect(html).toMatch(/Run 1, [a-z +]+, \d+ buildings, value \$/)
    // the perk is not owned: no start choice yet
    const notOwned = renderToStaticMarkup(createElement(FranchiseModal, { ...props, meta: { ...owned, perks: {} } }))
    expect(notOwned).not.toContain('Start run with')
    // a run that never upgraded has nothing to save
    const bare = structuredClone(won)
    delete bare.stallKit
    const none = renderToStaticMarkup(createElement(FranchiseModal, { ...props, state: bare, meta: owned }))
    expect(none).not.toContain('Save this run')
    expect(none).toContain('Start run with')
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
