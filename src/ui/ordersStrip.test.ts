// Patience bar maths for the orders strip (plan Step 11): fraction left and the level
// that picks the colour (and the alarm icon under 25%).

import { describe, expect, it } from 'vitest'
import { orderColumns, patienceLeft, patienceLevel } from './orders.ts'

describe('orders strip columns on narrow screens', () => {
  it('keeps the stall and restaurant slots in one row and wraps beyond ten', () => {
    expect(orderColumns(6)).toBe(6)
    expect(orderColumns(10)).toBe(10)
    expect(orderColumns(13)).toBe(10)
    expect(orderColumns(0)).toBe(1)
  })
})

describe('orders strip patience', () => {
  const c = { arriveTick: 100, patience: 400 }

  it('counts down from 1 to 0 and is clamped', () => {
    expect(patienceLeft(c, 100)).toBe(1)
    expect(patienceLeft(c, 300)).toBe(0.5)
    expect(patienceLeft(c, 500)).toBe(0)
    expect(patienceLeft(c, 900)).toBe(0)
    expect(patienceLeft(c, 50)).toBe(1)
  })

  it('is ok from 50%, warn from 25 to 50%, bad under 25%', () => {
    expect(patienceLevel(1)).toBe('ok')
    expect(patienceLevel(0.5)).toBe('ok')
    expect(patienceLevel(0.499)).toBe('warn')
    expect(patienceLevel(0.25)).toBe('warn')
    expect(patienceLevel(0.249)).toBe('bad')
    expect(patienceLevel(0)).toBe('bad')
  })
})
