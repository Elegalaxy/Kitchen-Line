// Tests for the renderer's item easing: stepping, snapping, speed scaling and cleanup.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../../content/index.ts'
import { LAYOUTS } from '../../content/layouts.ts'
import { applyCommand } from '../../sim/commands.ts'
import { createGame } from '../../sim/game.ts'
import { runTicks } from '../../sim/tick.ts'
import { createItemMotion, maxTravel, slotTarget, stepToward } from './itemMotion.ts'

describe('itemMotion', () => {
  it('places slots in the back and front half of the tile along dir', () => {
    expect(slotTarget(2, 3, 1, 0)).toEqual({ x: 2.25, y: 3.5 })
    expect(slotTarget(2, 3, 1, 1)).toEqual({ x: 2.75, y: 3.5 })
    expect(slotTarget(2, 3, 0, 1)).toEqual({ x: 2.5, y: 3.25 })
  })

  it('moves at most maxDist, and snaps when it would arrive or is far away', () => {
    const t = { x: 1, y: 0 }
    expect(stepToward({ x: 0, y: 0 }, t, 0.25)).toEqual({ x: 0.25, y: 0 })
    expect(stepToward({ x: 0.9, y: 0 }, t, 0.25)).toEqual(t)
    expect(stepToward({ x: -5, y: 0 }, t, 0.25)).toEqual(t)
  })

  it('travels half a tile per belt period and scales with speed; paused is frozen', () => {
    expect(maxTravel(300, 1, 3)).toBeCloseTo(0.5)
    expect(maxTravel(300, 4, 3)).toBeCloseTo(2)
    expect(maxTravel(300, 1, 2)).toBeCloseTo(0.75)
    expect(maxTravel(100, 0, 3)).toBe(0)
  })

  it('tracks belt items, glides them, and forgets removed ones', () => {
    let s = createGame(DEFS, 'seed')
    for (const c of LAYOUTS['demoBeltLine']) s = applyCommand(s, DEFS, c).state
    const motion = createItemMotion()
    s = runTicks(s, DEFS, 1)
    const first = motion.update(s, 16, 1)
    expect(first).toHaveLength(1)
    s = runTicks(s, DEFS, 3)
    const moved = motion.update(s, 16, 1)
    const a = first[0].pos
    const b = moved.find((m) => m.id === first[0].id)!.pos
    expect(b.x).toBeGreaterThan(a.x)
    expect(b.x - a.x).toBeLessThan(0.5)
    // Paused: displayed positions do not change even though the target moved.
    s = runTicks(s, DEFS, 3)
    const frozen = motion.update(s, 16, 0).find((m) => m.id === first[0].id)!.pos
    expect(frozen).toEqual(b)
    // Items that left the belts are forgotten.
    motion.update({ ...s, buildings: {} }, 16, 1)
    expect(motion.size()).toBe(0)
  })
})
