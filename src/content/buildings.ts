// Building defs. Costs in cents are provisional (GAME_DESIGN 5.3 and 7, plan 2.5).
// The first pass is pre-placed; a second one can be bought at the restaurant tier. The fast belt is a belt variant that needs
// the restaurant tier.

import type { BuildingDef, BuildingKind } from '../sim/types.ts'

const list: BuildingDef[] = [
  {
    kind: 'belt',
    name: 'Belt',
    emoji: '➡️',
    cost: 100,
    requiresTier: 'stall',
    tiles: 1,
    placeable: true,
    fast: { cost: 300, requiresTier: 'restaurant' },
  },
  { kind: 'pantry', name: 'Pantry', emoji: '📦', cost: 1000, requiresTier: 'stall', tiles: 1, placeable: true },
  { kind: 'splitter', name: 'Splitter', emoji: '🔀', cost: 800, requiresTier: 'stall', tiles: 1, placeable: true },
  { kind: 'merger', name: 'Merger', emoji: '🔁', cost: 800, requiresTier: 'stall', tiles: 1, placeable: true },
  { kind: 'filter', name: 'Filter', emoji: '🔍', cost: 1200, requiresTier: 'stall', tiles: 1, placeable: true },
  { kind: 'chopper', name: 'Chopper', emoji: '🔪', cost: 2500, requiresTier: 'stall', tiles: 1, placeable: true },
  { kind: 'fryer', name: 'Fryer', emoji: '🍳', cost: 4000, requiresTier: 'stall', tiles: 1, placeable: true },
  { kind: 'stove', name: 'Stove', emoji: '🔥', cost: 6000, requiresTier: 'stall', tiles: 1, placeable: true },
  {
    kind: 'assembler',
    name: 'Assembler',
    emoji: '🧑‍🍳',
    cost: 5000,
    requiresTier: 'stall',
    tiles: 2,
    placeable: true,
  },
  { kind: 'bin', name: 'Bin', emoji: '🗑️', cost: 500, requiresTier: 'stall', tiles: 1, placeable: true },
  // GAME_DESIGN 5.3: the first pass is pre-placed (createGame, free); one extra pass ($400) is for sale at the
  // restaurant tier, PASS_MAX in total. It is listed last so the palette hotkeys 1 to 0 keep their buildings.
  { kind: 'pass', name: 'Pass', emoji: '🛎️', cost: 40000, requiresTier: 'restaurant', tiles: 1, placeable: true },
]

export const BUILDINGS = Object.fromEntries(list.map((b) => [b.kind, b])) as Record<BuildingKind, BuildingDef>
