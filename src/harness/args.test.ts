// Tests for the harness argument parser (plan Step 13): valid runs, defaults, and every
// validation failure the CLI turns into exit code 1.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { parseArgs } from './args.ts'
import { layoutNames } from './run.ts'

const parse = (...argv: string[]) => parseArgs(argv, DEFS, layoutNames())

function errorOf(...argv: string[]): string {
  const r = parse(...argv)
  if (r.ok) throw new Error(`expected an error for ${argv.join(' ')}`)
  return r.error
}

describe('parseArgs', () => {
  it('parses a full run', () => {
    const r = parse('--layout', 'friesLine', '--seed', 'demo', '--days', '5', '--menu', 'fries:300,salad:450', '--speedtest')
    expect(r).toEqual({
      ok: true,
      options: {
        mode: 'run',
        layout: 'friesLine',
        seed: 'demo',
        days: 5,
        menu: [
          { dish: 'fries', price: 300 },
          { dish: 'salad', price: 450 },
        ],
        speedtest: true,
      },
    })
  })

  it('menu and speedtest are optional', () => {
    const r = parse('--layout', 'friesLine', '--seed', 'a', '--days', '1')
    expect(r).toEqual({ ok: true, options: { mode: 'run', layout: 'friesLine', seed: 'a', days: 1, menu: undefined, speedtest: false } })
  })

  it('--list needs nothing else', () => {
    expect(parse('--list')).toEqual({ ok: true, options: { mode: 'list' } })
  })

  it('rejects an unknown layout', () => {
    expect(errorOf('--layout', 'nope', '--seed', 'a', '--days', '1')).toContain('unknown layout')
  })

  it('rejects an unknown dish', () => {
    expect(errorOf('--layout', 'friesLine', '--seed', 'a', '--days', '1', '--menu', 'pizza:300')).toContain('unknown dish')
  })

  it('rejects bad price formats', () => {
    for (const menu of ['fries', 'fries:', 'fries:3.50', 'fries:-5', 'fries:abc', 'fries:0', 'fries:300,', 'fries:1,fries:2']) {
      expect(errorOf('--layout', 'friesLine', '--seed', 'a', '--days', '1', '--menu', menu), menu).toMatch(/menu|price|twice/)
    }
  })

  it('rejects bad day counts', () => {
    for (const days of ['0', '-1', 'abc', '1.5', '101', '']) {
      expect(errorOf('--layout', 'friesLine', '--seed', 'a', '--days', days), days).toContain('--days')
    }
  })

  it('rejects an unknown flag, a missing value and missing required flags', () => {
    expect(errorOf('--bogus')).toContain('unknown flag')
    expect(errorOf('--layout', '--seed', 'a')).toContain('requires a value')
    expect(errorOf('--layout', 'friesLine', '--seed', 'a')).toContain('--days is required')
    expect(errorOf('--seed', 'a', '--days', '1')).toContain('--layout is required')
    expect(errorOf('--layout', 'friesLine', '--days', '1')).toContain('--seed is required')
  })
})
