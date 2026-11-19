// Headless run logic for the harness CLI (plan Step 13). Pure functions: no console, no
// process, no clock, so they are unit-testable. A run applies a named layout (and an
// optional menu), then for each day does openService -> DAY_TICKS ticks -> dismissSummary
// and collects one summary per day plus the final stateHash.
//
// setMenu/setPrice commands arrive in Step 14. Until then `withMenu` writes the menu
// directly on a copy of the state (and unlocks the dishes), like LAYOUT_SETUP does.

import { LAYOUTS, LAYOUT_SETUP } from '../content/layouts.ts'
import { DAY_TICKS } from '../sim/constants.ts'
import { applyCommand } from '../sim/commands.ts'
import { reputationOf } from '../sim/customers.ts'
import { profitOf } from '../sim/economy.ts'
import { createGame } from '../sim/game.ts'
import { stateHash } from '../sim/hash.ts'
import { applyLayout } from '../sim/layout.ts'
import { runTicks } from '../sim/tick.ts'
import type { Defs, GameState } from '../sim/types.ts'

export type MenuEntry = { dish: string; price: number }

export type RunOptions = {
  layout: string
  seed: string
  days: number
  /** Dishes and prices in cents; undefined keeps the layout's own menu. */
  menu?: MenuEntry[] | undefined
}

export type DaySummary = {
  day: number
  served: number
  lostPatience: number
  lostNoMatch: number
  lostFull: number
  /** Cents. */
  sales: number
  /** Cents. */
  cost: number
  /** Cents: sales minus ingredient cost (profitOf). */
  profit: number
  /** Reputation after the day (average of the last ratings). */
  rep: number
  /** Spoiled plus binned item count. */
  waste: number
  /** Average wait of served customers, in ticks (0 when nobody was served). */
  avgWaitTicks: number
}

export type RunResult = { days: DaySummary[]; hash: string; state: GameState }

export function layoutNames(): string[] {
  return Object.keys(LAYOUTS)
}

/** A copy of `state` with the given menu (dishes unlocked). Dev helper until Step 14. */
export function withMenu(state: GameState, menu: MenuEntry[]): GameState {
  const next = structuredClone(state)
  next.menu = menu.map((m) => ({ dish: m.dish, price: m.price }))
  for (const m of menu) {
    if (!next.unlocked.includes(m.dish)) next.unlocked.push(m.dish)
  }
  return next
}

/** Fresh game with the named layout applied. Throws on an unknown layout or a rejected command. */
export function buildLayoutState(defs: Defs, layout: string, seed: string): GameState {
  const commands = LAYOUTS[layout]
  if (commands === undefined) throw new Error(`unknown layout: ${layout}`)
  const out = applyLayout(createGame(defs, seed), defs, commands, LAYOUT_SETUP[layout])
  if (out.rejected.length > 0) throw new Error(`layout ${layout} rejected: ${out.rejected.join('; ')}`)
  return out.state
}

function step(state: GameState, defs: Defs, type: 'openService' | 'dismissSummary'): GameState {
  const out = applyCommand(state, defs, { type })
  if (!out.result.ok) throw new Error(`${type} rejected: ${out.result.reason}`)
  return out.state
}

/** Run `days` full days from `start` (build phase). The input state is not mutated. */
export function runDaysFrom(start: GameState, defs: Defs, days: number): RunResult {
  let state = start
  const summaries: DaySummary[] = []
  for (let i = 0; i < days; i += 1) {
    state = step(state, defs, 'openService')
    state = runTicks(state, defs, DAY_TICKS)
    const d = state.lastDay
    if (state.phase !== 'summary' || d === null) throw new Error(`day ${state.day} did not finish`)
    summaries.push({
      day: d.day,
      served: d.served,
      lostPatience: d.lostPatience,
      lostNoMatch: d.lostNoMatch,
      lostFull: d.lostFull,
      sales: d.sales,
      cost: d.ingredientCost,
      profit: profitOf(d),
      rep: reputationOf(state),
      waste: d.wasteSpoiled + d.wasteBinned,
      avgWaitTicks: d.served === 0 ? 0 : d.waitTicksTotal / d.served,
    })
    state = step(state, defs, 'dismissSummary')
  }
  return { days: summaries, hash: stateHash(state), state }
}

export function runDays(defs: Defs, opts: RunOptions): RunResult {
  let state = buildLayoutState(defs, opts.layout, opts.seed)
  if (opts.menu !== undefined) state = withMenu(state, opts.menu)
  return runDaysFrom(state, defs, opts.days)
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export function formatDay(s: DaySummary): string {
  return (
    `[sim] day=${s.day} served=${s.served} lost=${s.lostPatience}/${s.lostNoMatch}/${s.lostFull} ` +
    `sales=${formatMoney(s.sales)} cost=${formatMoney(s.cost)} profit=${formatMoney(s.profit)} ` +
    `rep=${s.rep.toFixed(2)} waste=${s.waste} avgWait=${s.avgWaitTicks.toFixed(1)}t`
  )
}

/** Output lines of a run: one per day plus the final hash. */
export function formatRun(result: RunResult): string[] {
  return [...result.days.map(formatDay), `[sim] stateHash=${result.hash}`]
}
