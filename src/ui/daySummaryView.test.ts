// Summary modal helpers (Step 15): deltas carry an arrow and a sign, "lower is better" flips
// the tone, zero shows no change; the hint sentence matches the plan; stars clamp; reviews
// are picked lowest first.

import { describe, expect, it } from 'vitest'
import type { Defs, Review } from '../sim/types.ts'
import { countDelta, hintText, idleDishesLabel, moneyDelta, pickReviews, secondsDelta, splitDishRows, starsDelta, starsText } from './daySummaryView.ts'

const DEFS = {
  dishes: { fries: { name: 'Fries' } },
  items: { tomato: { name: 'Tomato' } },
} as unknown as Defs

describe('dish rows', () => {
  const none = { served: 0, lost: 0, sales: 0 }

  it('lists dishes with any non-zero stat and folds the rest, keeping the order', () => {
    const stats = new Map([
      ['a', none],
      ['b', { ...none, lost: 2 }],
      ['d', { ...none, served: 1, sales: 300 }],
      ['e', { ...none, sales: 100 }],
    ])
    expect(splitDishRows(['a', 'b', 'c', 'd', 'e'], stats)).toEqual({ active: ['b', 'd', 'e'], idle: ['a', 'c'] })
  })

  it('folds everything on a day with no activity', () => {
    expect(splitDishRows(['a', 'b'], new Map())).toEqual({ active: [], idle: ['a', 'b'] })
  })

  it('words the disclosure button', () => {
    expect(idleDishesLabel(1, false)).toBe('Show 1 dish with no activity')
    expect(idleDishesLabel(3, true)).toBe('Hide 3 dishes with no activity')
  })
})

describe('deltas', () => {
  it('shows arrow, sign and tone', () => {
    expect(moneyDelta(1550)).toEqual({ arrow: '▲', text: '+$15.50', tone: 'good' })
    expect(moneyDelta(-500)).toEqual({ arrow: '▼', text: '-$5.00', tone: 'bad' })
    expect(countDelta(3)).toEqual({ arrow: '▲', text: '+3', tone: 'good' })
  })

  it('treats a shorter wait as good', () => {
    expect(secondsDelta(-2.5)).toEqual({ arrow: '▼', text: '-2.5 s', tone: 'good' })
    expect(secondsDelta(1)).toEqual({ arrow: '▲', text: '+1.0 s', tone: 'bad' })
  })

  it('is flat at zero and null without data', () => {
    expect(countDelta(0)).toEqual({ arrow: '＝', text: 'no change', tone: 'flat' })
    expect(starsDelta(0.04)?.tone).toBe('flat')
    expect(moneyDelta(null)).toBeNull()
  })
})

describe('hintText', () => {
  it('words each reason', () => {
    expect(hintText({ kind: 'patience', dish: 'fries', count: 2 }, DEFS)).toBe('Customers gave up waiting for Fries')
    expect(hintText({ kind: 'noMatch', count: 2 }, DEFS)).toBe("Menu or prices don't fit customers")
    expect(hintText({ kind: 'waste', item: 'tomato', count: 2 }, DEFS)).toBe('Tomato spoiled on the line')
    expect(hintText(null, DEFS)).toBeNull()
  })
})

describe('starsText and pickReviews', () => {
  it('fills and clamps stars', () => {
    expect(starsText(3)).toBe('★★★☆☆')
    expect(starsText(9)).toBe('★★★★★')
    expect(starsText(-1)).toBe('☆☆☆☆☆')
  })

  it('picks up to 3 reviews, lowest first, stable for ties', () => {
    const r = (stars: number, text: string): Review => ({ stars, text, dish: null, reason: 'great' })
    const picked = pickReviews([r(5, 'a'), r(2, 'b'), r(4, 'c'), r(2, 'd'), r(1, 'e')])
    expect(picked.map((x) => x.text)).toEqual(['e', 'b', 'd'])
    expect(pickReviews([])).toEqual([])
  })
})
