// Tests for the meta save (GAME_DESIGN 8.2): round trip, every field required, and damaged input is
// rejected with a reason and never throws. persist tests may import only src/sim.

import { describe, expect, it } from 'vitest'
import { emptyMeta } from '../sim/franchise.ts'
import type { MetaState } from '../sim/types.ts'
import { loadMeta, META_CORRUPT_KEY, META_KEY, serializeMeta } from './meta.ts'

function sample(): MetaState {
  return {
    runsCompleted: 2,
    points: 17,
    perks: { seedMoney: 2, goodName: 1 },
    recipeBook: ['fries', 'salad'],
    history: [
      { run: 1, seed: 'kitchen-line', days: 31, profit: 1_200_000, chainProfit: 900_000, points: 36 },
      { run: 2, seed: 'kitchen-line-run2', days: 28, profit: -500, chainProfit: 0, points: 20 },
    ],
  }
}

function env(meta: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ version: 1, savedAt: '2026-11-24T00:00:00Z', meta, ...extra })
}

describe('meta save', () => {
  it('has its own keys', () => {
    expect(META_KEY).toBe('kitchen-line.meta.v1')
    expect(META_CORRUPT_KEY).toBe('kitchen-line.meta.v1.corrupt')
  })

  it('round-trips an empty and a filled meta', () => {
    for (const m of [emptyMeta(), sample()]) {
      const r = loadMeta(serializeMeta(m, '2026-11-24T00:00:00Z'))
      expect(r).toEqual({ ok: true, meta: m })
    }
  })

  it('requires every field', () => {
    for (const key of Object.keys(sample())) {
      const m: Record<string, unknown> = { ...sample() }
      delete m[key]
      const r = loadMeta(env(m))
      expect(r.ok, key).toBe(false)
      if (!r.ok) expect(r.reason).toContain(key)
    }
  })

  it('requires every history field', () => {
    for (const key of Object.keys(sample().history[0] ?? {})) {
      const m = sample()
      const row: Record<string, unknown> = { ...m.history[0] }
      delete row[key]
      expect(loadMeta(env({ ...m, history: [row] })).ok, key).toBe(false)
    }
  })

  it('rejects garbage, cut-off text and non-objects without throwing', () => {
    const inputs = ['', 'not json', '{"version":1,', 'null', '[]', '42', '"x"', '{}', '{"version":1}', env(null), env([]), env('x')]
    for (const raw of inputs) {
      const r = loadMeta(raw)
      expect(r.ok, raw).toBe(false)
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(0)
    }
    expect(loadMeta(undefined as unknown as string).ok).toBe(false)
    expect(loadMeta(42 as unknown as string).ok).toBe(false)
  })

  it('rejects a wrong or missing version and a missing savedAt', () => {
    expect(loadMeta(JSON.stringify({ version: 2, savedAt: 'x', meta: sample() }))).toEqual({
      ok: false,
      reason: 'unsupported meta save version 2',
    })
    expect(loadMeta(JSON.stringify({ savedAt: 'x', meta: sample() })).ok).toBe(false)
    expect(loadMeta(JSON.stringify({ version: 1, meta: sample() })).ok).toBe(false)
  })

  it('rejects negative, fractional and absurd numbers', () => {
    const bads: Partial<Record<keyof MetaState, unknown>>[] = [
      { runsCompleted: -1 },
      { runsCompleted: 1.5 },
      { points: -3 },
      { points: 1e12 },
      { points: Number.NaN },
      { perks: { seedMoney: -1 } },
      { perks: { seedMoney: 1.5 } },
      { perks: { seedMoney: 1000 } },
      { perks: { seedMoney: '2' } },
      { perks: [] },
    ]
    for (const b of bads) expect(loadMeta(env({ ...sample(), ...b })).ok, JSON.stringify(b)).toBe(false)
    // NaN serializes to null, which is not an integer either
  })

  it('rejects bad dish ids and bad history rows', () => {
    expect(loadMeta(env({ ...sample(), recipeBook: ['fries', 7] })).ok).toBe(false)
    expect(loadMeta(env({ ...sample(), recipeBook: [''] })).ok).toBe(false)
    const row = { run: 0, seed: 's', days: 1, profit: 0, chainProfit: 0, points: 1 }
    expect(loadMeta(env({ ...sample(), history: [row] })).ok).toBe(false)
    expect(loadMeta(env({ ...sample(), history: [{ ...row, run: 1, points: -1 }] })).ok).toBe(false)
    expect(loadMeta(env({ ...sample(), history: [{ ...row, run: 1, seed: '' }] })).ok).toBe(false)
  })

  it('keeps unknown perk ids (persist cannot see the defs) as long as their level is sane', () => {
    const m = { ...sample(), perks: { futurePerk: 3 } }
    expect(loadMeta(env(m))).toEqual({ ok: true, meta: m })
  })

  it('rejects a perk named __proto__', () => {
    const raw = '{"version":1,"savedAt":"x","meta":{"runsCompleted":0,"points":0,"perks":{"__proto__":1},"recipeBook":[],"history":[]}}'
    expect(loadMeta(raw).ok).toBe(false)
  })

  it('rejects oversized arrays and perk maps', () => {
    const row = { run: 1, seed: 's', days: 1, profit: 0, chainProfit: 0, points: 1 }
    expect(loadMeta(env({ ...sample(), history: new Array(101).fill(row) })).ok).toBe(false)
    expect(loadMeta(env({ ...sample(), history: new Array(100).fill(row) })).ok).toBe(true)
    expect(loadMeta(env({ ...sample(), recipeBook: new Array(201).fill('fries') })).ok).toBe(false)
    const perks: Record<string, number> = {}
    for (let i = 0; i < 65; i += 1) perks[`p${i}`] = 1
    expect(loadMeta(env({ ...sample(), perks })).ok).toBe(false)
  })
})
