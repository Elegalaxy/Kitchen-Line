// Tests for the harness franchise policy and the --meta journey (GAME_DESIGN 8.2).

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { emptyMeta } from '../sim/franchise.ts'
import { formatMetaMedians, formatMetaPoints, runMetaSeed, spendPoints } from './franchise.ts'

describe('spendPoints', () => {
  it('buys by priority order (seed money, good name, bigger stall), skips what it cannot afford, and leaves the rest', () => {
    const r = spendPoints({ ...emptyMeta(), points: 11 }, DEFS)
    expect(r.bought).toEqual(['seedMoney', 'goodName'])
    expect(r.meta.points).toBe(0)
    expect(spendPoints({ ...emptyMeta(), points: 32 }, DEFS).bought).toEqual(['seedMoney', 'seedMoney', 'seedMoney', 'goodName'])
    expect(r.meta.perks).toEqual({ goodName: 1, seedMoney: 1 })
  })

  it('buys nothing with too few points and stops at the top levels', () => {
    expect(spendPoints({ ...emptyMeta(), points: 4 }, DEFS).bought).toEqual([])
    const all = spendPoints({ ...emptyMeta(), points: 1000 }, DEFS)
    expect(all.meta.perks).toEqual({ seedMoney: 3, goodName: 2, biggerStall: 1 })
    expect(all.meta.points).toBe(1000 - (6 + 9 + 12 + 5 + 8 + 10))
  })
})

describe('--meta journey', () => {
  it('plays run 2 on the next run seed after franchising run 1', () => {
    const s = runMetaSeed(DEFS, 'journey-1', { maxDays: 60 }, 2)
    expect(s.problem).toBeNull()
    expect(s.runs.map((r) => r.seed)).toEqual(['journey-1', 'journey-1-run2'])
    expect(s.earned[0].total).toBeGreaterThan(0)
    expect(s.runs[1].failures).toEqual([])
    expect(s.runs[1].wonDay).not.toBeNull()
    expect(formatMetaPoints([s]).join('\n')).toContain('FP')
    expect(formatMetaMedians([s], 2)).toHaveLength(2)
  }, 120_000)
})
