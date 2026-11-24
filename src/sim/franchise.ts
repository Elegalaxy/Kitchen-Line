// Franchise prestige (GAME_DESIGN 8.2, provisional, 2026-11-24). Pure functions over `MetaState`
// (meta progress across runs, saved under its own key) and `GameState`:
//   franchisePoints  the points a finished chain run is worth, with its four parts
//   canFranchise     chainWon and the build or won phase
//   recordFranchise  book the run: points, history, recipe book (stall dishes only)
//   buyPerk          spend points on the next level of a perk (permanent)
//   createRun        createGame plus the perks and the recipe book: the starting state only
// No new GameState field and no tick rule: with an empty meta `createRun` is exactly `createGame`.

import {
  FRANCHISE_BASE_SEED,
  FRANCHISE_CHAIN_POINTS,
  FRANCHISE_EARNINGS_CAP,
  FRANCHISE_EARNINGS_STEP,
  FRANCHISE_HISTORY_MAX,
  FRANCHISE_REP_BASE,
  FRANCHISE_REP_POINTS,
  FRANCHISE_SPEED_CAP,
  FRANCHISE_SPEED_DAYS,
} from './constants.ts'
import { reputationOf } from './customers.ts'
import { createGame } from './game.ts'
import type { Defs, DishId, GameState, MetaState, PerkDef } from './types.ts'

export type PointsPart = { id: 'chain' | 'earnings' | 'speed' | 'reputation'; label: string; points: number }
export type FranchisePoints = { total: number; parts: PointsPart[] }

export type FranchiseResult = { ok: true; meta: MetaState } | { ok: false; reason: string }

export function emptyMeta(): MetaState {
  return { runsCompleted: 0, points: 0, perks: {}, recipeBook: [], history: [] }
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
export function recordFranchise(meta: MetaState, state: GameState, defs: Defs): FranchiseResult {
  if (!canFranchise(state)) return { ok: false, reason: 'chain not built yet' }
  if (meta.history.some((h) => h.seed === state.seed)) return { ok: false, reason: 'this run is already franchised' }
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
  return {
    ok: true,
    meta: { ...meta, runsCompleted: meta.runsCompleted + 1, points: meta.points + points, recipeBook: book, history },
  }
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
  if (perkOf(defs, id) === undefined) return { ok: false, reason: 'unknown perk' }
  const cost = perkCost(meta, defs, id)
  if (cost === null) return { ok: false, reason: 'already at the top level' }
  if (meta.points < cost) return { ok: false, reason: `needs ${cost} points` }
  return {
    ok: true,
    meta: { ...meta, points: meta.points - cost, perks: { ...meta.perks, [id]: (meta.perks[id] ?? 0) + 1 } },
  }
}

/** Sum of one effect field over all bought levels. */
function perkTotal(meta: MetaState, defs: Defs, field: 'startMoney' | 'goodRatings' | 'startExpansion'): number {
  let sum = 0
  for (const perk of defs.perks ?? []) {
    const level = Math.min(meta.perks[perk.id] ?? 0, perk.costs.length)
    sum += level * (perk.effect[field] ?? 0)
  }
  return sum
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
  state.events = []
}

/** A new run: run `meta.runsCompleted + 1`, its seed, and the perks applied. Empty meta equals `createGame`. */
export function createRun(defs: Defs, baseSeed: string = FRANCHISE_BASE_SEED, meta: MetaState = emptyMeta()): GameState {
  const state = createGame(defs, runSeed(baseSeed, meta.runsCompleted + 1))
  applyFranchiseStart(state, defs, meta)
  return state
}
