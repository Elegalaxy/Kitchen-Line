// Tests for the harness run logic (plan Step 13): same options give identical output, the
// seed matters, the menu override is applied, and a real friesLine run is plausible.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { formatMoney, formatRun, runDays } from './run.ts'

describe('runDays', () => {
  it('same options give identical output and hash', () => {
    const opts = { layout: 'friesLine', seed: 'demo', days: 3 }
    const a = formatRun(runDays(DEFS, opts))
    const b = formatRun(runDays(DEFS, opts))
    expect(a).toEqual(b)
    expect(a).toHaveLength(4)
    expect(a[3]).toMatch(/^\[sim\] stateHash=[0-9a-f]{16}$/)
  })

  it('a different seed changes the run', () => {
    const a = runDays(DEFS, { layout: 'friesLine', seed: 'demo', days: 2 })
    const b = runDays(DEFS, { layout: 'friesLine', seed: 'other', days: 2 })
    expect(a.hash).not.toBe(b.hash)
  })

  it('friesLine for 5 days is plausible', () => {
    const r = runDays(DEFS, { layout: 'friesLine', seed: 'demo', days: 5 })
    expect(r.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5])
    for (const d of r.days) expect(d.served).toBeGreaterThan(0)
    expect(r.days.reduce((n, d) => n + d.profit, 0)).toBeGreaterThan(0)
    const rep = r.days[4].rep
    expect(rep).toBeGreaterThanOrEqual(2)
    expect(rep).toBeLessThanOrEqual(5)
    expect(r.days[0].sales).toBe(r.days[0].served * 300)
  })

  it('--menu replaces the layout menu', () => {
    const base = runDays(DEFS, { layout: 'friesLine', seed: 'demo', days: 1 })
    const priced = runDays(DEFS, { layout: 'friesLine', seed: 'demo', days: 1, menu: [{ dish: 'fries', price: 200 }] })
    expect(priced.state.menu).toEqual([{ dish: 'fries', price: 200 }])
    expect(priced.hash).not.toBe(base.hash)
  })

  it('formats money as dollars', () => {
    expect(formatMoney(4200)).toBe('$42.00')
    expect(formatMoney(5)).toBe('$0.05')
    expect(formatMoney(-4400)).toBe('-$44.00')
  })
})
