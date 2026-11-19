// Palette contents (plan Step 5): the buildings present in DEFS that can be placed, in DEFS
// order, with the reason a building is disabled right now (shown as visible text).
// Position-dependent reasons (occupied, out of bounds) are shown by the ghost instead.

import { placeCost } from '../sim/grid.ts'
import type { BuildingDef, BuildingKind, Defs, GameState } from '../sim/types.ts'
import { formatMoney } from './format.ts'

/** Placeable buildings in DEFS order (the pass is pre-placed, not for sale). */
export function paletteKinds(defs: Defs): BuildingKind[] {
  return Object.values(defs.buildings)
    .filter((b: BuildingDef) => b.placeable)
    .map((b) => b.kind)
}

/** Why `kind` cannot be picked right now ("Restaurant tier", "Needs $40.00"), or null. */
export function paletteReason(state: GameState, defs: Defs, kind: BuildingKind): string | null {
  const def = defs.buildings[kind]
  if (def === undefined || !def.placeable) return 'Not for sale'
  if (def.requiresTier === 'restaurant' && state.tier !== 'restaurant') return 'Restaurant tier'
  const cost = placeCost(defs, { type: 'place', kind, x: 0, y: 0, dir: 0 })
  if (state.phase !== 'build' && state.phase !== 'service') return 'Not available now'
  if (state.money < cost) return `Needs ${formatMoney(cost)}`
  return null
}
