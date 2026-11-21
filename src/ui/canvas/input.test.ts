// Tests for the pure input helpers: pixel -> tile, the L-shaped belt drag path and the
// overlay validity (which must agree with the sim's canPlace).

import { describe, expect, it } from 'vitest'
import { DEFS } from '../../content/index.ts'
import { canPlace } from '../../sim/grid.ts'
import { createGame } from '../../sim/game.ts'
import type { UiState } from '../uiState.ts'
import { computeOverlay, lPath, planBeltDrag, tileAt } from './input.ts'

const state = () => createGame(DEFS, 'input-test') // pantry at (0,2), pass at (7,2), 8x6, $150
const ui = (patch: Partial<UiState>): UiState => ({
  tool: null,
  dir: 1,
  cursor: null,
  cursorFromKeys: false,
  fast: false,
  hintsHidden: false,
  tab: 'build',
  guideDone: false,
  drag: null,
  selectedId: null,
  toast: null,
  ...patch,
})

describe('tileAt', () => {
  it('maps pixels to tiles with no offset and rejects points outside the grid', () => {
    expect(tileAt(0, 0, 40, 8, 6)).toEqual({ x: 0, y: 0 })
    expect(tileAt(39.9, 40, 40, 8, 6)).toEqual({ x: 0, y: 1 })
    expect(tileAt(319, 239, 40, 8, 6)).toEqual({ x: 7, y: 5 })
    expect(tileAt(320, 10, 40, 8, 6)).toBeNull()
    expect(tileAt(-1, 10, 40, 8, 6)).toBeNull()
    expect(tileAt(Number.NaN, 10, 40, 8, 6)).toBeNull()
  })
})

describe('lPath', () => {
  it('goes horizontal first, then vertical', () => {
    expect(lPath({ x: 1, y: 1 }, { x: 3, y: 3 })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
    ])
  })
  it('handles single tiles, leftward and upward drags', () => {
    expect(lPath({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }])
    expect(lPath({ x: 3, y: 3 }, { x: 1, y: 2 })).toEqual([
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 1, y: 3 },
      { x: 1, y: 2 },
    ])
    expect(lPath({ x: 2, y: 4 }, { x: 2, y: 1 })).toHaveLength(4)
  })
})

describe('planBeltDrag', () => {
  it('each belt faces the next tile; the last keeps the previous direction', () => {
    const plan = planBeltDrag(state(), DEFS, { x: 1, y: 4 }, { x: 3, y: 5 }, 1)
    expect(plan.path.map((p) => [p.x, p.y, p.dir])).toEqual([
      [1, 4, 1],
      [2, 4, 1],
      [3, 4, 2],
      [3, 5, 2],
    ])
    expect(plan.place).toHaveLength(4)
    expect(plan.cost).toBe(400)
    expect(plan.reason).toBeNull()
  })

  it('a single tile uses the ghost direction', () => {
    const plan = planBeltDrag(state(), DEFS, { x: 2, y: 4 }, { x: 2, y: 4 }, 3)
    expect(plan.path.map((p) => p.dir)).toEqual([3])
    expect(plan.cost).toBe(100)
  })

  it('a leftward drag faces west', () => {
    const plan = planBeltDrag(state(), DEFS, { x: 5, y: 4 }, { x: 2, y: 4 }, 1)
    expect(plan.path.every((p) => p.dir === 3)).toBe(true)
  })

  it('skips occupied tiles and charges only for the free ones', () => {
    // Row 2 holds the pantry at x=0 and the pass at x=7.
    const plan = planBeltDrag(state(), DEFS, { x: 0, y: 2 }, { x: 7, y: 2 }, 1)
    expect(plan.path).toHaveLength(8)
    expect(plan.skipped).toEqual([
      { x: 0, y: 2 },
      { x: 7, y: 2 },
    ])
    expect(plan.place.map((c) => c.x)).toEqual([1, 2, 3, 4, 5, 6])
    expect(plan.cost).toBe(600)
    expect(plan.reason).toBeNull()
  })

  it('is rejected as a whole when nothing is free or the total cannot be afforded', () => {
    const s = state()
    expect(planBeltDrag(s, DEFS, { x: 0, y: 2 }, { x: 0, y: 2 }, 1).reason).toBe('occupied')
    const poor = { ...s, money: 599 }
    const plan = planBeltDrag(poor, DEFS, { x: 1, y: 4 }, { x: 6, y: 4 }, 1)
    expect(plan.cost).toBe(600)
    expect(plan.reason).toBe('cannot afford')
    expect(planBeltDrag({ ...s, money: 600 }, DEFS, { x: 1, y: 4 }, { x: 6, y: 4 }, 1).reason).toBeNull()
  })
})

describe('computeOverlay', () => {
  it('ghost validity matches canPlace (valid, occupied, cannot afford)', () => {
    const s = state()
    for (const [kind, at, money] of [
      ['bin', { x: 3, y: 4 }, 15000],
      ['bin', { x: 0, y: 2 }, 15000],
      ['stove', { x: 3, y: 4 }, 100],
      ['assembler', { x: 7, y: 4 }, 15000],
    ] as const) {
      const st = { ...s, money }
      const o = computeOverlay(st, DEFS, ui({ tool: kind, cursor: at }))
      const why = canPlace(st, DEFS, { type: 'place', kind, x: at.x, y: at.y, dir: 1 })
      expect(o.ghosts[0].status).toBe(why === null ? 'ok' : 'bad')
      expect(o.label?.ok).toBe(why === null)
    }
  })

  it('an assembler ghost covers two tiles', () => {
    const o = computeOverlay(state(), DEFS, ui({ tool: 'assembler', cursor: { x: 3, y: 4 } }))
    expect(o.ghosts[0].tiles).toEqual([
      { x: 3, y: 4 },
      { x: 3, y: 5 },
    ])
  })

  it('a drag shows the total cost next to the cursor', () => {
    const o = computeOverlay(
      state(),
      DEFS,
      ui({ tool: 'belt', cursor: { x: 6, y: 4 }, drag: { from: { x: 1, y: 4 } } }),
    )
    expect(o.ghosts).toHaveLength(6)
    expect(o.label).toEqual({ text: '✓ 6 belts · $6.00', ok: true })
  })

  it('remove mode marks the pass as not sellable', () => {
    const o = computeOverlay(state(), DEFS, ui({ tool: 'remove', cursor: { x: 7, y: 2 } }))
    expect(o.hoverBad).toBe(true)
    expect(o.label?.ok).toBe(false)
  })
})
