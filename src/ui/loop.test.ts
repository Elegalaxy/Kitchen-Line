// Tests for the tick accumulator math.

import { describe, expect, it } from 'vitest'
import { advanceAccumulator } from './loop.ts'

describe('advanceAccumulator', () => {
  it('runs one tick per 100 ms at 1x and carries the remainder', () => {
    expect(advanceAccumulator(0, 250, 1)).toEqual({ ticks: 2, acc: 50 })
    expect(advanceAccumulator(50, 60, 1)).toEqual({ ticks: 1, acc: 10 })
  })

  it('runs proportionally more ticks at 2x and 4x', () => {
    expect(advanceAccumulator(0, 100, 4).ticks).toBe(4)
    expect(advanceAccumulator(0, 100, 2).ticks).toBe(2)
  })

  it('does nothing and keeps no backlog while paused', () => {
    expect(advanceAccumulator(70, 1000, 0)).toEqual({ ticks: 0, acc: 0 })
  })

  it('caps ticks per frame and drops the backlog', () => {
    expect(advanceAccumulator(0, 60000, 4)).toEqual({ ticks: 40, acc: 0 })
    expect(advanceAccumulator(0, 4000, 1)).toEqual({ ticks: 40, acc: 0 })
  })

  it('keeps the accumulator for a zero dt', () => {
    expect(advanceAccumulator(30, 0, 1)).toEqual({ ticks: 0, acc: 30 })
  })
})
