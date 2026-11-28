// Patience maths for the orders strip (plan Step 11): the fraction left and the level that
// picks the bar colour (ok above or at 50%, warn from 25% up to 50%, bad under 25%).

import type { Customer, GameState } from '../sim/types.ts'

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

/** Chips per row on narrow screens: one row for up to 10 slots, then a second row (13 with more tables). */
export const MAX_ORDER_COLUMNS = 10

export function orderColumns(cap: number): number {
  return Math.min(Math.max(cap, 1), MAX_ORDER_COLUMNS)
}

/** One line under the orders title; empty text keeps the line's height so nothing shifts. */
export function ordersNote(state: Pick<GameState, 'phase' | 'today' | 'waiting'>): string {
  if (state.waiting.length > 0) return ''
  if (state.phase === 'build') return 'Open for service to get customers.'
  if (state.phase === 'service' && state.today.customers === 0) return 'No customers yet today (0 so far).'
  return ''
}
