// Tests for franchise prestige (GAME_DESIGN 8.2): points and their caps on hand-made states, the
// guards of canFranchise / recordFranchise, perk buying, the recipe book (stall dishes only), seed
// naming and createRun (empty meta equals createGame; perks change the starting state only).

import { describe, expect, it } from 'vitest'
import { DEFS as BASE } from './chainKit.ts'
import {
  activeKitOf,
  applyFranchiseStart,
  buyPerk,
  canFranchise,
  chooseKit,
  createRun,
  emptyMeta,
  franchisePoints,
  latestSlot,
  libraryOf,
  perkCost,
  recordFranchise,
  runSeed,
} from './franchise.ts'
import { blueprintOf } from './blueprint.ts'
import { applyCommand } from './commands.ts'
import { createGame } from './game.ts'
import { stateHash } from './hash.ts'
import type { Blueprint, BuildingKind, Defs, GameState, MetaState } from './types.ts'

const DEFS: Defs = {
  ...BASE,
  dishes: {
    ...BASE.dishes,
    salad: { id: 'salad', name: 'Salad', emoji: '', refPrice: 450, popularity: 2, startsUnlocked: false, unlockCost: 1000 },
    fish: { id: 'fish', name: 'Fish', emoji: '', refPrice: 800, popularity: 2, startsUnlocked: false, unlockCost: 2000, requiresTier: 'restaurant' },
  },
  expansions: [
    { width: 10, height: 8, cost: 10000, requiresTier: 'stall' },
    { width: 12, height: 9, cost: 20000, requiresTier: 'restaurant' },
  ],
  perks: [
    { id: 'seedMoney', name: 'Seed', emoji: '', costs: [6, 9, 12], effect: { startMoney: 25000 } },
    { id: 'goodName', name: 'Name', emoji: '', costs: [5, 8], effect: { goodRatings: 4 } },
    { id: 'biggerStall', name: 'Bigger', emoji: '', costs: [10], effect: { startExpansion: 1 } },
    { id: 'starterKit', name: 'Starter', emoji: '', costs: [14], effect: { starterKit: true } },
  ],
}

function won(over: Partial<GameState> = {}): GameState {
  const s = createGame(DEFS, 'kitchen-line')
  s.chainWon = true
  s.won = true
  s.phase = 'build'
  return Object.assign(s, over)
}

function meta(over: Partial<MetaState> = {}): MetaState {
  return { ...emptyMeta(), ...over }
}

const part = (s: GameState, id: string): number => franchisePoints(s).parts.find((p) => p.id === id)?.points ?? -1

describe('franchisePoints', () => {
  it('a typical run: chain 10, earnings 1 per $1,000, speed, reputation', () => {
    const s = won({ totals: { served: 900, profit: 1_200_000, days: 31 }, chainProfit: 1_800_000 })
    s.ratings = new Array<number>(10).fill(4)
    expect(part(s, 'chain')).toBe(10)
    expect(part(s, 'earnings')).toBe(25)
    expect(part(s, 'speed')).toBe(9)
    expect(part(s, 'reputation')).toBe(2)
    expect(franchisePoints(s).total).toBe(10 + 25 + 9 + 2)
  })

  it('earnings count whole $1,000 of profit plus chain profit', () => {
    const s = won({ totals: { served: 0, profit: 600_000, days: 50 }, chainProfit: 650_000 })
    expect(part(s, 'earnings')).toBe(12)
  })

  it('caps: earnings 25, speed 10, a perfect run is 49', () => {
    const s = won({ totals: { served: 0, profit: 99_000_000, days: 1 }, chainProfit: 5_000_000 })
    s.ratings = new Array<number>(10).fill(5)
    expect(part(s, 'earnings')).toBe(25)
    expect(part(s, 'speed')).toBe(10)
    expect(part(s, 'reputation')).toBe(4)
    expect(franchisePoints(s).total).toBe(49)
  })

  it('floors: no negative parts, nothing for the chain before it is built', () => {
    const s = won({ totals: { served: 0, profit: -500_000, days: 90 } })
    delete s.chainWon
    s.ratings = new Array<number>(10).fill(2)
    expect(franchisePoints(s).total).toBe(0)
    expect(franchisePoints(s).parts.map((p) => p.id)).toEqual(['chain', 'earnings', 'speed', 'reputation'])
  })

  it('reputation counts only full stars above 3', () => {
    const s = won()
    s.ratings = [4, 4, 4, 4, 4, 4, 4, 4, 4, 3] // 3.9
    expect(part(s, 'reputation')).toBe(0)
    s.ratings = [5, 5, 5, 5, 5, 5, 5, 5, 4, 4] // 4.8
    expect(part(s, 'reputation')).toBe(2)
  })
})

describe('canFranchise / recordFranchise', () => {
  it('needs chainWon and the build or won phase', () => {
    expect(canFranchise(won())).toBe(true)
    expect(canFranchise(won({ phase: 'won' }))).toBe(true)
    expect(canFranchise(won({ phase: 'service' }))).toBe(false)
    expect(canFranchise(won({ phase: 'summary' }))).toBe(false)
    const s = won()
    delete s.chainWon
    expect(canFranchise(s)).toBe(false)
  })

  it('books points, history and the run counter', () => {
    const s = won({ totals: { served: 0, profit: 300_000, days: 35 } })
    const r = recordFranchise(emptyMeta(), s, DEFS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const pts = franchisePoints(s).total
    expect(r.meta.points).toBe(pts)
    expect(r.meta.runsCompleted).toBe(1)
    expect(r.meta.history).toEqual([{ run: 1, seed: 'kitchen-line', days: 35, profit: 300_000, chainProfit: 0, points: pts }])
  })

  it('refuses an unfinished chain and a duplicate seed', () => {
    const s = won()
    delete s.chainWon
    expect(recordFranchise(emptyMeta(), s, DEFS)).toEqual({ ok: false, reason: 'chain not built yet' })
    const first = recordFranchise(emptyMeta(), won(), DEFS)
    if (!first.ok) throw new Error('first franchise refused')
    const again = recordFranchise(first.meta, won(), DEFS)
    expect(again.ok).toBe(false)
  })

  it('the recipe book keeps stall dishes and drops restaurant-tier ones', () => {
    const s = won()
    s.unlocked = ['fries', 'salad', 'fish']
    const r = recordFranchise(meta({ recipeBook: ['fries'] }), s, DEFS)
    if (!r.ok) throw new Error('refused')
    expect(r.meta.recipeBook).toEqual(['fries', 'salad'])
  })

  it('the history keeps the newest 100 runs', () => {
    const history = Array.from({ length: 100 }, (_, i) => ({ run: i + 1, seed: `s${i}`, days: 30, profit: 0, chainProfit: 0, points: 1 }))
    const r = recordFranchise(meta({ runsCompleted: 100, history }), won(), DEFS)
    if (!r.ok) throw new Error('refused')
    expect(r.meta.history).toHaveLength(100)
    expect(r.meta.history[0]?.run).toBe(2)
    expect(r.meta.history[99]?.run).toBe(101)
  })
})

describe('perks', () => {
  it('buys level by level, spending points', () => {
    let m = meta({ points: 30 })
    expect(perkCost(m, DEFS, 'seedMoney')).toBe(6)
    for (const cost of [6, 9, 12]) {
      const r = buyPerk(m, DEFS, 'seedMoney')
      if (!r.ok) throw new Error(r.reason)
      expect(m.points - r.meta.points).toBe(cost)
      m = r.meta
    }
    expect(m.perks['seedMoney']).toBe(3)
    expect(m.points).toBe(3)
  })

  it('refuses past the top level, without enough points and for unknown perks', () => {
    expect(buyPerk(meta({ points: 99, perks: { biggerStall: 1 } }), DEFS, 'biggerStall')).toEqual({ ok: false, reason: 'already at the top level' })
    expect(perkCost(meta({ perks: { biggerStall: 1 } }), DEFS, 'biggerStall')).toBeNull()
    expect(buyPerk(meta({ points: 9 }), DEFS, 'biggerStall')).toEqual({ ok: false, reason: 'needs 10 points' })
    expect(buyPerk(meta({ points: 99 }), DEFS, 'nope')).toEqual({ ok: false, reason: 'unknown perk' })
  })

  it('does not mutate the meta it was given', () => {
    const m = meta({ points: 20 })
    buyPerk(m, DEFS, 'goodName')
    expect(m).toEqual(meta({ points: 20 }))
  })
})

describe('runSeed / createRun', () => {
  it('names seeds: run 1 is the base, run N adds -runN', () => {
    expect(runSeed('kitchen-line', 1)).toBe('kitchen-line')
    expect(runSeed('kitchen-line', 2)).toBe('kitchen-line-run2')
    expect(runSeed('kitchen-line', 11)).toBe('kitchen-line-run11')
  })

  it('an empty meta gives exactly createGame (same stateHash)', () => {
    expect(stateHash(createRun(DEFS, 'kitchen-line', emptyMeta()))).toBe(stateHash(createGame(DEFS, 'kitchen-line')))
  })

  it('uses the seed of the next run', () => {
    expect(createRun(DEFS, 'kitchen-line', meta({ runsCompleted: 1 })).seed).toBe('kitchen-line-run2')
  })

  it('Seed money adds $250 a level', () => {
    expect(createRun(DEFS, 'k', meta({ perks: { seedMoney: 1 } })).money).toBe(40000)
    expect(createRun(DEFS, 'k', meta({ perks: { seedMoney: 3 } })).money).toBe(90000)
  })

  it('Good name turns 4 then 8 starting ratings into 4 stars', () => {
    const r1 = createRun(DEFS, 'k', meta({ perks: { goodName: 1 } }))
    expect(r1.ratings.filter((r) => r === 4)).toHaveLength(4)
    expect(r1.repAtDayStart).toBeCloseTo(3.4)
    const r2 = createRun(DEFS, 'k', meta({ perks: { goodName: 2 } }))
    expect(r2.repAtDayStart).toBeCloseTo(3.8)
  })

  it('Bigger stall gives 10 x 8 with the buildings in place and the money unchanged', () => {
    const base = createGame(DEFS, 'k')
    const s = createRun(DEFS, 'k', meta({ perks: { biggerStall: 1 } }))
    expect([s.width, s.height, s.expansion]).toEqual([10, 8, 1])
    expect(s.tiles).toHaveLength(80)
    expect(s.money).toBe(base.money)
    for (const b of Object.values(s.buildings)) expect(s.tiles[b.y * s.width + b.x]).toBe(b.id)
  })

  it('book dishes start unlocked; restaurant-tier and unknown ids are ignored; events are cleared', () => {
    const s = createRun(DEFS, 'k', meta({ recipeBook: ['fries', 'salad', 'fish', 'ghost'] }))
    expect(s.unlocked).toEqual(['fries', 'salad'])
    expect(s.events).toEqual([])
  })

  it('applyFranchiseStart ignores levels past the perk top', () => {
    const s = createGame(DEFS, 'k')
    applyFranchiseStart(s, DEFS, meta({ perks: { seedMoney: 9 } }))
    expect(s.money).toBe(15000 + 3 * 25000)
  })
})

// ---- Starter kitchen (GAME_DESIGN 8.2) ---------------------------------------------------------------

function place(s: GameState, kind: BuildingKind, x: number, y: number): GameState {
  const out = applyCommand(s, DEFS, { type: 'place', kind, x, y, dir: 1 })
  if (!out.result.ok) throw new Error(`place ${kind}: ${out.result.reason}`)
  return out.state
}

/** A stall with a small line, one extra dish unlocked and priced, ready to upgrade. */
function stallWithKitchen(): GameState {
  let s = createGame(DEFS, 'kit-run')
  s.money = 1_000_000
  for (const [kind, x] of [['belt', 1], ['chopper', 2], ['belt', 3], ['fryer', 4], ['belt', 5], ['belt', 6]] as const) s = place(s, kind, x, 2)
  s.unlocked = [...s.unlocked, 'salad']
  s.menu = [{ dish: 'fries', price: 350 }, { dish: 'salad', price: 500 }]
  s.goalsDone = ['served-3', 'money-high']
  return s
}

function upgraded(): GameState {
  const out = applyCommand(stallWithKitchen(), DEFS, { type: 'upgradeTier' })
  if (!out.result.ok) throw new Error(out.result.reason)
  return out.state
}

function kitMeta(kit: Blueprint | undefined, perks: Record<string, number> = { starterKit: 1 }): MetaState {
  return { ...emptyMeta(), perks, recipeBook: ['fries', 'salad'], ...(kit === undefined ? {} : { library: [{ run: 1, kit }, null, null] }) }
}

describe('stallKit (saved at the upgrade)', () => {
  it('upgradeTier stores the stall kitchen as it was before the upgrade', () => {
    const before = stallWithKitchen()
    const after = upgraded()
    expect(after.stallKit).toEqual(blueprintOf(before, DEFS))
    expect(after.tier).toBe('restaurant')
  })

  it('a run that never upgrades has no stallKit key', () => {
    expect('stallKit' in stallWithKitchen()).toBe(false)
  })
})

function wonUpgraded(seed: string, price?: number): GameState {
  const s = upgraded()
  s.seed = seed
  if (price !== undefined) s.stallKit = { ...s.stallKit!, menu: [{ dish: 'fries', price }] }
  s.chainWon = true
  s.phase = 'build'
  return s
}

describe('recordFranchise and the blueprint library', () => {
  it('saves the kit only into the chosen slot; no slot (or null) saves nothing', () => {
    const run = wonUpgraded('lib-1')
    const none = recordFranchise(emptyMeta(), run, DEFS)
    expect(none.ok && none.meta.library).toBeUndefined()
    const skipped = recordFranchise(emptyMeta(), run, DEFS, { saveSlot: null })
    expect(skipped.ok && 'library' in skipped.meta).toBe(false)
    const r = recordFranchise(emptyMeta(), run, DEFS, { saveSlot: 1 })
    expect(r.ok && r.meta.library).toEqual([null, { run: 1, kit: run.stallKit }, null])
    expect(r.ok && r.meta.library?.[1]?.kit).not.toBe(run.stallKit)
  })

  it('overwrites a slot, keeps the others, and counts the run number', () => {
    const r1 = recordFranchise(emptyMeta(), wonUpgraded('lib-1'), DEFS, { saveSlot: 0 })
    if (!r1.ok) throw new Error(r1.reason)
    const r2 = recordFranchise(r1.meta, wonUpgraded('lib-2', 400), DEFS, { saveSlot: 2 })
    expect(r2.ok && r2.meta.library?.map((e) => e?.run ?? null)).toEqual([1, null, 2])
    if (!r2.ok) return
    const r3 = recordFranchise(r2.meta, wonUpgraded('lib-3', 450), DEFS, { saveSlot: 0 })
    expect(r3.ok && r3.meta.library?.map((e) => e?.run ?? null)).toEqual([3, null, 2])
    expect(r3.ok && r3.meta.library?.[0]?.kit.menu).toEqual([{ dish: 'fries', price: 450 }])
    expect(latestSlot(libraryOf(r3.ok ? r3.meta : emptyMeta()))).toBe(0)
  })

  it('a run with no kit saves nothing, even with a slot; a bad slot refuses without booking', () => {
    const s = createGame(DEFS, 'plain')
    s.chainWon = true
    s.phase = 'build'
    const r = recordFranchise(emptyMeta(), s, DEFS, { saveSlot: 0 })
    expect(r.ok && 'library' in r.meta).toBe(false)
    for (const bad of [3, -1, 1.5]) expect(recordFranchise(emptyMeta(), s, DEFS, { saveSlot: bad }).ok).toBe(false)
  })

  it('an old meta with the single starterKit reads as slot 1 and moves into the library', () => {
    const kit = upgraded().stallKit!
    const old: MetaState = { ...emptyMeta(), runsCompleted: 2, starterKit: kit, history: [{ run: 2, seed: 'x', days: 1, profit: 0, chainProfit: 0, points: 1 }] }
    expect(libraryOf(old)).toEqual([{ run: 2, kit }, null, null])
    expect(activeKitOf(old)).toBe(kit)
    const r = recordFranchise(old, wonUpgraded('lib-9'), DEFS)
    expect(r.ok && 'starterKit' in r.meta).toBe(false)
    expect(r.ok && r.meta.library).toEqual([{ run: 2, kit }, null, null])
    expect(libraryOf({ ...emptyMeta(), starterKit: kit })[0]?.run).toBe(1)
  })
})

describe('the chosen kitchen (activeKit)', () => {
  const kitA = (): Blueprint => upgraded().stallKit!
  const kitB = (): Blueprint => ({ ...kitA(), menu: [{ dish: 'fries', price: 400 }] })
  const two = (): MetaState => ({
    ...emptyMeta(),
    perks: { starterKit: 1 },
    recipeBook: ['fries', 'salad'],
    library: [{ run: 1, kit: kitA() }, { run: 2, kit: kitB() }, null],
  })

  it('defaults to the most recently saved, and a choice overrides it (null = none)', () => {
    expect(activeKitOf(two())?.menu).toEqual([{ dish: 'fries', price: 400 }])
    const first = chooseKit(two(), 0)
    expect(first.ok && activeKitOf(first.meta)?.menu).toEqual(kitA().menu)
    const none = chooseKit(two(), null)
    expect(none.ok && activeKitOf(none.meta)).toBeUndefined()
    const back = chooseKit(none.ok ? none.meta : two(), undefined)
    expect(back.ok && 'activeKit' in back.meta).toBe(false)
    expect(chooseKit(two(), 2).ok).toBe(false)
    expect(chooseKit(two(), 7).ok).toBe(false)
  })

  it('createRun installs the chosen kitchen; none, or a slot that is now empty, equals no kit', () => {
    const m = two()
    expect(createRun(DEFS, 'kitchen-line', m).menu).toEqual([{ dish: 'fries', price: 400 }])
    const a = chooseKit(m, 0)
    if (!a.ok) throw new Error(a.reason)
    expect(createRun(DEFS, 'kitchen-line', a.meta).menu).toEqual(kitA().menu)
    const noKit = stateHash(createRun(DEFS, 'kitchen-line', { ...m, library: [null, null, null] }))
    const none = chooseKit(m, null)
    if (!none.ok) throw new Error(none.reason)
    expect(stateHash(createRun(DEFS, 'kitchen-line', none.meta))).toBe(noKit)
    expect(stateHash(createRun(DEFS, 'kitchen-line', { ...m, activeKit: 2 }))).toBe(noKit)
    expect(stateHash(createRun(DEFS, 'kitchen-line', m))).not.toBe(noKit)
  })
})

describe('starterKit perk: createRun', () => {
  const kit = (): Blueprint => upgraded().stallKit!

  it('installs the kitchen, menu and prices free on day 1', () => {
    const run = createRun(DEFS, 'kitchen-line', kitMeta(kit()))
    expect(run.money).toBe(15000)
    expect(run.tier).toBe('stall')
    expect(run.day).toBe(1)
    expect(Object.values(run.buildings).map((b) => b.kind).sort()).toEqual(
      Object.values(stallWithKitchen().buildings).map((b) => b.kind).sort(),
    )
    expect(run.menu).toEqual([{ dish: 'fries', price: 350 }, { dish: 'salad', price: 500 }])
    expect(run.unlocked).toContain('salad')
    expect(run.nextId).toBe(Math.max(...Object.keys(run.buildings).map(Number)) + 1)
    for (const b of Object.values(run.buildings)) {
      expect(b.status).toBe('idle')
      if (b.kind === 'pass') expect(b.shelf).toEqual([])
    }
    expect(run.tiles.filter((t) => t !== null).every((t) => run.buildings[t as number] !== undefined)).toBe(true)
    expect(Object.values(run.buildings).filter((b) => b.kind === 'pass')).toHaveLength(1)
  })

  it('is not installed without the perk, or with the perk but no kit (same hash as createGame)', () => {
    const plain = stateHash(createGame(DEFS, 'kitchen-line-run2'))
    expect(stateHash(createRun(DEFS, 'kitchen-line', { ...kitMeta(kit(), {}), recipeBook: [], runsCompleted: 1 }))).toBe(plain)
    expect(stateHash(createRun(DEFS, 'kitchen-line', { ...kitMeta(undefined), recipeBook: [], runsCompleted: 1 }))).toBe(plain)
    expect(stateHash(createRun(DEFS, 'kitchen-line', emptyMeta()))).toBe(stateHash(createGame(DEFS, 'kitchen-line')))
  })

  it('installs nothing for a kit that does not fit (never throws)', () => {
    const plain = stateHash(createRun(DEFS, 'kitchen-line', { ...kitMeta(undefined), recipeBook: [], runsCompleted: 1 }))
    const bad: Blueprint[] = []
    bad.push({ ...kit(), expansion: 3 })
    bad.push({ ...kit(), expansion: 2, width: 12, height: 9, tiles: new Array<number | null>(108).fill(null) })
    bad.push({ ...kit(), tiles: kit().tiles.slice(1) })
    const fast = kit()
    for (const b of Object.values(fast.buildings)) if (b.kind === 'belt') b.fast = true
    bad.push(fast)
    const pro = kit()
    for (const b of Object.values(pro.buildings)) if (b.kind === 'fryer') b.pro = true
    bad.push(pro)
    const far = kit()
    Object.values(far.buildings)[0].x = 99
    bad.push(far)
    const twoPass = kit()
    const pass = Object.values(twoPass.buildings).find((b) => b.kind === 'pass')!
    twoPass.buildings[99] = { ...structuredClone(pass), id: 99, x: 0, y: 5 }
    twoPass.tiles[5 * twoPass.width] = 99
    bad.push(twoPass)
    for (const k of bad) {
      const run = createRun(DEFS, 'kitchen-line', { ...kitMeta(k), recipeBook: [], runsCompleted: 1 })
      expect(stateHash(run)).toBe(plain)
    }
  })

  it('drops restaurant dishes from the saved menu and falls back to a valid price', () => {
    const k = kit()
    k.menu = [{ dish: 'fish', price: 800 }, { dish: 'fries', price: 7 }]
    k.unlocked = ['fries', 'fish']
    const run = createRun(DEFS, 'kitchen-line', kitMeta(k))
    expect(run.menu).toEqual([{ dish: 'fries', price: 300 }])
    expect(run.unlocked).not.toContain('fish')
  })

  it('works with Bigger stall: the larger grid keeps its size', () => {
    const run = createRun(DEFS, 'kitchen-line', kitMeta(kit(), { starterKit: 1, biggerStall: 1 }))
    expect([run.width, run.height, run.expansion]).toEqual([10, 8, 1])
    expect(run.tiles).toHaveLength(80)
    expect(Object.values(run.buildings).filter((b) => b.kind === 'belt')).toHaveLength(4)
    for (const b of Object.values(run.buildings)) expect(run.tiles[b.y * run.width + b.x]).toBe(b.id)
  })

  it('an expanded stall kit installs as is', () => {
    const s = applyCommand(stallWithKitchen(), DEFS, { type: 'buyExpansion' }).state
    expect(s.expansion).toBe(1)
    const out = applyCommand(s, DEFS, { type: 'upgradeTier' })
    const run = createRun(DEFS, 'kitchen-line', kitMeta(out.state.stallKit))
    expect([run.width, run.height, run.expansion]).toEqual([10, 8, 1])
  })

  it('does not share objects with the meta', () => {
    const m = kitMeta(kit())
    const run = createRun(DEFS, 'kitchen-line', m)
    Object.values(run.buildings)[0].x = 99
    expect(Object.values(m.library![0]!.kit.buildings)[0].x).not.toBe(99)
  })
})

describe('buyPerk starterKit', () => {
  it('needs a saved kitchen in the library (or the legacy single one)', () => {
    const poor = meta({ points: 20 })
    const r = buyPerk(poor, DEFS, 'starterKit')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no saved kitchen yet')
    const ok = buyPerk({ ...poor, library: [null, null, { run: 1, kit: upgraded().stallKit! }] }, DEFS, 'starterKit')
    expect(ok.ok && ok.meta.points).toBe(6)
    expect(ok.ok && ok.meta.perks.starterKit).toBe(1)
    expect(buyPerk({ ...poor, starterKit: upgraded().stallKit }, DEFS, 'starterKit').ok).toBe(true)
  })

  it('counts the kitchen saved in this franchise out (record first, then buy)', () => {
    const run = wonUpgraded('lib-buy')
    const booked = recordFranchise(meta({ points: 5 }), run, DEFS, { saveSlot: 0 })
    if (!booked.ok) throw new Error(booked.reason)
    expect(booked.meta.points).toBeGreaterThanOrEqual(14)
    expect(buyPerk(booked.meta, DEFS, 'starterKit').ok).toBe(true)
    const dropped = recordFranchise(meta({ points: 5 }), run, DEFS)
    if (!dropped.ok) throw new Error(dropped.reason)
    expect(buyPerk({ ...dropped.meta, points: 50 }, DEFS, 'starterKit').ok).toBe(false)
  })
})
