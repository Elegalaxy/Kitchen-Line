// View helpers for seasons (GAME_DESIGN 9): the top bar stat, the cost / taste change lists, the
// forecast line of the day summary and the per-dish tag of the menu. Restaurant tier only (the
// functions return null at the stall or without season defs). Pure, so they are unit-tested.

import { SEASON_DAYS } from '../sim/constants.ts'
import { currentSeason, inSeason, seasonIndex } from '../sim/season.ts'
import { formatMoney } from './format.ts'
import type { Defs, DishDef, GameState, SeasonDef } from '../sim/types.ts'

type SeasonState = Pick<GameState, 'tier' | 'day'>

export type SeasonView = {
  id: string
  name: string
  emoji: string
  /** 1 to SEASON_DAYS. */
  dayInSeason: number
  /** "Day 3 of 7" */
  progress: string
  /** Top bar form: "Summer 3/7". */
  short: string
  /** The part of `short` that stays on a crowded top bar: "3/7". */
  count: string
  /** Pantry price changes, e.g. "Tomato -25%". */
  costChanges: string[]
  /** Taste changes, e.g. "Salad more popular". */
  tasteChanges: string[]
}

function signedPercent(pct: number): string {
  const d = pct - 100
  return `${d > 0 ? '+' : '-'}${Math.abs(d)}%`
}

function costChanges(season: SeasonDef, defs: Defs): string[] {
  return Object.entries(season.costPercent)
    .filter(([, pct]) => pct !== 100)
    .map(([id, pct]) => `${defs.items[id]?.name ?? id} ${signedPercent(pct)}`)
}

function tasteChanges(season: SeasonDef, defs: Defs): string[] {
  return Object.entries(season.tastePercent)
    .filter(([, pct]) => pct !== 100)
    .map(([id, pct]) => `${defs.dishes[id]?.name ?? id} ${pct > 100 ? 'more' : 'less'} popular`)
}

/** The season of the day in progress, or null at the stall / without season defs. */
export function seasonView(state: SeasonState, defs: Defs): SeasonView | null {
  const season = currentSeason(state, defs)
  if (season === null) return null
  const dayInSeason = ((Math.max(state.day, 1) - 1) % SEASON_DAYS) + 1
  return {
    id: season.id,
    name: season.name,
    emoji: season.emoji,
    dayInSeason,
    progress: `Day ${dayInSeason} of ${SEASON_DAYS}`,
    short: `${season.name} ${dayInSeason}/${SEASON_DAYS}`,
    count: `${dayInSeason}/${SEASON_DAYS}`,
    costChanges: costChanges(season, defs),
    tasteChanges: tasteChanges(season, defs),
  }
}

/** The season's effects as key-value rows, for the Menu tab. */
export function seasonEffects(view: Pick<SeasonView, 'costChanges' | 'tasteChanges'>): { label: string; value: string }[] {
  const rows = [
    { label: 'Prices', value: view.costChanges.join(', ') },
    { label: 'Demand', value: view.tasteChanges.join(', ') },
  ].filter((r) => r.value !== '')
  return rows.length > 0 ? rows : [{ label: 'Effects', value: 'None this season' }]
}

/** The lines behind the top bar's season stat. */
export function seasonDetails(view: SeasonView): string[] {
  return [`${view.name}: ${view.progress.toLowerCase()}`, ...view.costChanges, ...view.tasteChanges]
}

export type SeasonForecast = {
  name: string
  emoji: string
  /** First day of the next season. */
  startDay: number
  /** Days from `state.day` until it starts (1 = tomorrow). */
  daysLeft: number
  costChanges: string[]
  tasteChanges: string[]
  /** Names of the dishes that come into season. */
  dishes: string[]
  /** "Next: Autumn 🍂 from day 15 (in 3 days): Potato -25%, Soup more popular, Pumpkin soup in season" */
  text: string
}

/** The season after the current one (null at the stall). `state.day` is the day in progress or, in the summary, the day just finished. */
export function seasonForecast(state: SeasonState, defs: Defs): SeasonForecast | null {
  const seasons = defs.seasons
  if (currentSeason(state, defs) === null || seasons === undefined) return null
  const day = Math.max(state.day, 1)
  const startDay = (Math.floor((day - 1) / SEASON_DAYS) + 1) * SEASON_DAYS + 1
  const next = seasons[seasonIndex(startDay) % seasons.length]
  const dishes = Object.values(defs.dishes)
    .filter((d) => d.season === next.id)
    .map((d) => d.name)
  const daysLeft = startDay - day
  const costs = costChanges(next, defs)
  const tastes = tasteChanges(next, defs)
  const parts = [...costs, ...tastes, ...dishes.map((n) => `${n} in season`)]
  const when = daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`
  return {
    name: next.name,
    emoji: next.emoji,
    startDay,
    daysLeft,
    costChanges: costs,
    tasteChanges: tastes,
    dishes,
    text: `Next: ${next.name} ${next.emoji} from day ${startDay} (${when})${parts.length > 0 ? `: ${parts.join(', ')}` : ''}`,
  }
}

export type SeasonTag = {
  inSeason: boolean
  /** "In season" or "Out of season, from day N". */
  text: string
  /** First day this dish is wanted again (null while in season). */
  fromDay: number | null
}

/** Tag for a seasonal dish; null for a dish without a season or when seasons do not apply. */
export function seasonTag(dish: Pick<DishDef, 'season'>, state: SeasonState, defs: Defs): SeasonTag | null {
  if (dish.season === undefined || currentSeason(state, defs) === null) return null
  if (inSeason(state, defs, dish)) return { inSeason: true, text: 'In season', fromDay: null }
  for (let day = state.day + 1; day <= state.day + SEASON_DAYS * 4; day += 1) {
    if (inSeason(state, defs, dish, day)) return { inSeason: false, text: `Out of season, from day ${day}`, fromDay: day }
  }
  return null
}

/** Title for a cost cell whose seasonal cost differs from the base cost (null when equal). */
export function costTitle(cost: number, base: number): string | undefined {
  if (cost === base) return undefined
  return `Base ${formatMoney(base)}, now ${formatMoney(cost)} at this season's prices`
}
