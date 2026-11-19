// Renderer-only item motion (plan Step 4). The sim moves items in half-tile jumps; this
// map eases the DISPLAYED position of each belt item toward its slot position. It never
// touches sim state and does not rely on event history. Positions are in tile units
// (tile centre = x + 0.5), so a window resize cannot make anything jump.

import type { Dir, GameState } from '../../sim/types.ts'

export type Vec = { x: number; y: number }

/** Items further than this from their target are snapped (new or teleported items). */
export const SNAP_DISTANCE = 1.5
const DIR_VEC: readonly Vec[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]
const TICK_MS = 100

/** Tile-unit centre of belt slot 0 (back half) or 1 (front half). */
export function slotTarget(x: number, y: number, dir: Dir, slot: 0 | 1): Vec {
  const v = DIR_VEC[dir]
  const off = slot === 0 ? -0.25 : 0.25
  return { x: x + 0.5 + v.x * off, y: y + 0.5 + v.y * off }
}

/** Move `cur` toward `target` by at most `maxDist`; snap if it would arrive or is too far. */
export function stepToward(cur: Vec, target: Vec, maxDist: number): Vec {
  const dx = target.x - cur.x
  const dy = target.y - cur.y
  const dist = Math.hypot(dx, dy)
  if (dist > SNAP_DISTANCE || dist <= maxDist) return { x: target.x, y: target.y }
  const k = maxDist / dist
  return { x: cur.x + dx * k, y: cur.y + dy * k }
}

/** Max displayed travel in `dtMs`: half a tile per belt period, scaled by speed. */
export function maxTravel(dtMs: number, speed: number, beltPeriodTicks: number): number {
  if (speed <= 0 || dtMs <= 0) return 0
  return (0.5 * dtMs * speed) / (beltPeriodTicks * TICK_MS)
}

export type MotionItem = { id: number; type: string; bornTick: number; pos: Vec }

export type ItemMotion = {
  /** Advance displayed positions; returns the items on belts with their positions. */
  update(state: GameState, dtMs: number, speed: number): MotionItem[]
  size(): number
}

export function createItemMotion(): ItemMotion {
  const pos = new Map<number, Vec>()
  return {
    update(state, dtMs, speed) {
      const out: MotionItem[] = []
      const seen = new Set<number>()
      for (const b of Object.values(state.buildings)) {
        if (b.kind !== 'belt') continue
        const step = maxTravel(dtMs, speed, b.fast ? 2 : 3)
        for (const slot of [0, 1] as const) {
          const item = b.slots[slot]
          if (item === null) continue
          const target = slotTarget(b.x, b.y, b.dir, slot)
          const prev = pos.get(item.id)
          const next = prev === undefined ? target : stepToward(prev, target, step)
          pos.set(item.id, next)
          seen.add(item.id)
          out.push({ id: item.id, type: item.type, bornTick: item.bornTick, pos: next })
        }
      }
      for (const id of [...pos.keys()]) if (!seen.has(id)) pos.delete(id)
      return out
    },
    size: () => pos.size,
  }
}
