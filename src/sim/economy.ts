// Economy (plan Step 11). Money is integer cents. Money only goes up through sales
// (`recordSale`); it goes down at the pantries (tick.ts) and on building purchases
// (commands.ts). Profit for goals is sales minus ingredient cost; building and expansion
// spending is excluded (plan 2.5).

import type { Customer, DayStats, DishId, GameState, LostReason } from './types.ts'

export function profitOf(stats: Pick<DayStats, 'sales' | 'ingredientCost'>): number {
  return stats.sales - stats.ingredientCost
}

function dishStats(stats: DayStats, dish: DishId): { served: number; lost: number; sales: number } {
  const existing = stats.byDish[dish]
  if (existing !== undefined) return existing
  const fresh = { served: 0, lost: 0, sales: 0 }
  stats.byDish[dish] = fresh
  return fresh
}

/** Mutates `state`: a dish reached the customer who ordered it. Pays the price and records the wait. */
export function recordSale(state: GameState, customer: Customer): void {
  const wait = state.tick - customer.arriveTick
  state.money += customer.price
  state.today.sales += customer.price
  state.today.served += 1
  state.today.waitTicksTotal += wait
  state.totals.served += 1
  const d = dishStats(state.today, customer.dish)
  d.served += 1
  d.sales += customer.price
  state.events.push({ type: 'served', tick: state.tick, id: customer.id, dish: customer.dish, price: customer.price, wait })
}

/**
 * Mutates `state`: a customer left unserved. `dish` is the dish the loss is booked to in
 * `byDish`: the ordered dish for lost patience, the first-choice dish when nothing matched
 * or the queue was full. No money moves. The rating is written by the caller (reviews.ts).
 */
export function recordLoss(state: GameState, reason: LostReason, dish: DishId): void {
  if (reason === 'patience') state.today.lostPatience += 1
  else if (reason === 'noMatch') state.today.lostNoMatch += 1
  else state.today.lostFull += 1
  dishStats(state.today, dish).lost += 1
}

/** Mutates `state`: at day end everyone still waiting leaves unrated and uncounted (Q6). */
export function dropLeftovers(state: GameState): void {
  for (const c of state.waiting) {
    state.events.push({ type: 'customerLeft', tick: state.tick, id: c.id, reason: 'closing', dish: c.dish })
  }
  state.waiting = []
}
