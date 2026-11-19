// Patience maths for the orders strip (plan Step 11): the fraction left and the level that
// picks the bar colour (ok above or at 50%, warn from 25% up to 50%, bad under 25%).

import type { Customer } from '../sim/types.ts'

export type PatienceLevel = 'ok' | 'warn' | 'bad'

/** Fraction of patience left, 0 to 1. */
export function patienceLeft(c: Pick<Customer, 'arriveTick' | 'patience'>, tick: number): number {
  if (c.patience <= 0) return 0
  return Math.min(1, Math.max(0, 1 - (tick - c.arriveTick) / c.patience))
}

export function patienceLevel(fraction: number): PatienceLevel {
  if (fraction < 0.25) return 'bad'
  if (fraction < 0.5) return 'warn'
  return 'ok'
}
