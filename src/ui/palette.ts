// Palette contents (plan Step 5): the buildings present in DEFS that can be placed, in DEFS
// order, with the reason a building is disabled right now (shown as visible text).
// Position-dependent reasons (occupied, out of bounds) are shown by the ghost instead.

import { PASS_MAX } from '../sim/constants.ts'
import { countKind, placeCost } from '../sim/grid.ts'
import type { PlaceCommand } from '../sim/grid.ts'
import type { BuildingDef, BuildingKind, Defs, GameState } from '../sim/types.ts'
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

/** The place command used to price a palette entry (`fast` = the fast belt variant). */
function priceCommand(kind: BuildingKind, fast: boolean): PlaceCommand {
  return fast && kind === 'belt'
    ? { type: 'place', kind, x: 0, y: 0, dir: 0, config: { fast: true } }
    : { type: 'place', kind, x: 0, y: 0, dir: 0 }
}

/** Cost in cents of one palette entry. */
export function paletteCost(defs: Defs, kind: BuildingKind, fast = false): number {
  return placeCost(defs, priceCommand(kind, fast))
}

/**
 * Why `kind` cannot be picked right now ("Restaurant tier", "Needs $40.00"), or null.
 * `fast` asks about the fast belt entry, which has its own tier and cost.
 */
export function paletteReason(state: GameState, defs: Defs, kind: BuildingKind, fast = false): string | null {
  const def = defs.buildings[kind]
  if (def === undefined || !def.placeable) return 'Not for sale'
  if (fast && def.fast === undefined) return 'Not for sale'
  const tier = fast && def.fast !== undefined ? def.fast.requiresTier : def.requiresTier
  if (tier === 'restaurant' && state.tier !== 'restaurant') return 'Restaurant tier'
  if (kind === 'pass' && countKind(state, 'pass') >= PASS_MAX) return 'Limit reached'
  const cost = paletteCost(defs, kind, fast)
  if (state.phase !== 'build' && state.phase !== 'service') return 'Not available now'
  if (state.money < cost) return `Needs ${formatMoney(cost)}`
  return null
}
