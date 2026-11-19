// Update order for the tick (plan Step 3): downstream first, so an item never moves
// twice and a full belt frees its slot before the belt behind it tries to push.
// Non-belt buildings come first (by id), then belts by distance to the end of their
// chain (belt steps until a non-belt tile or the grid edge), smallest first, ties by id.
// Belts on a cycle have no end; they go last, ordered by id. Recomputed every tick.

import { buildingAt, neighbor } from './grid.ts'
import type { GameState } from './types.ts'

export function updateOrder(state: GameState): number[] {
  const nonBelts: number[] = []
  const belts: number[] = []
  for (const key of Object.keys(state.buildings)) {
    const b = state.buildings[Number(key)]
    if (b === undefined) continue
    if (b.kind === 'belt') belts.push(b.id)
    else nonBelts.push(b.id)
  }
  nonBelts.sort((a, b) => a - b)

  const dist = new Map<number, number>()
  const CYCLE = Number.POSITIVE_INFINITY
  for (const start of belts) {
    if (dist.has(start)) continue
    // Walk the chain, then assign distances back from the end.
    const path: number[] = []
    const onPath = new Set<number>()
    let cur: number | null = start
    let base = 0
    while (cur !== null) {
      const known = dist.get(cur)
      if (known !== undefined) {
        base = known
        break
      }
      if (onPath.has(cur)) {
        base = CYCLE
        break
      }
      const b = state.buildings[cur]
      if (b === undefined || b.kind !== 'belt') break
      path.push(cur)
      onPath.add(cur)
      const n = neighbor(b.x, b.y, b.dir)
      const next = buildingAt(state, n.x, n.y)
      const nb = next === null ? undefined : state.buildings[next]
      cur = nb !== undefined && nb.kind === 'belt' ? next : null
      if (cur === null) base = 0
    }
    for (let i = path.length - 1; i >= 0; i -= 1) {
      const id = path[i]
      if (id === undefined) continue
      base = base === CYCLE ? CYCLE : base + 1
      dist.set(id, base)
    }
  }
  belts.sort((a, b) => {
    const da = dist.get(a) ?? CYCLE
    const db = dist.get(b) ?? CYCLE
    if (da !== db) return da < db ? -1 : 1
    return a - b
  })
  return [...nonBelts, ...belts]
}
