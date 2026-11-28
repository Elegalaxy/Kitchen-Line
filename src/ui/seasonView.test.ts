// Tests for the season view helpers: restaurant tier only, cost / taste change text, the forecast
// line across the season boundary, the dish tag in and out of season and the menu row fields.

import { describe, expect, it } from 'vitest'
import { ingredientCostOf } from '../content/dishes.ts'
import { DEFS } from '../content/index.ts'
import { createGame } from '../sim/game.ts'
import { itemCost } from '../sim/season.ts'
import type { GameState } from '../sim/types.ts'
import { menuView } from './menuView.ts'
import { seasonDetails, seasonEffects, seasonForecast, seasonTag, seasonView } from './seasonView.ts'

function at(day: number, tier: GameState['tier'] = 'restaurant'): GameState {
  const s = createGame(DEFS, 'seasons-ui')
  s.tier = tier
  s.day = day
  return s
}

describe('seasonView', () => {
  it('is null at the stall', () => {
    expect(seasonView(at(3, 'stall'), DEFS)).toBeNull()
    expect(seasonForecast(at(3, 'stall'), DEFS)).toBeNull()
  })
  it('names the season, the day in it and the changes', () => {
    const v = seasonView(at(17), DEFS)!
    expect(v.name).toBe('Autumn')
    expect(v.short).toBe('Autumn 3/7')
    expect(v.progress).toBe('Day 3 of 7')
    expect(v.costChanges).toContain('Potato -25%')
    expect(v.costChanges).toContain('Tomato +25%')
    expect(v.tasteChanges).toContain('Soup more popular')
    expect(v.tasteChanges).toContain('Salad less popular')
  })
  it('gives the effects as rows for the Menu tab and lines for the top bar', () => {
    const v = seasonView(at(17), DEFS)!
    const rows = seasonEffects(v)
    expect(rows.map((r) => r.label)).toEqual(['Prices', 'Demand'])
    expect(rows[0].value).toContain('Potato -25%')
    expect(seasonDetails(v)[0]).toBe('Autumn: day 3 of 7')
    expect(seasonDetails(v)).toContain('Soup more popular')
    expect(seasonEffects({ costChanges: [], tasteChanges: [] })).toEqual([{ label: 'Effects', value: 'None this season' }])
  })
  it('wraps around after winter', () => {
    expect(seasonView(at(29), DEFS)!.name).toBe('Spring')
    expect(seasonView(at(28), DEFS)!.short).toBe('Winter 7/7')
  })
})

describe('seasonForecast', () => {
  it('describes the next season', () => {
    const f = seasonForecast(at(12), DEFS)!
    expect(f.name).toBe('Autumn')
    expect(f.startDay).toBe(15)
    expect(f.daysLeft).toBe(3)
    expect(f.text).toContain('Next: Autumn 🍂 from day 15 (in 3 days): Potato -25%')
    expect(f.text).toContain('Soup more popular')
    expect(f.text).toContain('Pumpkin soup in season')
  })
  it('says tomorrow on the last day of a season and wraps winter to spring', () => {
    expect(seasonForecast(at(14), DEFS)!.text).toContain('(tomorrow)')
    const w = seasonForecast(at(25), DEFS)!
    expect(w.name).toBe('Spring')
    expect(w.startDay).toBe(29)
  })
})

describe('seasonTag', () => {
  it('tags seasonal dishes only', () => {
    expect(seasonTag(DEFS.dishes.fries, at(10), DEFS)).toBeNull()
    expect(seasonTag(DEFS.dishes.pumpkinSoup, at(10, 'stall'), DEFS)).toBeNull()
  })
  it('in and out of season', () => {
    expect(seasonTag(DEFS.dishes.pumpkinSoup, at(16), DEFS)).toEqual({ inSeason: true, text: 'In season', fromDay: null })
    expect(seasonTag(DEFS.dishes.pumpkinSoup, at(10), DEFS)).toEqual({
      inSeason: false,
      text: 'Out of season, from day 15',
      fromDay: 15,
    })
    expect(seasonTag(DEFS.dishes.pumpkinSoup, at(22), DEFS)!.fromDay).toBe(15 + 28)
  })
})

describe('menuView with seasonal costs', () => {
  it('carries the seasonal cost, the base cost, the tag and the off-season warning', () => {
    const s = at(1)
    s.unlocked.push('springRoll', 'pumpkinSoup')
    s.menu.push({ dish: 'pumpkinSoup', price: DEFS.dishes.pumpkinSoup.refPrice })
    const seasonal = (d: string): number => ingredientCostOf(d, (i) => itemCost(s, DEFS, i))
    const rows = menuView(s, DEFS, seasonal, ingredientCostOf).rows
    const roll = rows.find((r) => r.id === 'springRoll')!
    expect(roll.cost).toBeLessThan(roll.baseCost)
    expect(roll.season?.inSeason).toBe(true)
    expect(roll.seasonWarning).toBeNull()
    const soup = rows.find((r) => r.id === 'pumpkinSoup')!
    expect(soup.cost).toBeGreaterThan(soup.baseCost)
    expect(soup.seasonWarning).toBe('Out of season: no orders until day 15')
  })
  it('without the base cost function the base cost equals the cost', () => {
    const row = menuView(at(1), DEFS, ingredientCostOf).rows[0]
    expect(row.baseCost).toBe(row.cost)
    expect(row.season).toBeNull()
  })
})
