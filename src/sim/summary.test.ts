// Tests for the end-of-day summary (plan Step 15): KPIs, deltas with and without a previous
// day, the worst dish, and the bottleneck hint rule (largest count wins; ties patience, then
// noMatch, then waste; no hint when nothing was lost or spoiled).

import { describe, expect, it } from 'vitest'
import { emptyDayStats } from './game.ts'
import { bottleneckHintOf, summarizeDay, worstDishOf } from './summary.ts'
import type { DayStats } from './types.ts'

const REP = { now: 3.5, atDayStart: 3 }

function stats(patch: Partial<DayStats> = {}, day = 1): DayStats {
  return { ...emptyDayStats(day), ...patch }
}

describe('bottleneckHintOf', () => {
  it('is null when nothing was lost or spoiled', () => {
    expect(bottleneckHintOf(stats())).toBeNull()
    expect(bottleneckHintOf(stats({ lostFull: 4, wasteBinned: 3, wasteDestroyed: 2 }))).toBeNull()
  })

  it('picks patience and names the worst dish', () => {
    const s = stats({
      lostPatience: 5,
      lostNoMatch: 2,
      wasteSpoiled: 1,
      byDish: { fries: { served: 3, lost: 1, sales: 900 }, salad: { served: 0, lost: 4, sales: 0 } },
    })
    expect(bottleneckHintOf(s)).toEqual({ kind: 'patience', dish: 'salad', count: 5 })
  })

  it('picks noMatch when it is the largest', () => {
    expect(bottleneckHintOf(stats({ lostPatience: 1, lostNoMatch: 3, wasteSpoiled: 2 }))).toEqual({
      kind: 'noMatch',
      count: 3,
    })
  })

  it('ignores what was thrown away at close: only in-service spoilage is a hint', () => {
    const closing = stats({ wasteSpoiled: 9, wasteOvernight: 9, spoiledByItem: { potato: 9 }, overnightByItem: { potato: 9 } })
    expect(bottleneckHintOf(closing)).toBeNull()
    const mixed = stats({
      wasteSpoiled: 9,
      wasteOvernight: 6,
      spoiledByItem: { potato: 6, lettuce: 3 },
      overnightByItem: { potato: 6 },
    })
    expect(bottleneckHintOf(mixed)).toEqual({ kind: 'waste', item: 'lettuce', count: 3 })
  })

  it('picks waste and names the item that spoiled most', () => {
    const s = stats({ lostPatience: 1, lostNoMatch: 2, wasteSpoiled: 5, spoiledByItem: { tomato: 2, lettuce: 3 } })
    expect(bottleneckHintOf(s)).toEqual({ kind: 'waste', item: 'lettuce', count: 5 })
  })

  it('breaks ties patience, then noMatch, then waste', () => {
    expect(bottleneckHintOf(stats({ lostPatience: 2, lostNoMatch: 2, wasteSpoiled: 2 }))?.kind).toBe('patience')
    expect(bottleneckHintOf(stats({ lostPatience: 1, lostNoMatch: 2, wasteSpoiled: 2 }))?.kind).toBe('noMatch')
    expect(bottleneckHintOf(stats({ lostPatience: 0, lostNoMatch: 0, wasteSpoiled: 1 }))?.kind).toBe('waste')
  })

  it('breaks item and dish ties by id', () => {
    expect(
      bottleneckHintOf(stats({ wasteSpoiled: 4, spoiledByItem: { tomato: 2, lettuce: 2 } })),
    ).toEqual({ kind: 'waste', item: 'lettuce', count: 4 })
    expect(
      worstDishOf(stats({ byDish: { soup: { served: 0, lost: 2, sales: 0 }, burger: { served: 0, lost: 2, sales: 0 } } })),
    ).toBe('burger')
  })
})

describe('summarizeDay', () => {
  const day1 = stats({
    sales: 6000,
    ingredientCost: 1500,
    customers: 20,
    served: 15,
    waitTicksTotal: 1500,
    lostPatience: 3,
    byDish: {
      fries: { served: 10, lost: 3, sales: 3000 },
      salad: { served: 5, lost: 0, sales: 3000 },
      soup: { served: 0, lost: 0, sales: 0 },
    },
  })

  it('computes the KPIs without a previous day (deltas null)', () => {
    const s = summarizeDay(day1, null, REP)
    expect(s.profit).toBe(4500)
    expect(s.served).toBe(15)
    expect(s.customers).toBe(20)
    expect(s.servedPct).toBe(75)
    expect(s.avgWaitSec).toBe(10)
    expect(s.reputation).toBe(3.5)
    expect(s.reputationDelta).toBeCloseTo(0.5)
    expect(summarizeDay(day1, null, { now: 3.34, atDayStart: 3.36 }).reputationDelta).toBeCloseTo(-0.1) // 3.3 vs 3.4 as shown
    expect(s.deltas).toBeNull()
    expect(s.worstDish).toBe('fries')
    expect(s.dishes.map((d) => d.dish)).toEqual(['fries', 'salad']) // sales tie by id, idle soup left out
  })

  it('computes deltas against the previous day', () => {
    const prev = stats(
      { sales: 4000, ingredientCost: 1000, customers: 10, served: 8, waitTicksTotal: 1200 },
      0,
    )
    const s = summarizeDay(day1, prev, REP)
    expect(s.deltas).toEqual({ profit: 1500, served: 7, servedPct: -5, avgWaitSec: -5 })
  })

  it('handles a day with no customers', () => {
    const s = summarizeDay(stats(), stats({ customers: 4, served: 4, waitTicksTotal: 400 }, 0), REP)
    expect(s.servedPct).toBeNull()
    expect(s.avgWaitSec).toBeNull()
    expect(s.worstDish).toBeNull()
    expect(s.bottleneckHint).toBeNull()
    expect(s.deltas).toEqual({ profit: 0, served: -4, servedPct: null, avgWaitSec: null })
  })

  it('does not mutate its inputs', () => {
    const copy = structuredClone(day1)
    summarizeDay(day1, copy, REP)
    expect(day1).toEqual(copy)
  })
})
