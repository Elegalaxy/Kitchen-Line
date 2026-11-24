// Harness side of the franchise prestige (GAME_DESIGN 8.2): the scripted player's spend policy and
// the `--meta` journey (run 1 to the chain end screen, franchise, run 2 and optionally run 3 on the
// next run seed with the perks). Pure: no console, clock or process.
//
// Spend policy (documented, harness only): repeatedly buy the next level of the FIRST perk in the order
// seedMoney, goodName, biggerStall whose next level is affordable (an unaffordable level is skipped, not
// saved for). With the typical 32 to 37 points that is seed money 3 (27) plus good name 1 (5).
// (A first try, "cheapest affordable level first", bought good name 2 + seed money 2 and was slower.)
// With the starter kitchen (`--meta` default, `--no-starterkit` turns it off) the order is starterKit first, then
// the three above: the kitchen is bought once a run has saved one (buyPerk refuses it before that).
// Blueprint library: each run's kitchen is saved into the first free slot (none free: the library is kept) and
// the most recently saved one starts the next run.

import { activeKitOf, buyPerk, emptyMeta, franchisePoints, libraryOf, perkCost, recordFranchise } from '../sim/franchise.ts'
import type { FranchisePoints } from '../sim/franchise.ts'
import type { Defs, MetaState } from '../sim/types.ts'
import { runJourney } from './player.ts'
import type { JourneyResult, PlayerOptions } from './player.ts'

/** Priority order of the spend policy. */
export const SPEND_ORDER = ['seedMoney', 'goodName', 'biggerStall']

/** The order with the starter kitchen first (the `--meta` default). */
export const KIT_SPEND_ORDER = ['starterKit', ...SPEND_ORDER]
/** Only the starter kitchen (to measure what it is worth on its own; the other points stay unspent). */
export const KIT_ONLY_ORDER = ['starterKit']

/** Spend the points by the policy above; returns the new meta and the perk ids bought, in order. */
export function spendPoints(meta: MetaState, defs: Defs, order: string[] = SPEND_ORDER): { meta: MetaState; bought: string[] } {
  let current = meta
  const bought: string[] = []
  for (;;) {
    const best =
      order.find((id) => {
        const cost = perkCost(current, defs, id)
        return cost !== null && cost <= current.points && buyPerk(current, defs, id).ok
      }) ?? null
    if (best === null) return { meta: current, bought }
    const r = buyPerk(current, defs, best)
    if (!r.ok) return { meta: current, bought }
    current = r.meta
    bought.push(best)
  }
}

export type MetaSeed = {
  /** The base seed (journey-N); run k plays on runSeed(base, k). */
  base: string
  /** One result per run played (run 1 first). */
  runs: JourneyResult[]
  /** Points earned by each franchised run (the last run is not franchised). */
  earned: FranchisePoints[]
  /** Perk ids bought after each franchised run. */
  bought: string[][]
  /** Points left unspent after each franchise. */
  left: number[]
  /** The library after each franchise: the run number saved in each slot (null = empty). */
  library: (number | null)[][]
  /** The run whose kitchen starts the next run after each franchise (null: none, or the perk is not owned). */
  startedWith: (number | null)[]
  /** Why a run could not be franchised (the chain end screen was not reached), or null. */
  problem: string | null
}

export type MetaOptions = PlayerOptions & { seeds: number; runs: number; seedPrefix?: string; starterKit?: boolean; kitOnly?: boolean }

/** One seed: play run 1 (chain on), franchise, spend, play run 2 (and 3). */
export function runMetaSeed(defs: Defs, base: string, opts: PlayerOptions, runs: number, order: string[] = SPEND_ORDER): MetaSeed {
  let meta = emptyMeta()
  const out: MetaSeed = { base, runs: [], earned: [], bought: [], left: [], library: [], startedWith: [], problem: null }
  for (let run = 1; run <= runs; run += 1) {
    const r = runJourney(defs, base, { ...opts, chain: true, meta: run === 1 ? undefined : meta })
    out.runs.push(r)
    if (run === runs) break
    // Library policy: the run's kitchen goes into the first free slot (a full library stays as it is); the next run
    // starts with the most recently saved kitchen (the default choice).
    const free = libraryOf(meta).findIndex((e) => e === null)
    const rec = recordFranchise(meta, r.state, defs, { saveSlot: free < 0 ? null : free })
    if (!rec.ok) {
      out.problem = `run ${run}: ${rec.reason}`
      break
    }
    out.earned.push(franchisePoints(r.state))
    const spent = spendPoints(rec.meta, defs, order)
    meta = spent.meta
    out.bought.push(spent.bought)
    out.left.push(meta.points)
    const lib = libraryOf(meta)
    out.library.push(lib.map((e) => e?.run ?? null))
    const kit = (meta.perks.starterKit ?? 0) > 0 ? activeKitOf(meta) : undefined
    out.startedWith.push(lib.find((e) => e !== null && e.kit === kit)?.run ?? null)
  }
  return out
}

export function runMetaSet(defs: Defs, opts: MetaOptions): MetaSeed[] {
  const prefix = opts.seedPrefix ?? 'journey'
  const result: MetaSeed[] = []
  const order = opts.kitOnly === true ? KIT_ONLY_ORDER : opts.starterKit === false ? SPEND_ORDER : KIT_SPEND_ORDER
  for (let i = 1; i <= opts.seeds; i += 1) result.push(runMetaSeed(defs, `${prefix}-${i}`, opts, opts.runs, order))
  return result
}

const pad = (s: string, n: number): string => s.padStart(n)

/** FP per seed with its parts, the perks bought and the points left, then the medians. */
export function formatMetaPoints(sets: MetaSeed[]): string[] {
  const lines = ['franchise points after run 1 (chain / earnings / speed / reputation), perks bought, points left']
  for (const s of sets) {
    const e = s.earned[0]
    if (e === undefined) {
      lines.push(`${s.base.padEnd(12)}${s.problem ?? 'not franchised'}`)
      continue
    }
    const parts = e.parts.map((p) => String(p.points)).join('/')
    lines.push(`${s.base.padEnd(12)}${pad(String(e.total), 3)} FP (${parts})  bought ${s.bought[0].join(', ') || 'nothing'}; left ${s.left[0]}`)
  }
  const totals = sets.flatMap((s) => (s.earned[0] === undefined ? [] : [s.earned[0].total])).sort((a, b) => a - b)
  if (totals.length > 0) {
    const spent = sets.flatMap((s) => (s.earned[0] === undefined ? [] : [s.earned[0].total - s.left[0]])).sort((a, b) => a - b)
    const mid = (v: number[]): number => v[Math.floor((v.length - 1) / 2)]
    lines.push(`FP earned: median ${mid(totals)}, min ${totals[0]}, max ${totals[totals.length - 1]}; points spent: median ${mid(spent)}, min ${spent[0]}, max ${spent[spent.length - 1]}`)
  }
  return lines
}

/** Per seed and franchise: the library slots (run numbers) and which run's kitchen the next run starts with. */
export function formatMetaLibrary(sets: MetaSeed[]): string[] {
  const lines = ['blueprint library after each franchise (run number in each of the slots, - = empty), kitchen the next run starts with']
  for (const s of sets) {
    const parts = s.library.map((slots, k) => {
      const used = s.startedWith[k]
      return `after run ${k + 1}: [${slots.map((r) => (r === null ? '-' : String(r))).join(' ')}] -> run ${k + 2} ${used === null ? 'starts empty' : `starts with run ${used}`}`
    })
    lines.push(`${s.base.padEnd(12)}${parts.length === 0 ? (s.problem ?? 'not franchised') : parts.join('; ')}`)
  }
  return lines
}

/** Median of the non-null values, or null. */
function medianOf(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b)
  return v.length === 0 ? null : v[Math.floor((v.length - 1) / 2)]
}

/** Run k medians: restaurant end screen day, chain end screen day, total days played. */
export function formatMetaMedians(sets: MetaSeed[], runs: number): string[] {
  const lines: string[] = []
  for (let k = 0; k < runs; k += 1) {
    const rs = sets.flatMap((s) => (s.runs[k] === undefined ? [] : [s.runs[k]]))
    const fmt = (v: number | null): string => (v === null ? '-' : String(v))
    lines.push(
      `run ${k + 1} medians over ${rs.length} seeds: restaurant end screen day ${fmt(medianOf(rs.map((r) => r.wonDay)))}, ` +
        `chain end screen day ${fmt(medianOf(rs.map((r) => r.chainDay)))}, total days ${fmt(medianOf(rs.map((r) => r.days.length)))}`,
    )
  }
  return lines
}

