// Tests for pausing pantries (control step A, GAME_DESIGN 5.3): a paused pantry emits nothing,
// charges nothing and keeps its cooldown frozen; resume continues; `configure { paused }` works
// in every phase and only for pantries; `setPantriesPaused` pauses or resumes all of them at once.

import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { createGame } from './game.ts'
import { runTicks } from './tick.ts'
import type { Building, BuildingDef, BuildingKind, Command, Defs, GameState } from './types.ts'

function bd(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

// Sim tests may not import src/content, so the fixture is inline.
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
  dishes: {},
}

function must(s: GameState, cmd: Command): GameState {
  const out = applyCommand(s, DEFS, cmd)
  if (!out.result.ok) throw new Error(`rejected ${JSON.stringify(cmd)}: ${out.result.reason}`)
  return out.state
}

function pantries(s: GameState): Extract<Building, { kind: 'pantry' }>[] {
  return Object.values(s.buildings).filter((b): b is Extract<Building, { kind: 'pantry' }> => b.kind === 'pantry')
}

/** Starting game (pantry at 0,2 and pass at 7,2) plus a belt line between them and a second pantry feeding a belt. */
function game(): GameState {
  let s = createGame(DEFS, 'pause')
  for (let x = 1; x <= 6; x += 1) s = must(s, { type: 'place', kind: 'belt', x, y: 2, dir: 1 })
  s = must(s, { type: 'place', kind: 'pantry', x: 0, y: 4, dir: 1 })
  s = must(s, { type: 'place', kind: 'belt', x: 1, y: 4, dir: 0 })
  return s
}

describe('paused pantry', () => {
  it('emits nothing, charges nothing and keeps its cooldown frozen', () => {
    const open = must(game(), { type: 'openService' })
    const [keep, stop] = pantries(open)
    const s = must(open, { type: 'configure', x: stop.x, y: stop.y, paused: true })
    const frozen = pantries(s).find((p) => p.id === stop.id)
    const emits = { keep: 0, stop: 0 }
    const out = runTicks(s, DEFS, 300, (events) => {
      for (const e of events) {
        if (e.type !== 'emit') continue
        if (e.x === stop.x && e.y === stop.y) emits.stop += 1
        if (e.x === keep.x && e.y === keep.y) emits.keep += 1
      }
    })
    const after = pantries(out).find((p) => p.id === stop.id)
    expect(after?.status).toBe('paused')
    expect(after?.cooldown).toBe(frozen?.cooldown)
    expect(emits.stop).toBe(0)
    expect(emits.keep).toBeGreaterThan(0)
    expect(out.today.ingredientCost).toBe(emits.keep * (DEFS.items[keep.ingredient]?.cost ?? 0))
  })

  it('with every pantry paused nothing is bought', () => {
    const s = must(must(game(), { type: 'openService' }), { type: 'setPantriesPaused', paused: true })
    const out = runTicks(s, DEFS, 300)
    expect(out.money).toBe(s.money)
    expect(out.today.ingredientCost).toBe(0)
    expect(out.nextItemId).toBe(s.nextItemId)
  })

  it('resume continues from the frozen cooldown', () => {
    let s = must(game(), { type: 'openService' })
    s = runTicks(s, DEFS, 5)
    s = must(s, { type: 'setPantriesPaused', paused: true })
    const cooldowns = pantries(s).map((p) => p.cooldown)
    s = runTicks(s, DEFS, 100)
    expect(pantries(s).map((p) => p.cooldown)).toEqual(cooldowns)
    s = must(s, { type: 'setPantriesPaused', paused: false })
    expect(pantries(s).every((p) => p.paused === undefined)).toBe(true)
    const before = s.nextItemId
    s = runTicks(s, DEFS, 200)
    expect(s.nextItemId).toBeGreaterThan(before)
    expect(pantries(s).every((p) => p.status !== 'paused')).toBe(true)
  })

  it('shows the paused status at once, even while time is frozen in the build phase', () => {
    const s = game()
    const paused = must(s, { type: 'setPantriesPaused', paused: true })
    expect(pantries(paused).every((p) => p.status === 'paused')).toBe(true)
    const one = must(paused, { type: 'configure', x: 0, y: 2, paused: false })
    expect(pantries(one).find((p) => p.x === 0 && p.y === 2)?.status).toBe('idle')
  })

  it('works in build, service and summary phases', () => {
    const s = game()
    expect(s.phase).toBe('build')
    expect(pantries(must(s, { type: 'setPantriesPaused', paused: true })).every((p) => p.paused === true)).toBe(true)
    const svc = must(s, { type: 'openService' })
    expect(pantries(must(svc, { type: 'setPantriesPaused', paused: true })).every((p) => p.paused === true)).toBe(true)
    const day = runTicks(svc, DEFS, 100000)
    expect(day.phase).toBe('summary')
    const p0 = pantries(day)[0]
    const one = must(day, { type: 'configure', x: p0.x, y: p0.y, paused: true })
    expect(pantries(one).find((p) => p.id === p0.id)?.paused).toBe(true)
    expect(pantries(must(day, { type: 'setPantriesPaused', paused: true })).every((p) => p.paused === true)).toBe(true)
  })

  it('other configure fields still need build or service', () => {
    const day = runTicks(must(game(), { type: 'openService' }), DEFS, 100000)
    const p0 = pantries(day)[0]
    const out = applyCommand(day, DEFS, { type: 'configure', x: p0.x, y: p0.y, interval: 80 })
    expect(out.result.ok).toBe(false)
  })
})

describe('configure paused validation', () => {
  it('is rejected for non-pantries and for non-boolean values', () => {
    const s = game()
    const bad = applyCommand(s, DEFS, { type: 'configure', x: 3, y: 2, paused: true })
    expect(bad.result.ok).toBe(false)
    if (!bad.result.ok) expect(bad.result.reason).toBe('invalid config')
    const wrong = applyCommand(s, DEFS, { type: 'configure', x: 0, y: 2, paused: 'yes' as unknown as boolean })
    expect(wrong.result.ok).toBe(false)
    const place = applyCommand(s, DEFS, { type: 'place', kind: 'belt', x: 2, y: 5, dir: 0, config: { paused: true } })
    expect(place.result.ok).toBe(false)
  })

  it('resuming removes the flag, so an untouched pantry looks like before', () => {
    const s = game()
    const paused = must(s, { type: 'configure', x: 0, y: 2, paused: true })
    const back = must(paused, { type: 'configure', x: 0, y: 2, paused: false })
    expect(JSON.stringify(back)).toBe(JSON.stringify(s))
  })
})

describe('setPantriesPaused', () => {
  it('pauses and resumes every pantry in one command', () => {
    const s = game()
    expect(pantries(s)).toHaveLength(2)
    const paused = must(s, { type: 'setPantriesPaused', paused: true })
    expect(pantries(paused).every((p) => p.paused === true)).toBe(true)
    const resumed = must(paused, { type: 'setPantriesPaused', paused: false })
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(s))
  })

  it('rejects a bad value, and a game without pantries', () => {
    const s = game()
    expect(applyCommand(s, DEFS, { type: 'setPantriesPaused', paused: 1 as unknown as boolean }).result.ok).toBe(false)
    const none = structuredClone(s)
    for (const p of pantries(none)) {
      delete none.buildings[p.id]
      none.tiles = none.tiles.map((t) => (t === p.id ? null : t))
    }
    const out = applyCommand(none, DEFS, { type: 'setPantriesPaused', paused: true })
    expect(out.result.ok).toBe(false)
  })
})
