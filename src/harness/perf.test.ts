// Performance check (plan Step 13; the plan names src/sim/perf.test.ts, but this needs the
// real content layouts and sim tests may import only src/sim, so it lives in the harness).
// Each scenario runs 7 days (16,800 ticks) and must finish in under 1 s. Wall-clock time is
// allowed here (not in src/sim). To keep a loaded machine from failing the test, each
// scenario is timed 3 times and the best time counts.
//
// The big-grid scenario is a 16 x 12 grid completely filled with belts in concentric
// clockwise rings, each belt holding items, so every belt is loopable and busy. The grid
// is made by overriding width/height/tiles on a fresh game state (no expansion command
// exists until Step 16).

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { blueprintOf } from '../sim/blueprint.ts'
import { branchDayResult, branchSeed } from '../sim/branches.ts'
import { endDay } from '../sim/day.ts'
import { createGame, newBuilding } from '../sim/game.ts'
import { tileIndex } from '../sim/grid.ts'
import type { Dir, GameState } from '../sim/types.ts'
import { buildLayoutState, runDaysFrom } from './run.ts'

const DAYS = 7
// The 1 s target is for a normal machine. Shared CI runners are about 2x slower and noisy
// (over 3 s seen on GitHub Actions for the big-grid scenario), so CI gets 8 s: still catches a real (several-fold) slowdown.
const LIMIT_MS = process.env.CI === undefined ? 1000 : 8000
const RUNS = 3
// Each scenario runs RUNS times; the default 5 s test timeout failed CI before LIMIT_MS was even checked.
const TEST_TIMEOUT_MS = 60_000

function debug(message: string): void {
  console.log(`[DEBUG perf] ${message}\n`)
}

/** 16 x 12 grid fully covered with clockwise belt rings; every belt holds two items. */
function bigLoopGrid(): GameState {
  const state = createGame(DEFS, 'perf')
  state.width = 16
  state.height = 12
  state.tiles = new Array<number | null>(16 * 12).fill(null)
  state.buildings = {}
  state.nextId = 1
  state.money = 1_000_000
  let itemId = 1
  for (let k = 0; k < 6; k += 1) {
    const x0 = k
    const x1 = 15 - k
    const y0 = k
    const y1 = 11 - k
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        let dir: Dir
        if (y === y0 && x < x1) dir = 1 // top edge: east
        else if (x === x1 && y < y1) dir = 2 // right edge: south
        else if (y === y1 && x > x0) dir = 3 // bottom edge: west
        else if (x === x0 && y > y0) dir = 0 // left edge: north
        else continue // interior tile of this ring; belongs to an inner ring
        const b = newBuilding('belt', state.nextId++, x, y, dir, 0, { ingredient: 'potato' })
        if (b.kind === 'belt') {
          const type = (x + y) % 2 === 0 ? 'potato' : 'tomato'
          b.slots = [
            { id: itemId++, type, bornTick: 0 },
            (x + y) % 3 === 0 ? null : { id: itemId++, type, bornTick: 0 },
          ]
        }
        state.buildings[b.id] = b
        state.tiles[tileIndex(state, x, y)] = b.id
      }
    }
  }
  state.nextItemId = itemId
  return state
}

function bestMs(make: () => GameState): number {
  let best = Infinity
  for (let i = 0; i < RUNS; i += 1) {
    const start = make()
    const t0 = performance.now()
    runDaysFrom(start, DEFS, DAYS)
    best = Math.min(best, performance.now() - t0)
  }
  return best
}

describe('performance: 7 days (16,800 ticks) under 1 s', () => {
  it('the big grid really is full of belts', () => {
    const s = bigLoopGrid()
    expect(s.tiles.every((t) => t !== null)).toBe(true)
    expect(Object.keys(s.buildings)).toHaveLength(192)
  })

  it('16 x 12 grid of looping belts with items', () => {
    const ms = bestMs(bigLoopGrid)
    debug(`bigLoopGrid best of ${RUNS}: ${ms.toFixed(1)} ms`)
    expect(ms).toBeLessThan(LIMIT_MS)
  }, TEST_TIMEOUT_MS)

  for (const layout of ['saladLine', 'burgerLine', 'soupLine', 'sandwichLine', 'riceBowlLine']) {
    it(`${layout}`, () => {
      const ms = bestMs(() => buildLayoutState(DEFS, layout, 'perf'))
      debug(`${layout} best of ${RUNS}: ${ms.toFixed(1)} ms`)
      expect(ms).toBeLessThan(LIMIT_MS)
    }, TEST_TIMEOUT_MS)
  }
})

// Chain stage (GAME_DESIGN 8.1): opening or refitting a branch runs one full test day of a real kitchen; every
// night with branches is O(branches) arithmetic inside endDay.
describe('performance: chain stage', () => {
  const NIGHT_LIMIT_MS = process.env.CI === undefined ? 5 : 40

  it('a test day on a real layout kitchen', () => {
    const state = buildLayoutState(DEFS, 'friesSaladLine', 'perf')
    state.tier = 'restaurant'
    const bp = blueprintOf(state, DEFS)
    const area = DEFS.branchAreas?.[0]
    if (area === undefined) throw new Error('no branch areas')
    let best = Infinity
    for (let i = 0; i < RUNS; i += 1) {
      const t0 = performance.now()
      const r = branchDayResult(bp, area, { seed: branchSeed(state.seed, 1), day: 20, ratings: state.ratings }, DEFS)
      best = Math.min(best, performance.now() - t0)
      expect(r.customers).toBeGreaterThan(0)
    }
    debug(`branch test day best of ${RUNS}: ${best.toFixed(1)} ms`)
    expect(best).toBeLessThan(LIMIT_MS)
  }, TEST_TIMEOUT_MS)

  it('endDay with 3 branches', () => {
    const base = buildLayoutState(DEFS, 'friesSaladLine', 'perf')
    base.tier = 'restaurant'
    const bp = blueprintOf(base, DEFS)
    base.won = true
    base.phase = 'service'
    base.branches = [1, 2, 3].map((id) => ({
      id,
      areaId: DEFS.branchAreas?.[id - 1]?.id ?? 'x',
      openedDay: 1,
      blueprintDay: 1,
      refits: 0,
      blueprint: bp,
      expected: { profit: 20000, sales: 30000, served: 80, customers: 100 },
    }))
    const N = 200
    const states = Array.from({ length: N }, () => structuredClone(base))
    const t0 = performance.now()
    for (const s of states) endDay(s, DEFS)
    const avg = (performance.now() - t0) / N
    debug(`endDay with 3 branches: ${avg.toFixed(3)} ms average over ${N}`)
    expect(states[0].today.branches ?? states[0].lastDay?.branches).toHaveLength(3)
    expect(avg).toBeLessThan(NIGHT_LIMIT_MS)
  }, TEST_TIMEOUT_MS)
})
