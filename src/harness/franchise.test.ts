// Tests for the harness franchise policy and the --meta journey (GAME_DESIGN 8.2).

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { emptyMeta } from '../sim/franchise.ts'
import { blueprintOf } from '../sim/blueprint.ts'
import { createGame } from '../sim/game.ts'
import { formatMetaLibrary, formatMetaMedians, formatMetaPoints, KIT_SPEND_ORDER, runMetaSeed, SPEND_ORDER, spendPoints } from './franchise.ts'

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

describe('spendPoints with the starter kitchen', () => {
  const kit = blueprintOf(createGame(DEFS, 'k'), DEFS)

  it('buys the kitchen first once one is saved, and skips it (not stops) while none is', () => {
    const withKit = spendPoints({ ...emptyMeta(), points: 35, starterKit: kit }, DEFS, KIT_SPEND_ORDER)
    expect(withKit.bought).toEqual(['starterKit', 'seedMoney', 'seedMoney', 'goodName'])
    expect(withKit.meta.points).toBe(1)
    const without = spendPoints({ ...emptyMeta(), points: 35 }, DEFS, KIT_SPEND_ORDER)
    expect(without.bought).toEqual(['seedMoney', 'seedMoney', 'seedMoney', 'goodName'])
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

describe('--meta journey with the starter kitchen', () => {
  it('run 2 starts with the saved stall lines built, rejects nothing and upgrades sooner than run 1', () => {
    const s = runMetaSeed(DEFS, 'journey-1', { maxDays: 60 }, 2, KIT_SPEND_ORDER)
    expect(s.problem).toBeNull()
    expect(s.bought[0]).toContain('starterKit')
    expect(s.runs[1].failures).toEqual([])
    expect(s.runs[1].wonDay).not.toBeNull()
    expect(s.runs[1].upgradeDay ?? 99).toBeLessThan(s.runs[0].upgradeDay ?? 0)
    // the library holds run 1's kitchen in the first slot and run 2 starts with it
    expect(s.library[0]).toEqual([1, null, null])
    expect(s.startedWith[0]).toBe(1)
    expect(formatMetaLibrary([s]).join(' ')).toContain('after run 1: [1 - -] -> run 2 starts with run 1')
  }, 120_000)
})

describe('--meta library policy', () => {
  it('without the starter kitchen perk the next run starts empty even with a saved kitchen', () => {
    const s = runMetaSeed(DEFS, 'journey-1', { maxDays: 60 }, 2, SPEND_ORDER)
    expect(s.library[0]).toEqual([1, null, null])
    expect(s.startedWith[0]).toBeNull()
  }, 120_000)

  it('three runs: each run saves into the next free slot and the newest kitchen starts the next run', () => {
    const s = runMetaSeed(DEFS, 'journey-1', { maxDays: 60 }, 3, KIT_SPEND_ORDER)
    expect(s.problem).toBeNull()
    expect(s.library).toEqual([[1, null, null], [1, 2, null]])
    expect(s.startedWith).toEqual([1, 2])
    expect(s.runs[2].failures).toEqual([])
  }, 240_000)
})
