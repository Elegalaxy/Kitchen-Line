// Food critics (GAME_DESIGN 9, restaurant tier only). On about one restaurant day in six one critic
// arrives during the dinner rush. Which days, and the arrival tick, are pure FNV-1a hashes of the seed
// and the day: NO random stream, so the normal arrivals draws never change. Two critic days are never
// adjacent, and the first possible one is the day after the upgrade to restaurant (`tierDay`), so a
// visit can always be announced the day before.

import { CRITIC_ARRIVAL_SPAN, CRITIC_BUDGET_PERCENT, CRITIC_DAY_MODULUS, CRITIC_ID_OFFSET, CRITIC_PATIENCE, DAY_PHASE_STARTS } from './constants.ts'
import { inSeason } from './season.ts'
import type { Customer, Defs, DishId, GameState } from './types.ts'

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

function hashOf(text: string): number {
  let hash = FNV_OFFSET
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  return hash >>> 0
}

function rawCandidate(seed: string, day: number): boolean {
  return day >= 2 && hashOf(`${seed}|critic|${day}`) % CRITIC_DAY_MODULUS === 0
}

/** Pure: is `day` a critic day for this seed (ignoring tier)? Never true two days in a row. */
export function criticDay(seed: string, day: number): boolean {
  return rawCandidate(seed, day) && !rawCandidate(seed, day - 1)
}

/** Pure: the `dayTick` the critic arrives on `day`, inside the dinner rush. */
export function criticArrivalTick(seed: string, day: number): number {
  const rushStart = DAY_PHASE_STARTS.find((p) => p.phase === 'dinnerRush')?.from ?? 0
  return rushStart + (hashOf(`${seed}|criticTick|${day}`) % CRITIC_ARRIVAL_SPAN)
}

type CriticView = Pick<GameState, 'seed' | 'day' | 'tier' | 'tierDay'>

/** Does a critic visit on `day` (default: the state's day)? Restaurant tier, after the upgrade day. */
export function isCriticDay(state: CriticView, day = state.day): boolean {
  if (state.tier !== 'restaurant') return false
  if (state.tierDay !== undefined && day <= state.tierDay) return false
  return criticDay(state.seed, day)
}

/**
 * The dish the critic orders: the menu dish with the highest popularity (ties: first on the menu); null on an empty menu.
 * A seasonal dish that is out of season is skipped (season.ts); a menu with only such dishes counts as empty.
 */
export function criticDish(state: Pick<GameState, 'menu' | 'tier' | 'day'>, defs: Defs): DishId | null {
  let best: DishId | null = null
  let bestPop = -1
  for (const m of state.menu) {
    const def = defs.dishes[m.dish]
    if (def !== undefined && !inSeason(state, defs, def)) continue
    const pop = def?.popularity ?? 0
    if (pop > bestPop) {
      best = m.dish
      bestPop = pop
    }
  }
  return best
}

/** The critic as a waiting customer. `dish` is the ordered dish; the caller handles the empty menu. */
export function makeCritic(state: GameState, defs: Defs, dish: DishId): Customer {
  const price = state.menu.find((m) => m.dish === dish)?.price ?? 0
  const ref = defs.dishes[dish]?.refPrice ?? price
  return {
    id: CRITIC_ID_OFFSET + state.tick,
    arriveTick: state.tick,
    prefs: [dish],
    budget: Math.round((ref * CRITIC_BUDGET_PERCENT) / 100),
    patience: CRITIC_PATIENCE,
    dish,
    price,
    critic: true,
  }
}
