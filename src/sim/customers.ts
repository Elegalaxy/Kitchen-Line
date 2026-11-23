// Customers (plan Step 11). Per service tick, `stepCustomers` runs three parts in this
// order (the order and the draw order below are deliberate and change run hashes):
//   1. Patience: every waiting customer with `tick - arriveTick >= patience` leaves as
//      `lostPatience` (waiting order, no random draws).
//   2. Arrival (not in the closing phase): ONE `arrivals` float per tick, compared with the
//      per-tick chance (1 / gap x reputation factor x tier factor; gap 150 quiet, 50 rush).
//      Only on an arrival are more draws made, always in this order and never skipped
//      whatever the menu is: taste count (2..3, capped by how many dishes exist), then one
//      weighted pick per liked dish without repeats (weights = dish popularity, dishes in
//      defs order), then budget percent (90..140), then patience (300..600). After the draws
//      the customer chooses the first liked dish that is on the menu at price <= budget;
//      none -> lostNoMatch; waiting full -> lostFull; otherwise they join `waiting`.
//   3. Matching: each dish on the pass shelf (oldest first) goes to the oldest waiting
//      customer who ordered exactly that dish (a sale, economy.ts). Unmatched dishes stay.
// Restaurant upgrades (upgrades.ts) scale the arrival chance, budget and patience and add waiting places.
// Within a tick this runs after the buildings update (so a dish pushed onto the shelf this
// tick can be sold this tick) and before `tick` and `dayTick` advance. At day end,
// leftover customers are dropped without a rating or a loss (`dropLeftovers`, economy.ts, Q6).
// Each sale or loss then writes a rating and a review (reviews.ts) on the `reviews` stream,
// which never feeds back into the `arrivals` draws (only the reputation it changes does).

import {
  ARRIVAL_GAP_QUIET,
  ARRIVAL_GAP_RUSH,
  BUDGET_PERCENT_MAX,
  BUDGET_PERCENT_MIN,
  DEFAULT_REPUTATION,
  PATIENCE_MAX,
  PATIENCE_MIN,
  PREFS_MAX,
  PREFS_MIN,
  REPUTATION_FACTOR_BASE,
  REPUTATION_FACTOR_PER_STAR,
  TIER_ARRIVAL_FACTOR,
} from './constants.ts'
import { phaseAt } from './day.ts'
import { recordLoss, recordSale } from './economy.ts'
import { rateLost, rateServed, submitRating } from './reviews.ts'
import { nextFloat, nextInt, pickWeighted } from './rng.ts'
import type { Customer, Defs, DishId, GameState, Weighted } from './types.ts'
import { scalePercent, upgradeEffects, waitingCap } from './upgrades.ts'

/** Reputation: the mean of the stored ratings (seeded with 10 virtual 3s). */
export function reputationOf(state: Pick<GameState, 'ratings'>): number {
  const n = state.ratings.length
  if (n === 0) return DEFAULT_REPUTATION
  let sum = 0
  for (const r of state.ratings) sum += r
  return sum / n
}

/** Per-tick arrival chance for the part of the day at `dayTick` (0 while closing). */
export function arrivalChance(state: Pick<GameState, 'dayTick' | 'ratings' | 'tier' | 'upgrades'>, defs: Defs): number {
  const phase = phaseAt(state.dayTick)
  if (phase === 'closing') return 0
  const gap = phase === 'lunchRush' || phase === 'dinnerRush' ? ARRIVAL_GAP_RUSH : ARRIVAL_GAP_QUIET
  const repFactor = Math.max(0, REPUTATION_FACTOR_BASE + REPUTATION_FACTOR_PER_STAR * reputationOf(state))
  const base = (1 / gap) * repFactor * TIER_ARRIVAL_FACTOR[state.tier]
  const percent = upgradeEffects(state, defs).arrivalPercent
  return percent === 0 ? base : (base * (100 + percent)) / 100
}

/** Draw taste, budget and patience for a new customer (the draw order is in the file header). */
function drawCustomer(state: GameState, defs: Defs): Customer | null {
  const stream = state.rng.arrivals
  const dishes = Object.values(defs.dishes)
  if (dishes.length === 0) return null
  const count = Math.min(nextInt(stream, PREFS_MIN, PREFS_MAX), dishes.length)
  const pool: Weighted<DishId>[] = dishes.map((d) => ({ value: d.id, weight: d.popularity }))
  const prefs: DishId[] = []
  for (let i = 0; i < count; i += 1) {
    const pick = pickWeighted(stream, pool)
    prefs.push(pick)
    const at = pool.findIndex((e) => e.value === pick)
    pool.splice(at, 1)
  }
  const percent = nextInt(stream, BUDGET_PERCENT_MIN, BUDGET_PERCENT_MAX)
  const patience = nextInt(stream, PATIENCE_MIN, PATIENCE_MAX)
  const firstRef = defs.dishes[prefs[0]]?.refPrice ?? 0
  // Upgrade effects scale the drawn values AFTER the draws, so the draw order is the same with and without them.
  const effects = upgradeEffects(state, defs)
  return {
    id: state.tick,
    arriveTick: state.tick,
    prefs,
    budget: scalePercent(Math.round((firstRef * percent) / 100), effects.budgetPercent),
    patience: scalePercent(patience, effects.patiencePercent),
    dish: prefs[0],
    price: 0,
  }
}

/** Mutates `state`: maybe one customer arrives this tick and chooses (or is lost). */
export function stepArrivals(state: GameState, defs: Defs): void {
  const chance = arrivalChance(state, defs)
  if (chance <= 0) return
  if (!(nextFloat(state.rng.arrivals) < chance)) return
  const c = drawCustomer(state, defs)
  if (c === null) return
  state.today.customers += 1
  const first = c.prefs[0]
  let choice: { dish: DishId; price: number } | null = null
  for (const pref of c.prefs) {
    const entry = state.menu.find((m) => m.dish === pref && m.price <= c.budget)
    if (entry !== undefined) {
      choice = entry
      break
    }
  }
  if (choice === null) {
    recordLoss(state, 'noMatch', first)
    submitRating(state, defs, c, rateLost('noMatch'))
    state.events.push({ type: 'customerLeft', tick: state.tick, id: c.id, reason: 'noMatch', dish: null })
    return
  }
  if (state.waiting.length >= waitingCap(state, defs)) {
    recordLoss(state, 'full', first)
    submitRating(state, defs, c, rateLost('full'))
    state.events.push({ type: 'customerLeft', tick: state.tick, id: c.id, reason: 'full', dish: choice.dish })
    return
  }
  c.dish = choice.dish
  c.price = choice.price
  state.waiting.push(c)
  state.events.push({ type: 'customerArrived', tick: state.tick, id: c.id, prefs: c.prefs, dish: c.dish, price: c.price })
}

/** Mutates `state`: customers whose patience has run out leave (lostPatience). */
function expirePatience(state: GameState, defs: Defs): void {
  if (state.waiting.length === 0) return
  const staying: Customer[] = []
  for (const c of state.waiting) {
    if (state.tick - c.arriveTick >= c.patience) {
      recordLoss(state, 'patience', c.dish)
      submitRating(state, defs, c, rateLost('patience'))
      state.events.push({ type: 'customerLeft', tick: state.tick, id: c.id, reason: 'patience', dish: c.dish })
    } else {
      staying.push(c)
    }
  }
  state.waiting = staying
}

/** Mutates `state`: sell shelf dishes to the oldest waiting customer who ordered exactly that dish. */
function matchShelf(state: GameState, defs: Defs): void {
  if (state.waiting.length === 0) return
  const ids = Object.keys(state.buildings)
    .map(Number)
    .sort((a, b) => a - b)
  for (const id of ids) {
    const b = state.buildings[id]
    if (b === undefined || b.kind !== 'pass') continue
    const kept: typeof b.shelf = []
    for (const item of b.shelf) {
      const at = state.waiting.findIndex((c) => c.dish === item.type)
      if (at < 0) {
        kept.push(item)
        continue
      }
      const [customer] = state.waiting.splice(at, 1)
      recordSale(state, customer)
      submitRating(state, defs, customer, rateServed(customer, state.tick - customer.arriveTick))
    }
    b.shelf = kept
  }
}

/** Mutates `state`: one tick of customer logic (header comment has the order). */
export function stepCustomers(state: GameState, defs: Defs): void {
  expirePatience(state, defs)
  stepArrivals(state, defs)
  matchShelf(state, defs)
}
