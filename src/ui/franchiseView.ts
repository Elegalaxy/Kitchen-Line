// View helper for the Franchise modal and the "Chain built" preview (GAME_DESIGN 8.2): the points
// breakdown, the perk cards with their next cost and effect, the balance after the picks, and what is
// kept, and the blueprint library (which slot takes this run's kitchen, which saved kitchen starts the next
// run). `picks` is the list of perk ids chosen in the modal (one id per level, in order); nothing is
// bought or saved until the player confirms (session.franchiseOut). Pure and unit-tested.

import { buyPerk, canFranchise, franchisePoints, kitFits, latestSlot, libraryOf, perkCost, recordFranchise, starterKitSummary } from '../sim/franchise.ts'
import type { Blueprint, Defs, GameState, LibraryEntry, MetaState, PerkDef } from '../sim/types.ts'
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
  /** Starter kitchen perk only: "12 buildings, value $155.00", or "None saved yet"; null on other perks. */
  kitText: string | null
  canBuy: boolean
  /** Why Buy is disabled (null when it is enabled). */
  reason: string | null
}

/** The player's two library choices in the modal; undefined means "the default". */
export type KitChoices = {
  /** Slot that takes this run's kitchen; null = don't save. Default: the first empty slot, else don't save. */
  saveSlot?: number | null
  /** Slot that starts the next run; null = none. Default: the most recently saved. */
  useSlot?: number | null
}

/** One library slot as the modal shows it. */
export type SlotView = {
  slot: number
  name: string
  text: string
  empty: boolean
  /** The saved kitchen cannot be built in this version (it would start the run empty), else null. */
  warning: string | null
}

export const STALE_KIT_WARNING = "Doesn't fit this version, so it can't start a run"


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
  /** This run's kitchen ("21 buildings, value $607.00"), or null when the run never upgraded (no save choice). */
  runKitText: string | null
  /** The slots this run's kitchen could go into (what is there now), and the selected one (null = don't save). */
  saveSlots: SlotView[]
  saveSelected: number | null
  /** The saved kitchens after this franchise (the choices for the next run), and the selected one (null = none). */
  useSlots: SlotView[]
  useSelected: number | null
  /** The Starter kitchen perk is owned after the picks, so the player chooses which kitchen starts the next run. */
  kitOwned: boolean
  /** What is being decided, repeated in the confirm dialog. */
  confirmRows: { label: string; value: string }[]
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
  if (e.starterKit === true) parts.push('Your saved stall kitchen, built free on day 1')
  return parts.join(', ')
}

/** "Run 2, fries + salad, 21 buildings, value $607.00" (dishes from the menu, else the unlocked ones). */
export function kitLabel(entry: LibraryEntry, defs: Defs): string {
  const ids = entry.kit.menu.length > 0 ? entry.kit.menu.map((m) => m.dish) : entry.kit.unlocked
  const names = ids.map((id) => (defs.dishes[id]?.name ?? id).toLowerCase())
  const s = starterKitSummary(entry.kit)
  return `Run ${entry.run}, ${names.length === 0 ? 'no dishes' : names.join(' + ')}, ${plural(s.buildings, 'building')}, value ${formatMoney(s.value)}`
}

function kitText(kit: Blueprint): string {
  const s = starterKitSummary(kit)
  return `${plural(s.buildings, 'building')}, value ${formatMoney(s.value)}`
}

function slotViews(library: (LibraryEntry | null)[], defs: Defs): SlotView[] {
  return library.map((e, slot) => ({
    slot,
    name: `Slot ${slot + 1}`,
    text: e === null ? 'Empty' : kitLabel(e, defs),
    empty: e === null,
    warning: e === null || kitFits(defs, e.kit) ? null : STALE_KIT_WARNING,
  }))
}

function projected(
  meta: MetaState,
  state: GameState,
  defs: Defs,
  picks: string[],
  saveSlot: number | null,
): { meta: MetaState; applied: string[] } {
  const booked = recordFranchise(meta, state, defs, { saveSlot })
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

export function franchiseView(state: GameState, meta: MetaState, defs: Defs, picks: string[], choices: KitChoices = {}): FranchiseView {
  const fp = franchisePoints(state)
  const before = libraryOf(meta)
  const firstEmpty = before.findIndex((e) => e === null)
  const wanted = choices.saveSlot === undefined ? (firstEmpty < 0 ? null : firstEmpty) : choices.saveSlot
  const saveSelected = state.stallKit === undefined || wanted === null || wanted < 0 || wanted >= before.length ? null : wanted
  const rows: PointsRow[] = fp.parts.map((p) => ({ id: p.id, label: p.label, text: `+${p.points}` }))
  const booked = projected(meta, state, defs, [], saveSelected)
  const after = projected(meta, state, defs, picks, saveSelected)
  const library = libraryOf(after.meta)
  const usable = library.map((e) => (e !== null && kitFits(defs, e.kit) ? e : null))
  const useWanted = choices.useSlot === undefined ? latestSlot(usable) : choices.useSlot
  const useSelected = useWanted === null || usable[useWanted] == null ? null : useWanted
  const spent = booked.meta.points - after.meta.points
  const perks = defs.perks ?? []
  const cards: PerkCardView[] = perks.map((perk) => {
    const base = meta.perks[perk.id] ?? 0
    const pending = after.applied.filter((id) => id === perk.id).length
    const level = Math.min(base + pending, perk.costs.length)
    const nextCost = perkCost(after.meta, defs, perk.id)
    const maxed = nextCost === null
    const short = !maxed && after.meta.points < nextCost
    const needsKit = perk.effect.starterKit === true
    const saved = library.filter((e) => e !== null).length
    const noKit = needsKit && saved === 0
    const noFit = needsKit && saved > 0 && usable.every((e) => e === null)
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
      // `saved` counts the kitchen waiting to be saved, so say so while the slot lists still show it as empty.
      kitText: !needsKit ? null : saved === 0 ? 'None saved yet' : `${saved} of ${library.length} slots used${saveSelected === null ? '' : ' after saving'}`,
      canBuy: !maxed && !short && !noKit && !noFit,
      reason: maxed
        ? 'Top level reached'
        : noKit
          ? 'Upgrade to a restaurant in a run first'
          : noFit
            ? 'No saved kitchen fits this version'
          : short
            ? `Needs ${nextCost - after.meta.points} more points`
            : null,
    }
  })
  const bookNames = after.meta.recipeBook.map((id) => defs.dishes[id]?.name ?? id)
  const bookText = `Recipe book: ${plural(bookNames.length, 'dish', 'dishes')}`
  const perkLines = cards.filter((c) => c.level > 0).map((c) => `${c.name} level ${c.level}`)
  const nextRun = meta.runsCompleted + 2
  const dup = meta.history.some((h) => h.seed === state.seed)
  const kitOwned = cards.some((c) => c.id === 'starterKit' && c.level > 0)
  const chosen = cards.filter((c) => c.pending > 0).map((c) => `${c.name} level ${c.level}`)
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
    runKitText: state.stallKit === undefined ? null : kitText(state.stallKit),
    saveSlots: slotViews(before, defs),
    saveSelected,
    useSlots: slotViews(library, defs),
    useSelected,
    kitOwned,
    confirmRows: [
      { label: 'Points left', value: String(after.meta.points) },
      { label: 'Perks bought now', value: chosen.length === 0 ? 'None' : chosen.join(', ') },
      {
        label: 'This kitchen saved to',
        value: saveSelected === null ? 'Not saved' : `Slot ${saveSelected + 1}${before[saveSelected] === null ? '' : ' (replaces its kitchen)'}`,
      },
      { label: 'Next run starts with', value: kitOwned && useSelected !== null ? `Kitchen in slot ${useSelected + 1}` : 'No saved kitchen' },
    ],
    blocked: dup ? 'This run is already franchised' : canFranchise(state) ? null : 'Build the chain first',
    startLabel: `Sell chain and start run ${nextRun}`,
  }
}
