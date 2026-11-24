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
// Restaurant growth (2026-11-23): the second fryer line is preceded by PASS2, a second pass at (9,2) bought for
// $400 (needs the 10x8 grid), and its last belt (9,3) then faces NORTH into that pass instead of west into
// the merger (8,3), so the fries stop sharing the east side. `pass2: false` keeps the old west join. Once every
// dish line is built the player buys the restaurant upgrades in the order tables, sign, music, plates
// whenever the cash reserve is kept (`upgrades: false` turns that off).
// Pro stations (2026-11-24): at the restaurant tier, the first day after fries customers gave up (2 or more) the
// player swaps the fries fryer for a pro fryer (sell the base one at 100%, place the pro one in the same tile); only
// if fries customers still give up on a later day does the second fryer line follow. `pro: false` turns it off.
// Chain stage (2026-11-24, `chain: true`): after the restaurant end screen (state.won) the player dismisses it and keeps
// playing the SAME kitchen (the restaurant purchases above still run). In every build phase, after the menu is synced:
//  a. OPEN the next branch when openBranchProblem is null and the cost still leaves the flagship's operating reserve
//     (reserveNow(), the same reserve the upgrade buying keeps). A 'branch would lose money' refusal is not a failure
//     (the player just tries again on a later day, e.g. after a refit-worthy kitchen change).
//  b. REFIT a branch when its blueprint differs from the kitchen AND the kitchen gained value since the branch's copy
//     (blueprintOf(...).value > branch.blueprint.value; a menu or price change alone is not worth the $250 fee) AND the
//     refit cost leaves the reserve. The player never closes or sells (there is no such command).
// The run stops at the chain end screen (state.chainWon). Without `chain` it stops at the restaurant end screen as before.
// Same seed gives the same run (it only uses applyCommand and runTicks).

import { PANTRY_DEFAULT_INTERVAL, UPGRADE_COST } from '../sim/constants.ts'
import { applyCommand } from '../sim/commands.ts'
import { reputationOf } from '../sim/customers.ts'
import { profitOf } from '../sim/economy.ts'
import { createGame } from '../sim/game.ts'
import { stateHash } from '../sim/hash.ts'
import { allGoalsDone, upgradeProblem } from '../sim/goals.ts'
import { blueprintOf, sameBlueprint } from '../sim/blueprint.ts'
import { openBranchCost, openBranchProblem, refitCost, refitProblem } from '../sim/branches.ts'
import { buildingAt, placeCost } from '../sim/grid.ts'
import { currentSeason } from '../sim/season.ts'
import { currentTrend } from '../sim/trend.ts'
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
  /** Buy the restaurant upgrades once every dish line is built. Default true. */
  upgrades?: boolean
  /** Buy a second pass for the second fryer line. Default true. */
  pass2?: boolean
  /** Swap the fries fryer for a pro fryer when fries customers gave up (restaurant tier). Default true. */
  pro?: boolean
  /** Keep playing after the restaurant end screen: open and refit branches until the chain end screen. Default false. */
  chain?: boolean
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
  /** The day's trending dish (restaurant tier, GAME_DESIGN 9) or null; the scripted player ignores it. */
  trend: string | null
  /** The season id on that day (restaurant tier, GAME_DESIGN 9) or null at the stall. */
  season: string | null
  /** Units of the trend dish served that day. */
  trendServed: number
  /** The food critic's result that day (restaurant tier, GAME_DESIGN 9) or null; the scripted player ignores critics. */
  critic: { stars: number; served: boolean } | null
  /** Reputation when the day opened (to see what a critic did to it). */
  repAtStart: number
  /** What the player bought before the day. */
  bought: string[]
  /** Cents spent in this build phase at the restaurant tier (the tier fee itself is not counted). */
  spent: number
  /** Net cents (after rent) of each branch's night, by branch id order; empty without branches. */
  branchNets: number[]
  /** Cents spent on opening and refitting branches in this build phase. */
  branchSpent: number
}

export type JourneyResult = {
  seed: string
  days: DayLog[]
  /** Day (state.day when first seen done) per goal id; null when never done. */
  goalDay: Record<string, number | null>
  upgradeDay: number | null
  /** Day the pro fryer was bought, or null. */
  proFryerDay: number | null
  wonDay: number | null
  /** True when the chain stage was played (`chain: true`). */
  chain: boolean
  /** Day the n-th branch was opened (index 0 = first), null when not opened. */
  branchDay: (number | null)[]
  /** Day the chain end screen showed, or null. */
  chainDay: number | null
  /** Cents spent on opening and refitting branches. */
  branchSpent: number
  /** Cents spent on buildings, recipes, grids and restaurant upgrades while at the restaurant tier. */
  restaurantSpent: number
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

const place = (kind: 'belt' | 'merger' | 'pass' | 'chopper' | 'fryer' | 'stove' | 'assembler' | 'pantry', x: number, y: number, dir: Dir = 1, ingredient?: string): Command =>
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
/** Second pass beside the east column (restaurant tier, 10x8 grid): the second fryer line serves into it. */
const PASS2_POS = { x: 9, y: 2 } as const
const PASS2: Project = {
  id: 'pass2',
  dish: null,
  minWidth: 10,
  minHeight: 8,
  needs: ['riceBowl'],
  cmds: [place('pass', PASS2_POS.x, PASS2_POS.y, 3)],
}
/** With the second pass the last belt (9,3) faces north into it; without, west into the merger (8,3). */
const fries2 = (interval: number, pass2: boolean): Project => ({
  id: 'fries2',
  dish: null,
  minWidth: 10,
  minHeight: 8,
  needs: pass2 ? ['pass2'] : ['riceBowl'],
  cmds: [
    place('pantry', 9, 7, 0, 'potato'),
    place('chopper', 9, 6, 0),
    place('belt', 9, 5, 0),
    place('fryer', 9, 4, 0),
    place('belt', 9, 3, pass2 ? 0 : 3),
    ...throttle(interval, [[9, 7]]),
  ],
})

/** Restaurant upgrades in the order the player buys them. */
const UPGRADE_ORDER = ['tables', 'sign', 'music', 'plates']

/** Stall lines in strict priority order, then the restaurant line. */
const priority = (interval: number): Project[] => [FRIES, SALAD, SOUP, rice(interval), sandwich(interval)]
const MENU_ORDER = ['fries', 'salad', 'soup', 'riceBowl', 'sandwich']

/** The fries fryer of the first line (FRIES project) and its facing. */
const FRYER_POS = { x: 4, y: 2 } as const

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

/** Sell the base fryer of the fries line and place a pro fryer in its tile (same facing, nothing else changes). */
function swapToProFryer(run: Run): boolean {
  const id = buildingAt(run.state, FRYER_POS.x, FRYER_POS.y)
  const old = id === null ? undefined : run.state.buildings[id]
  if (old === undefined || old.kind !== 'fryer' || old.pro === true) return false
  const dir = old.dir
  if (!send(run, { type: 'remove', x: FRYER_POS.x, y: FRYER_POS.y }, 'pro fryer')) return false
  return send(run, { type: 'place', kind: 'fryer', x: FRYER_POS.x, y: FRYER_POS.y, dir, config: { pro: true } }, 'pro fryer')
}

function syncMenu(run: Run, built: Set<string>): void {
  const cap = run.state.tier === 'restaurant' ? 6 : 4
  const want = MENU_ORDER.filter((d) => built.has(d)).slice(0, cap)
  const have = run.state.menu.map((m) => m.dish)
  if (want.length === have.length && want.every((d, i) => d === have[i])) return
  send(run, { type: 'setMenu', dishes: want }, 'menu')
}

/** Chain policy (see the header): open when the reserve is kept, refit when the kitchen gained value. */
function branchPolicy(run: Run, bought: string[], reserve: number, branchDay: (number | null)[]): void {
  const { defs } = run
  if (openBranchProblem(run.state, defs) === null && run.state.money - openBranchCost(run.state, defs) >= reserve) {
    const out = applyCommand(run.state, defs, { type: 'openBranch' })
    if (out.result.ok) {
      run.state = out.state
      const n = run.state.branches?.length ?? 0
      branchDay[n - 1] ??= run.state.day
      bought.push(`branch${n}`)
    } else if (out.result.reason !== 'branch would lose money') {
      run.failures.push(`day ${run.state.day}: openBranch rejected: ${out.result.reason}`)
    }
  }
  for (const b of [...(run.state.branches ?? [])]) {
    const bp = blueprintOf(run.state, defs)
    if (sameBlueprint(bp, b.blueprint) || bp.value <= b.blueprint.value) continue
    if (refitProblem(run.state, defs, b.id) !== null) continue
    if (run.state.money - refitCost(run.state, defs, b) < reserve) continue
    const out = applyCommand(run.state, defs, { type: 'refitBranch', id: b.id })
    if (out.result.ok) {
      run.state = out.state
      bought.push(`refit${b.id}`)
    } else if (out.result.reason !== 'branch would lose money') {
      run.failures.push(`day ${run.state.day}: refitBranch ${b.id} rejected: ${out.result.reason}`)
    }
  }
}

export function runJourney(defs: Defs, seed: string, opts: PlayerOptions = {}): JourneyResult {
  const cautious = opts.cautious === true
  const maxDays = opts.maxDays ?? 40
  const PRIORITY = priority(opts.sharedInterval ?? 80)
  const usePass2 = opts.pass2 !== false
  const usePro = opts.pro !== false
  let proFryer = false
  let proFryerDay: number | null = null
  const FRIES2 = fries2(opts.sharedInterval ?? 80, usePass2)
  const run: Run = { state: createGame(defs, seed), defs, failures: [] }
  const built = new Set<string>()
  const failedProjects = new Set<string>()
  const goalDay: Record<string, number | null> = {}
  for (const g of defs.goals ?? []) goalDay[g.id] = null
  const days: DayLog[] = []
  let upgradeDay: number | null = null
  let restaurantSpent = 0
  let wonDay: number | null = null
  let chainDay: number | null = null
  let branchSpent = 0
  const branchDay: (number | null)[] = [null, null, null]
  const chain = opts.chain === true
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
    let moneyBefore = run.state.money
    // Upgrade first, as soon as it is allowed (cautious: with a margin).
    if (run.state.tier === 'stall' && upgradeProblem(run.state, defs) === null) {
      if (!cautious || run.state.money >= UPGRADE_COST + CAUTIOUS_RESERVE) {
        if (send(run, { type: 'upgradeTier' }, 'upgrade')) {
          bought.push('upgrade')
          upgradeDay = run.state.day
          spent = true
          moneyBefore = run.state.money // the tier fee is not counted as restaurant spending
        }
      }
    }
    // Second fryer when fries customers gave up yesterday (restaurant tier).
    // Pro fryer first (net cost: the pro price minus the 100% refund of the base fryer); the second line only
    // follows when fries customers still gave up after the pro fryer was in place (an earlier day).
    const proBeforeToday = proFryer
    if (usePro && !proFryer && run.state.tier === 'restaurant' && lastFriesPatience >= 2 && !(cautious && spent)) {
      const proCost = defs.buildings.fryer.pro?.cost ?? 0
      if (run.state.money - (proCost - defs.buildings.fryer.cost) >= reserveNow() && swapToProFryer(run)) {
        proFryer = true
        spent = true
        bought.push('pro:fryer')
        proFryerDay ??= run.state.day
      }
    }
    const wantFryer2 =
      secondFryer === 'always' || (secondFryer === 'auto' && lastFriesPatience >= 2 && (!usePro || proBeforeToday))
    if (run.state.tier === 'restaurant' && wantFryer2 && !(cautious && spent)) {
      if (usePass2 && tryBuild(PASS2, bought) === 'built') spent = true
      if (tryBuild(FRIES2, bought) === 'built') spent = true
    }
    for (const p of PRIORITY) {
      if (cautious && spent) break
      const r = tryBuild(p, bought)
      if (r === 'built') spent = true
      if (r === 'wait') break
    }
    // Restaurant upgrades, once every dish line is built and the reserve is kept.
    if (opts.upgrades !== false && run.state.tier === 'restaurant' && PRIORITY.every((p) => built.has(p.id) || failedProjects.has(p.id))) {
      for (const id of UPGRADE_ORDER) {
        if (run.state.upgrades?.includes(id) === true) continue
        if (cautious && spent) break
        const cost = defs.upgrades?.find((u) => u.id === id)?.cost
        if (cost === undefined || run.state.money - cost < reserveNow()) break
        if (!send(run, { type: 'buyUpgrade', id }, 'upgrade')) break
        bought.push(`upgrade:${id}`)
        spent = true
      }
    }
    syncMenu(run, built)
    noteGoals()
    let branchSpentToday = 0
    if (chain && run.state.won === true) {
      const money0 = run.state.money
      branchPolicy(run, bought, reserveNow(), branchDay)
      branchSpentToday = money0 - run.state.money
      branchSpent += branchSpentToday
    }
    const spentToday = run.state.tier === 'restaurant' ? moneyBefore - run.state.money : 0
    restaurantSpent += spentToday

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
    const trend = currentTrend(run.state, defs, d.day)
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
      trend,
      season: currentSeason(run.state, defs, d.day)?.id ?? null,
      trendServed: trend === null ? 0 : (d.byDish[trend]?.served ?? 0),
      critic: d.critic === undefined ? null : { stars: d.critic.stars, served: d.critic.served },
      repAtStart: run.state.repAtDayStart,
      bought,
      spent: spentToday,
      branchNets: (d.branches ?? []).map((b) => b.net),
      branchSpent: branchSpentToday,
    })
    if (run.state.money < 0) run.failures.push(`day ${d.day}: money is negative (${run.state.money})`)
    for (const m of run.state.menu) {
      const row = d.byDish[m.dish]
      if (d.customers >= 30 && (row === undefined || row.served === 0)) run.failures.push(`day ${d.day}: ${m.dish} sold 0 (on the menu)`)
    }
    if (run.state.phase === 'won') {
      if (run.state.chainWon === true) {
        chainDay ??= d.day
        wonDay ??= d.day
        break
      }
      wonDay ??= d.day
      if (opts.continueAfterWin !== true && !chain) break
    }
    if (!send(run, { type: 'dismissSummary' }, 'dismiss')) break
    run.state = resumeAfterDay(run.state, defs)
  }
  return {
    seed,
    days,
    goalDay,
    upgradeDay,
    proFryerDay,
    wonDay,
    chain,
    branchDay,
    chainDay,
    branchSpent,
    restaurantSpent,
    finalMoney: run.state.money,
    failures: run.failures,
    hash: stateHash(run.state),
    state: run.state,
  }
}
