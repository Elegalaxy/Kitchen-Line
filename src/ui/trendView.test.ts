import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { createGame } from '../sim/game.ts'
import { currentTrend } from '../sim/trend.ts'
import { trendSummary, trendView } from './trendView.ts'

function restaurant() {
  const s = createGame(DEFS, 'demo')
  s.tier = 'restaurant'
  s.unlocked = Object.keys(DEFS.dishes)
  s.day = 5
  return s
}

describe('trendView', () => {
  it('is null at the stall', () => {
    const s = createGame(DEFS, 'demo')
    expect(trendView(s, DEFS)).toBeNull()
    expect(trendSummary(s, DEFS)).toBeNull()
  })
  it('announces the trend with the multiplier and hints when it is off the menu', () => {
    const s = restaurant()
    const dish = currentTrend(s, DEFS) as string
    s.menu = s.menu.filter((m) => m.dish !== dish)
    const v = trendView(s, DEFS)
    expect(v?.text).toBe(`Today's trend: ${DEFS.dishes[dish].name}, 2x demand`)
    expect(v?.onMenu).toBe(false)
    expect(v?.hint).toContain('add')
    s.menu.push({ dish, price: DEFS.dishes[dish].refPrice })
    expect(trendView(s, DEFS)?.hint).toBeNull()
  })
  it('summarises the finished day', () => {
    const s = restaurant()
    const dish = currentTrend(s, DEFS) as string
    const day = createGame(DEFS, 'demo').today
    s.lastDay = { ...day, day: 5, byDish: { [dish]: { served: 7, lost: 2, sales: 100 } } }
    expect(trendSummary(s, DEFS)).toMatchObject({ served: 7, lost: 2 })
  })
})
