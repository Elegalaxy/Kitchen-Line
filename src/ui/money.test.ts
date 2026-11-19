// Tests for dollar text <-> cents parsing used by the price inputs.

import { describe, expect, it } from 'vitest'
import { centsToInput, parseDollars } from './money.ts'

describe('parseDollars', () => {
  it('accepts plain and formatted amounts', () => {
    expect(parseDollars('3')).toEqual({ ok: true, cents: 300 })
    expect(parseDollars('3.5')).toEqual({ ok: true, cents: 350 })
    expect(parseDollars('3.50')).toEqual({ ok: true, cents: 350 })
    expect(parseDollars('$3.50')).toEqual({ ok: true, cents: 350 })
    expect(parseDollars('  $ 3.05 ')).toEqual({ ok: true, cents: 305 })
    expect(parseDollars('.5')).toEqual({ ok: true, cents: 50 })
    expect(parseDollars('0')).toEqual({ ok: true, cents: 0 })
    expect(parseDollars('12')).toEqual({ ok: true, cents: 1200 })
  })

  it('rejects bad input with a message', () => {
    for (const bad of ['', '   ', 'abc', '-1', '+1', '$-1', '3.555', '3.', '.', '$', '1,000', '3 5', '1e3', '--3']) {
      const out = parseDollars(bad)
      expect(out.ok, `"${bad}"`).toBe(false)
      if (!out.ok) expect(out.error.length).toBeGreaterThan(0)
    }
    expect(parseDollars('3.555')).toEqual({ ok: false, error: 'Use at most 2 decimals' })
    expect(parseDollars('-1')).toEqual({ ok: false, error: 'Price cannot be negative' })
  })

  it('rejects absurdly large numbers', () => {
    expect(parseDollars('9'.repeat(40)).ok).toBe(false)
  })
})

describe('centsToInput', () => {
  it('formats cents as bare dollars', () => {
    expect(centsToInput(350)).toBe('3.50')
    expect(centsToInput(305)).toBe('3.05')
    expect(centsToInput(1200)).toBe('12.00')
    expect(centsToInput(5)).toBe('0.05')
  })

  it('round-trips through parseDollars', () => {
    for (const c of [0, 5, 150, 300, 1350, 99999]) expect(parseDollars(centsToInput(c))).toEqual({ ok: true, cents: c })
  })
})
