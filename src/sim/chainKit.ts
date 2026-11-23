// Shared fixture for the chain stage tests (branches.test.ts, chain.test.ts): inline defs (sim tests may not
// import src/content) with a fries line like content's friesLine, three branch sites, and a restaurant-tier
// kitchen that is mid-service so the blueprint has something to empty. Test support only, nothing imports it
// from the game.

import { applyCommand } from './commands.ts'
import { createGame } from './game.ts'
import { runTicks } from './tick.ts'
import type { BranchAreaDef, BuildingDef, BuildingKind, Command, Defs, GameState } from './types.ts'

function bd(kind: BuildingKind, cost: number, extra: Partial<BuildingDef> = {}): BuildingDef {
  return { kind, name: kind, emoji: '?', cost, requiresTier: 'stall', tiles: 1, placeable: true, ...extra }
}

export const AREAS: BranchAreaDef[] = [
  { id: 'a', name: 'Area A', emoji: '', demandPercent: 100, rent: 1000 },
  { id: 'b', name: 'Area B', emoji: '', demandPercent: 120, rent: 2000 },
  { id: 'c', name: 'Area C', emoji: '', demandPercent: 80, rent: 500 },
  { id: 'd', name: 'Area D', emoji: '', demandPercent: 140, rent: 3000 },
]

export const DEFS: Defs = {
  items: {
    potato: { id: 'potato', name: 'Potato', emoji: '', kind: 'raw', cost: 30 },
    potatoStrips: { id: 'potatoStrips', name: 'Strips', emoji: '', kind: 'processed' },
    fries: { id: 'fries', name: 'Fries', emoji: '', kind: 'dish', spoilTicks: 600 },
  },
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
  stationRecipes: [
    { station: 'chopper', input: 'potato', output: 'potatoStrips', ticks: 20 },
    { station: 'fryer', input: 'potatoStrips', output: 'fries', ticks: 60 },
  ],
  dishes: {
    fries: { id: 'fries', name: 'Fries', emoji: '', refPrice: 300, popularity: 3, startsUnlocked: true, unlockCost: 0 },
  },
  branchAreas: AREAS,
}

export function area(demandPercent: number, rent = 0): BranchAreaDef {
  return { id: `a${demandPercent}`, name: 'Area', emoji: '', demandPercent, rent }
}

/** Apply a command that must be accepted. */
export function must(s: GameState, cmd: Command, defs: Defs = DEFS): GameState {
  const out = applyCommand(s, defs, cmd)
  if (!out.result.ok) throw new Error(`rejected ${JSON.stringify(cmd)}: ${out.result.reason}`)
  return out.state
}

/** pantry -> belt -> chopper -> belt -> fryer -> 2 belts -> pass, like content's friesLine, in the restaurant tier, mid-service. */
export function friesKitchen(): GameState {
  let s = createGame(DEFS, 'demo')
  s.money = 1_000_000
  const east = (kind: BuildingKind, x: number): Command => ({ type: 'place', kind, x, y: 2, dir: 1 })
  for (const [kind, x] of [['belt', 1], ['chopper', 2], ['belt', 3], ['fryer', 4], ['belt', 5], ['belt', 6]] as const) s = must(s, east(kind, x))
  s.tier = 'restaurant'
  s = must(s, { type: 'openService' })
  return runTicks(s, DEFS, 700) // items on the belts, pantry cooldowns mid-way, a few ratings
}

/** The same kitchen in the build phase of the next day with the end screen already seen (the chain stage is open). */
export function chainReady(): GameState {
  const s = runTicks(friesKitchen(), DEFS, 2400)
  s.won = true
  return must(s, { type: 'dismissSummary' })
}
