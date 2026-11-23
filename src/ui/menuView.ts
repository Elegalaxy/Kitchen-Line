// View model for the menu panel (plan Step 14): one row per dish with everything the table
// shows, plus the pure helpers behind it (margin text, price text validation, why a toggle
// or an unlock button is disabled). No React in here, so it is unit-tested directly.

import { MENU_CAP, TIER_RANK } from '../sim/constants.ts'
import { priceBounds, priceProblem } from '../sim/menu.ts'
import type { Defs, DishDef, DishId, GameState } from '../sim/types.ts'
import { formatMoney } from './format.ts'
import { parseDollars } from './money.ts'

export type MarginView = {
  kind: 'up' | 'down' | 'even'
  /** Arrow shown next to the amount. */
  arrow: string
  /** Signed amount: "+$1.50", "-$0.30" or "$0.00". */
  text: string
  /** For screen readers: the sign and word the arrow stands for. */
  word: string
}

/** Margin of one sale: price minus ingredient cost, with an arrow, a sign and a word (never colour alone). */
export function marginView(price: number, cost: number): MarginView {
  const margin = price - cost
  if (margin > 0) return { kind: 'up', arrow: '▲', text: `+${formatMoney(margin)}`, word: 'profit' }
  if (margin < 0) return { kind: 'down', arrow: '▼', text: formatMoney(margin), word: 'loss' }
  return { kind: 'even', arrow: '=', text: formatMoney(0), word: 'break-even' }
}

export type PriceInputResult = { ok: true; cents: number } | { ok: false; error: string }

/** Check text typed into a price input against the dish's reference price. Nothing is dispatched on an error. */
export function checkPriceText(text: string, refPrice: number): PriceInputResult {
  const parsed = parseDollars(text)
  if (!parsed.ok) return parsed
  const problem = priceProblem(refPrice, parsed.cents)
  if (problem === 'invalid price') return { ok: false, error: 'Use 10-cent steps, like 3.50' }
  if (problem === 'price out of range') {
    const { min, max } = priceBounds(refPrice)
    return { ok: false, error: `Between ${formatMoney(min)} and ${formatMoney(max)}` }
  }
  return { ok: true, cents: parsed.cents }
}

/** Why the whole panel is read-only, or null while the menu can be edited. */
export function lockNote(phase: GameState['phase']): string | null {
  switch (phase) {
    case 'build':
      return null
    case 'service':
      return 'Locked during service'
    case 'summary':
      return 'Locked until the next day starts'
    case 'won':
      return 'Locked'
  }
}

export type MenuRow = {
  id: DishId
  name: string
  emoji: string
  locked: boolean
  onMenu: boolean
  /** Current menu price in cents (null off the menu). */
  price: number | null
  refPrice: number
  /** Raw ingredient cost in cents. */
  cost: number
  /** Price minus cost (null off the menu). */
  margin: MarginView | null
  /** Dishes of this kind served today (0 before the day starts). */
  served: number
  unlockCost: number
  bounds: { min: number; max: number }
  /** Why the on-menu toggle cannot be used (menu full), or null. Read-only phases are in `lockNote`. */
  toggleReason: string | null
  /** Why the Unlock button cannot be used (not enough money), or null. */
  unlockReason: string | null
}

export type MenuView = {
  rows: MenuRow[]
  count: number
  cap: number
  readOnly: boolean
  note: string | null
}

/** Everything the panel shows. `costOf` is `ingredientCostOf` from content (the sim does not own it). */
export function menuView(state: GameState, defs: Defs, costOf: (dish: DishId) => number): MenuView {
  const cap = MENU_CAP[state.tier]
  const note = lockNote(state.phase)
  const count = state.menu.length
  const servedToday = state.today.day === state.day ? state.today.byDish : {}
  // Dishes of a higher tier (dish pack) are not listed until the restaurant tier.
  const inTier = (d: DishDef): boolean => d.requiresTier === undefined || TIER_RANK[d.requiresTier] <= TIER_RANK[state.tier]
  const rows = Object.values(defs.dishes).filter(inTier).map((d): MenuRow => {
    const locked = !state.unlocked.includes(d.id)
    const entry = state.menu.find((m) => m.dish === d.id)
    const cost = costOf(d.id)
    const missing = d.unlockCost - state.money
    return {
      id: d.id,
      name: d.name,
      emoji: d.emoji,
      locked,
      onMenu: entry !== undefined,
      price: entry?.price ?? null,
      refPrice: d.refPrice,
      cost,
      margin: entry === undefined ? null : marginView(entry.price, cost),
      served: servedToday[d.id]?.served ?? 0,
      unlockCost: d.unlockCost,
      bounds: priceBounds(d.refPrice),
      toggleReason: !locked && entry === undefined && count >= cap ? `Menu full (${cap} / ${cap})` : null,
      unlockReason: locked && missing > 0 ? `Needs ${formatMoney(missing)} more` : null,
    }
  })
  return { rows, count, cap, readOnly: note !== null, note }
}
