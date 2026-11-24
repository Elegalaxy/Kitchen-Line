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
        pause: true,
      },
    })
  })

  it('menu and speedtest are optional', () => {
    const r = parse('--layout', 'friesLine', '--seed', 'a', '--days', '1')
    expect(r).toEqual({ ok: true, options: { mode: 'run', layout: 'friesLine', seed: 'a', days: 1, menu: undefined, speedtest: false, pause: true } })
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

  it('parses journey mode with defaults and flags', () => {
    expect(parse('--journey')).toEqual({
      ok: true,
      options: { mode: 'journey', seeds: 20, cautious: false, throttle: true, upgrades: true, pass2: true, pro: true, fryer: 'auto', chain: true, maxDays: 60, example: 1, pause: true },
    })
    expect(
      parse('--journey', '--seeds', '5', '--cautious', '--no-throttle', '--fryer', 'never', '--max-days', '15', '--example', '3'),
    ).toEqual({
      ok: true,
      options: { mode: 'journey', seeds: 5, cautious: true, throttle: false, upgrades: true, pass2: true, pro: true, fryer: 'never', chain: true, maxDays: 15, example: 3, pause: true },
    })
  })

  it('rejects bad journey values', () => {
    expect(errorOf('--journey', '--seeds', '0')).toContain('--seeds')
    expect(errorOf('--journey', '--seeds', '201')).toContain('--seeds')
    expect(errorOf('--journey', '--max-days', 'x')).toContain('--max-days')
    expect(errorOf('--journey', '--fryer', 'two')).toContain('--fryer')
    expect(errorOf('--journey', '--seeds', '2', '--example', '3')).toContain('beyond')
    expect(errorOf('--journey', '--seeds')).toContain('requires a value')
  })

  it('--no-pause turns the pantry pause off in both modes', () => {
    const run = parse('--layout', 'friesLine', '--seed', 'a', '--days', '1', '--no-pause')
    expect(run.ok && run.options.mode === 'run' && run.options.pause).toBe(false)
    const j = parse('--journey', '--no-pause')
    expect(j.ok && j.options.mode === 'journey' && j.options.pause).toBe(false)
  })

  it('--no-upgrades and --no-pass2 turn the restaurant growth purchases off (journey only)', () => {
    const j = parse('--journey', '--no-upgrades', '--no-pass2')
    expect(j.ok && j.options.mode === 'journey' && [j.options.upgrades, j.options.pass2]).toEqual([false, false])
    const one = parse('--journey', '--no-pass2')
    expect(one.ok && one.options.mode === 'journey' && [one.options.upgrades, one.options.pass2]).toEqual([true, false])
  })

  it('--no-chain stops at the restaurant end screen and keeps the old 40 day default; --max-days overrides', () => {
    const j = parse('--journey', '--no-chain')
    expect(j.ok && j.options.mode === 'journey' && [j.options.chain, j.options.maxDays]).toEqual([false, 40])
    const m = parse('--journey', '--no-chain', '--max-days', '50')
    expect(m.ok && m.options.mode === 'journey' && [m.options.chain, m.options.maxDays]).toEqual([false, 50])
    const d = parse('--journey')
    expect(d.ok && d.options.mode === 'journey' && [d.options.chain, d.options.maxDays]).toEqual([true, 60])
  })

  it('--no-pro turns the pro fryer purchase off (journey only)', () => {
    const j = parse('--journey', '--no-pro')
    expect(j.ok && j.options.mode === 'journey' && j.options.pro).toBe(false)
    const d = parse('--journey')
    expect(d.ok && d.options.mode === 'journey' && d.options.pro).toBe(true)
  })
})
