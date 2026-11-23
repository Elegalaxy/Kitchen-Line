import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { criticArrivalTick, criticDay } from '../sim/critic.ts'
import { createGame } from '../sim/game.ts'
import type { GameState } from '../sim/types.ts'
import { criticBadge, criticNotice, criticSummary } from './criticView.ts'

function criticDayOf(): number {
  for (let d = 2; d < 200; d += 1) if (criticDay('demo', d)) return d
  throw new Error('none')
}

function restaurant(day: number): GameState {
  const s = createGame(DEFS, 'demo')
  s.tier = 'restaurant'
  s.day = day
  return s
}

describe('criticNotice', () => {
  const day = criticDayOf()
  it('is null at the stall', () => {
    const s = createGame(DEFS, 'demo')
    s.day = day - 1
    expect(criticNotice(s, DEFS)).toBeNull()
  })
  it('announces tomorrow in the build phase and in the summary of the day before', () => {
    const s = restaurant(day - 1)
    s.phase = 'build'
    expect(criticNotice(s, DEFS)?.kind).toBe('tomorrow')
    expect(criticNotice(s, DEFS)?.text).toContain('tomorrow')
    s.phase = 'summary'
    expect(criticNotice(s, DEFS)?.kind).toBe('tomorrow')
  })
  it('shows the critic day itself, the waiting critic and the result', () => {
    const s = restaurant(day)
    s.phase = 'build'
    expect(criticNotice(s, DEFS)?.kind).toBe('today')
    s.phase = 'service'
    s.dayTick = criticArrivalTick('demo', day) + 1
    expect(criticNotice(s, DEFS)).toBeNull()
    s.waiting = [{ id: 1, arriveTick: 0, prefs: ['fries'], budget: 300, patience: 240, dish: 'fries', price: 300, critic: true }]
    expect(criticNotice(s, DEFS)?.kind).toBe('waiting')
    s.waiting = []
    s.today.critic = { stars: 4, served: true, dish: 'fries' }
    expect(criticNotice(s, DEFS)?.text).toContain('4 stars')
  })
  it('says nothing on an ordinary day', () => {
    const s = restaurant(day + 1)
    s.phase = 'build'
    expect(criticNotice(s, DEFS)).toBeNull()
  })
})

describe('criticSummary and badge', () => {
  it('formats the line and the badge', () => {
    const s = restaurant(5)
    expect(criticSummary(s)).toBeNull()
    s.lastDay = { ...s.today, critic: { stars: 1, served: false, dish: 'fries' } }
    expect(criticSummary(s)?.text).toBe('Critic: 1 star (lost)')
    s.lastDay = { ...s.today, critic: { stars: 5, served: true, dish: 'fries' } }
    expect(criticSummary(s)?.text).toBe('Critic: 5 stars (served)')
    expect(criticBadge({ critic: true })).toBe('Critic')
    expect(criticBadge({})).toBeNull()
  })
})
