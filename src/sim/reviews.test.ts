// Tests for ratings, reputation and reviews (plan Step 12). Fixtures are inline Defs (sim tests
// may import only vitest and src/sim). Checked: the rating rules per reason, each reason
// producing its template text, reputation equal to the mean of the stored ratings (capped
// at 50), same seed -> same hash and same reviews, the reviews stream never changing who
// arrives, customers dropped at day end getting no rating, lost customers rated 1 or 2,
// the 20-reviews-per-day cap keeping the lowest-rated, and the day-start reputation snapshot.

import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { DAY_TICKS, REVIEWS_PER_DAY, WAITING_CAP } from './constants.ts'
import { reputationOf, stepArrivals, stepCustomers } from './customers.ts'
import { createGame } from './game.ts'
import { stateHash } from './hash.ts'
import { rateLost, rateServed, submitRating } from './reviews.ts'
import { runTicks } from './tick.ts'
import type { BuildingDef, BuildingKind, Command, Customer, Defs, GameState, ReviewReason, SimEvent } from './types.ts'

function debug(message: string): void {
  console.log(`[DEBUG reviews] ${message}\n`)
}

function b(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

const TEMPLATES: Record<ReviewReason, string[]> = {
  waitedLong: ['Waited forever for {dish}', 'Slow {dish}'],
  overpriced: ['{dish} was overpriced', 'Pricey {dish}'],
  notFirstChoice: ['Wanted {pref}, got {dish}', 'No {pref}, took {dish}'],
  noMatch: ['Nothing I wanted at a price I liked'],
  queueFull: ["Couldn't even order, the queue was full"],
  gaveUp: ['Left before my {dish} came', 'Gave up on {dish}'],
  great: ['{dish} was fast and fresh', 'Fresh {dish}'],
}

const BASE: Defs = {
  items: {
    potato: { id: 'potato', name: 'Potato', emoji: '', kind: 'raw', cost: 30 },
    potatoStrips: { id: 'potatoStrips', name: 'Strips', emoji: '', kind: 'processed' },
    fries: { id: 'fries', name: 'Fries', emoji: '', kind: 'dish' },
    salad: { id: 'salad', name: 'Salad', emoji: '', kind: 'dish' },
    burger: { id: 'burger', name: 'Burger', emoji: '', kind: 'dish' },
  },
  buildings: {
    belt: b('belt', 100),
    pantry: b('pantry', 1000),
    splitter: b('splitter', 800),
    merger: b('merger', 800),
    filter: b('filter', 1200),
    chopper: b('chopper', 2500),
    fryer: b('fryer', 4000),
    stove: b('stove', 6000),
    assembler: b('assembler', 5000, { tiles: 2 }),
    pass: b('pass', 0, { placeable: false }),
    bin: b('bin', 500),
  },
  stationRecipes: [
    { station: 'chopper', input: 'potato', output: 'potatoStrips', ticks: 20 },
    { station: 'fryer', input: 'potatoStrips', output: 'fries', ticks: 40 },
  ],
  dishes: {
    fries: { id: 'fries', name: 'Fries', emoji: '', refPrice: 300, popularity: 3, startsUnlocked: true, unlockCost: 0 },
    salad: { id: 'salad', name: 'Salad', emoji: '', refPrice: 450, popularity: 2, startsUnlocked: true, unlockCost: 0 },
    burger: { id: 'burger', name: 'Burger', emoji: '', refPrice: 800, popularity: 3, startsUnlocked: false, unlockCost: 8000 },
  },
}
const DEFS: Defs = { ...BASE, reviewTemplates: TEMPLATES }
/** Same content but no templates: the sim then makes no variant draw on the reviews stream. */
const DEFS_NO_TEXT: Defs = { ...BASE }

const FRIES_LINE: Command[] = [
  { type: 'place', kind: 'belt', x: 1, y: 2, dir: 1 },
  { type: 'place', kind: 'chopper', x: 2, y: 2, dir: 1 },
  { type: 'place', kind: 'belt', x: 3, y: 2, dir: 1 },
  { type: 'place', kind: 'fryer', x: 4, y: 2, dir: 1 },
  { type: 'place', kind: 'belt', x: 5, y: 2, dir: 1 },
  { type: 'place', kind: 'belt', x: 6, y: 2, dir: 1 },
]

function friesLine(defs: Defs, seed = 'test'): GameState {
  let s = createGame(defs, seed)
  for (const c of FRIES_LINE) {
    const out = applyCommand(s, defs, c)
    if (!out.result.ok) throw new Error(`command failed: ${out.result.reason}`)
    s = out.state
  }
  return applyCommand(s, defs, { type: 'openService' }).state
}

function bare(dayTick: number, seed = 'test'): GameState {
  const s = createGame(DEFS, seed)
  s.phase = 'service'
  s.dayTick = dayTick
  return s
}

function cust(over: Partial<Customer> = {}): Customer {
  return { id: 1, arriveTick: 0, prefs: ['fries', 'salad'], budget: 400, patience: 500, dish: 'fries', price: 300, ...over }
}

describe('rating rules (plan 2.5)', () => {
  it('a prompt first-choice dish at a fair price is 5 stars (great)', () => {
    expect(rateServed(cust(), 100)).toEqual({ stars: 5, reason: 'great' })
  })

  it('wait over 50% of patience is -1 and over 80% is -2 (waitedLong)', () => {
    expect(rateServed(cust(), 250)).toEqual({ stars: 5, reason: 'great' }) // exactly 50%: not over
    expect(rateServed(cust(), 251)).toEqual({ stars: 4, reason: 'waitedLong' })
    expect(rateServed(cust(), 400)).toEqual({ stars: 4, reason: 'waitedLong' }) // exactly 80%
    expect(rateServed(cust(), 401)).toEqual({ stars: 3, reason: 'waitedLong' })
  })

  it('price over 90% of budget is -1 (overpriced), not the first choice is -1 (notFirstChoice)', () => {
    expect(rateServed(cust({ price: 360 }), 0)).toEqual({ stars: 5, reason: 'great' }) // exactly 90%
    expect(rateServed(cust({ price: 361 }), 0)).toEqual({ stars: 4, reason: 'overpriced' })
    expect(rateServed(cust({ dish: 'salad', price: 300 }), 0)).toEqual({ stars: 4, reason: 'notFirstChoice' })
  })

  it('penalties add up, the main reason is the biggest one, and the minimum is 1', () => {
    expect(rateServed(cust({ dish: 'salad', price: 400 }), 450)).toEqual({ stars: 1, reason: 'waitedLong' })
    expect(rateServed(cust({ dish: 'salad', price: 400 }), 300)).toEqual({ stars: 2, reason: 'waitedLong' })
    const c = cust({ dish: 'salad', price: 400 })
    expect(rateServed(c, 0)).toEqual({ stars: 3, reason: 'overpriced' })
    const raw = rateServed(cust({ dish: 'salad', price: 400, patience: 100 }), 99)
    expect(raw.stars).toBeGreaterThanOrEqual(1)
  })

  it('lost customers rate 1 (patience) or 2 (nothing wanted, full queue)', () => {
    expect(rateLost('patience')).toEqual({ stars: 1, reason: 'gaveUp' })
    expect(rateLost('noMatch')).toEqual({ stars: 2, reason: 'noMatch' })
    expect(rateLost('full')).toEqual({ stars: 2, reason: 'queueFull' })
  })
})

describe('review text', () => {
  const cases: [string, Customer, ReturnType<typeof rateServed>, string[]][] = [
    ['great', cust(), rateServed(cust(), 10), ['Fries was fast and fresh', 'Fresh Fries']],
    ['waitedLong', cust(), rateServed(cust(), 300), ['Waited forever for Fries', 'Slow Fries']],
    ['overpriced', cust({ price: 399 }), rateServed(cust({ price: 399 }), 10), ['Fries was overpriced', 'Pricey Fries']],
    ['notFirstChoice', cust({ dish: 'salad' }), rateServed(cust({ dish: 'salad' }), 10), ['Wanted Fries, got Salad', 'No Fries, took Salad']],
    ['gaveUp', cust(), rateLost('patience'), ['Left before my Fries came', 'Gave up on Fries']],
    ['noMatch', cust(), rateLost('noMatch'), ['Nothing I wanted at a price I liked']],
    ['queueFull', cust(), rateLost('full'), ["Couldn't even order, the queue was full"]],
  ]
  for (const [name, c, rating, allowed] of cases) {
    it(`reason ${name} produces its template text`, () => {
      expect(rating.reason).toBe(name)
      const s = bare(100)
      const stars = submitRating(s, DEFS, c, rating)
      const review = s.today.reviews[0]
      debug(`${name}: ${stars} stars "${review.text}"`)
      expect(allowed).toContain(review.text)
      expect(review.stars).toBe(stars)
      expect(review.reason).toBe(name)
      expect(review.dish).toBe(c.dish)
    })
  }

  it('picks variants on the reviews stream (both variants show up, same seed same pick)', () => {
    const texts = new Set<string>()
    const s = bare(100)
    for (let i = 0; i < 20; i += 1) submitRating(s, DEFS, cust(), rateServed(cust(), 10))
    for (const r of s.today.reviews) texts.add(r.text)
    expect(texts.size).toBe(2)
    const again = bare(100)
    for (let i = 0; i < 20; i += 1) submitRating(again, DEFS, cust(), rateServed(cust(), 10))
    expect(again.today.reviews).toEqual(s.today.reviews)
    expect(s.rng.arrivals).toEqual(bare(100).rng.arrivals)
  })

  it('without templates the text falls back to the reason key (no variant draw)', () => {
    const s = bare(100)
    submitRating(s, DEFS_NO_TEXT, cust(), rateLost('full'))
    expect(s.today.reviews[0].text).toBe('queueFull')
    expect(s.rng.reviews).toEqual(bare(100).rng.reviews)
  })
})

describe('reputation', () => {
  it('equals the mean of the stored ratings and a new game starts at 3', () => {
    const s = bare(100)
    expect(reputationOf(s)).toBe(3)
    submitRating(s, DEFS, cust(), rateServed(cust(), 10)) // 5
    expect(s.ratings).toHaveLength(11)
    expect(reputationOf(s)).toBeCloseTo((10 * 3 + 5) / 11, 10)
  })

  it('keeps only the last 50 ratings', () => {
    const s = bare(100)
    for (let i = 0; i < 70; i += 1) submitRating(s, DEFS, cust(), i % 2 === 0 ? rateServed(cust(), 10) : rateLost('patience'))
    expect(s.ratings).toHaveLength(50)
    expect(s.ratings.slice(-2)).toEqual([5, 1])
    const mean = s.ratings.reduce((a, r) => a + r, 0) / 50
    expect(reputationOf(s)).toBeCloseTo(mean, 10)
    expect(mean).toBe(3) // 25 fives and 25 ones
  })

  it('openService stores the day-start reputation', () => {
    let s = createGame(DEFS, 'x')
    s.ratings = [5, 5, 4]
    s = applyCommand(s, DEFS, { type: 'openService' }).state
    expect(s.repAtDayStart).toBeCloseTo(14 / 3, 10)
  })
})

describe('integration with customers', () => {
  it('a sale writes a rating and a review; a patience loss rates 1', () => {
    const s = bare(100)
    s.tick = 400
    s.menu = [{ dish: 'fries', price: 300 }]
    s.waiting = [cust({ arriveTick: 100, patience: 500, dish: 'fries', price: 300 })]
    const p = Object.values(s.buildings).find((x) => x.kind === 'pass')
    if (p === undefined || p.kind !== 'pass') throw new Error('no pass')
    p.shelf = [{ id: 1, type: 'fries', bornTick: 400 }]
    // Keep the arrival draw from adding a customer: closing phase has no arrivals.
    s.dayTick = 2300
    stepCustomers(s, DEFS)
    expect(s.today.served).toBe(1)
    expect(s.ratings.at(-1)).toBe(4) // waited 300 of 500: over 50%
    expect(s.today.reviews.at(-1)?.reason).toBe('waitedLong')

    s.tick = 1000
    s.waiting = [cust({ arriveTick: 0, patience: 500 })]
    stepCustomers(s, DEFS)
    expect(s.today.lostPatience).toBe(1)
    expect(s.ratings.at(-1)).toBe(1)
    expect(s.today.reviews.at(-1)?.text).toMatch(/Fries/)
  })

  it('noMatch and queue-full arrivals are rated 2', () => {
    const s = bare(300)
    s.menu = [{ dish: 'burger', price: 800 }]
    for (let i = 0; i < 3000 && s.today.lostNoMatch === 0; i += 1) {
      s.tick = i
      stepArrivals(s, DEFS)
    }
    expect(s.today.lostNoMatch).toBeGreaterThan(0)
    expect(s.ratings.at(-1)).toBe(2)
    expect(s.today.reviews.at(-1)?.reason).toBe('noMatch')

    const f = bare(300, 'full')
    f.menu = [{ dish: 'fries', price: 270 }, { dish: 'salad', price: 405 }, { dish: 'burger', price: 600 }]
    f.waiting = Array.from({ length: WAITING_CAP.stall }, (_, i) => cust({ id: -i, arriveTick: 0, patience: 1_000_000 }))
    for (let i = 0; i < 3000 && f.today.lostFull === 0; i += 1) {
      f.tick = i
      stepArrivals(f, DEFS)
    }
    expect(f.today.lostFull).toBeGreaterThan(0)
    expect(f.today.reviews.some((r) => r.reason === 'queueFull' && r.stars === 2)).toBe(true)
  })

  it('customers still waiting when the day ends get no rating', () => {
    const s = bare(DAY_TICKS - 1)
    s.tick = 5000
    s.waiting = [cust({ arriveTick: 4900 }), cust({ id: 2, arriveTick: 4950 })]
    const ratings = [...s.ratings]
    const end = runTicks(s, DEFS, 1)
    expect(end.phase).toBe('summary')
    expect(end.waiting).toEqual([])
    expect(end.ratings).toEqual(ratings)
    expect(end.today.reviews).toEqual([])
    expect(end.lastDay?.lostPatience).toBe(0)
  })

  it('same seed gives the same hash, ratings and reviews; another seed differs', () => {
    const a = runTicks(friesLine(DEFS, 'demo'), DEFS, DAY_TICKS)
    const c = runTicks(friesLine(DEFS, 'demo'), DEFS, DAY_TICKS)
    const other = runTicks(friesLine(DEFS, 'other'), DEFS, DAY_TICKS)
    debug(`demo: ${a.lastDay?.reviews.length} reviews, ${a.ratings.length} ratings, rep ${reputationOf(a).toFixed(2)}`)
    expect(stateHash(a)).toBe(stateHash(c))
    expect(a.lastDay?.reviews).toEqual(c.lastDay?.reviews)
    expect(a.ratings).toEqual(c.ratings)
    expect(a.lastDay?.reviews.length).toBeGreaterThan(0)
    expect(stateHash(a)).not.toBe(stateHash(other))
  })

  it('the reviews stream does not change arrivals (arrival log equal with variant drawing off)', () => {
    const log = (defs: Defs): string[] => {
      const out: string[] = []
      const onEvents = (events: SimEvent[]): void => {
        for (const e of events) {
          if (e.type === 'customerArrived') out.push(`${e.tick}:${e.id}:${e.prefs.join('>')}:${e.dish}:${e.price}`)
        }
      }
      runTicks(friesLine(defs, 'demo'), defs, DAY_TICKS, onEvents)
      return out
    }
    const withText = log(DEFS)
    const withoutText = log(DEFS_NO_TEXT)
    debug(`arrivals logged: ${withText.length}`)
    expect(withText.length).toBeGreaterThan(5)
    expect(withText).toEqual(withoutText)
    // The streams are separate objects: drawing text only moves `reviews`.
    const a = runTicks(friesLine(DEFS, 'demo'), DEFS, DAY_TICKS)
    const n = runTicks(friesLine(DEFS_NO_TEXT, 'demo'), DEFS_NO_TEXT, DAY_TICKS)
    expect(a.rng.arrivals).toEqual(n.rng.arrivals)
    expect(a.rng.reviews).not.toEqual(n.rng.reviews)
  })
})

describe('reviews kept per day', () => {
  it('keeps at most 20, always the lowest-rated, and is deterministic', () => {
    const fill = (): GameState => {
      const s = bare(100, 'cap')
      // 60 mixed ratings; one 1-star early (will be the lowest) among 4s and 5s.
      submitRating(s, DEFS, cust(), rateLost('patience'))
      s.today.lostPatience += 1
      for (let i = 0; i < 59; i += 1) {
        const rating = i % 3 === 0 ? rateServed(cust({ dish: 'salad' }), 10) : rateServed(cust(), 10)
        submitRating(s, DEFS, cust(), rating)
        s.today.served += 1
      }
      return s
    }
    const s = fill()
    expect(s.today.reviews).toHaveLength(REVIEWS_PER_DAY)
    expect(Math.min(...s.today.reviews.map((r) => r.stars))).toBe(1)
    expect(s.ratings).toHaveLength(50)
    expect(fill().today.reviews).toEqual(s.today.reviews)
  })

  it('a lower review pushes into a full list and survives later higher ones', () => {
    const s = bare(100, 'cap2')
    for (let i = 0; i < REVIEWS_PER_DAY; i += 1) {
      submitRating(s, DEFS, cust(), rateServed(cust(), 10))
      s.today.served += 1
    }
    submitRating(s, DEFS, cust(), rateLost('noMatch'))
    s.today.lostNoMatch += 1
    expect(s.today.reviews).toHaveLength(REVIEWS_PER_DAY)
    expect(s.today.reviews.filter((r) => r.stars === 2)).toHaveLength(1)
    for (let i = 0; i < 100; i += 1) {
      submitRating(s, DEFS, cust(), rateServed(cust(), 10))
      s.today.served += 1
    }
    expect(s.today.reviews).toHaveLength(REVIEWS_PER_DAY)
    expect(s.today.reviews.filter((r) => r.stars === 2)).toHaveLength(1)
  })
})
