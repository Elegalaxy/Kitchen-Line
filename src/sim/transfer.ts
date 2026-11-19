// Item hand-over between buildings (plan Step 3).
// `tryInsert(state, building, item, fromDir)` puts `item` into `building` if it accepts
// it and returns true; otherwise it changes nothing and returns false. `fromDir` is the
// direction from the receiving building towards the sender. Rules so far:
//   belt: accepts into slot 0 from its back, left or right, only if slot 0 is empty.
//         Never from its front. Offline (warming) buildings accept nothing.
//   chopper/fryer/stove: accept an item only if a station recipe exists for it (this
//         station, this input), the input holds fewer than STATION_INPUT_CAP items, and
//         it does not come from the station's front (back, left and right are fine).
//   pass: accepts dishes only (by the item's def kind), up to PASS_SHELF_CAP on the
//         shelf, from any side. Until customers exist (Step 11) a dish is served at once:
//         it counts in `delivered` and `today.served` and never stays on the shelf.
//   bin:  accepts any item from any side and counts it as binned waste.
//   splitter/merger/filter: one-item buffer, see logistics.ts (`acceptRouting`).
// Every other kind refuses for now (their steps add acceptance).

import { acceptRouting } from './logistics.ts'
import { PASS_SHELF_CAP, STATION_INPUT_CAP } from './constants.ts'
import type { Building, Defs, Dir, GameState, Item, ItemId, StationRecipe } from './types.ts'

export function opposite(dir: Dir): Dir {
  return ((dir + 2) % 4) as Dir
}

/** The recipe a `station` uses for `input`, if any. */
export function findStationRecipe(defs: Defs, station: StationRecipe['station'], input: ItemId): StationRecipe | undefined {
  return defs.stationRecipes.find((r) => r.station === station && r.input === input)
}

export function tryInsert(state: GameState, defs: Defs, building: Building, item: Item, fromDir: Dir): boolean {
  if (building.onlineAt > state.tick) return false
  switch (building.kind) {
    case 'belt': {
      if (fromDir === building.dir) return false
      if (building.slots[0] !== null) return false
      building.slots[0] = item
      return true
    }
    case 'chopper':
    case 'fryer':
    case 'stove': {
      if (fromDir === building.dir) return false
      if (building.input.length >= STATION_INPUT_CAP) return false
      if (findStationRecipe(defs, building.kind, item.type) === undefined) return false
      building.input.push(item)
      return true
    }
    case 'splitter':
    case 'merger':
    case 'filter':
      return acceptRouting(state, building, item, fromDir)
    case 'pass': {
      if (defs.items[item.type]?.kind !== 'dish') return false
      if (building.shelf.length >= PASS_SHELF_CAP) return false
      building.delivered += 1
      state.today.served += 1
      building.status = 'ok'
      state.events.push({ type: 'delivered', tick: state.tick, x: building.x, y: building.y, item: item.type })
      return true
    }
    case 'bin': {
      state.today.wasteBinned += 1
      building.status = 'ok'
      state.events.push({ type: 'binned', tick: state.tick, x: building.x, y: building.y, item: item.type })
      return true
    }
    default:
      return false
  }
}
