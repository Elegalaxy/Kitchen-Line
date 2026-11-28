// View helpers for food critics (GAME_DESIGN 9): the announcement banner, the orders-strip badge text and
// the day-summary line. Restaurant tier only (all return null at the stall). Pure, so they are unit-tested.

import { CRITIC_RATING_WEIGHT } from '../sim/constants.ts'
import { criticArrivalTick, isCriticDay } from '../sim/critic.ts'
import type { Customer, Defs, GameState } from '../sim/types.ts'

export type CriticNotice = { kind: 'tomorrow' | 'today' | 'waiting' | 'result'; text: string }

function starsText(n: number): string {
  return `${n} ${n === 1 ? 'star' : 'stars'}`
}

/**
 * The critic notice for the top bar: the day before ("A critic visits tomorrow", also in the summary), the critic
 * day itself (before they arrive, while they wait, and their result). Null when nothing to say.
 */
export function criticNotice(state: GameState, defs: Defs): CriticNotice | null {
  if (state.tier !== 'restaurant') return null
  const weight = `their rating counts ${CRITIC_RATING_WEIGHT}x`
  if (state.phase === 'summary' || state.phase === 'won') {
    return isCriticDay(state, state.day + 1) ? { kind: 'tomorrow', text: `A critic visits tomorrow: ${weight}.` } : null
  }
  if (isCriticDay(state)) {
    const critic = state.waiting.find((c) => c.critic === true)
    if (critic !== undefined) {
      const name = defs.dishes[critic.dish]?.name ?? critic.dish
      return { kind: 'waiting', text: `The critic is waiting for ${name}: ${weight}.` }
    }
    const result = state.today.critic
    if (result !== undefined) {
      return { kind: 'result', text: `The critic ${result.served ? 'gave' : 'left, counted as'} ${starsText(result.stars)}.` }
    }
    if (state.phase === 'build' || state.dayTick < criticArrivalTick(state.seed, state.day)) {
      return { kind: 'today', text: `A critic visits today in the dinner rush: ${weight}.` }
    }
    return null
  }
  return isCriticDay(state, state.day + 1) ? { kind: 'tomorrow', text: `A critic visits tomorrow: ${weight}.` } : null
}

/** Identifies one notice on one day: a closed cue stays closed until the day or the message changes. */
export function criticCueKey(day: number, notice: CriticNotice): string {
  return `${day}:${notice.kind}:${notice.text}`
}

/** Strip badge for one waiting customer: "Critic" or null. */
export function criticBadge(c: Pick<Customer, 'critic'>): string | null {
  return c.critic === true ? 'Critic' : null
}

export type CriticSummary = { stars: number; served: boolean; text: string }

/** "Critic: 4 stars (served)" for the finished day, or null when no critic came. */
export function criticSummary(state: GameState): CriticSummary | null {
  const c = state.lastDay?.critic
  if (c === undefined) return null
  return { stars: c.stars, served: c.served, text: `Critic: ${starsText(c.stars)} (${c.served ? 'served' : 'lost'})` }
}
