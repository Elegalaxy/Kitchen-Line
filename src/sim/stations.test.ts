// Tests for stations and the dish-only pass (plan Step 6). Fixtures are inline Defs
// (sim tests may import only vitest and src/sim). friesLine is built like the content
// layout: pantry(potato) -> belt -> chopper -> belt -> fryer -> belt x2 -> pass on an
// 8 x 6 grid, all facing east. Checked: exact first-fries tick, fryer-limited rate,
// a tomato into a fryer is refused and the belt stalls, an unconnected stove is idle,
// the pass refuses non-dishes and takes dishes, and the line is deterministic. Assembler
// (Step 8): acceptance, cap of 2, 30-tick cycle, missing input idle, no recipe, output front.

import { describe, expect, it } from 'vitest'
import { applyCommand } from './commands.ts'
import { createGame } from './game.ts'
import { stateHash } from './hash.ts'
import { runTicks } from './tick.ts'
import { tryInsert } from './transfer.ts'
import type { Building, BuildingDef, BuildingKind, Command, Defs, GameState } from './types.ts'

function debug(message: string): void {
  console.log(`[DEBUG stations] ${message}\n`)
}

function b(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

const DEFS: Defs = {
  items: {
    potato: { id: 'potato', name: 'Potato', emoji: '', kind: 'raw', cost: 30 },
    tomato: { id: 'tomato', name: 'Tomato', emoji: '', kind: 'raw', cost: 40 },
    patty: { id: 'patty', name: 'Patty', emoji: '', kind: 'raw', cost: 120 },
    potatoStrips: { id: 'potatoStrips', name: 'Strips', emoji: '', kind: 'processed' },
    cookedPatty: { id: 'cookedPatty', name: 'Cooked patty', emoji: '', kind: 'processed' },
    fries: { id: 'fries', name: 'Fries', emoji: '', kind: 'dish' },
    lettuce: { id: 'lettuce', name: 'Lettuce', emoji: '', kind: 'raw', cost: 40 },
    choppedLettuce: { id: 'choppedLettuce', name: 'Chopped lettuce', emoji: '', kind: 'processed' },
    slicedTomato: { id: 'slicedTomato', name: 'Sliced tomato', emoji: '', kind: 'processed' },
    salad: { id: 'salad', name: 'Salad', emoji: '', kind: 'dish' },
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
    { station: 'stove', input: 'patty', output: 'cookedPatty', ticks: 60 },
    { station: 'chopper', input: 'lettuce', output: 'choppedLettuce', ticks: 20 },
    { station: 'chopper', input: 'tomato', output: 'slicedTomato', ticks: 20 },
  ],
  dishes: {
    fries: { id: 'fries', name: 'Fries', emoji: '', refPrice: 300, popularity: 3, startsUnlocked: true, unlockCost: 0 },
    salad: {
      id: 'salad',
      name: 'Salad',
      emoji: '',
      refPrice: 450,
      popularity: 2,
      startsUnlocked: true,
      unlockCost: 0,
      inputs: ['choppedLettuce', 'slicedTomato'],
    },
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

function build(cmds: Command[]): GameState {
  let s = createGame(DEFS, 'test')
  for (const c of cmds) {
    const out = applyCommand(s, DEFS, c)
    if (!out.result.ok) throw new Error(`command failed: ${out.result.reason}`)
    s = out.state
  }
  return s
}

function find<K extends BuildingKind>(s: GameState, kind: K): Building & { kind: K } {
  const f = Object.values(s.buildings).find((x) => x.kind === kind)
  if (f === undefined) throw new Error(`no ${kind}`)
  return f as Building & { kind: K }
}

describe('fries line', () => {
  it('serves its first fries at tick 81, then one every 40 ticks (fryer-limited)', () => {
    // Pantry emits into belt 1 at tick 0; belt 1 pushes to the chopper at 6 (2 belt
    // steps of 3 ticks). Chopper: 20 ticks of progress, output at 26, pushed to belt 3.
    // Belt 3 pushes to the fryer at 30. Fryer: 40 ticks, output at 70 into belt 5.
    // Belts 5 and 6 take 2 steps each on multiples of 3: 70 -> 75 -> 81 (the pass).
    let s = build(FRIES_LINE)
    const served: number[] = []
    const fried: number[] = []
    for (let t = 0; t < 1200; t += 1) {
      s = runTicks(s, DEFS, 1)
      for (const e of s.events) {
        if (e.type === 'delivered') served.push(e.tick)
        if (e.type === 'stationDone' && e.output === 'fries') fried.push(e.tick)
      }
    }
    debug(`first fries at ${served[0]}, total ${served.length} in 1200 ticks`)
    expect(served[0]).toBe(81)
    // Fryer-limited: one fries per 40 ticks after the first (81, 121, ... <= 1199).
    const expected = Math.floor((1199 - 81) / 40) + 1
    expect(Math.abs(served.length - expected)).toBeLessThanOrEqual(1)
    // The fryer itself runs at exactly 40 ticks per fries; belt steps (every 3 ticks)
    // only jitter the delivery gaps by a tick or two.
    expect(fried[0]).toBe(70)
    for (let i = 1; i < fried.length; i += 1) expect((fried[i] ?? 0) - (fried[i - 1] ?? 0)).toBe(40)
    for (let i = 1; i < served.length; i += 1) {
      expect(Math.abs((served[i] ?? 0) - (served[i - 1] ?? 0) - 40)).toBeLessThanOrEqual(2)
    }
    expect(find(s, 'pass').delivered).toBe(served.length)
    expect(s.today.served).toBe(served.length)
    expect(find(s, 'pass').shelf.length).toBe(0)
  })

  it('shows station statuses and counts progress up from 0', () => {
    let s = build(FRIES_LINE)
    s = runTicks(s, DEFS, 17) // chopper took its item at tick 6: 10 ticks of progress
    expect(find(s, 'chopper').progress).toBe(10)
    expect(find(s, 'chopper').status).toBe('ok')
    expect(find(s, 'fryer').status).toBe('idle')
    s = runTicks(s, DEFS, 500)
    expect(find(s, 'fryer').status).toBe('ok')
    expect(find(s, 'pantry').status).toBe('blocked') // the fryer is the bottleneck
  })

  it('is deterministic', () => {
    expect(stateHash(runTicks(build(FRIES_LINE), DEFS, 700))).toBe(stateHash(runTicks(build(FRIES_LINE), DEFS, 700)))
  })
})

describe('station acceptance', () => {
  it('refuses a tomato into a fryer, so the belt stalls', () => {
    let s = build([
      { type: 'place', kind: 'belt', x: 1, y: 2, dir: 1 },
      { type: 'place', kind: 'belt', x: 2, y: 2, dir: 1 },
      { type: 'place', kind: 'fryer', x: 3, y: 2, dir: 1 },
      { type: 'configure', x: 0, y: 2, ingredient: 'tomato' },
    ])
    s = runTicks(s, DEFS, 200)
    const fryer = find(s, 'fryer')
    expect(fryer.input.length).toBe(0)
    expect(fryer.status).toBe('idle')
    const belts = Object.values(s.buildings).filter((x) => x.kind === 'belt')
    expect(belts.length).toBe(2)
    for (const belt of belts) if (belt.kind === 'belt') expect(belt.stalled).toBe(true)
    expect(find(s, 'pantry').status).toBe('blocked')
  })

  it('does not accept a station input from its front', () => {
    // A fryer facing W whose front neighbour is a belt pushing east into it.
    let s = build([
      { type: 'place', kind: 'belt', x: 1, y: 2, dir: 1 },
      { type: 'place', kind: 'belt', x: 2, y: 2, dir: 1 },
      { type: 'place', kind: 'fryer', x: 3, y: 2, dir: 3 },
    ])
    s = runTicks(s, DEFS, 100)
    expect(find(s, 'fryer').input.length).toBe(0)
  })

  it('shows idle on an unconnected stove', () => {
    const s = runTicks(build([{ type: 'place', kind: 'stove', x: 4, y: 4, dir: 1 }]), DEFS, 100)
    expect(find(s, 'stove').status).toBe('idle')
    expect(find(s, 'stove').progress).toBe(0)
  })

  it('blocks a station whose output cannot be pushed, and keeps the output', () => {
    // Chopper facing N into a free tile: nothing to push into.
    let s = build([
      { type: 'place', kind: 'belt', x: 1, y: 2, dir: 1 },
      { type: 'place', kind: 'chopper', x: 2, y: 2, dir: 0 },
    ])
    s = runTicks(s, DEFS, 100)
    const chopper = find(s, 'chopper')
    expect(chopper.output?.type).toBe('potatoStrips')
    expect(chopper.status).toBe('blocked')
    expect(chopper.input.length).toBe(2)
  })
})

describe('pass', () => {
  it('refuses non-dishes and accepts a dish', () => {
    // A belt at (6, 2) pushes east into the pass; tick 3 is a belt-step tick.
    const base = build([{ type: 'place', kind: 'belt', x: 6, y: 2, dir: 1 }])
    base.tick = 3
    const withPotato = structuredClone(base)
    find(withPotato, 'belt').slots[1] = { id: 900, type: 'potato', bornTick: 0 }
    const refused = runTicks(withPotato, DEFS, 1)
    expect(find(refused, 'pass').delivered).toBe(0)
    expect(find(refused, 'belt').stalled).toBe(true)
    expect(refused.today.served).toBe(0)

    const withFries = structuredClone(base)
    find(withFries, 'belt').slots[1] = { id: 901, type: 'fries', bornTick: 0 }
    const accepted = runTicks(withFries, DEFS, 1)
    expect(find(accepted, 'pass').delivered).toBe(1)
    expect(accepted.today.served).toBe(1)
    expect(find(accepted, 'pass').shelf.length).toBe(0)
  })
})

// ---- Assembler (plan Step 8) ----------------------------------------------------------
// Salad assembler at anchor (4, 2) facing E, second tile (4, 3), output belt (5, 2) -> (6, 2)
// -> pass. Items are put in by hand so each rule is checked on its own.

const ASM_BASE: Command[] = [
  { type: 'place', kind: 'assembler', x: 4, y: 2, dir: 1 },
  { type: 'place', kind: 'belt', x: 5, y: 2, dir: 1 },
  { type: 'place', kind: 'belt', x: 6, y: 2, dir: 1 },
  { type: 'configure', x: 4, y: 2, recipe: 'salad' },
]

function held(type: string, id: number): { id: number; type: string; bornTick: number } {
  return { id, type, bornTick: 0 }
}

/** The assembler line with nothing feeding it (the start pantry is not connected). */
function asmState(): GameState {
  return build(ASM_BASE)
}

describe('assembler', () => {
  it('shows noRecipe and accepts nothing while no recipe is set', () => {
    let s = build([{ type: 'place', kind: 'assembler', x: 4, y: 2, dir: 1 }])
    s = runTicks(s, DEFS, 5)
    const asm = find(s, 'assembler')
    expect(asm.status).toBe('noRecipe')
    expect(tryInsert(s, DEFS, asm, held('choppedLettuce', 900), 3)).toBe(false)
  })

  it('accepts only recipe inputs, at most 2 of each, never from its front', () => {
    const s = asmState()
    const asm = find(s, 'assembler')
    expect(tryInsert(s, DEFS, asm, held('potato', 1), 3)).toBe(false)
    expect(tryInsert(s, DEFS, asm, held('slicedTomato', 2), 1)).toBe(false) // from the front
    expect(tryInsert(s, DEFS, asm, held('slicedTomato', 3), 3)).toBe(true)
    expect(tryInsert(s, DEFS, asm, held('slicedTomato', 4), 0)).toBe(true)
    expect(tryInsert(s, DEFS, asm, held('slicedTomato', 5), 3)).toBe(false) // cap 2
    expect(tryInsert(s, DEFS, asm, held('choppedLettuce', 6), 2)).toBe(true) // other input unaffected
    expect(asm.inputs['slicedTomato']?.length).toBe(2)
  })

  it('with a missing input never produces anything and shows idle', () => {
    const s0 = asmState()
    const asm0 = find(s0, 'assembler')
    tryInsert(s0, DEFS, asm0, held('slicedTomato', 1), 3)
    tryInsert(s0, DEFS, asm0, held('slicedTomato', 2), 3)
    const s = runTicks(s0, DEFS, 400)
    const asm = find(s, 'assembler')
    expect(asm.status).toBe('idle')
    expect(asm.progress).toBe(0)
    expect(asm.output).toBeNull()
    expect(find(s, 'pass').delivered).toBe(0)
    expect(asm.inputs['slicedTomato']?.length).toBe(2)
  })

  it('takes 30 ticks once every input is held, consumes one of each and outputs out the front', () => {
    const s0 = asmState()
    const asm0 = find(s0, 'assembler')
    tryInsert(s0, DEFS, asm0, held('slicedTomato', 1), 3)
    tryInsert(s0, DEFS, asm0, held('slicedTomato', 2), 3)
    tryInsert(s0, DEFS, asm0, held('choppedLettuce', 3), 3)
    // Tick 0 is the first progress tick; the dish is made at the end of tick 29.
    const s29 = runTicks(s0, DEFS, 29)
    expect(find(s29, 'assembler').output).toBeNull()
    expect(find(s29, 'assembler').status).toBe('ok')
    const s30 = runTicks(s0, DEFS, 30)
    const made = s30.events.find((e) => e.type === 'assembled')
    expect(made).toMatchObject({ type: 'assembled', dish: 'salad', x: 4, y: 2 })
    const a = find(s30, 'assembler')
    expect(a.inputs['slicedTomato']?.length).toBe(1)
    expect(a.inputs['choppedLettuce']?.length).toBe(0)
    // The dish went out the front onto the belt at (5, 2), then reaches the pass.
    const belt = Object.values(s30.buildings).find((x) => x.kind === 'belt' && x.x === 5)
    expect(belt?.kind === 'belt' && (belt.slots[0] ?? belt.slots[1])?.type).toBe('salad')
    const s60 = runTicks(s0, DEFS, 60)
    expect(find(s60, 'pass').delivered).toBe(1)
    expect(find(s60, 'assembler').status).toBe('idle')
  })

  it('blocks while its dish cannot leave, and keeps the dish', () => {
    let s = build([
      { type: 'place', kind: 'assembler', x: 4, y: 2, dir: 0 },
      { type: 'configure', x: 4, y: 2, recipe: 'salad' },
    ])
    const asm0 = find(s, 'assembler')
    tryInsert(s, DEFS, asm0, held('slicedTomato', 1), 2)
    tryInsert(s, DEFS, asm0, held('choppedLettuce', 2), 2)
    s = runTicks(s, DEFS, 100)
    const asm = find(s, 'assembler')
    expect(asm.output?.type).toBe('salad')
    expect(asm.status).toBe('blocked')
  })

  it('changing the recipe destroys held items; a non-assembler recipe is rejected', () => {
    const s0 = asmState()
    tryInsert(s0, DEFS, find(s0, 'assembler'), held('slicedTomato', 1), 3)
    const out = applyCommand(s0, DEFS, { type: 'configure', x: 4, y: 2, recipe: null })
    expect(out.result.ok).toBe(true)
    expect(find(out.state, 'assembler').inputs).toEqual({})
    expect(out.state.today.wasteDestroyed).toBe(1)
    const bad = applyCommand(s0, DEFS, { type: 'configure', x: 4, y: 2, recipe: 'fries' })
    expect(bad.result.ok).toBe(false)
  })
})
