// Tests for the franchise view helper (GAME_DESIGN 8.2).

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { emptyMeta, franchisePoints } from '../sim/franchise.ts'
import type { MetaState } from '../sim/types.ts'
import { franchiseView, kitLabel, STALE_KIT_WARNING } from './franchiseView.ts'
import { applyCheat, newGameState } from './store.ts'

const won = applyCheat(DEFS, newGameState(DEFS, 'friesSaladLine'), 'chainwon')
const fp = franchisePoints(won).total

describe('franchiseView', () => {
  it('lists the four point parts and the balance', () => {
    const v = franchiseView(won, emptyMeta(), DEFS, [])
    expect(v.rows.map((r) => r.id)).toEqual(['chain', 'earnings', 'speed', 'reputation'])
    expect(v.rows[0].text).toBe('+10')
    expect(v.earned).toBe(fp)
    expect(v.left).toBe(fp)
    expect(v.nextRun).toBe(2)
    expect(v.startLabel).toBe('Sell chain and start run 2')
    expect(v.blocked).toBeNull()
  })

  it('builds a card per perk with level, next cost and next effect', () => {
    const v = franchiseView(won, emptyMeta(), DEFS, [])
    const seed = v.cards.find((c) => c.id === 'seedMoney')
    expect(seed).toMatchObject({ level: 0, maxLevel: 3, nextCost: 6, canBuy: true, reason: null, levelText: 'Level 0 / 3' })
    expect(seed?.nextEffect).toBe('+$250.00 start cash')
    expect(seed?.currentEffect).toBe('None yet')
    expect(v.cards.find((c) => c.id === 'biggerStall')?.nextEffect).toContain('10 × 8')
  })

  it('picks spend points, raise the shown level and the next cost', () => {
    const v = franchiseView(won, emptyMeta(), DEFS, ['seedMoney'])
    const seed = v.cards.find((c) => c.id === 'seedMoney')
    expect(v.spent).toBe(6)
    expect(v.left).toBe(fp - 6)
    expect(seed).toMatchObject({ level: 1, pending: 1, nextCost: 9 })
    expect(v.kept).toContain(`Points left: ${fp - 6}`)
    expect(v.kept.some((k) => k.includes('Seed money level 1'))).toBe(true)
  })

  it('disables Buy with a reason when points run out or the perk is maxed', () => {
    const poor = franchiseView(won, { ...emptyMeta(), points: 0 }, DEFS, ['biggerStall', 'biggerStall'])
    const big = poor.cards.find((c) => c.id === 'biggerStall')
    expect(big?.canBuy).toBe(false)
    expect(big?.reason).toBe('Top level reached')
    expect(big?.levelText).toBe('Maxed (1 / 1)')
    expect(big?.nextEffect).toBeNull()
    const all = franchiseView(won, emptyMeta(), DEFS, ['biggerStall', 'seedMoney', 'seedMoney', 'seedMoney', 'goodName'])
    const good = all.cards.find((c) => c.id === 'goodName')
    if (!good?.canBuy) expect(good?.reason).toMatch(/^Needs \d+ more points$/)
  })

  it('reports the recipe book after this franchise and flags a duplicate or unbuilt chain', () => {
    const v = franchiseView(won, emptyMeta(), DEFS, [])
    expect(v.bookNames.length).toBeGreaterThan(0)
    expect(v.bookText).toMatch(/^Recipe book: \d+ dishes?$/)
    const done: MetaState = { ...emptyMeta(), runsCompleted: 1, history: [{ run: 1, seed: won.seed, days: 1, profit: 0, chainProfit: 0, points: 1 }] }
    expect(franchiseView(won, done, DEFS, []).blocked).toBe('This run is already franchised')
    expect(franchiseView(newGameState(DEFS, null), emptyMeta(), DEFS, []).blocked).toBe('Build the chain first')
    expect(franchiseView(won, done, DEFS, []).nextRun).toBe(3)
  })

  it('starter kitchen card: counts saved slots, and says a restaurant upgrade is needed when nothing can be saved', () => {
    const card = franchiseView(won, emptyMeta(), DEFS, []).cards.find((c) => c.id === 'starterKit')
    expect(card?.kitText).toBe('1 of 3 slots used')
    expect(card).toMatchObject({ nextCost: 14, canBuy: true, reason: null })
    const bare = structuredClone(won)
    delete bare.stallKit
    const none = franchiseView(bare, emptyMeta(), DEFS, []).cards.find((c) => c.id === 'starterKit')
    expect(none).toMatchObject({ kitText: 'None saved yet', canBuy: false, reason: 'Upgrade to a restaurant in a run first' })
    // a kitchen kept from an earlier run counts when this run has none (a legacy single kit reads as slot 1)
    const kept = franchiseView(bare, { ...emptyMeta(), starterKit: won.stallKit }, DEFS, []).cards.find((c) => c.id === 'starterKit')
    expect(kept?.canBuy).toBe(true)
    // choosing "Don't save" with an empty library leaves nothing to install
    const skip = franchiseView(won, emptyMeta(), DEFS, [], { saveSlot: null }).cards.find((c) => c.id === 'starterKit')
    expect(skip).toMatchObject({ kitText: 'None saved yet', canBuy: false })
    // other cards have no kit line
    expect(franchiseView(won, emptyMeta(), DEFS, []).cards.find((c) => c.id === 'seedMoney')?.kitText).toBeNull()
  })
})

describe('franchiseView blueprint library', () => {
  const kit = won.stallKit!
  const entry = (run: number) => ({ run, kit })

  it('defaults to the first empty slot and the newest kitchen; no kit hides the choice', () => {
    const v = franchiseView(won, { ...emptyMeta(), runsCompleted: 2, library: [entry(1), null, entry(2)] }, DEFS, [])
    expect(v.saveSelected).toBe(1)
    expect(v.saveSlots.map((s) => s.empty)).toEqual([false, true, false])
    expect(v.runKitText).toMatch(/^\d+ buildings, value \$\d/)
    expect(v.useSlots.map((s) => s.empty)).toEqual([false, false, false])
    expect(v.useSelected).toBe(1)
    const bare = structuredClone(won)
    delete bare.stallKit
    const hidden = franchiseView(bare, emptyMeta(), DEFS, [])
    expect(hidden.runKitText).toBeNull()
    expect(hidden.saveSelected).toBeNull()
  })

  it('a full library defaults to Do not save; the choices are honoured and bounded', () => {
    const full = { ...emptyMeta(), runsCompleted: 3, library: [entry(1), entry(2), entry(3)] }
    expect(franchiseView(won, full, DEFS, []).saveSelected).toBeNull()
    expect(franchiseView(won, full, DEFS, [], { saveSlot: 0 }).useSelected).toBe(0)
    expect(franchiseView(won, full, DEFS, [], { saveSlot: 9 }).saveSelected).toBeNull()
    expect(franchiseView(won, full, DEFS, [], { saveSlot: null, useSlot: 2 }).useSelected).toBe(2)
    expect(franchiseView(won, full, DEFS, [], { useSlot: null }).useSelected).toBeNull()
    // an empty slot cannot be the one that starts the run
    const gap = { ...emptyMeta(), library: [entry(1), null, null] }
    expect(franchiseView(won, gap, DEFS, [], { saveSlot: null, useSlot: 1 }).useSelected).toBeNull()
  })

  it('shows the saved kitchens only after the perk is owned (bought now or before)', () => {
    expect(franchiseView(won, emptyMeta(), DEFS, []).kitOwned).toBe(false)
    expect(franchiseView(won, { ...emptyMeta(), points: 20 }, DEFS, ['starterKit']).kitOwned).toBe(true)
    expect(franchiseView(won, { ...emptyMeta(), perks: { starterKit: 1 } }, DEFS, []).kitOwned).toBe(true)
  })

  it('labels a kitchen with run, dishes, buildings and value', () => {
    const label = kitLabel({ run: 2, kit: { ...kit, menu: [{ dish: 'fries', price: 300 }, { dish: 'salad', price: 450 }] } }, DEFS)
    expect(label).toMatch(/^Run 2, fries \+ salad, \d+ buildings, value \$\d/)
    expect(kitLabel({ run: 1, kit: { ...kit, menu: [], unlocked: [] } }, DEFS)).toContain('no dishes')
  })

  it('warns about a saved kitchen that no longer fits and never starts a run with it', () => {
    const stale = { run: 5, kit: { ...kit, width: kit.width + 1 } }
    const meta = { ...emptyMeta(), points: 40, perks: { starterKit: 1 }, library: [entry(1), stale, null] }
    const v = franchiseView(won, meta, DEFS, [], { saveSlot: null })
    expect(v.useSlots.map((s) => s.warning)).toEqual([null, STALE_KIT_WARNING, null])
    // the newest kitchen is the stale one, so the default is the newest that fits
    expect(v.useSelected).toBe(0)
    expect(franchiseView(won, meta, DEFS, [], { saveSlot: null, useSlot: 1 }).useSelected).toBeNull()
  })

  it('does not sell the perk when no saved kitchen fits', () => {
    const stale = { run: 1, kit: { ...kit, width: kit.width + 1 } }
    const meta = { ...emptyMeta(), points: 40, library: [stale, null, null] }
    const card = franchiseView(won, meta, DEFS, [], { saveSlot: null }).cards.find((c) => c.id === 'starterKit')
    expect(card?.canBuy).toBe(false)
    expect(card?.reason).toBe('No saved kitchen fits this version')
  })
})
