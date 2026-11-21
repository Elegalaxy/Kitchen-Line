// Tests for the save format (plan Step 17). persist tests may import only src/sim (not src/content),
// so the fixture is an inline Defs with a fries line (pantry -> chopper -> fryer -> pass) built through
// the real sim commands. Checked: save -> load keeps stateHash for a fresh game, a mid-service state
// (items on belts, a station working, shelf dishes, waiting customers) and an expanded restaurant that
// has won; a loaded save run N more ticks equals a never-saved run (so the rng state is persisted);
// and every kind of damaged input is rejected with a reason and never throws.

import { describe, expect, it } from 'vitest'
import { applyCommand } from '../sim/commands.ts'
import { createGame } from '../sim/game.ts'
import { stateHash } from '../sim/hash.ts'
import { runTicks } from '../sim/tick.ts'
import type { BuildingDef, BuildingKind, Command, Defs, GameState } from '../sim/types.ts'
import { CORRUPT_KEY, loadSave, SAVE_KEY, serializeSave } from './save.ts'

function bd(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

const DEFS: Defs = {
  items: {
    potato: { id: 'potato', name: 'Potato', emoji: '', kind: 'raw', cost: 30 },
    potatoStrips: { id: 'potatoStrips', name: 'Strips', emoji: '', kind: 'processed' },
    fries: { id: 'fries', name: 'Fries', emoji: '', kind: 'dish', spoilTicks: 300 },
    soup: { id: 'soup', name: 'Soup', emoji: '', kind: 'dish', spoilTicks: 300 },
  },
  buildings: {
    belt: bd('belt', 100, { fast: { cost: 300, requiresTier: 'restaurant' } }),
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
  stationRecipes: [
    { station: 'chopper', input: 'potato', output: 'potatoStrips', ticks: 20 },
    { station: 'fryer', input: 'potatoStrips', output: 'fries', ticks: 40 },
  ],
  dishes: {
    fries: { id: 'fries', name: 'Fries', emoji: '', refPrice: 300, popularity: 3, startsUnlocked: true, unlockCost: 0 },
    // Nothing in the fixture cooks soup, so customers who want it keep waiting.
    soup: { id: 'soup', name: 'Soup', emoji: '', refPrice: 300, popularity: 3, startsUnlocked: true, unlockCost: 0 },
  },
  goals: [
    {
      id: 'g1',
      tier: 'stall',
      label: 'Always done',
      unit: 'count',
      check: () => ({ done: true, current: 1, target: 1 }),
    },
  ],
  expansions: [{ width: 10, height: 8, cost: 10000, requiresTier: 'stall' }],
}

function must(s: GameState, cmd: Command): GameState {
  const out = applyCommand(s, DEFS, cmd)
  if (!out.result.ok) throw new Error(`command failed: ${out.result.reason}`)
  return out.state
}

const east = (kind: 'belt' | 'chopper' | 'fryer', x: number): Command => ({ type: 'place', kind, x, y: 2, dir: 1 })

/** Fries line along y = 2 with service open. */
function friesService(): GameState {
  let s = createGame(DEFS, 'save-test')
  for (const c of [east('belt', 1), east('chopper', 2), east('belt', 3), east('fryer', 4), east('belt', 5), east('belt', 6)]) {
    s = must(s, c)
  }
  s = must(s, { type: 'setMenu', dishes: ['fries', 'soup'] })
  return must(s, { type: 'openService' })
}

/** Run until items are on belts, a station is working, a dish is on the shelf and a customer waits. */
function midService(): GameState {
  let s = friesService()
  for (let i = 0; i < 2000; i += 1) {
    s = runTicks(s, DEFS, 1)
    const all = Object.values(s.buildings)
    const onBelt = all.some((b) => b.kind === 'belt' && b.slots.some((x) => x !== null))
    const working = all.some((b) => b.kind === 'fryer' && b.progress > 0)
    const shelf = all.some((b) => b.kind === 'pass' && b.shelf.length > 0)
    if (onBelt && working && shelf && s.waiting.length > 0) return s
  }
  throw new Error('fixture never reached a busy mid-service state')
}

function roundTrip(s: GameState): GameState {
  const loaded = loadSave(serializeSave(s, '2026-11-20T10:00:00.000Z'))
  if (!loaded.ok) throw new Error(`load failed: ${loaded.reason}`)
  return loaded.state
}

function expectRejected(raw: string, part?: string): void {
  const r = loadSave(raw)
  expect(r.ok).toBe(false)
  if (!r.ok) {
    expect(r.reason.length).toBeGreaterThan(0)
    if (part !== undefined) expect(r.reason).toContain(part)
  }
}

/** Serialize `s`, let `edit` damage the parsed envelope, and return the JSON text. */
function damaged(s: GameState, edit: (env: { version: unknown; savedAt: unknown; state: Record<string, unknown> }) => void): string {
  const env = JSON.parse(serializeSave(s, 'now')) as { version: unknown; savedAt: unknown; state: Record<string, unknown> }
  edit(env)
  return JSON.stringify(env)
}

describe('save keys', () => {
  it('uses the versioned key and a .corrupt twin', () => {
    expect(SAVE_KEY).toBe('kitchen-line.save.v1')
    expect(CORRUPT_KEY).toBe('kitchen-line.save.v1.corrupt')
  })
})

describe('round trip', () => {
  it('keeps the hash of a fresh game', () => {
    const s = createGame(DEFS, 'fresh')
    expect(stateHash(roundTrip(s))).toBe(stateHash(s))
  })

  it('keeps the hash of a busy mid-service state', () => {
    const s = midService()
    const text = serializeSave(s, 'x')
    expect(text).toContain('"waiting"')
    expect(stateHash(roundTrip(s))).toBe(stateHash(s))
  })

  it('still loads an old save that has the old goal 5 id (menu-5) in goalsDone', () => {
    const s = createGame(DEFS, 'old')
    s.goalsDone = ['first-dish', 'menu-5']
    expect(roundTrip(s).goalsDone).toEqual(['first-dish', 'menu-5'])
  })

  it('keeps the hash of an expanded restaurant that has won', () => {
    let s = createGame(DEFS, 'rest')
    s.goalsDone = ['g1']
    s.money = 100000
    s = must(s, { type: 'upgradeTier' })
    s = must(s, { type: 'buyExpansion' })
    s.won = true
    s.phase = 'won'
    s.totals = { served: 640, profit: 98000, days: 12 }
    s.prevDay = structuredClone(s.today)
    s.lastDay = structuredClone(s.today)
    expect(s.tier).toBe('restaurant')
    expect(s.width).toBe(10)
    expect(stateHash(roundTrip(s))).toBe(stateHash(s))
    expect(roundTrip(s)).toMatchObject({ won: true, tier: 'restaurant', expansion: 1, width: 10, height: 8 })
  })

  it('a saved and loaded run equals a never-saved run of the same total ticks', () => {
    const start = midService()
    const straight = runTicks(structuredClone(start), DEFS, 900)
    const resumed = runTicks(roundTrip(runTicks(structuredClone(start), DEFS, 400)), DEFS, 500)
    expect(stateHash(resumed)).toBe(stateHash(straight))
    const loadedAtStart = runTicks(roundTrip(start), DEFS, 900)
    expect(stateHash(loadedAtStart)).toBe(stateHash(straight))
  })

  it('covers a summary state after a whole day', () => {
    const s = runTicks(friesService(), DEFS, 2400)
    expect(s.phase).toBe('summary')
    expect(stateHash(roundTrip(s))).toBe(stateHash(s))
  })
})

describe('rejection', () => {
  const s = midService()
  const pass = Object.values(s.buildings).find((b) => b.kind === 'pass')

  it('rejects text that is not JSON, truncated JSON and non-objects', () => {
    const text = serializeSave(s, 'x')
    expectRejected('', 'JSON')
    expectRejected('not json', 'JSON')
    expectRejected(text.slice(0, Math.floor(text.length / 2)), 'JSON')
    expectRejected('null', 'expected an object')
    expectRejected('[1,2]', 'expected an object')
    expectRejected('42')
  })

  it('rejects a wrong or missing version', () => {
    expectRejected(damaged(s, (e) => (e.version = 2)), 'version')
    expectRejected(damaged(s, (e) => delete (e as { version?: unknown }).version), 'version')
    expectRejected(damaged(s, (e) => (e.state.version = 2)), 'state.version')
  })

  it('rejects a missing savedAt or state', () => {
    expectRejected(damaged(s, (e) => delete (e as { savedAt?: unknown }).savedAt), 'savedAt')
    expectRejected(damaged(s, (e) => delete (e as { state?: unknown }).state), 'state')
  })

  it('rejects any missing top-level field of the state', () => {
    for (const key of Object.keys(s)) {
      expectRejected(damaged(s, (e) => delete e.state[key]), key)
    }
  })

  it('rejects wrong types and non-integers', () => {
    expectRejected(damaged(s, (e) => (e.state.money = '100')), 'state.money')
    expectRejected(damaged(s, (e) => (e.state.money = 1.5)), 'state.money')
    expectRejected(damaged(s, (e) => (e.state.tick = -1)), 'state.tick')
    expectRejected(damaged(s, (e) => (e.state.day = 0)), 'state.day')
    expectRejected(damaged(s, (e) => (e.state.phase = 'paused')), 'state.phase')
    expectRejected(damaged(s, (e) => (e.state.tier = 'palace')), 'state.tier')
    expectRejected(damaged(s, (e) => (e.state.won = 'yes')), 'state.won')
    expectRejected(damaged(s, (e) => (e.state.waiting = {})), 'state.waiting')
    expectRejected(damaged(s, (e) => (e.state.repAtDayStart = null)), 'repAtDayStart')
    expectRejected(damaged(s, (e) => (e.state.goalsDone = [1])), 'goalsDone')
    expectRejected(damaged(s, (e) => (e.state.totals = { served: 1 })), 'totals')
  })

  it('rejects a bad rng state', () => {
    expectRejected(damaged(s, (e) => delete (e.state.rng as Record<string, unknown>).reviews), 'rng.reviews')
    expectRejected(damaged(s, (e) => ((e.state.rng as { arrivals: { a: unknown } }).arrivals.a = -1)), 'rng.arrivals.a')
    expectRejected(damaged(s, (e) => ((e.state.rng as { arrivals: { a: unknown } }).arrivals.a = 2 ** 32)), 'rng.arrivals.a')
    expectRejected(damaged(s, (e) => ((e.state.rng as { arrivals: { spare: unknown } }).arrivals.spare = 'x')), 'spare')
  })

  it('rejects a tiles length mismatch and a changed grid size', () => {
    expectRejected(damaged(s, (e) => (e.state.tiles as unknown[]).pop()), 'tiles')
    expectRejected(damaged(s, (e) => (e.state.width = 9)), 'tiles')
    expectRejected(damaged(s, (e) => (e.state.width = 1000)), 'grid')
  })

  it('rejects a tile that points at a missing building', () => {
    expectRejected(
      damaged(s, (e) => {
        const tiles = e.state.tiles as (number | null)[]
        tiles[tiles.findIndex((t) => t === null)] = 99
      }),
      'missing building 99',
    )
  })

  it('rejects building problems', () => {
    const first = Object.keys(s.buildings)[0]
    const buildings = (e: { state: Record<string, unknown> }): Record<string, Record<string, unknown>> =>
      e.state.buildings as Record<string, Record<string, unknown>>
    expectRejected(damaged(s, (e) => (buildings(e)[first].x = 99)), 'outside')
    expectRejected(damaged(s, (e) => (buildings(e)[first].kind = 'oven')), 'kind')
    expectRejected(damaged(s, (e) => (buildings(e)[first].dir = 4)), 'dir')
    expectRejected(damaged(s, (e) => (buildings(e)[first].id = 77)), 'id')
    expectRejected(damaged(s, (e) => (buildings(e)[first].status = 'on fire')), 'status')
    expectRejected(damaged(s, (e) => delete buildings(e)[first].onlineAt), 'onlineAt')
    expectRejected(damaged(s, (e) => (e.state.nextId = 1)), 'nextId')
    // A building whose tile is not in `tiles`.
    expectRejected(damaged(s, (e) => ((e.state.tiles as (number | null)[]).fill(null))), 'building')
  })

  it('rejects broken items, shelves and customers', () => {
    expect(pass).toBeDefined()
    const passId = String(pass?.id)
    const buildings = (e: { state: Record<string, unknown> }): Record<string, Record<string, unknown>> =>
      e.state.buildings as Record<string, Record<string, unknown>>
    expectRejected(damaged(s, (e) => (buildings(e)[passId].shelf = [{ id: 1, type: '', bornTick: 0 }])), 'shelf')
    expectRejected(damaged(s, (e) => (buildings(e)[passId].shelf = [{ id: 1, type: 'fries' }])), 'bornTick')
    expectRejected(damaged(s, (e) => (buildings(e)[passId].shelf = 'full')), 'shelf')
    expectRejected(damaged(s, (e) => ((e.state.waiting as Record<string, unknown>[])[0].price = 'cheap')), 'price')
    expectRejected(damaged(s, (e) => ((e.state.waiting as Record<string, unknown>[])[0].prefs = 'fries')), 'prefs')
    expectRejected(damaged(s, (e) => ((e.state.today as Record<string, unknown>).byDish = [])), 'byDish')
    expectRejected(damaged(s, (e) => ((e.state.today as Record<string, unknown>).spoiledByItem = { potato: 1.5 })), 'spoiledByItem')
    expectRejected(damaged(s, (e) => (e.state.events = [{ tick: 1 }])), 'events')
  })

  it('never throws, whatever it is given', () => {
    const odd: unknown[] = [undefined, null, 0, {}, [], '{"version":1}', '{"version":1,"savedAt":"x","state":null}', '{"__proto__":{}}']
    for (const raw of odd) {
      const r = loadSave(raw as string)
      expect(r.ok).toBe(false)
    }
  })
})

describe('paused pantries', () => {
  const pantryOf = (s: GameState) => Object.values(s.buildings).find((b) => b.kind === 'pantry')
  const buildingsOf = (e: { state: Record<string, unknown> }): Record<string, Record<string, unknown>> =>
    e.state.buildings as Record<string, Record<string, unknown>>

  it('keeps a paused pantry through a save and load', () => {
    const s = must(friesService(), { type: 'setPantriesPaused', paused: true })
    const loaded = roundTrip(s)
    expect(stateHash(loaded)).toBe(stateHash(s))
    const p = pantryOf(loaded)
    expect(p?.kind === 'pantry' && p.paused).toBe(true)
  })

  it('loads an old save whose pantries have no paused field (they run)', () => {
    const s = midService()
    const id = String(pantryOf(s)?.id)
    const text = damaged(s, (e) => {
      expect(buildingsOf(e)[id]).not.toHaveProperty('paused')
      delete buildingsOf(e)[id].paused
    })
    const r = loadSave(text)
    expect(r.ok).toBe(true)
    if (r.ok) expect(stateHash(r.state)).toBe(stateHash(s))
  })

  it('rejects a paused value that is not true or false', () => {
    const s = friesService()
    const id = String(pantryOf(s)?.id)
    const set = (v: unknown) => damaged(s, (e) => (buildingsOf(e)[id].paused = v))
    expectRejected(set('yes'), 'paused')
    expectRejected(set(1), 'paused')
    expectRejected(set(null), 'paused')
    expect(loadSave(set(false)).ok).toBe(true)
  })

  it('accepts the paused status', () => {
    const s = must(friesService(), { type: 'setPantriesPaused', paused: true })
    const ticked = runTicks(s, DEFS, 5)
    expect(pantryOf(ticked)?.status).toBe('paused')
    expect(stateHash(roundTrip(ticked))).toBe(stateHash(ticked))
  })
})

describe('overnight waste stats', () => {
  it('round trips the new stats', () => {
    let s = friesService()
    s = runTicks(s, DEFS, 2400)
    expect(s.phase).toBe('summary')
    expect(s.lastDay?.wasteOvernight).toBeGreaterThan(0)
    expect(stateHash(roundTrip(s))).toBe(stateHash(s))
  })

  it('loads an old save without them (0 and none) and rejects wrong types', () => {
    const s = runTicks(friesService(), DEFS, 2400)
    const strip = (e: { state: Record<string, unknown> }): void => {
      for (const k of ['today', 'lastDay', 'prevDay']) {
        const d = e.state[k] as Record<string, unknown> | null
        if (d !== null) {
          delete d.wasteOvernight
          delete d.overnightByItem
        }
      }
    }
    const r = loadSave(damaged(s, strip))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.lastDay?.wasteOvernight).toBe(0)
      expect(r.state.lastDay?.overnightByItem).toEqual({})
      expect(r.state.today.wasteOvernight).toBe(0)
    }
    expectRejected(damaged(s, (e) => ((e.state.today as Record<string, unknown>).wasteOvernight = 'many')), 'wasteOvernight')
    expectRejected(damaged(s, (e) => ((e.state.today as Record<string, unknown>).overnightByItem = { potato: 1.5 })), 'overnightByItem')
  })
})
