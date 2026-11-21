// Scripted "efficient player" for the journey simulation (harness only, measurement).
// It drives the sim ONLY through applyCommand, with the same commands the UI sends, and
// never edits state directly. A rejected command is recorded as a failure, not hidden.
//
// Policy (all decisions are made in the build phase at the start of a day):
//  1. Day 1: build the fries line from the tutorial hint layout (chopper (2,2), fryer (4,2), belts).
//  2. Stall tier, strict priority: salad, soup, rice bowl (each unlocks its recipe, builds its
//     line, puts the dish on the menu at the reference price). Rice bowl needs the 10x8 grid
//     (its dish reaches the pass from the east, tile (8,2)). Once all four stall goals are done
//     the player saves UPGRADE_COST instead of buying more stall lines.
//  3. Upgrade to restaurant as soon as the goals are done and the money is there.
//  4. Restaurant tier: buy the 12x9 grid, build the sandwich line, put it on the menu (5 dishes,
//     goal 5 needs 10+ sold of each of 5 dishes in one day). When last day's fries customers gave
//     up (patience) a second fryer line is built (column x = 9, joining the merger at (8,3)).
//  5. Prices stay at the reference prices. Nothing is bought during service.
//  6. Pantries are paused for the last PAUSE_LEAD_TICKS of each day (overnight cleanup would bin
//     what is left on the line) and resumed at the next build phase (pausePolicy.ts; `pausePantries: false` turns it off).
//
// Pass sides (8x6 start): W fries, N salad, S soup. The 4th side E (8,2) needs the 10x8 grid:
// rice bowl uses it; the sandwich and the second fryer JOIN the same east column through mergers (round-robin), so three lines share one pass side (head-of-line is possible and is the thing to watch).
// Kitchen map (x to the right, y down; pass at (7,2)):
//   y0-1 salad (assembler (4,0))  -> belts (5..6,0), (7,0..1) south into the pass
//   y2   fries (chopper (2,2), fryer (4,2)) -> belts (5..6,2)
//   y3   soup  (chopper (2,3), stove (4,3)) -> belts (5..6,3), (7,3) north
//   y4-5 rice bowl (assembler (4,4)) -> belts (5..7,4), mergers (8,4) and (8,3) north, belt (8,2) west
//   y6-8 sandwich (assembler (4,7), lettuce chopper (4,6) from the north) -> (5..7,7), (8,5..7) north into the merger (8,4)
//   x = 9 second fryer line (pantry (9,7), chopper (9,6), fryer (9,4)) -> (9,3) west into the merger (8,3)
// Shared side: since 2026-11-22 the pass shelf never blocks (a 5th copy of a dish drops the oldest
// unsold one, counted as waste), so a full shelf can no longer starve the other lines. What is left is
// waste: every line out-produces demand and the surplus is thrown away at the pass, which eats profit
// (without the throttle 4 of 30 seeds never make the $300 day in 40 days). So the player still slows
// the pantries of the lines that share the east side to 80 ticks (an interval is a real pantry
// setting); `sharedInterval: 20` shows the unthrottled result.
// The "cautious" variant buys one project a day and keeps a bigger cash reserve.
// Same seed gives the same run (it only uses applyCommand and runTicks).

import { PANTRY_DEFAULT_INTERVAL, UPGRADE_COST } from '../sim/constants.ts'
import { applyCommand } from '../sim/commands.ts'
import { reputationOf } from '../sim/customers.ts'
import { profitOf } from '../sim/economy.ts'
import { createGame } from '../sim/game.ts'
import { stateHash } from '../sim/hash.ts'
import { allGoalsDone, upgradeProblem } from '../sim/goals.ts'
import { placeCost } from '../sim/grid.ts'
import { resumeAfterDay, runServiceDay } from './pausePolicy.ts'
import type { Command, Defs, Dir, GameState, SimEvent } from '../sim/types.ts'

export type PlayerOptions = {
  cautious?: boolean
  maxDays?: number
  /** Keep playing after the end screen (diagnostics: steady state with the full kitchen). */
  continueAfterWin?: boolean
  /** Pantry emit interval (ticks) of the rice bowl and sandwich lines, which share the east pass side. Default 80. */
  sharedInterval?: number
  /** Second fryer line: 'auto' (when fries customers gave up), 'always' (right after the upgrade) or 'never'. Default 'auto'. */
  secondFryer?: 'auto' | 'always' | 'never'
  /** Pause all pantries for the last PAUSE_LEAD_TICKS of each day and resume them next morning. Default true. */
  pausePantries?: boolean
}

export type DayLog = {
  day: number
  tier: 'stall' | 'restaurant'
  /** Cents at the start of the day (after the build phase). */
  moneyStart: number
  menuSize: number
  customers: number
  served: number
  /** Whole percent of customers served (0 when nobody came). */
  servedPct: number
  /** Cents: sales minus ingredient cost. */
  profit: number
  rep: number
  lostPatience: number
  lostNoMatch: number
  lostFull: number
  /** Customers of this day who ordered fries and gave up. */
  friesPatience: number
  /** Fries the fryers finished (one fryer makes at most 40 a day) and fries sold. */
  friesMade: number
  friesServed: number
  /** What the player bought before the day. */
  bought: string[]
}

export type JourneyResult = {
  seed: string
  days: DayLog[]
  /** Day (state.day when first seen done) per goal id; null when never done. */
  goalDay: Record<string, number | null>
  upgradeDay: number | null
  wonDay: number | null
  finalMoney: number
  failures: string[]
  hash: string
  state: GameState
}

type Project = {
  id: string
  dish: string | null
  minWidth: number
  minHeight: number
  needs: string[]
  cmds: Command[]
}

const place = (kind: 'belt' | 'merger' | 'chopper' | 'fryer' | 'stove' | 'assembler' | 'pantry', x: number, y: number, dir: Dir = 1, ingredient?: string): Command =>
  ingredient === undefined ? { type: 'place', kind, x, y, dir } : { type: 'place', kind, x, y, dir, config: { ingredient } }
const belts = (xs: number[], y: number): Command[] => xs.map((x) => place('belt', x, y))
const recipeAt = (x: number, y: number, recipe: string): Command => ({ type: 'configure', x, y, recipe })

/** Pantry emit interval commands (skipped at the default 20): used on the lines that share the east side. */
const throttle = (interval: number, tiles: [number, number][]): Command[] =>
  interval === PANTRY_DEFAULT_INTERVAL ? [] : tiles.map(([x, y]) => ({ type: 'configure', x, y, interval }))

const FRIES: Project = {
  id: 'fries',
  dish: 'fries',
  minWidth: 8,
  minHeight: 6,
  needs: [],
  cmds: [place('belt', 1, 2), place('chopper', 2, 2), place('belt', 3, 2), place('fryer', 4, 2), place('belt', 5, 2), place('belt', 6, 2)],
}
const SALAD: Project = {
  id: 'salad',
  dish: 'salad',
  minWidth: 8,
  minHeight: 6,
  needs: ['fries'],
  cmds: [
    place('pantry', 0, 0, 1, 'lettuce'),
    place('belt', 1, 0),
    place('chopper', 2, 0),
    place('belt', 3, 0),
    place('pantry', 0, 1, 1, 'tomato'),
    place('belt', 1, 1),
    place('chopper', 2, 1),
    place('belt', 3, 1),
    place('assembler', 4, 0),
    recipeAt(4, 0, 'salad'),
    place('belt', 5, 0),
    place('belt', 6, 0),
    place('belt', 7, 0, 2),
    place('belt', 7, 1, 2),
  ],
}
const SOUP: Project = {
  id: 'soup',
  dish: 'soup',
  minWidth: 8,
  minHeight: 6,
  needs: ['fries'],
  cmds: [
    place('pantry', 0, 3, 1, 'tomato'),
    place('belt', 1, 3),
    place('chopper', 2, 3),
    place('belt', 3, 3),
    place('stove', 4, 3),
    place('belt', 5, 3),
    place('belt', 6, 3),
    place('belt', 7, 3, 0),
  ],
}
const rice = (interval: number): Project => ({
  id: 'riceBowl',
  dish: 'riceBowl',
  minWidth: 10,
  minHeight: 8,
  needs: ['fries'],
  cmds: [
    place('pantry', 0, 4, 1, 'rice'),
    place('belt', 1, 4),
    place('stove', 2, 4),
    place('belt', 3, 4),
    place('pantry', 0, 5, 1, 'patty'),
    place('belt', 1, 5),
    place('stove', 2, 5),
    place('belt', 3, 5),
    place('assembler', 4, 4),
    recipeAt(4, 4, 'riceBowl'),
    ...belts([5, 6, 7], 4),
    // Mergers (round-robin) instead of belts at the two joins, so the lines sharing the east side take turns.
    place('merger', 8, 4, 0),
    place('merger', 8, 3, 0),
    place('belt', 8, 2, 3),
    ...throttle(interval, [[0, 4], [0, 5]]),
  ],
})
const sandwich = (interval: number): Project => ({
  id: 'sandwich',
  dish: 'sandwich',
  minWidth: 12,
  minHeight: 9,
  needs: ['riceBowl'],
  cmds: [
    place('pantry', 0, 6, 1, 'lettuce'),
    ...belts([1, 2, 3], 6),
    place('chopper', 4, 6, 2),
    place('pantry', 0, 7, 1, 'bread'),
    ...belts([1, 2, 3], 7),
    place('pantry', 0, 8, 1, 'tomato'),
    place('belt', 1, 8),
    place('chopper', 2, 8),
    place('belt', 3, 8),
    place('assembler', 4, 7),
    recipeAt(4, 7, 'sandwich'),
    ...belts([5, 6, 7], 7),
    place('belt', 8, 7, 0),
    place('belt', 8, 6, 0),
    place('belt', 8, 5, 0),
    ...throttle(interval, [[0, 6], [0, 7], [0, 8]]),
  ],
})
const fries2 = (interval: number): Project => ({
  id: 'fries2',
  dish: null,
  minWidth: 10,
  minHeight: 8,
  needs: ['riceBowl'],
  cmds: [
    place('pantry', 9, 7, 0, 'potato'),
    place('chopper', 9, 6, 0),
    place('belt', 9, 5, 0),
    place('fryer', 9, 4, 0),
    place('belt', 9, 3, 3),
    ...throttle(interval, [[9, 7]]),
  ],
})

/** Stall lines in strict priority order, then the restaurant line. */
const priority = (interval: number): Project[] => [FRIES, SALAD, SOUP, rice(interval), sandwich(interval)]
const MENU_ORDER = ['fries', 'salad', 'soup', 'riceBowl', 'sandwich']

const BASE_RESERVE = 2000
const CAUTIOUS_RESERVE = 8000

/** Cents a project costs now: expansions still needed, the recipe unlock and every placed building. */
function projectCost(state: GameState, defs: Defs, p: Project): number | null {
  let cost = 0
  let w = state.width
  let h = state.height
  let step = state.expansion
  while (w < p.minWidth || h < p.minHeight) {
    const next = defs.expansions?.[step]
    if (next === undefined) return null
    if (next.requiresTier === 'restaurant' && state.tier !== 'restaurant') return null
    cost += next.cost
    w = next.width
    h = next.height
    step += 1
  }
  if (p.dish !== null && !state.unlocked.includes(p.dish)) cost += defs.dishes[p.dish].unlockCost
  for (const c of p.cmds) if (c.type === 'place') cost += placeCost(defs, c)
  return cost
}

type Run = { state: GameState; defs: Defs; failures: string[] }

function send(run: Run, cmd: Command, why: string): boolean {
  const out = applyCommand(run.state, run.defs, cmd)
  if (out.result.ok) {
    run.state = out.state
    return true
  }
  const where = 'x' in cmd && 'y' in cmd ? ` at (${cmd.x},${cmd.y})` : ''
  const kind = 'kind' in cmd ? ` ${cmd.kind}` : ''
  run.failures.push(`day ${run.state.day}: ${why}: ${cmd.type}${kind}${where} rejected: ${out.result.reason}`)
  return false
}

function buildProject(run: Run, p: Project, bought: string[]): boolean {
  while (run.state.width < p.minWidth || run.state.height < p.minHeight) {
    if (!send(run, { type: 'buyExpansion' }, p.id)) return false
    bought.push(`grid ${run.state.width}x${run.state.height}`)
  }
  if (p.dish !== null && !run.state.unlocked.includes(p.dish)) {
    if (!send(run, { type: 'unlockRecipe', dish: p.dish }, p.id)) return false
  }
  for (const c of p.cmds) if (!send(run, c, p.id)) return false
  bought.push(p.id)
  return true
}

function syncMenu(run: Run, built: Set<string>): void {
  const cap = run.state.tier === 'restaurant' ? 6 : 4
  const want = MENU_ORDER.filter((d) => built.has(d)).slice(0, cap)
  const have = run.state.menu.map((m) => m.dish)
  if (want.length === have.length && want.every((d, i) => d === have[i])) return
  send(run, { type: 'setMenu', dishes: want }, 'menu')
}

export function runJourney(defs: Defs, seed: string, opts: PlayerOptions = {}): JourneyResult {
  const cautious = opts.cautious === true
  const maxDays = opts.maxDays ?? 40
  const PRIORITY = priority(opts.sharedInterval ?? 80)
  const FRIES2 = fries2(opts.sharedInterval ?? 80)
  const run: Run = { state: createGame(defs, seed), defs, failures: [] }
  const built = new Set<string>()
  const failedProjects = new Set<string>()
  const goalDay: Record<string, number | null> = {}
  for (const g of defs.goals ?? []) goalDay[g.id] = null
  const days: DayLog[] = []
  let upgradeDay: number | null = null
  let wonDay: number | null = null
  let friesPatience = 0
  let friesMade = 0
  const secondFryer = opts.secondFryer ?? 'auto'
  let lastFriesPatience = 0

  const noteGoals = (): void => {
    for (const id of run.state.goalsDone) if (goalDay[id] === null || goalDay[id] === undefined) goalDay[id] = run.state.day
  }
  const reserveNow = (): number => {
    const base = cautious ? CAUTIOUS_RESERVE : BASE_RESERVE
    const saving = run.state.tier === 'stall' && allGoalsDone(run.state, defs, 'stall') ? UPGRADE_COST : 0
    return base + saving
  }
  const tryBuild = (p: Project, bought: string[]): 'built' | 'wait' | 'skip' => {
    if (built.has(p.id) || failedProjects.has(p.id)) return 'skip'
    if (!p.needs.every((n) => built.has(n))) return 'skip'
    const cost = projectCost(run.state, defs, p)
    if (cost === null) return 'wait'
    if (run.state.money - cost < reserveNow()) return 'wait'
    if (buildProject(run, p, bought)) {
      built.add(p.id)
      return 'built'
    }
    failedProjects.add(p.id)
    return 'skip'
  }

  for (let i = 0; i < maxDays; i += 1) {
    const bought: string[] = []
    let spent = false
    // Upgrade first, as soon as it is allowed (cautious: with a margin).
    if (run.state.tier === 'stall' && upgradeProblem(run.state, defs) === null) {
      if (!cautious || run.state.money >= UPGRADE_COST + CAUTIOUS_RESERVE) {
        if (send(run, { type: 'upgradeTier' }, 'upgrade')) {
          bought.push('upgrade')
          upgradeDay = run.state.day
          spent = true
        }
      }
    }
    // Second fryer when fries customers gave up yesterday (restaurant tier).
    const wantFryer2 = secondFryer === 'always' || (secondFryer === 'auto' && lastFriesPatience >= 2)
    if (run.state.tier === 'restaurant' && wantFryer2 && !(cautious && spent)) {
      if (tryBuild(FRIES2, bought) === 'built') spent = true
    }
    for (const p of PRIORITY) {
      if (cautious && spent) break
      const r = tryBuild(p, bought)
      if (r === 'built') spent = true
      if (r === 'wait') break
    }
    syncMenu(run, built)
    noteGoals()

    const moneyStart = run.state.money
    if (!send(run, { type: 'openService' }, 'open')) break
    friesPatience = 0
    friesMade = 0
    run.state = runServiceDay(run.state, defs, opts.pausePantries !== false, (events: SimEvent[]) => {
      for (const e of events) {
        if (e.type === 'customerLeft' && e.reason === 'patience' && e.dish === 'fries') friesPatience += 1
        if (e.type === 'stationDone' && e.output === 'fries') friesMade += 1
      }
    })
    const d = run.state.lastDay
    if (d === null || (run.state.phase !== 'summary' && run.state.phase !== 'won')) {
      run.failures.push(`day ${run.state.day}: did not finish`)
      break
    }
    lastFriesPatience = friesPatience
    noteGoals()
    days.push({
      day: d.day,
      tier: run.state.tier,
      moneyStart,
      menuSize: run.state.menu.length,
      customers: d.customers,
      served: d.served,
      servedPct: d.customers === 0 ? 0 : Math.floor((d.served * 100) / d.customers),
      profit: profitOf(d),
      rep: reputationOf(run.state),
      lostPatience: d.lostPatience,
      lostNoMatch: d.lostNoMatch,
      lostFull: d.lostFull,
      friesPatience,
      friesMade,
      friesServed: d.byDish['fries']?.served ?? 0,
      bought,
    })
    for (const m of run.state.menu) {
      const row = d.byDish[m.dish]
      if (d.customers >= 30 && (row === undefined || row.served === 0)) run.failures.push(`day ${d.day}: ${m.dish} sold 0 (on the menu)`)
    }
    if (run.state.phase === 'won') {
      wonDay ??= d.day
      if (opts.continueAfterWin !== true) break
    }
    if (!send(run, { type: 'dismissSummary' }, 'dismiss')) break
    run.state = resumeAfterDay(run.state, defs)
  }
  return {
    seed,
    days,
    goalDay,
    upgradeDay,
    wonDay,
    finalMoney: run.state.money,
    failures: run.failures,
    hash: stateHash(run.state),
    state: run.state,
  }
}
