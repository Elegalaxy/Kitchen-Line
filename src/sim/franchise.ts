// Franchise prestige (GAME_DESIGN 8.2, provisional, 2026-11-24). Pure functions over `MetaState`
// (meta progress across runs, saved under its own key) and `GameState`:
//   franchisePoints  the points a finished chain run is worth, with its four parts
//   canFranchise     chainWon and the build or won phase
//   recordFranchise  book the run: points, history, recipe book (stall dishes only)
//   buyPerk          spend points on the next level of a perk (permanent)
//   createRun        createGame plus the perks and the recipe book: the starting state only
// Blueprint library (2026-11-24): the run's `stallKit` (the stall kitchen at the restaurant upgrade) is saved
// by the player's choice into one of LIBRARY_SLOTS slots of `meta.library` (`recordFranchise` options); the
// `starterKit` perk installs the chosen saved kitchen (`meta.activeKit`, default the latest) free on day 1.
// An old meta with the single `starterKit` reads as library slot 1 (`libraryOf`).
// No tick rule: with an empty meta, or perks but no kit, `createRun` is exactly `createGame`.

import {
  FRANCHISE_BASE_SEED,
  MENU_CAP,
  PASS_MAX,
  START_HEIGHT,
  START_WIDTH,
  FRANCHISE_CHAIN_POINTS,
  FRANCHISE_EARNINGS_CAP,
  FRANCHISE_EARNINGS_STEP,
  FRANCHISE_HISTORY_MAX,
  FRANCHISE_REP_BASE,
  FRANCHISE_REP_POINTS,
  FRANCHISE_SPEED_CAP,
  FRANCHISE_SPEED_DAYS,
  LIBRARY_SLOTS,
} from './constants.ts'
import { reputationOf } from './customers.ts'
import { createGame } from './game.ts'
import { footprint } from './grid.ts'
import { priceProblem } from './menu.ts'
import type { Blueprint, Defs, DishId, GameState, LibraryEntry, MetaState, PerkDef } from './types.ts'

export type PointsPart = { id: 'chain' | 'earnings' | 'speed' | 'reputation'; label: string; points: number }
export type FranchisePoints = { total: number; parts: PointsPart[] }

/** `saveSlot`: the library slot (0-based) that takes this run's kitchen; null or absent: do not save it. */
export type RecordOptions = { saveSlot?: number | null }

export type FranchiseResult = { ok: true; meta: MetaState } | { ok: false; reason: string }

export function emptyMeta(): MetaState {
  return { runsCompleted: 0, points: 0, perks: {}, recipeBook: [], history: [] }
}

/**
 * The library as exactly LIBRARY_SLOTS slots (null = empty). An old meta's single `starterKit` is slot 1, as
 * run (last history run, or 1). Pure; does not change the meta.
 */
export function libraryOf(meta: MetaState): (LibraryEntry | null)[] {
  const slots: (LibraryEntry | null)[] = []
  for (let i = 0; i < LIBRARY_SLOTS; i += 1) slots.push(meta.library?.[i] ?? null)
  if (meta.library === undefined && meta.starterKit !== undefined) {
    slots[0] = { run: meta.history[meta.history.length - 1]?.run ?? 1, kit: meta.starterKit }
  }
  return slots
}

/** The most recently saved slot (highest run, a tie goes to the later slot), or null when the library is empty. */
export function latestSlot(library: (LibraryEntry | null)[]): number | null {
  let best: number | null = null
  let bestRun = -1
  for (let i = 0; i < library.length; i += 1) {
    const e = library[i]
    if (e !== null && e.run >= bestRun) {
      best = i
      bestRun = e.run
    }
  }
  return best
}

/** The kitchen the next run starts with: the player's choice (`activeKit`; null = none), else the latest saved. */
export function activeKitOf(meta: MetaState): Blueprint | undefined {
  const lib = libraryOf(meta)
  if (meta.activeKit === null) return undefined
  const slot = meta.activeKit ?? latestSlot(lib)
  return slot === null ? undefined : lib[slot]?.kit
}

/** Choose the kitchen that starts the next run: a slot, null for none, undefined for the default (latest saved). */
export function chooseKit(meta: MetaState, slot: number | null | undefined): FranchiseResult {
  const next = { ...meta }
  if (slot === undefined) delete next.activeKit
  else if (slot === null) next.activeKit = null
  else if (libraryOf(meta)[slot]?.kit === undefined) return { ok: false, reason: 'no saved kitchen in that slot' }
  else next.activeKit = slot
  return { ok: true, meta: next }
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** What a finished run is worth. Before `chainWon` the chain part is 0. */
export function franchisePoints(state: GameState): FranchisePoints {
  const chain = state.chainWon === true ? FRANCHISE_CHAIN_POINTS : 0
  const earned = state.totals.profit + (state.chainProfit ?? 0)
  const earnings = clamp(Math.floor(earned / FRANCHISE_EARNINGS_STEP), 0, FRANCHISE_EARNINGS_CAP)
  const speed = clamp(FRANCHISE_SPEED_DAYS - state.totals.days, 0, FRANCHISE_SPEED_CAP)
  const stars = Math.floor(reputationOf(state) + 1e-9) - FRANCHISE_REP_BASE
  const reputation = Math.max(0, stars * FRANCHISE_REP_POINTS)
  const parts: PointsPart[] = [
    { id: 'chain', label: 'Chain built', points: chain },
    { id: 'earnings', label: 'Earnings', points: earnings },
    { id: 'speed', label: 'Speed', points: speed },
    { id: 'reputation', label: 'Reputation', points: reputation },
  ]
  return { total: chain + earnings + speed + reputation, parts }
}

/** The chain is built and the player is between days (build) or on the end screen (won). */
export function canFranchise(state: GameState): boolean {
  return state.chainWon === true && (state.phase === 'build' || state.phase === 'won')
}

/** Run 1 keeps the base seed; run N is the base seed plus "-runN". */
export function runSeed(base: string, run: number): string {
  return run <= 1 ? base : `${base}-run${run}`
}

/** Dishes the recipe book may hold: known and without a tier requirement (stall dishes). */
function bookable(defs: Defs, id: DishId): boolean {
  const d = defs.dishes[id]
  return d !== undefined && d.requiresTier === undefined
}

/**
 * Book the finished run: add its points, append it to the history (newest last, at most
 * FRANCHISE_HISTORY_MAX), and merge its unlocked stall dishes into the recipe book. Refused when the
 * chain is not built, or when the history already holds this state's seed (a reloaded tab cannot pay twice).
 */
export function recordFranchise(meta: MetaState, state: GameState, defs: Defs, options: RecordOptions = {}): FranchiseResult {
  if (!canFranchise(state)) return { ok: false, reason: 'chain not built yet' }
  if (meta.history.some((h) => h.seed === state.seed)) return { ok: false, reason: 'this run is already franchised' }
  const slot = options.saveSlot ?? null
  if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot >= LIBRARY_SLOTS)) return { ok: false, reason: 'bad library slot' }
  const points = franchisePoints(state).total
  const book = [...meta.recipeBook]
  for (const id of state.unlocked) if (bookable(defs, id) && !book.includes(id)) book.push(id)
  const history = [
    ...meta.history,
    {
      run: meta.runsCompleted + 1,
      seed: state.seed,
      days: state.totals.days,
      profit: state.totals.profit,
      chainProfit: state.chainProfit ?? 0,
      points,
    },
  ].slice(-FRANCHISE_HISTORY_MAX)
  const next: MetaState = {
    ...meta,
    runsCompleted: meta.runsCompleted + 1,
    points: meta.points + points,
    recipeBook: book,
    history,
  }
  // The kitchen is saved only when the player picked a slot (it may overwrite what is there); a run that never
  // upgraded has no kit. A legacy single kit moves into the library.
  delete next.starterKit
  const library = libraryOf(meta)
  if (slot !== null && state.stallKit !== undefined) library[slot] = { run: meta.runsCompleted + 1, kit: structuredClone(state.stallKit) }
  if (library.some((e) => e !== null)) next.library = library
  return { ok: true, meta: next }
}

function perkOf(defs: Defs, id: string): PerkDef | undefined {
  return defs.perks?.find((p) => p.id === id)
}

/** Price in points of the next level of a perk; null when unknown or already at its top level. */
export function perkCost(meta: MetaState, defs: Defs, id: string): number | null {
  const perk = perkOf(defs, id)
  if (perk === undefined) return null
  const cost = perk.costs[meta.perks[id] ?? 0]
  return cost ?? null
}

/** Buy the next level of a perk. Points are spent; levels are permanent. */
export function buyPerk(meta: MetaState, defs: Defs, id: string): FranchiseResult {
  const perk = perkOf(defs, id)
  if (perk === undefined) return { ok: false, reason: 'unknown perk' }
  // The starter kitchen is only worth points once a kitchen is saved (a franchise out books its save first).
  if (perk.effect.starterKit === true && libraryOf(meta).every((e) => e === null)) return { ok: false, reason: 'no saved kitchen yet' }
  const cost = perkCost(meta, defs, id)
  if (cost === null) return { ok: false, reason: 'already at the top level' }
  if (meta.points < cost) return { ok: false, reason: `needs ${cost} points` }
  return {
    ok: true,
    meta: { ...meta, points: meta.points - cost, perks: { ...meta.perks, [id]: (meta.perks[id] ?? 0) + 1 } },
  }
}

/** Sum of one effect field over all bought levels. */
function perkTotal(meta: MetaState, defs: Defs, field: 'startMoney' | 'goodRatings' | 'startExpansion' | 'starterKit'): number {
  let sum = 0
  for (const perk of defs.perks ?? []) {
    const level = Math.min(meta.perks[perk.id] ?? 0, perk.costs.length)
    const v = perk.effect[field]
    sum += level * (typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? 0))
  }
  return sum
}

/** Total value (cents) of a starter kitchen's buildings, for the Franchise modal. */
export function starterKitSummary(kit: Blueprint): { buildings: number; value: number } {
  return { buildings: Object.keys(kit.buildings).length, value: kit.value }
}

/** The grid size of expansion step `n` (0 = the start grid of `start`), or null when it is not a stall step. */
function stallSize(defs: Defs, start: { width: number; height: number }, n: number): { width: number; height: number } | null {
  if (!Number.isInteger(n) || n < 0) return null
  if (n === 0) return start
  const step = defs.expansions?.[n - 1]
  return step !== undefined && step.requiresTier === 'stall' ? { width: step.width, height: step.height } : null
}

/**
 * Why a saved kitchen cannot be installed on a fresh stall of size `start`, or null when it fits. Defensive
 * (the meta file is data from disk): a stall grid size, tiles consistent with the footprints, stall buildings
 * only (no fast belt, no pro station, at most the one pre-placed pass).
 */
export function starterKitProblem(defs: Defs, kit: Blueprint, start: { width: number; height: number }): string | null {
  const size = stallSize(defs, start, kit.expansion)
  if (size === null) return 'expansion is not a stall one'
  if (kit.width !== size.width || kit.height !== size.height) return 'grid size does not match its expansion'
  if (!Array.isArray(kit.tiles) || kit.tiles.length !== kit.width * kit.height) return 'tile count mismatch'
  const expected = new Array<number | null>(kit.tiles.length).fill(null)
  let passes = 0
  for (const [key, b] of Object.entries(kit.buildings)) {
    const def = defs.buildings[b.kind]
    if (def === undefined || Number(key) !== b.id || !Number.isInteger(b.id) || b.id < 1) return 'unknown building'
    if (b.kind === 'pass') passes += 1
    else if (def.requiresTier !== 'stall') return 'not a stall building'
    if (b.kind === 'belt' && b.fast) return 'not a stall building'
    if ((b.kind === 'fryer' || b.kind === 'stove' || b.kind === 'assembler') && b.pro === true) return 'not a stall building'
    for (const t of footprint(b.kind, b.x, b.y, b.dir)) {
      if (t.x < 0 || t.y < 0 || t.x >= kit.width || t.y >= kit.height) return 'building out of bounds'
      const at = t.y * kit.width + t.x
      if (expected[at] !== null) return 'buildings overlap'
      expected[at] = b.id
    }
  }
  if (passes >= PASS_MAX) return 'too many passes'
  for (let i = 0; i < expected.length; i += 1) if (expected[i] !== kit.tiles[i]) return 'tiles do not match buildings'
  return null
}

/** Whether a saved kitchen can be installed on a new run's stall (the check `createRun` itself makes). */
export function kitFits(defs: Defs, kit: Blueprint): boolean {
  return starterKitProblem(defs, kit, { width: START_WIDTH, height: START_HEIGHT }) === null
}

/**
 * Install the saved stall kitchen into a fresh run (free: the points were the price). The kitchen replaces the
 * pre-placed pass and pantry; the grid is the larger of the kit's and the state's (a bigger-stall perk keeps its
 * room); the menu keeps the kit's prices for stall dishes; the unlocked stall dishes are added. Installs nothing
 * (and never throws) when the kit does not fit.
 */
function installStarterKit(state: GameState, defs: Defs, kit: Blueprint): void {
  const start = { width: state.width, height: state.height }
  const base = { width: START_WIDTH, height: START_HEIGHT }
  if (starterKitProblem(defs, kit, base) !== null) return
  const target = Math.max(state.expansion, kit.expansion)
  const size = stallSize(defs, base, target)
  if (size === null || size.width < start.width || size.height < start.height) return
  const tiles = new Array<number | null>(size.width * size.height).fill(null)
  for (let t = 0; t < kit.tiles.length; t += 1) {
    const id = kit.tiles[t]
    if (id !== null) tiles[Math.floor(t / kit.width) * size.width + (t % kit.width)] = id
  }
  const buildings = structuredClone(kit.buildings)
  state.width = size.width
  state.height = size.height
  state.expansion = target
  state.tiles = tiles
  state.buildings = buildings
  state.nextId = Math.max(0, ...Object.keys(buildings).map(Number)) + 1
  for (const id of kit.unlocked) {
    if (bookable(defs, id) && !state.unlocked.includes(id)) state.unlocked.push(id)
  }
  const menu: { dish: DishId; price: number }[] = []
  for (const m of kit.menu) {
    const dish = defs.dishes[m.dish]
    if (dish === undefined || !bookable(defs, m.dish) || !state.unlocked.includes(m.dish)) continue
    if (menu.some((e) => e.dish === m.dish) || menu.length >= MENU_CAP.stall) continue
    menu.push({ dish: m.dish, price: priceProblem(dish.refPrice, m.price) === null ? m.price : dish.refPrice })
  }
  if (menu.length > 0) state.menu = menu
}

/**
 * Mutates a fresh `createGame` state: start cash, good starting ratings, the recipe book as unlocked
 * dishes, the free expansion steps, events cleared. Does nothing for an empty meta.
 */
export function applyFranchiseStart(state: GameState, defs: Defs, meta: MetaState): void {
  state.money += perkTotal(meta, defs, 'startMoney')
  const good = Math.min(state.ratings.length, perkTotal(meta, defs, 'goodRatings'))
  if (good > 0) {
    for (let i = 0; i < good; i += 1) state.ratings[i] = 4
    state.repAtDayStart = reputationOf(state)
  }
  for (const id of meta.recipeBook) {
    if (bookable(defs, id) && !state.unlocked.includes(id)) state.unlocked.push(id)
  }
  const steps = perkTotal(meta, defs, 'startExpansion')
  for (let i = 0; i < steps; i += 1) {
    const step = defs.expansions?.[state.expansion]
    if (step === undefined || step.requiresTier !== 'stall') break
    const tiles = new Array<number | null>(step.width * step.height).fill(null)
    for (let t = 0; t < state.tiles.length; t += 1) {
      const id = state.tiles[t]
      if (id !== null) tiles[Math.floor(t / state.width) * step.width + (t % state.width)] = id
    }
    state.tiles = tiles
    state.width = step.width
    state.height = step.height
    state.expansion += 1
  }
  const kit = activeKitOf(meta)
  if (kit !== undefined && perkTotal(meta, defs, 'starterKit') > 0) installStarterKit(state, defs, kit)
  state.events = []
}

/** A new run: run `meta.runsCompleted + 1`, its seed, and the perks applied. Empty meta equals `createGame`. */
export function createRun(defs: Defs, baseSeed: string = FRANCHISE_BASE_SEED, meta: MetaState = emptyMeta()): GameState {
  const state = createGame(defs, runSeed(baseSeed, meta.runsCompleted + 1))
  applyFranchiseStart(state, defs, meta)
  return state
}
