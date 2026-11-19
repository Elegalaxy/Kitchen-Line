// End-of-day summary (plan Step 15). `summarizeDay` is pure: it turns a finished day's stats
// into KPI values, deltas against the previous day, the worst dish and a bottleneck hint. It
// returns ids only; the UI looks up names. Reputation is not part of DayStats, so the caller
// passes it in (`now`, and `atDayStart` for the change over the day).
//
// Bottleneck hint rule: three reasons compete, each with a count: lost to patience
// (`lostPatience`), lost to no match (`lostNoMatch`) and spoiled items (`wasteSpoiled`).
// The largest count wins; ties go patience, then noMatch, then waste. All counts 0 means no
// hint (null). Queue-full losses and binned/destroyed waste are not hints. The dish named
// for patience is the worst dish; the item named for waste is the item that spoiled most
// (ties by id).

import { TICKS_PER_SECOND } from './constants.ts'
import { profitOf } from './economy.ts'
import type { DayStats, DishId, ItemId } from './types.ts'

export type BottleneckHint =
  | { kind: 'patience'; dish: DishId | null; count: number }
  | { kind: 'noMatch'; count: number }
  | { kind: 'waste'; item: ItemId | null; count: number }

export type DishRow = { dish: DishId; served: number; lost: number; sales: number }

/** Change against the previous day; every field is null when there is no previous day. */
export type SummaryDeltas = {
  profit: number
  served: number
  /** Percentage points. Null when either day had no customers. */
  servedPct: number | null
  /** Seconds. Null when either day served nobody. */
  avgWaitSec: number | null
}

export type DaySummary = {
  day: number
  profit: number
  sales: number
  ingredientCost: number
  served: number
  customers: number
  /** Whole percent of customers served; null when no customers came. */
  servedPct: number | null
  reputation: number
  /** Reputation change over the day (now minus the value when service opened). */
  reputationDelta: number
  /** Average wait of served customers in seconds; null when nobody was served. */
  avgWaitSec: number | null
  /** Null when there is no previous day. */
  deltas: SummaryDeltas | null
  /** Dish rows with any activity, most sales first (ties by id). */
  dishes: DishRow[]
  /** The dish with the most losses; null when nothing was lost. */
  worstDish: DishId | null
  bottleneckHint: BottleneckHint | null
}

/** One decimal, the precision the UI shows reputation at. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function servedPctOf(s: DayStats): number | null {
  return s.customers === 0 ? null : Math.round((s.served / s.customers) * 100)
}

function avgWaitOf(s: DayStats): number | null {
  return s.served === 0 ? null : s.waitTicksTotal / s.served / TICKS_PER_SECOND
}

/** Key with the largest value above 0; ties go to the smaller key. Null when none. */
function maxKey(record: Record<string, number>): string | null {
  let best: string | null = null
  let bestValue = 0
  for (const key of Object.keys(record).sort()) {
    const v = record[key] ?? 0
    if (v > bestValue) {
      best = key
      bestValue = v
    }
  }
  return best
}

export function worstDishOf(stats: DayStats): DishId | null {
  const lost: Record<string, number> = {}
  for (const [dish, d] of Object.entries(stats.byDish)) lost[dish] = d.lost
  return maxKey(lost)
}

export function bottleneckHintOf(stats: DayStats): BottleneckHint | null {
  const patience = stats.lostPatience
  const noMatch = stats.lostNoMatch
  const waste = stats.wasteSpoiled
  const top = Math.max(patience, noMatch, waste)
  if (top <= 0) return null
  if (patience === top) return { kind: 'patience', dish: worstDishOf(stats), count: patience }
  if (noMatch === top) return { kind: 'noMatch', count: noMatch }
  return { kind: 'waste', item: maxKey(stats.spoiledByItem), count: waste }
}

function nullableDiff(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b
}

export function summarizeDay(
  stats: DayStats,
  prevStats: DayStats | null,
  reputation: { now: number; atDayStart: number },
): DaySummary {
  const profit = profitOf(stats)
  const servedPct = servedPctOf(stats)
  const avgWaitSec = avgWaitOf(stats)
  const dishes = Object.entries(stats.byDish)
    .map(([dish, d]) => ({ dish, served: d.served, lost: d.lost, sales: d.sales }))
    .filter((r) => r.served > 0 || r.lost > 0)
    .sort((a, b) => b.sales - a.sales || (a.dish < b.dish ? -1 : a.dish > b.dish ? 1 : 0))
  const deltas: SummaryDeltas | null =
    prevStats === null
      ? null
      : {
          profit: profit - profitOf(prevStats),
          served: stats.served - prevStats.served,
          servedPct: nullableDiff(servedPct, servedPctOf(prevStats)),
          avgWaitSec: nullableDiff(avgWaitSec, avgWaitOf(prevStats)),
        }
  return {
    day: stats.day,
    profit,
    sales: stats.sales,
    ingredientCost: stats.ingredientCost,
    served: stats.served,
    customers: stats.customers,
    servedPct,
    reputation: reputation.now,
    reputationDelta: round1(reputation.now) - round1(reputation.atDayStart),
    avgWaitSec,
    deltas,
    dishes,
    worstDish: worstDishOf(stats),
    bottleneckHint: bottleneckHintOf(stats),
  }
}
