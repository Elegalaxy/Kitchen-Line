// Tests for customers, orders and the economy (plan Step 11). Fixtures are inline Defs (sim
// tests may import only vitest and src/sim). Checked: same seed -> same customers (hash
// equal), the rush rate is about 3.3x a quiet period (statistical, see below), a menu without
// fries loses fries-first customers (lostNoMatch), lostFull, lostPatience, a dish never goes
// to a customer who ordered something else, the oldest matching customer is served first,
// money only rises through sales, no arrivals while closing, and leftovers at day end are
// dropped without a rating or a loss (Q6).

import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { ARRIVAL_GAP_QUIET, ARRIVAL_GAP_RUSH, DAY_TICKS, PASS_DROP_AGE_TICKS, WAITING_CAP } from './constants.ts'
import { arrivalChance, stepArrivals } from './customers.ts'
import { profitOf } from './economy.ts'
import { createGame } from './game.ts'
import { stateHash } from './hash.ts'
import { runTicks } from './tick.ts'
import { tryInsert } from './transfer.ts'
import type { Building, BuildingDef, BuildingKind, Command, Customer, Defs, GameState, SimEvent } from './types.ts'

function debug(message: string): void {
  console.log(`[DEBUG customers] ${message}\n`)
}

function b(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

const DEFS: Defs = {
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

const FRIES_LINE: Command[] = [
  { type: 'place', kind: 'belt', x: 1, y: 2, dir: 1 },
  { type: 'place', kind: 'chopper', x: 2, y: 2, dir: 1 },
  { type: 'place', kind: 'belt', x: 3, y: 2, dir: 1 },
  { type: 'place', kind: 'fryer', x: 4, y: 2, dir: 1 },
  { type: 'place', kind: 'belt', x: 5, y: 2, dir: 1 },
  { type: 'place', kind: 'belt', x: 6, y: 2, dir: 1 },
]

/** A fries line in service at day tick 0 (nothing warming). */
function friesLine(seed = 'test'): GameState {
  let s = createGame(DEFS, seed)
  for (const c of FRIES_LINE) {
    const out = applyCommand(s, DEFS, c)
    if (!out.result.ok) throw new Error(`command failed: ${out.result.reason}`)
    s = out.state
  }
  return applyCommand(s, DEFS, { type: 'openService' }).state
}

/** A bare game in service at the given day tick: just the pass and the potato pantry. */
function bare(dayTick: number, seed = 'test'): GameState {
  const s = createGame(DEFS, seed)
  s.phase = 'service'
  s.dayTick = dayTick
  return s
}

function pass(s: GameState): Building & { kind: 'pass' } {
  const p = Object.values(s.buildings).find((x) => x.kind === 'pass')
  if (p === undefined || p.kind !== 'pass') throw new Error('no pass')
  return p
}

function customer(id: number, dish: string, price: number, patience = 500, arriveTick = 0): Customer {
  return { id, arriveTick, prefs: [dish], budget: price, patience, dish, price }
}

function item(id: number, type: string) {
  return { id, type, bornTick: 0 }
}

/** Stop the pantry so a fixture does not spend money on its own. */
function quietPantry(s: GameState): void {
  for (const x of Object.values(s.buildings)) {
    if (x.kind === 'pantry') {
      x.interval = 1_000_000
      x.cooldown = 1_000_000
    }
  }
}

describe('arrivals', () => {
  it('same seed gives the same customers; another seed differs', () => {
    const a = runTicks(friesLine('demo'), DEFS, DAY_TICKS)
    const c = runTicks(friesLine('demo'), DEFS, DAY_TICKS)
    const other = runTicks(friesLine('other'), DEFS, DAY_TICKS)
    debug(`customers today: demo=${a.today.customers} other=${other.today.customers}`)
    expect(stateHash(a)).toBe(stateHash(c))
    expect(a.today.customers).toBeGreaterThan(0)
    expect(stateHash(a)).not.toBe(stateHash(other))
    // Two batches equal one batch (the clone per call cannot change the draws).
    expect(stateHash(runTicks(runTicks(friesLine('demo'), DEFS, 1000), DEFS, DAY_TICKS - 1000))).toBe(stateHash(a))
  })

  it('the rush has about 3.3x the arrival rate of a quiet period (10,000 ticks per phase, pooled over 20 seeds)', () => {
    // A day is only 2400 ticks, so the arrival logic is stepped directly: the day tick is
    // held inside one phase and `stepArrivals` runs 10,000 times per seed and phase. Waiting
    // is cleared each step so every arrival is counted (`today.customers` counts them all).
    // Each 10,000-tick sample alone is noisy (about 67 quiet arrivals, sd 8), so 20 seeds are
    // pooled (200,000 ticks per phase): the ratio's sd is about 0.1, far inside the +-15%
    // (+-0.45) band. All draws are seeded, so the numbers never change.
    const sample = (seed: string, dayTick: number): number => {
      const s = bare(dayTick, seed)
      for (let i = 0; i < 10_000; i += 1) {
        s.tick = i
        s.waiting = []
        stepArrivals(s, DEFS)
      }
      return s.today.customers
    }
    const seeds = Array.from({ length: 20 }, (_, i) => `seed${i}`)
    const ticks = seeds.length * 10_000
    const quiet = seeds.reduce((n, seed) => n + sample(seed, 100), 0) // open: quiet
    const rush = seeds.reduce((n, seed) => n + sample(seed, 300), 0) // lunch rush
    const ratio = rush / quiet
    debug(`arrivals per ${ticks} ticks: quiet=${quiet} (expected ${ticks / ARRIVAL_GAP_QUIET}) rush=${rush} (expected ${ticks / ARRIVAL_GAP_RUSH}) ratio=${ratio.toFixed(2)}`)
    expect(Math.abs(ratio - ARRIVAL_GAP_QUIET / ARRIVAL_GAP_RUSH)).toBeLessThanOrEqual(0.45)
    expect(Math.abs(quiet / (ticks / ARRIVAL_GAP_QUIET) - 1)).toBeLessThanOrEqual(0.15)
  })

  it('chance follows reputation and tier; it is zero while closing, and one draw is made per non-closing tick', () => {
    const s = bare(100)
    expect(arrivalChance(s, DEFS)).toBeCloseTo(1 / ARRIVAL_GAP_QUIET, 10) // 3 stars, stall
    s.ratings = [5, 5]
    expect(arrivalChance(s, DEFS)).toBeCloseTo((1 / ARRIVAL_GAP_QUIET) * 1.4, 10)
    s.ratings = [1]
    expect(arrivalChance(s, DEFS)).toBeCloseTo((1 / ARRIVAL_GAP_QUIET) * 0.6, 10)
    s.ratings = [3]
    s.tier = 'restaurant'
    expect(arrivalChance(s, DEFS)).toBeCloseTo((1 / ARRIVAL_GAP_QUIET) * 2.0, 10)
    s.dayTick = 2280
    expect(arrivalChance(s, DEFS)).toBe(0)

    const open = runTicks(bare(100), DEFS, 1)
    expect(open.rng.arrivals).not.toEqual(bare(100).rng.arrivals) // drew this tick
    const closing = runTicks(bare(2280), DEFS, 1)
    expect(closing.rng.arrivals).toEqual(bare(2280).rng.arrivals) // no draw while closing
  })

  it('no customer arrives during the closing phase', () => {
    let s = bare(2280)
    s.menu = [{ dish: 'fries', price: 300 }]
    s = runTicks(s, DEFS, DAY_TICKS - 2280 - 1)
    expect(s.today.customers).toBe(0)
    expect(s.waiting).toEqual([])
  })
})

describe('choice and losses', () => {
  it('a menu without fries loses fries-first customers who cannot afford anything else (lostNoMatch)', () => {
    // Menu: burger at $8.00 only. A fries-first customer's budget is 90-140% of $3.00
    // ($2.70 to $4.20), so they can never afford the burger.
    const s = bare(300)
    s.menu = [{ dish: 'burger', price: 800 }]
    const arrived: Extract<SimEvent, { type: 'customerArrived' }>[] = []
    for (let i = 0; i < 6000; i += 1) {
      s.tick = i
      s.waiting = []
      s.events = []
      stepArrivals(s, DEFS)
      for (const e of s.events) if (e.type === 'customerArrived') arrived.push(e)
    }
    debug(`customers=${s.today.customers} noMatch=${s.today.lostNoMatch} fries.lost=${s.today.byDish['fries']?.lost}`)
    expect(s.today.customers).toBeGreaterThan(50)
    expect(s.today.byDish['fries']?.lost ?? 0).toBeGreaterThan(0)
    expect(s.today.lostNoMatch).toBeGreaterThanOrEqual(s.today.byDish['fries']?.lost ?? 0)
    expect(arrived.length + s.today.lostNoMatch + s.today.lostFull).toBe(s.today.customers)
    expect(arrived.every((e) => e.dish === 'burger' && e.prefs[0] !== 'fries')).toBe(true)
  })

  it('a customer takes their next liked dish when the first is not on the menu', () => {
    const s = bare(300)
    s.menu = [{ dish: 'fries', price: 300 }]
    let secondChoice = 0
    for (let i = 0; i < 6000; i += 1) {
      s.tick = i
      s.waiting = []
      s.events = []
      stepArrivals(s, DEFS)
      for (const e of s.events) if (e.type === 'customerArrived' && e.prefs[0] !== 'fries') secondChoice += 1
    }
    expect(secondChoice).toBeGreaterThan(0)
  })

  it('counts lostFull when the waiting list is full, and leaves the waiting list alone', () => {
    const cap = WAITING_CAP.stall
    const s = bare(300)
    s.menu = [
      { dish: 'fries', price: 300 },
      { dish: 'salad', price: 450 },
      { dish: 'burger', price: 800 },
    ]
    const crowd = Array.from({ length: cap }, (_, i) => customer(1000 + i, 'salad', 450, 1_000_000))
    s.waiting = structuredClone(crowd)
    for (let i = 0; i < 3000; i += 1) {
      s.tick = i
      stepArrivals(s, DEFS)
    }
    debug(`customers=${s.today.customers} lostFull=${s.today.lostFull} lostNoMatch=${s.today.lostNoMatch}`)
    expect(s.today.lostFull).toBeGreaterThan(0)
    expect(s.today.lostFull + s.today.lostNoMatch).toBe(s.today.customers)
    expect(s.waiting).toEqual(crowd)
  })

  it('the restaurant tier waits for up to 10 orders', () => {
    const s = bare(300)
    s.tier = 'restaurant'
    s.menu = [
      { dish: 'fries', price: 300 },
      { dish: 'salad', price: 450 },
      { dish: 'burger', price: 800 },
    ]
    for (let i = 0; i < 20_000; i += 1) {
      s.tick = i
      stepArrivals(s, DEFS)
    }
    expect(s.waiting.length).toBe(WAITING_CAP.restaurant)
    expect(WAITING_CAP.restaurant).toBe(10)
  })

  it('counts lostPatience exactly when patience ends, and books the loss to the ordered dish', () => {
    // Closing phase: no new arrivals. Patience 50 from tick 100: still waiting at tick 149
    // (wait 49), gone at tick 150 (wait 50).
    const s = bare(2280)
    s.tick = 100
    s.waiting = [customer(7, 'fries', 300, 50, 100)]
    quietPantry(s)
    const still = runTicks(s, DEFS, 50) // ticks 100..149
    expect(still.waiting.map((c) => c.id)).toEqual([7])
    expect(still.today.lostPatience).toBe(0)
    const gone = runTicks(s, DEFS, 51) // tick 150: wait 50 >= patience
    expect(gone.waiting).toEqual([])
    expect(gone.today.lostPatience).toBe(1)
    expect(gone.today.byDish['fries']?.lost).toBe(1)
    expect(gone.today.served).toBe(0)
    expect(gone.events).toEqual([{ type: 'customerLeft', tick: 150, id: 7, reason: 'patience', dish: 'fries' }])
    expect(gone.money).toBe(s.money)
  })
})

describe('the pass and sales', () => {
  it('never gives a dish to a customer who ordered something else', () => {
    const s = bare(2280)
    s.tick = 10
    quietPantry(s)
    pass(s).shelf = [item(1, 'salad')]
    s.waiting = [customer(1, 'fries', 300), customer(2, 'burger', 800)]
    const out = runTicks(s, DEFS, 5)
    expect(pass(out).shelf.map((i) => i.type)).toEqual(['salad'])
    expect(out.waiting.map((c) => c.id)).toEqual([1, 2])
    expect(out.today.served).toBe(0)
    expect(out.money).toBe(s.money)
  })

  it('sells a dish waiting on a second pass', () => {
    const s = bare(2280)
    s.tick = 50
    s.tier = 'restaurant'
    quietPantry(s)
    const forSale: Defs = { ...DEFS, buildings: { ...DEFS.buildings, pass: b('pass', 40000, { requiresTier: 'restaurant' }) } }
    const second = applyCommand({ ...s, money: 100000 }, forSale, { type: 'place', kind: 'pass', x: 7, y: 3, dir: 3 })
    expect(second.result.ok).toBe(true)
    const t = second.state
    const extra = Object.values(t.buildings).filter((x) => x.kind === 'pass')[1]
    if (extra === undefined || extra.kind !== 'pass') throw new Error('no second pass')
    extra.shelf = [item(1, 'salad')]
    t.waiting = [customer(1, 'salad', 450, 500, 30)]
    const before = t.money
    const out = runTicks(t, DEFS, 1)
    expect(out.today.served).toBe(1)
    expect(out.money).toBe(before + 450)
    expect(out.waiting).toEqual([])
  })

  it('gives a dish to the oldest customer waiting for exactly that dish, and pays the price', () => {
    const s = bare(2280)
    s.tick = 50
    quietPantry(s)
    pass(s).shelf = [item(1, 'salad')]
    s.waiting = [customer(1, 'fries', 300, 500, 20), customer(2, 'salad', 450, 500, 30), customer(3, 'salad', 460, 500, 40)]
    const out = runTicks(s, DEFS, 1)
    expect(out.waiting.map((c) => c.id)).toEqual([1, 3])
    expect(pass(out).shelf).toEqual([])
    expect(out.money).toBe(s.money + 450)
    expect(out.today.sales).toBe(450)
    expect(out.today.served).toBe(1)
    expect(out.today.waitTicksTotal).toBe(20) // tick 50 - arrived 30
    expect(out.today.byDish['salad']).toEqual({ served: 1, lost: 0, sales: 450 })
    expect(out.totals.served).toBe(1)
    expect(out.events).toEqual([{ type: 'served', tick: 50, id: 2, dish: 'salad', price: 450, wait: 20 }])
  })

  it('keeps unmatched dishes on the shelf, capped at 4', () => {
    let s = friesLine()
    s.menu = [] // nobody ever waits
    for (let t = 0; t < 600; t += 1) s = runTicks(s, DEFS, 1)
    const shelf = pass(s).shelf
    debug(`shelf after 600 ticks with no customers: ${shelf.length}, delivered ${pass(s).delivered}, spoiled ${s.today.wasteSpoiled}`)
    expect(shelf.length).toBeGreaterThan(0)
    expect(shelf.length).toBeLessThanOrEqual(4)
  })

  it('keeps at most 4 of each dish: once the oldest copy is old enough a 5th is accepted and the OLDEST is thrown away (GAME_DESIGN 5.3)', () => {
    const s = bare(2280)
    s.tick = PASS_DROP_AGE_TICKS // items are born at tick 0, so the oldest copy is old enough to drop
    pass(s).shelf = [item(1, 'fries'), item(2, 'fries'), item(3, 'fries'), item(4, 'fries')]
    expect(tryInsert(s, DEFS, pass(s), item(5, 'fries'), 3)).toBe(true)
    expect(pass(s).shelf.map((i) => i.id)).toEqual([2, 3, 4, 5]) // id 1 (oldest) is gone
    expect(tryInsert(s, DEFS, pass(s), item(6, 'salad'), 3)).toBe(true) // a salad fits next to them
    expect(pass(s).shelf.map((i) => i.type)).toEqual(['fries', 'fries', 'fries', 'fries', 'salad'])
    // A dropped dish is not delivered twice; both new dishes count, and nothing else was dropped.
    expect(pass(s).delivered).toBe(2)
  })

  it('a full shelf of YOUNG copies refuses a 5th one (the belt backs up) until the oldest reaches the drop age', () => {
    const s = bare(2280)
    s.tick = 1000
    const young = s.tick - (PASS_DROP_AGE_TICKS - 1)
    const copy = (id: number) => ({ id, type: 'fries', bornTick: young })
    pass(s).shelf = [copy(1), copy(2), copy(3), copy(4)]
    expect(tryInsert(s, DEFS, pass(s), item(5, 'fries'), 3)).toBe(false)
    expect(pass(s).shelf).toHaveLength(4)
    expect(pass(s).delivered).toBe(0)
    expect(s.today.wasteSpoiled).toBe(0)
    s.tick += 1 // the oldest copy is now exactly PASS_DROP_AGE_TICKS old
    expect(tryInsert(s, DEFS, pass(s), item(5, 'fries'), 3)).toBe(true)
    expect(pass(s).shelf.map((i) => i.id)).toEqual([2, 3, 4, 5])
    expect(s.today.wasteSpoiled).toBe(1)
  })

  it('a full shelf drops at once when a DIFFERENT dish waits behind on the feeding belt, and refuses when it is the same dish', () => {
    const base = bare(500)
    const placed = applyCommand(base, DEFS, { type: 'place', kind: 'belt', x: 6, y: 2, dir: 1 })
    if (!placed.result.ok) throw new Error(`command failed: ${placed.result.reason}`)
    const make = (behind: string) => {
      const s = structuredClone(placed.state)
      s.tick = 1000
      const belt = Object.values(s.buildings).find((x) => x.kind === 'belt')
      if (belt === undefined || belt.kind !== 'belt') throw new Error('no belt')
      belt.slots = [{ id: 30, type: behind, bornTick: s.tick }, { id: 10, type: 'fries', bornTick: s.tick }]
      pass(s).shelf = [1, 2, 3, 4].map((id) => ({ id, type: 'fries', bornTick: s.tick }))
      return s
    }
    const mixed = make('salad')
    expect(tryInsert(mixed, DEFS, pass(mixed), { id: 10, type: 'fries', bornTick: 1000 }, 3)).toBe(true)
    expect(pass(mixed).shelf.map((i) => i.id)).toEqual([2, 3, 4, 10])
    const same = make('fries')
    expect(tryInsert(same, DEFS, pass(same), { id: 10, type: 'fries', bornTick: 1000 }, 3)).toBe(false)
    expect(pass(same).shelf).toHaveLength(4)
  })

  it('records the dropped dish as spoiled waste (counter, per item and a spoiled event)', () => {
    const s = bare(2280)
    s.tick = PASS_DROP_AGE_TICKS
    pass(s).shelf = [item(1, 'fries'), item(2, 'fries'), item(3, 'fries'), item(4, 'fries')]
    tryInsert(s, DEFS, pass(s), item(5, 'fries'), 3)
    expect(s.today.wasteSpoiled).toBe(1)
    expect(s.today.spoiledByItem['fries']).toBe(1)
    expect(s.events.filter((e) => e.type === 'spoiled')).toHaveLength(1)
    // A salad onto a shelf with room throws nothing away.
    tryInsert(s, DEFS, pass(s), item(6, 'salad'), 3)
    expect(s.today.wasteSpoiled).toBe(1)
  })

  it('an unsold dish no longer jams the belt behind it: a salad queued behind a 5th fries still arrives', () => {
    const s = bare(500)
    s.menu = [] // nobody buys anything
    const placed = applyCommand(s, DEFS, { type: 'place', kind: 'belt', x: 6, y: 2, dir: 1 })
    if (!placed.result.ok) throw new Error(`command failed: ${placed.result.reason}`)
    let cur = placed.state
    cur.phase = 'service'
    const belt = Object.values(cur.buildings).find((x) => x.kind === 'belt')
    if (belt === undefined || belt.kind !== 'belt') throw new Error('no belt')
    belt.onlineAt = 0
    const born = cur.tick
    // Young shelf copies: a different dish waiting behind makes the pass drop the oldest at once.
    pass(cur).shelf = [1, 2, 3, 4].map((id) => ({ id, type: 'fries', bornTick: born }))
    belt.slots = [{ id: 20, type: 'salad', bornTick: born }, { id: 10, type: 'fries', bornTick: born }]
    cur = runTicks(cur, DEFS, 40)
    const shelf = pass(cur).shelf.map((i) => i.type)
    expect(shelf.filter((t) => t === 'fries')).toHaveLength(4)
    expect(shelf).toContain('salad')
    const after = Object.values(cur.buildings).find((x) => x.kind === 'belt')
    expect(after !== undefined && after.kind === 'belt' ? after.slots : null).toEqual([null, null])
  })

  it('wait is 0 when the dish is already on the shelf, and the delivery delay when it is not (the avgWait finding)', () => {
    // Stocked shelf: the customer is matched in the tick they arrive (arrivals run before matching).
    const stocked = bare(2280)
    stocked.tick = 80
    quietPantry(stocked)
    pass(stocked).shelf = [item(1, 'fries')]
    stocked.waiting = [customer(1, 'fries', 300, 500, 80)]
    expect(runTicks(stocked, DEFS, 1).today.waitTicksTotal).toBe(0)
    // Empty shelf: the dish lands 25 ticks later, so the customer waited 25 ticks.
    let empty = bare(2280)
    empty.tick = 80
    quietPantry(empty)
    empty.waiting = [customer(1, 'fries', 300, 500, 80)]
    for (let i = 0; i < 25; i += 1) empty = runTicks(empty, DEFS, 1)
    expect(empty.today.served).toBe(0)
    pass(empty).shelf = [item(2, 'fries')]
    empty = runTicks(empty, DEFS, 1)
    expect(empty.today.served).toBe(1)
    expect(empty.today.waitTicksTotal).toBe(25)
  })

  it('money only rises through sales over a full day', () => {
    // Per tick the money change is exactly the sales made minus the ingredients bought.
    let s = friesLine('demo')
    const startMoney = s.money
    let sold = 0
    let sales = 0
    for (let t = 0; t < DAY_TICKS; t += 1) {
      const before = s.money
      s = runTicks(s, DEFS, 1)
      let delta = 0
      for (const e of s.events) {
        if (e.type === 'served') {
          delta += e.price
          sold += 1
          sales += e.price
        }
        if (e.type === 'emit') delta -= e.cost
      }
      expect(s.money - before).toBe(delta)
    }
    debug(`day: customers=${s.today.customers} sold=${sold} sales=${sales} cost=${s.today.ingredientCost} money ${startMoney} -> ${s.money}`)
    expect(s.phase).toBe('summary')
    expect(sold).toBeGreaterThan(0)
    expect(s.lastDay?.served).toBe(sold)
    expect(s.lastDay?.sales).toBe(sales)
    expect(s.money).toBe(startMoney + sales - (s.lastDay?.ingredientCost ?? 0))
    expect(profitOf(s.lastDay ?? s.today)).toBe(sales - (s.lastDay?.ingredientCost ?? 0))
  })

  it('drops customers still waiting at day end without a rating or a loss (Q6)', () => {
    let s = bare(DAY_TICKS - 2)
    s.menu = [{ dish: 'fries', price: 300 }]
    quietPantry(s)
    s.waiting = [customer(1, 'fries', 300, 600, 2300), customer(2, 'salad', 450, 600, 2310)]
    const ratings = [...s.ratings]
    s = runTicks(s, DEFS, 2)
    expect(s.phase).toBe('summary')
    expect(s.waiting).toEqual([])
    expect(s.lastDay?.lostPatience).toBe(0)
    expect(s.lastDay?.lostNoMatch).toBe(0)
    expect(s.lastDay?.lostFull).toBe(0)
    expect(s.lastDay?.served).toBe(0)
    expect(s.ratings).toEqual(ratings)
    const reasons = s.events.flatMap((e) => (e.type === 'customerLeft' ? [e.reason] : []))
    expect(reasons).toEqual(['closing', 'closing'])
  })
})
