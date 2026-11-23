// Palette contents (plan Step 5): the buildings present in DEFS that can be placed, in DEFS
// order, with the reason a building is disabled right now (shown as visible text).
// Position-dependent reasons (occupied, out of bounds) are shown by the ghost instead.

import { ASSEMBLER_TICKS, PASS_MAX, TICKS_PER_SECOND } from '../sim/constants.ts'
import { countKind, PRO_KINDS, placeCost } from '../sim/grid.ts'
import type { PlaceCommand } from '../sim/grid.ts'
import { stationTicks } from '../sim/stations.ts'
import type { BuildingDef, BuildingKind, Defs, GameState, PlaceConfig } from '../sim/types.ts'
import { formatMoney } from './format.ts'

/** Placeable buildings in DEFS order (the pass is last: one extra is for sale at the restaurant tier). */
export function paletteKinds(defs: Defs): BuildingKind[] {
  return Object.values(defs.buildings)
    .filter((b: BuildingDef) => b.placeable)
    .map((b) => b.kind)
}

/** True when the palette also offers a fast variant of `kind` (only the belt has one). */
export function hasFastVariant(defs: Defs, kind: BuildingKind): boolean {
  return kind === 'belt' && defs.buildings.belt?.fast !== undefined
}

/** True when the palette offers a variant of `kind`: the fast belt, or a pro fryer, stove or assembler. */
export function hasVariant(defs: Defs, kind: BuildingKind): boolean {
  return hasFastVariant(defs, kind) || (PRO_KINDS.includes(kind) && defs.buildings[kind]?.pro !== undefined)
}

/** The place config of the variant entry of `kind` (the fast belt, or a pro station). */
export function variantConfig(kind: BuildingKind): PlaceConfig {
  return kind === 'belt' ? { fast: true } : { pro: true }
}

/** Palette name of the variant entry: "Fast belt", "Pro fryer". */
export function variantName(defs: Defs, kind: BuildingKind): string {
  return kind === 'belt' ? 'Fast belt' : `Pro ${(defs.buildings[kind]?.name ?? kind).toLowerCase()}`
}

/** Cost and tier of a building's variant, or undefined when it has none. */
export function variantOf(def: BuildingDef): { cost: number; requiresTier: BuildingDef['requiresTier'] } | undefined {
  return def.fast ?? def.pro
}

/** Seconds per item as text ("6 s per item"), for the base building or its pro variant. Null for kinds without a speed. */
export function speedText(defs: Defs, kind: BuildingKind, pro: boolean): string | null {
  let base: number | undefined
  if (kind === 'assembler') base = ASSEMBLER_TICKS
  else if (kind === 'fryer' || kind === 'stove') base = defs.stationRecipes.find((r) => r.station === kind)?.ticks
  if (base === undefined) return null
  const secs = stationTicks(base, pro) / TICKS_PER_SECOND
  return `${Number.isInteger(secs) ? secs : secs.toFixed(1)} s per item`
}

function hasVariantKind(kind: BuildingKind): boolean {
  return kind === 'belt' || PRO_KINDS.includes(kind)
}

/** The place command used to price a palette entry (`fast` = the variant entry: fast belt or pro station). */
function priceCommand(kind: BuildingKind, fast: boolean): PlaceCommand {
  return fast && hasVariantKind(kind)
    ? { type: 'place', kind, x: 0, y: 0, dir: 0, config: variantConfig(kind) }
    : { type: 'place', kind, x: 0, y: 0, dir: 0 }
}

/** Cost in cents of one palette entry. */
export function paletteCost(defs: Defs, kind: BuildingKind, fast = false): number {
  return placeCost(defs, priceCommand(kind, fast))
}

/**
 * Why `kind` cannot be picked right now ("Restaurant tier", "Needs $40.00"), or null.
 * `fast` asks about the variant entry (fast belt, pro station), which has its own tier and cost.
 */
export function paletteReason(state: GameState, defs: Defs, kind: BuildingKind, fast = false): string | null {
  const def = defs.buildings[kind]
  if (def === undefined || !def.placeable) return 'Not for sale'
  const variant = variantOf(def)
  if (fast && variant === undefined) return 'Not for sale'
  const tier = fast && variant !== undefined ? variant.requiresTier : def.requiresTier
  if (tier === 'restaurant' && state.tier !== 'restaurant') return 'Restaurant tier'
  if (kind === 'pass' && countKind(state, 'pass') >= PASS_MAX) return 'Limit reached'
  const cost = paletteCost(defs, kind, fast)
  if (state.phase !== 'build' && state.phase !== 'service') return 'Not available now'
  if (state.money < cost) return `Needs ${formatMoney(cost)}`
  return null
}
