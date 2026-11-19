// Item hand-over between buildings (plan Step 3).
// `tryInsert(state, building, item, fromDir)` puts `item` into `building` if it accepts
// it and returns true; otherwise it changes nothing and returns false. `fromDir` is the
// direction from the receiving building towards the sender. Rules so far:
//   belt: accepts into slot 0 from its back, left or right, only if slot 0 is empty.
//         Never from its front. Offline (warming) buildings accept nothing.
//   pass: accepts any item from any side (placeholder until Step 6 restricts to dishes)
//         and counts it in `delivered`.
//   bin:  accepts any item from any side and counts it as binned waste.
// Every other kind refuses for now (their steps add acceptance).

import type { Building, Dir, GameState, Item } from './types.ts'

export function opposite(dir: Dir): Dir {
  return ((dir + 2) % 4) as Dir
}

export function tryInsert(state: GameState, building: Building, item: Item, fromDir: Dir): boolean {
  if (building.onlineAt > state.tick) return false
  switch (building.kind) {
    case 'belt': {
      if (fromDir === building.dir) return false
      if (building.slots[0] !== null) return false
      building.slots[0] = item
      return true
    }
    case 'pass': {
      building.delivered += 1
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
