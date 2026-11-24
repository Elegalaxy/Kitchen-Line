// Tests for seasons (GAME_DESIGN 9): the calendar boundaries, the stall and missing-defs fallbacks,
// price rounding, taste percents and the in-season rule.

import { describe, expect, it } from 'vitest'
import { branchSeasonPercent, currentSeason, inSeason, itemCost, seasonIndex, tastePercent } from './season.ts'
import type { Defs, SeasonDef } from './types.ts'

const season = (id: string, extra: Partial<SeasonDef> = {}): SeasonDef => ({
  id,
  name: id,
  emoji: '',
  costPercent: {},
  tastePercent: {},
  branchPercent: 100,
  ...extra,
})

const DEFS = {
  items: { tomato: { id: 'tomato', name: 'Tomato', emoji: '', kind: 'raw', cost: 30 }, rice: { id: 'rice', name: 'Rice', emoji: '', kind: 'raw', cost: 30 } },
  buildings: {},
  stationRecipes: [],
  dishes: {},
  seasons: [
    season('spring'),
    season('summer', { costPercent: { tomato: 75 }, tastePercent: { salad: 150 }, branchPercent: 105 }),
    season('autumn'),
    season('winter', { branchPercent: 95 }),
  ],
} as unknown as Defs

const NO_SEASONS = { ...DEFS, seasons: undefined } as Defs
const rest = (day: number) => ({ tier: 'restaurant' as const, day })
const stall = (day: number) => ({ tier: 'stall' as const, day })

describe('seasonIndex', () => {
  it('changes every 7 days and wraps after 28', () => {
    expect([1, 7, 8, 14, 15, 21, 22, 28, 29].map(seasonIndex)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 0])
  })
})

describe('currentSeason', () => {
  it('follows the calendar at the restaurant tier', () => {
    expect(currentSeason(rest(1), DEFS)?.id).toBe('spring')
    expect(currentSeason(rest(8), DEFS)?.id).toBe('summer')
    expect(currentSeason(rest(28), DEFS)?.id).toBe('winter')
    expect(currentSeason(rest(29), DEFS)?.id).toBe('spring')
    expect(currentSeason(rest(1), DEFS, 15)?.id).toBe('autumn')
  })
  it('is null at the stall and without season defs', () => {
    expect(currentSeason(stall(10), DEFS)).toBeNull()
    expect(currentSeason(rest(10), NO_SEASONS)).toBeNull()
  })
})

describe('itemCost', () => {
  it('scales and rounds in season (22.5 rounds to 23)', () => {
    expect(itemCost(rest(8), DEFS, 'tomato')).toBe(23)
    expect(itemCost(rest(8), DEFS, 'rice')).toBe(30)
  })
  it('gives base prices at the stall and without seasons', () => {
    expect(itemCost(stall(8), DEFS, 'tomato')).toBe(30)
    expect(itemCost(rest(8), NO_SEASONS, 'tomato')).toBe(30)
    expect(itemCost(rest(8), DEFS, 'nope')).toBeUndefined()
  })
})

describe('tastePercent and branchSeasonPercent', () => {
  it('uses the season value, else 100', () => {
    expect(tastePercent(rest(8), DEFS, 'salad')).toBe(150)
    expect(tastePercent(rest(8), DEFS, 'soup')).toBe(100)
    expect(tastePercent(stall(8), DEFS, 'salad')).toBe(100)
    expect(tastePercent(rest(8), NO_SEASONS, 'salad')).toBe(100)
  })
  it('gives the branch percent by day, 100 without seasons', () => {
    expect(branchSeasonPercent(DEFS, 8)).toBe(105)
    expect(branchSeasonPercent(DEFS, 22)).toBe(95)
    expect(branchSeasonPercent(NO_SEASONS, 8)).toBe(100)
  })
})

describe('inSeason', () => {
  it('is always true for a dish without a season', () => {
    expect(inSeason(rest(8), DEFS, {})).toBe(true)
  })
  it('lets a seasonal dish through only in its season', () => {
    expect(inSeason(rest(8), DEFS, { season: 'summer' })).toBe(true)
    expect(inSeason(rest(1), DEFS, { season: 'summer' })).toBe(false)
    expect(inSeason(rest(1), DEFS, { season: 'summer' }, 9)).toBe(true)
  })
  it('does not filter without seasons', () => {
    expect(inSeason(rest(1), NO_SEASONS, { season: 'summer' })).toBe(true)
  })
})
