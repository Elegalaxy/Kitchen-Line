// Formatting helpers for the end-of-day summary modal (Step 15): signed deltas with an arrow
// (never colour alone), the bottleneck hint sentence, and stars. Pure, so they are tested.

import type { BottleneckHint } from '../sim/summary.ts'
import type { Defs, Review } from '../sim/types.ts'
import { formatMoney } from './format.ts'

export type DeltaView = { arrow: '▲' | '▼' | '＝'; text: string; tone: 'good' | 'bad' | 'flat' }

/**
 * A change as arrow plus signed text. `betterWhen` says which direction is good (a shorter
 * wait is good). Values that round to zero at `digits` decimals show "＝ no change" with a
 * flat tone.
 */
export function deltaView(
  value: number | null,
  format: (abs: number) => string,
  betterWhen: 'higher' | 'lower' = 'higher',
  digits = 0,
): DeltaView | null {
  if (value === null || !Number.isFinite(value)) return null
  const scale = 10 ** digits
  const rounded = Math.round(value * scale) / scale
  if (rounded === 0) return { arrow: '＝', text: 'no change', tone: 'flat' }
  const up = rounded > 0
  const good = up === (betterWhen === 'higher')
  return { arrow: up ? '▲' : '▼', text: `${up ? '+' : '-'}${format(Math.abs(rounded))}`, tone: good ? 'good' : 'bad' }
}

export const moneyDelta = (cents: number | null): DeltaView | null => deltaView(cents, (a) => formatMoney(a))
export const countDelta = (n: number | null): DeltaView | null => deltaView(n, (a) => String(a))
export const pointsDelta = (n: number | null): DeltaView | null => deltaView(n, (a) => `${a} pts`)
export const secondsDelta = (n: number | null): DeltaView | null => deltaView(n, (a) => `${a.toFixed(1)} s`, 'lower', 1)
export const starsDelta = (n: number): DeltaView | null => deltaView(n, (a) => `${a.toFixed(1)}★`, 'higher', 1)

/** The one-line bottleneck sentence, or null when there is no hint. */
export function hintText(hint: BottleneckHint | null, defs: Defs): string | null {
  if (hint === null) return null
  switch (hint.kind) {
    case 'patience': {
      const dish = hint.dish === null ? null : (defs.dishes[hint.dish]?.name ?? hint.dish)
      return dish === null ? 'Customers gave up waiting' : `Customers gave up waiting for ${dish}`
    }
    case 'noMatch':
      return "Menu or prices don't fit customers"
    case 'waste': {
      const item = hint.item === null ? null : (defs.items[hint.item]?.name ?? hint.item)
      return item === null ? 'Ingredients spoiled on the line' : `${item} spoiled on the line`
    }
  }
}

/** "★★★☆☆" for 3 stars (clamped to 0 to 5). */
export function starsText(stars: number): string {
  const n = Math.min(5, Math.max(0, Math.round(stars)))
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

export type DishActivity = { served: number; lost: number; sales: number }

/**
 * Splits the by-dish rows into dishes where something happened (any non-zero stat) and the rest,
 * which the summary folds behind a button. Both keep the given order.
 */
export function splitDishRows(ids: readonly string[], stats: ReadonlyMap<string, DishActivity>): { active: string[]; idle: string[] } {
  const busy = (id: string): boolean => {
    const r = stats.get(id)
    return r !== undefined && (r.served !== 0 || r.lost !== 0 || r.sales !== 0)
  }
  return { active: ids.filter(busy), idle: ids.filter((id) => !busy(id)) }
}

/** The disclosure button under the dish table. */
export function idleDishesLabel(count: number, open: boolean): string {
  return `${open ? 'Hide' : 'Show'} ${count} ${count === 1 ? 'dish' : 'dishes'} with no activity`
}

export const MAX_REVIEWS = 3

/** Up to 3 reviews, lowest-rated first (stable for equal stars). */
export function pickReviews(reviews: readonly Review[]): Review[] {
  return reviews
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.stars - b.r.stars || a.i - b.i)
    .slice(0, MAX_REVIEWS)
    .map((x) => x.r)
}
