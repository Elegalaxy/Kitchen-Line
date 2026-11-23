// Ratings, reputation and reviews (plan Step 12, rules in plan 2.5).
// A served customer starts at 5: wait over 50% of patience -1, over 80% -2 (the larger one,
// not both), price over 90% of budget -1, not their first choice -1; minimum 1. A customer
// who ran out of patience rates 1; nothing affordable they liked or a full queue rates 2.
// Customers still waiting at day end are never rated (economy.ts `dropLeftovers`, Q6).
// A food critic's rating (critic.ts) is stored CRITIC_RATING_WEIGHT times (CRITIC_LOST_STARS x CRITIC_LOST_WEIGHT when lost);
// one review is still written and the result is kept in `today.critic`.
// Every rating goes onto `state.ratings` (last RATINGS_KEPT kept; reputation is their mean,
// customers.ts `reputationOf`) and writes a review into `today.reviews` (max REVIEWS_PER_DAY).
// Reviews stream draws, always in this order per rating: (1) the template variant
// (`nextInt`, one draw even when a reason has one variant); (2) only when today's list is
// already full, one more draw: if the new review is lower than every kept one it replaces a
// random slot, otherwise reservoir sampling (it takes slot j-1 with j uniform in 1..seen,
// unless that slot holds the lowest-rated review). Never touches the `arrivals` stream.

import {
  CRITIC_LOST_STARS,
  CRITIC_LOST_WEIGHT,
  CRITIC_RATING_WEIGHT,
  NOT_FIRST_CHOICE_PENALTY,
  OVERPRICED_FRACTION,
  OVERPRICED_PENALTY,
  RATING_GAVE_UP,
  RATING_MAX,
  RATING_MIN,
  RATING_NO_MATCH,
  RATING_QUEUE_FULL,
  RATINGS_KEPT,
  REVIEWS_PER_DAY,
  WAIT_LONG_FRACTION,
  WAIT_LONG_PENALTY,
  WAIT_VERY_LONG_FRACTION,
  WAIT_VERY_LONG_PENALTY,
} from './constants.ts'
import { nextInt } from './rng.ts'
import type { Customer, Defs, DishId, GameState, LostReason, Review, ReviewReason } from './types.ts'

export type Rating = { stars: number; reason: ReviewReason }

/** The rating for a served customer who waited `wait` ticks. Pure. */
export function rateServed(c: Customer, wait: number): Rating {
  let waitPenalty = 0
  if (wait > c.patience * WAIT_VERY_LONG_FRACTION) waitPenalty = WAIT_VERY_LONG_PENALTY
  else if (wait > c.patience * WAIT_LONG_FRACTION) waitPenalty = WAIT_LONG_PENALTY
  const pricePenalty = c.price > c.budget * OVERPRICED_FRACTION ? OVERPRICED_PENALTY : 0
  const choicePenalty = c.dish !== c.prefs[0] ? NOT_FIRST_CHOICE_PENALTY : 0
  const stars = Math.max(RATING_MIN, RATING_MAX - waitPenalty - pricePenalty - choicePenalty)
  // Main reason: the biggest penalty; ties go wait, then price, then choice.
  let reason: ReviewReason = 'great'
  let biggest = 0
  if (waitPenalty > biggest) {
    reason = 'waitedLong'
    biggest = waitPenalty
  }
  if (pricePenalty > biggest) {
    reason = 'overpriced'
    biggest = pricePenalty
  }
  if (choicePenalty > biggest) reason = 'notFirstChoice'
  return { stars, reason }
}

/** The rating for a customer who left unserved. Pure. */
export function rateLost(lost: LostReason): Rating {
  if (lost === 'patience') return { stars: RATING_GAVE_UP, reason: 'gaveUp' }
  if (lost === 'noMatch') return { stars: RATING_NO_MATCH, reason: 'noMatch' }
  return { stars: RATING_QUEUE_FULL, reason: 'queueFull' }
}

function nameOf(defs: Defs, dish: DishId | undefined): string {
  if (dish === undefined) return ''
  return defs.dishes[dish]?.name ?? dish
}

/** Fill a template with the dish names. */
export function fillTemplate(template: string, dish: string, pref: string): string {
  return template.split('{dish}').join(dish).split('{pref}').join(pref)
}

/** Mutates `state`: the review text variant is picked on the `reviews` stream (one draw). */
function writeText(state: GameState, defs: Defs, c: Customer, reason: ReviewReason): string {
  const variants = defs.reviewTemplates?.[reason]
  if (variants === undefined || variants.length === 0) return reason
  const template = variants[nextInt(state.rng.reviews, 0, variants.length - 1)]
  return fillTemplate(template, nameOf(defs, c.dish), nameOf(defs, c.prefs[0]))
}

/** Mutates `state`: keep `review` in today's list (max REVIEWS_PER_DAY, lowest always kept). */
function keepReview(state: GameState, review: Review): void {
  const list = state.today.reviews
  if (list.length < REVIEWS_PER_DAY) {
    list.push(review)
    return
  }
  let lowIdx = 0
  for (let i = 1; i < list.length; i += 1) {
    if (list[i].stars < list[lowIdx].stars) lowIdx = i
  }
  const stream = state.rng.reviews
  if (review.stars < list[lowIdx].stars) {
    list[nextInt(stream, 0, list.length - 1)] = review
    return
  }
  const t = state.today
  const seen = Math.max(list.length + 1, t.served + t.lostPatience + t.lostNoMatch + t.lostFull)
  const j = nextInt(stream, 1, seen)
  if (j <= list.length && j - 1 !== lowIdx) list[j - 1] = review
}

/**
 * Mutates `state`: record one customer's rating (ratings list, review). `rating` comes from
 * `rateServed` or `rateLost`. Returns the stars.
 */
export function submitRating(state: GameState, defs: Defs, c: Customer, rating: Rating): number {
  let { stars } = rating
  let weight = 1
  if (c.critic === true) {
    const lost = rating.reason === 'gaveUp' || rating.reason === 'noMatch' || rating.reason === 'queueFull'
    if (lost) stars = CRITIC_LOST_STARS
    weight = lost ? CRITIC_LOST_WEIGHT : CRITIC_RATING_WEIGHT
    state.today.critic = { stars, served: !lost, dish: c.dish === '' ? null : c.dish }
  }
  // A weighted rating is stored as `weight` equal entries, so reputation (the mean) needs no other change.
  for (let i = 0; i < weight; i += 1) state.ratings.push(stars)
  if (state.ratings.length > RATINGS_KEPT) state.ratings.splice(0, state.ratings.length - RATINGS_KEPT)
  const text = writeText(state, defs, c, rating.reason)
  keepReview(state, { stars, text, dish: c.dish === '' ? null : c.dish, reason: rating.reason })
  return stars
}
