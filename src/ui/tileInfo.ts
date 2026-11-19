// What is on a grid tile, for the hover tooltip and the keyboard tile-info line (plan Step 18):
// each item held by the building on the tile with its freshness in seconds left. Freshness is
// `spoilTicks - (tick - bornTick)` (sim/spoil.ts: an item spoils once its age reaches
// spoilTicks), shown in whole seconds rounded up so "0 s" never shows for a live item.
// Items without a shelf life (potatoes, patties, ...) read "does not spoil". Pure, no DOM.

import { buildingAt } from '../sim/grid.ts'
import { buildingItems } from '../sim/spoil.ts'
import type { Defs, GameState, Item } from '../sim/types.ts'
import { STATUS_TEXT } from './format.ts'

export const TICKS_PER_SECOND = 10

/** Whole seconds of shelf life left (at least 1 while the item exists), or null if it never spoils. */
export function freshnessSeconds(defs: Defs, item: Item, tick: number): number | null {
  const life = defs.items[item.type]?.spoilTicks
  if (life === undefined) return null
  return Math.max(1, Math.ceil((life - (tick - item.bornTick)) / TICKS_PER_SECOND))
}

export type TileItem = { name: string; emoji: string; seconds: number | null; text: string }

/** One entry per item held by the building on tile (x, y); empty when there is none. */
export function tileItems(state: GameState, defs: Defs, x: number, y: number): TileItem[] {
  const id = buildingAt(state, x, y)
  if (id === null) return []
  return buildingItems(state.buildings[id]).map((item) => {
    const def = defs.items[item.type]
    const name = def?.name ?? item.type
    const seconds = freshnessSeconds(defs, item, state.tick)
    return {
      name,
      emoji: def?.emoji ?? '?',
      seconds,
      text: seconds === null ? `${name}: does not spoil` : `${name}: fresh for ${seconds} s`,
    }
  })
}

/** Tooltip lines for the tile (the same text keyboard users read under the grid). */
export function tileTooltip(state: GameState, defs: Defs, x: number, y: number): string[] {
  return tileItems(state, defs, x, y).map((i) => i.text)
}

/** One sentence about the tile: building, status and held items. Null for an empty tile. */
export function tileSummary(state: GameState, defs: Defs, x: number, y: number): string | null {
  const id = buildingAt(state, x, y)
  if (id === null) return null
  const b = state.buildings[id]
  const items = tileItems(state, defs, x, y)
  const where = `${defs.buildings[b.kind].name} at ${b.x}, ${b.y} (${STATUS_TEXT[b.status].word})`
  return items.length === 0 ? `${where}: no items.` : `${where}: ${items.map((i) => i.text).join('; ')}.`
}
