// Tests for the menu commands (plan Step 14): setMenu, setPrice, unlockRecipe, plus the
// price bounds. Inline Defs fixture (sim tests import only src/sim). Rules checked: all
// three only work in the build phase (service: 'Menu is locked during service', summary
// and won: 'wrong phase'); the menu fits the tier cap; only unlocked dishes go on it;
// prices are whole cents in 10-cent steps within 50% to 300% of the reference and are
// rejected, never clamped; unlocking charges the cost once. Every rejection leaves the
// state unchanged (same stateHash) and no input is mutated (inputs are deep-frozen).

import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { MENU_CAP } from './constants.ts'
import { createGame } from './game.ts'
import { stateHash } from './hash.ts'
import { priceBounds, priceProblem } from './menu.ts'
import type { BuildingDef, BuildingKind, Command, Defs, DishDef, GameState } from './types.ts'

function debug(message: string): void {
  console.log(`[DEBUG menu] ${message}\n`)
}

function bd(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

function dish(id: string, refPrice: number, unlocked: boolean, unlockCost: number): DishDef {
  return { id, name: id, emoji: '', refPrice, popularity: 1, startsUnlocked: unlocked, unlockCost }
}

const DEFS: Defs = {
  items: { potato: { id: 'potato', name: 'Potato', emoji: '', kind: 'raw', cost: 30 } },
  buildings: {
    belt: bd('belt', 100),
    pantry: bd('pantry', 1000),
    splitter: bd('splitter', 800),
    merger: bd('merger', 800),
    filter: bd('filter', 1200),
    chopper: bd('chopper', 2500),
    fryer: bd('fryer', 4000),
    stove: bd('stove', 6000),
    assembler: bd('assembler', 5000, { tiles: 2 }),
    pass: bd('pass', 0, { placeable: false }),
    bin: bd('bin', 500),
  },
  stationRecipes: [],
  dishes: {
    fries: dish('fries', 300, true, 0),
    salad: dish('salad', 450, true, 0),
    soup: dish('soup', 400, false, 4000),
    sandwich: dish('sandwich', 600, false, 6000),
    burger: dish('burger', 800, false, 8000),
    riceBowl: dish('riceBowl', 700, false, 10000),
    pie: dish('pie', 500, false, 20000),
  },
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

/** Build-phase game with these extra dishes unlocked and this money, deep-frozen. */
function game(unlock: string[] = [], money?: number): GameState {
  const s = createGame(DEFS, 'menu-test')
  s.unlocked.push(...unlock)
  if (money !== undefined) s.money = money
  return deepFreeze(s)
}

/** A deep-frozen copy of `s` with some fields replaced. */
function variant(s: GameState, patch: Partial<GameState>): GameState {
  return deepFreeze({ ...structuredClone(s), ...patch })
}

function ok(state: GameState, cmd: Command): GameState {
  const out = applyCommand(state, DEFS, cmd)
  expect(out.result).toEqual({ ok: true })
  return out.state
}

function expectRejected(state: GameState, cmd: Command, reason: string): void {
  const before = stateHash(state)
  const out = applyCommand(state, DEFS, cmd)
  debug(`rejected ${cmd.type}: ${out.result.ok ? 'OK?!' : out.result.reason}`)
  expect(out.result.ok).toBe(false)
  if (!out.result.ok) {
    expect(out.result.reason).toBe(reason)
    expect(out.result.event).toMatchObject({ type: 'commandRejected', command: cmd.type, reason })
  }
  expect(stateHash(out.state)).toBe(before)
  expect(stateHash(state)).toBe(before)
}

describe('priceBounds', () => {
  it('is 50% to 300% of the reference, snapped inward to 10-cent steps', () => {
    expect(priceBounds(300)).toEqual({ min: 150, max: 900 })
    expect(priceBounds(800)).toEqual({ min: 400, max: 2400 })
    expect(priceBounds(450)).toEqual({ min: 230, max: 1350 })
    expect(priceBounds(0)).toEqual({ min: 0, max: 0 })
  })

  it('priceProblem tells step problems from range problems', () => {
    expect(priceProblem(300, 150)).toBeNull()
    expect(priceProblem(300, 900)).toBeNull()
    expect(priceProblem(300, 140)).toBe('price out of range')
    expect(priceProblem(300, 910)).toBe('price out of range')
    expect(priceProblem(300, 355)).toBe('invalid price')
    expect(priceProblem(300, 350.5)).toBe('invalid price')
    expect(priceProblem(300, Number.NaN)).toBe('invalid price')
    expect(priceProblem(300, '350')).toBe('invalid price')
  })
})

describe('setMenu', () => {
  it('adds an unlocked dish at its reference price and keeps the price of dishes already on the menu', () => {
    let s = ok(game(), { type: 'setPrice', dish: 'fries', cents: 350 })
    s = ok(s, { type: 'setMenu', dishes: ['fries', 'salad'] })
    expect(s.menu).toEqual([
      { dish: 'fries', price: 350 },
      { dish: 'salad', price: 450 },
    ])
  })

  it('removes a dish, allows an empty menu, and re-adding resets the price to the reference', () => {
    let s = ok(game(), { type: 'setPrice', dish: 'fries', cents: 350 })
    s = ok(s, { type: 'setMenu', dishes: [] })
    expect(s.menu).toEqual([])
    s = ok(s, { type: 'setMenu', dishes: ['fries'] })
    expect(s.menu).toEqual([{ dish: 'fries', price: 300 }])
  })

  it('does not mutate its input and leaves money and unlocks alone', () => {
    const s0 = game()
    const before = stateHash(s0)
    const s1 = ok(s0, { type: 'setMenu', dishes: ['salad'] })
    expect(stateHash(s0)).toBe(before)
    expect(s1.menu).toEqual([{ dish: 'salad', price: 450 }])
    expect([s1.money, s1.unlocked]).toEqual([s0.money, s0.unlocked])
  })

  it('rejects a locked dish, an unknown dish, duplicates and junk', () => {
    const s = game()
    expectRejected(s, { type: 'setMenu', dishes: ['fries', 'soup'] }, 'locked recipe')
    expectRejected(s, { type: 'setMenu', dishes: ['nope'] }, 'invalid command')
    expectRejected(s, { type: 'setMenu', dishes: ['fries', 'fries'] }, 'invalid command')
    expectRejected(s, { type: 'setMenu', dishes: 'fries' as unknown as string[] }, 'invalid command')
    expectRejected(s, { type: 'setMenu', dishes: [3] as unknown as string[] }, 'invalid command')
    expectRejected(s, { type: 'setMenu' } as unknown as Command, 'invalid command')
  })

  it('enforces the tier cap (stall 4, restaurant 6) and rejects with "menu full"', () => {
    expect(MENU_CAP).toEqual({ stall: 4, restaurant: 6 })
    const s = game(['soup', 'sandwich', 'burger', 'riceBowl', 'pie'])
    const four = ok(s, { type: 'setMenu', dishes: ['fries', 'salad', 'soup', 'sandwich'] })
    expect(four.menu).toHaveLength(4)
    expectRejected(four, { type: 'setMenu', dishes: ['fries', 'salad', 'soup', 'sandwich', 'burger'] }, 'menu full')
    const restaurant = variant(s, { tier: 'restaurant' })
    const six = ok(restaurant, { type: 'setMenu', dishes: ['fries', 'salad', 'soup', 'sandwich', 'burger', 'riceBowl'] })
    expect(six.menu).toHaveLength(6)
    expectRejected(
      restaurant,
      { type: 'setMenu', dishes: ['fries', 'salad', 'soup', 'sandwich', 'burger', 'riceBowl', 'pie'] },
      'menu full',
    )
  })
})

describe('setPrice', () => {
  it('sets the price of a dish on the menu, including both bounds', () => {
    const s = game()
    expect(ok(s, { type: 'setPrice', dish: 'fries', cents: 450 }).menu).toEqual([{ dish: 'fries', price: 450 }])
    expect(ok(s, { type: 'setPrice', dish: 'fries', cents: 150 }).menu[0].price).toBe(150)
    expect(ok(s, { type: 'setPrice', dish: 'fries', cents: 900 }).menu[0].price).toBe(900)
  })

  it('rejects out-of-range prices instead of clamping them', () => {
    const s = game()
    expectRejected(s, { type: 'setPrice', dish: 'fries', cents: 140 }, 'price out of range')
    expectRejected(s, { type: 'setPrice', dish: 'fries', cents: 910 }, 'price out of range')
    expectRejected(s, { type: 'setPrice', dish: 'fries', cents: 0 }, 'price out of range')
    expectRejected(s, { type: 'setPrice', dish: 'fries', cents: -300 }, 'price out of range')
  })

  it('rejects fractional, non-step and non-number prices', () => {
    const s = game()
    expectRejected(s, { type: 'setPrice', dish: 'fries', cents: 305 }, 'invalid price')
    expectRejected(s, { type: 'setPrice', dish: 'fries', cents: 300.5 }, 'invalid price')
    expectRejected(s, { type: 'setPrice', dish: 'fries', cents: Number.NaN }, 'invalid price')
    expectRejected(s, { type: 'setPrice', dish: 'fries', cents: '300' as unknown as number }, 'invalid price')
  })

  it('rejects a dish that is not on the menu, and unknown dishes', () => {
    const s = game()
    expectRejected(s, { type: 'setPrice', dish: 'salad', cents: 450 }, 'not on menu')
    expectRejected(s, { type: 'setPrice', dish: 'nope', cents: 450 }, 'invalid command')
    expectRejected(s, { type: 'setPrice', dish: 7 as unknown as string, cents: 450 }, 'invalid command')
  })

  it('does not mutate its input', () => {
    const s0 = game()
    const before = stateHash(s0)
    const s1 = ok(s0, { type: 'setPrice', dish: 'fries', cents: 400 })
    expect(stateHash(s0)).toBe(before)
    expect(s0.menu[0].price).toBe(300)
    expect(s1.menu[0].price).toBe(400)
  })
})

describe('unlockRecipe', () => {
  it('charges the unlock cost and unlocks the dish (not on the menu yet)', () => {
    const s0 = game()
    const s1 = ok(s0, { type: 'unlockRecipe', dish: 'soup' })
    debug(`money ${s0.money} -> ${s1.money}`)
    expect(s1.money).toBe(s0.money - 4000)
    expect(s1.unlocked).toEqual(['fries', 'salad', 'soup'])
    expect(s1.menu).toEqual(s0.menu)
    expect(s0.unlocked).toEqual(['fries', 'salad'])
    // The new dish can now go on the menu.
    expect(ok(s1, { type: 'setMenu', dishes: ['fries', 'soup'] }).menu).toHaveLength(2)
  })

  it('works with exactly enough money and rejects with one cent less', () => {
    const exact = ok(game([], 4000), { type: 'unlockRecipe', dish: 'soup' })
    expect(exact.money).toBe(0)
    expectRejected(game([], 3999), { type: 'unlockRecipe', dish: 'soup' }, 'cannot afford')
  })

  it('rejects an already unlocked dish (never charges twice) and unknown dishes', () => {
    expectRejected(game(), { type: 'unlockRecipe', dish: 'fries' }, 'already unlocked')
    expectRejected(game(['soup']), { type: 'unlockRecipe', dish: 'soup' }, 'already unlocked')
    expectRejected(game(), { type: 'unlockRecipe', dish: 'nope' }, 'invalid command')
    expectRejected(game(), { type: 'unlockRecipe', dish: undefined as unknown as string }, 'invalid command')
  })
})

describe('phases', () => {
  const cmds: Command[] = [
    { type: 'setMenu', dishes: ['fries'] },
    { type: 'setPrice', dish: 'fries', cents: 350 },
    { type: 'unlockRecipe', dish: 'soup' },
  ]

  it('are locked during service with the dedicated reason', () => {
    const service = variant(game(), { phase: 'service' })
    for (const cmd of cmds) expectRejected(service, cmd, 'Menu is locked during service')
  })

  it('say "wrong phase" in summary and won', () => {
    for (const phase of ['summary', 'won'] as const) {
      const s = variant(game(), { phase })
      for (const cmd of cmds) expectRejected(s, cmd, 'wrong phase')
    }
  })

  it('a menu change made in build shows up when service opens', () => {
    let s = ok(game(['soup']), { type: 'setMenu', dishes: ['soup'] })
    s = ok(s, { type: 'setPrice', dish: 'soup', cents: 500 })
    s = ok(s, { type: 'openService' })
    expect(s.menu).toEqual([{ dish: 'soup', price: 500 }])
  })
})
