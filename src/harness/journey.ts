// Journey simulation output (harness only): runs the scripted player (player.ts) over many
// seeds and formats one table row per seed, the median/min/max over seeds, the playtime
// at 1x and 4x, and a per-day table for one example seed. Pure: no console, clock or process.
// A day is DAY_TICKS ticks of service (2400 ticks = 240 s at 1x, 60 s at 4x); build time
// between days is not simulated, so the playtime is a lower bound.

import { DAY_TICKS, TICKS_PER_SECOND } from '../sim/constants.ts'
import type { Defs } from '../sim/types.ts'
import { formatMoney } from './run.ts'
import { runJourney } from './player.ts'
import type { JourneyResult, PlayerOptions } from './player.ts'

export type JourneyOptions = PlayerOptions & { seeds: number; seedPrefix?: string }

export function journeySeedName(prefix: string, i: number): string {
  return `${prefix}-${i}`
}

export function runJourneySet(defs: Defs, opts: JourneyOptions): JourneyResult[] {
  const prefix = opts.seedPrefix ?? 'journey'
  const results: JourneyResult[] = []
  for (let i = 1; i <= opts.seeds; i += 1) results.push(runJourney(defs, journeySeedName(prefix, i), opts))
  return results
}

/** The goal columns, in the order they are shown. */
const GOAL_COLUMNS: { id: string; head: string }[] = [
  { id: 'first-dish', head: 'dish1' },
  { id: 'serve-100', head: 'srv100' },
  { id: 'rating-4', head: 'rate4' },
  { id: 'profit-300', head: 'prof300' },
  { id: 'menu-5', head: 'menu5' },
  { id: 'great-day', head: 'goal6' },
  { id: 'restaurant-profit', head: 'goal7' },
]

export type Stat = { median: number; min: number; max: number; n: number }

/** Median (lower middle for an even count), min and max of the non-null values; null when there are none. */
export function stat(values: (number | null)[]): Stat | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b)
  if (v.length === 0) return null
  return { median: v[Math.floor((v.length - 1) / 2)], min: v[0], max: v[v.length - 1], n: v.length }
}

const pad = (s: string, n: number): string => s.padStart(n)
const cell = (v: number | null, n = 8): string => pad(v === null ? '-' : String(v), n)
const statCell = (s: Stat | null, pick: 'median' | 'min' | 'max'): string => cell(s === null ? null : s[pick])

function valuesOf(r: JourneyResult): (number | null)[] {
  return [...GOAL_COLUMNS.map((c) => r.goalDay[c.id] ?? null), r.upgradeDay, r.wonDay]
}

/** Per-seed table, the aggregate rows and the playtime lines. */
export function formatJourneyTable(results: JourneyResult[]): string[] {
  const heads = [...GOAL_COLUMNS.map((c) => c.head), 'upgrade', 'END']
  const lines: string[] = []
  lines.push(`${'seed'.padEnd(12)}${heads.map((h) => pad(h, 8)).join('')}${pad('money', 12)}${pad('issues', 8)}`)
  for (const r of results) {
    lines.push(
      `${r.seed.padEnd(12)}${valuesOf(r).map((v) => cell(v)).join('')}${pad(formatMoney(r.finalMoney), 12)}${pad(String(r.failures.length), 8)}`,
    )
  }
  const cols = heads.map((_, i) => stat(results.map((r) => valuesOf(r)[i])))
  for (const pick of ['median', 'min', 'max'] as const) {
    lines.push(`${pick.padEnd(12)}${cols.map((s) => statCell(s, pick)).join('')}`)
  }
  const upgradeCol = results.map((r) => r.upgradeDay)
  const after = (label: string, pick: (r: JourneyResult) => number | null): void => {
    const st = stat(results.map((r, i) => (pick(r) === null || upgradeCol[i] === null ? null : (pick(r) as number) - (upgradeCol[i] as number))))
    if (st !== null) lines.push(`${label}: median ${st.median}, min ${st.min}, max ${st.max} (${st.n} seeds)`)
  }
  after('days from the upgrade to goal 5 (5 dishes)', (r) => r.goalDay['menu-5'] ?? null)
  after('days from the upgrade to goal 6 ($300 day)', (r) => r.goalDay['great-day'] ?? null)
  after('days from the upgrade to goal 7 (restaurant profit)', (r) => r.goalDay['restaurant-profit'] ?? null)
  after('days from the upgrade to the end screen', (r) => r.wonDay)
  const spent = stat(results.map((r) => (r.upgradeDay === null ? null : Math.round(r.restaurantSpent / 100))))
  if (spent !== null) {
    lines.push(`cash spent at the restaurant tier (grids, lines, passes, upgrades): median $${spent.median}, min $${spent.min}, max $${spent.max} (${spent.n} seeds)`)
  }
  const allDays = results.flatMap((r) => r.days)
  const lossDays = allDays.filter((d) => d.profit < 0).length
  lines.push(`days with a loss: ${lossDays} of ${allDays.length}`)
  const reached = cols[cols.length - 1]
  const dnf = results.filter((r) => r.wonDay === null).length
  lines.push(`reached the end screen: ${results.length - dnf}/${results.length} seeds`)
  if (reached !== null) {
    const secPerDay = DAY_TICKS / TICKS_PER_SECOND
    const mins = (days: number, speed: number): string => ((days * secPerDay) / speed / 60).toFixed(0)
    lines.push(
      `service time to the end screen (median ${reached.median} days, max ${reached.max}): ` +
        `1x ${mins(reached.median, 1)} min (max ${mins(reached.max, 1)}), 4x ${mins(reached.median, 4)} min (max ${mins(reached.max, 4)}); build time between days not included`,
    )
  }
  return lines
}

/** One line per day for one seed: the pace, as the player would see it. */
export function formatJourneyDays(r: JourneyResult): string[] {
  const lines = [`example ${r.seed}: per day`]
  for (const d of r.days) {
    lines.push(
      `  day ${String(d.day).padStart(2)} ${d.tier.padEnd(10)} money=${pad(formatMoney(d.moneyStart), 9)} menu=${d.menuSize} ` +
        `cust=${pad(String(d.customers), 3)} served=${pad(String(d.servedPct), 3)}% profit=${pad(formatMoney(d.profit), 8)} ` +
        `stars=${d.rep.toFixed(2)} lost=${d.lostPatience}/${d.lostNoMatch}/${d.lostFull} fries=${d.friesMade}/${d.friesServed} ${d.bought.join(',')}`,
    )
  }
  return lines
}

/** Distinct failure messages over all seeds (day numbers stripped), most common first, to spot patterns. */
export function formatFailures(results: JourneyResult[]): string[] {
  const counts = new Map<string, number>()
  for (const r of results) {
    for (const f of r.failures) {
      const key = f.replace(/^day \d+: /, '')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `  ${n}x ${f}`)
}

/**
 * Fryer load per tier: mean fries finished a day (one fryer makes at most DAY_TICKS / 60 = 40), mean
 * fries customers who gave up a day, and the share of days with 2 or more of them. Days from the day a
 * second fryer is built are left out, so the numbers describe the single fryer. A last line covers the days
 * from the second fryer on (restaurant tier), which should have almost no fries customers giving up.
 */
export function formatFryerLoad(results: JourneyResult[]): string[] {
  const lines: string[] = []
  for (const tier of ['stall', 'restaurant'] as const) {
    let days = 0
    let made = 0
    let gaveUp = 0
    let bad = 0
    for (const r of results) {
      const second = r.days.findIndex((d) => d.bought.includes('fries2'))
      for (const [i, d] of r.days.entries()) {
        if (d.tier !== tier || (second >= 0 && i >= second)) continue
        days += 1
        made += d.friesMade
        gaveUp += d.friesPatience
        if (d.friesPatience >= 2) bad += 1
      }
    }
    if (days === 0) continue
    lines.push(
      `single fryer, ${tier} tier (${days} days): ${(made / days).toFixed(1)} fries made a day (cap 40), ` +
        `${(gaveUp / days).toFixed(2)} fries customers gave up a day, ${Math.round((bad * 100) / days)}% of days with 2 or more`,
    )
  }
  let after = 0
  let afterGaveUp = 0
  let afterBad = 0
  for (const r of results) {
    const second = r.days.findIndex((d) => d.bought.includes('fries2'))
    if (second < 0) continue
    for (const d of r.days.slice(second)) {
      after += 1
      afterGaveUp += d.friesPatience
      if (d.friesPatience >= 2) afterBad += 1
    }
  }
  if (after > 0) {
    lines.push(
      `second fryer, from the day it is built (${after} days): ${(afterGaveUp / after).toFixed(2)} fries customers gave up a day, ` +
        `${Math.round((afterBad * 100) / after)}% of days with 2 or more`,
    )
  }
  return lines
}
