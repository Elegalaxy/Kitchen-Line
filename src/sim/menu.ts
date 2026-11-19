// Menu price rules (plan 2.5, GAME_DESIGN 6.1). A dish's price must be a whole number of
// cents in steps of PRICE_STEP, between 50% and 300% of its reference price. The bounds are
// snapped inward to a step (reference 450 -> 230 to 1350), so every bound is itself valid.
// Shared by the setMenu / setPrice commands and the menu panel.

import { PRICE_MAX_PERCENT, PRICE_MIN_PERCENT, PRICE_STEP } from './constants.ts'

export type PriceBounds = { min: number; max: number }

/** Lowest and highest allowed price in cents for a dish with this reference price. */
export function priceBounds(refPrice: number): PriceBounds {
  const min = Math.ceil((refPrice * PRICE_MIN_PERCENT) / 100 / PRICE_STEP) * PRICE_STEP
  const max = Math.floor((refPrice * PRICE_MAX_PERCENT) / 100 / PRICE_STEP) * PRICE_STEP
  return { min, max }
}

/** null when `cents` is allowed, else why not. */
export function priceProblem(refPrice: number, cents: unknown): 'invalid price' | 'price out of range' | null {
  if (typeof cents !== 'number' || !Number.isInteger(cents) || cents % PRICE_STEP !== 0) return 'invalid price'
  const { min, max } = priceBounds(refPrice)
  return cents < min || cents > max ? 'price out of range' : null
}
