// View helper for the Franchise modal and the "Chain built" preview (GAME_DESIGN 8.2): the points
// breakdown, the perk cards with their next cost and effect, the balance after the picks, and what is
// kept. `picks` is the list of perk ids chosen in the modal (one id per level, in order); nothing is
// bought until the player confirms (session.franchiseOut). Pure and unit-tested.

import { buyPerk, canFranchise, franchisePoints, perkCost, recordFranchise } from '../sim/franchise.ts'
import type { Defs, GameState, MetaState, PerkDef } from '../sim/types.ts'
import { formatMoney } from './format.ts'

export type PointsRow = { id: string; label: string; text: string }

export type PerkCardView = {
  id: string
  name: string
  emoji: string
  level: number
  maxLevel: number
  /** "Level 1 / 3", or "Maxed (3 / 3)". */
  levelText: string
  /** Levels picked in this modal and not yet confirmed. */
  pending: number
  /** Cost of the next level, or null at the top level. */
  nextCost: number | null
  costText: string
  /** What the next level does ("+$250 start cash"), or null at the top level. */
  nextEffect: string | null
  /** Effect of the levels owned so far, "None yet" at level 0. */
  currentEffect: string
  canBuy: boolean
  /** Why Buy is disabled (null when it is enabled). */
  reason: string | null
}

export type FranchiseView = {
  /** The number of the run that starts next. */
  nextRun: number
  rows: PointsRow[]
  earned: number
  /** Points held before this franchise, the points after it, the points spent on picks, and what is left. */
  balanceBefore: number
  available: number
  spent: number
  left: number
  cards: PerkCardView[]
  /** Dish names in the recipe book after this franchise. */
  bookNames: string[]
  /** "Recipe book: 3 dishes" */
  bookText: string
  /** One line per kept thing, for the confirm summary and the end-screen preview. */
  kept: string[]
  /** Why franchising is not possible now, or null. */
  blocked: string | null
  startLabel: string
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** Text for one level of a perk, built from its effect numbers. */
export function effectText(perk: PerkDef, level: number, defs: Defs): string {
  const e = perk.effect
  const parts: string[] = []
  if (e.startMoney !== undefined) parts.push(`+${formatMoney(e.startMoney * level)} start cash`)
  if (e.goodRatings !== undefined) parts.push(`${e.goodRatings * level} of the 10 starting ratings are 4 stars`)
  if (e.startExpansion !== undefined) {
    const step = defs.expansions?.[e.startExpansion * level - 1]
    parts.push(step === undefined ? `${plural(e.startExpansion * level, 'free expansion')}` : `Start with a ${step.width} × ${step.height} kitchen`)
  }
  return parts.join(', ')
}

function projected(meta: MetaState, state: GameState, defs: Defs, picks: string[]): { meta: MetaState; applied: string[] } {
  const booked = recordFranchise(meta, state, defs)
  let cur: MetaState = booked.ok ? booked.meta : { ...meta, points: meta.points + franchisePoints(state).total }
  const applied: string[] = []
  for (const id of picks) {
    const out = buyPerk(cur, defs, id)
    if (!out.ok) continue
    cur = out.meta
    applied.push(id)
  }
  return { meta: cur, applied }
}

export function franchiseView(state: GameState, meta: MetaState, defs: Defs, picks: string[]): FranchiseView {
  const fp = franchisePoints(state)
  const rows: PointsRow[] = fp.parts.map((p) => ({ id: p.id, label: p.label, text: `+${p.points}` }))
  const booked = projected(meta, state, defs, [])
  const after = projected(meta, state, defs, picks)
  const spent = booked.meta.points - after.meta.points
  const perks = defs.perks ?? []
  const cards: PerkCardView[] = perks.map((perk) => {
    const base = meta.perks[perk.id] ?? 0
    const pending = after.applied.filter((id) => id === perk.id).length
    const level = Math.min(base + pending, perk.costs.length)
    const nextCost = perkCost(after.meta, defs, perk.id)
    const maxed = nextCost === null
    const short = !maxed && after.meta.points < nextCost
    return {
      id: perk.id,
      name: perk.name,
      emoji: perk.emoji,
      level,
      maxLevel: perk.costs.length,
      levelText: maxed ? `Maxed (${level} / ${perk.costs.length})` : `Level ${level} / ${perk.costs.length}`,
      pending,
      nextCost,
      costText: maxed ? '–' : `${nextCost} points`,
      nextEffect: maxed ? null : effectText(perk, level + 1, defs),
      currentEffect: level === 0 ? 'None yet' : effectText(perk, level, defs),
      canBuy: !maxed && !short,
      reason: maxed ? 'Top level reached' : short ? `Needs ${nextCost - after.meta.points} more points` : null,
    }
  })
  const bookNames = after.meta.recipeBook.map((id) => defs.dishes[id]?.name ?? id)
  const bookText = `Recipe book: ${plural(bookNames.length, 'dish', 'dishes')}`
  const perkLines = cards.filter((c) => c.level > 0).map((c) => `${c.name} level ${c.level}`)
  const nextRun = meta.runsCompleted + 2
  const dup = meta.history.some((h) => h.seed === state.seed)
  return {
    nextRun,
    rows,
    earned: fp.total,
    balanceBefore: meta.points,
    available: booked.meta.points,
    spent,
    left: after.meta.points,
    cards,
    bookNames,
    bookText,
    kept: [bookText, perkLines.length === 0 ? 'Perks: none yet' : `Perks: ${perkLines.join(', ')}`, `Points left: ${after.meta.points}`],
    blocked: dup ? 'This run is already franchised' : canFranchise(state) ? null : 'Build the chain first',
    startLabel: `Sell chain and start run ${nextRun}`,
  }
}
