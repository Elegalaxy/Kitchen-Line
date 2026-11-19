// Named starter layouts, each a list of `place` commands applied to a fresh game.
// demoBeltLine (plan Step 4): the pre-placed potato pantry at (0, 2) feeds a straight
// belt line east into the pass at (7, 2). The grid is 8 wide, so the gap between the
// two needs 6 belt tiles (x = 1..6). Since Step 6 the pass takes dishes only, so raw
// potatoes stall at the pass; the line is kept as a belt-stall demo.
// friesLine (plan Step 6): pantry(potato) -> belt -> chopper -> belt -> fryer -> 2 belts
// -> pass, all facing east along y = 2. Costs $69 (2 stations + 4 belts), within $150.
// routingDemo (plan Step 7): potato (0,2) and tomato (2,1) pantries share a belt into a
// filter at (4,2) set to tomato. Tomatoes go left onto a belt into the merger at (5,1);
// potatoes go front into a splitter at (5,2), whose left output feeds the same merger
// and whose right output goes to a bin at (5,3). The merger ends in a bin at (6,1).
// Costs $52 (4 belts, pantry, filter, splitter, merger, 2 bins), within the $150 start.
// Step 8 dish lines (all fit the 8 x 6 start grid, so no grid change is needed). The
// pre-placed potato pantry at (0, 2) is reconfigured to the line's first ingredient. Every
// line ends in belts at (5, 2) and (6, 2) into the pass. Each assembler input has its own
// feed so a full input can never block another ingredient:
//   - Two-input lines (salad, riceBowl): anchor (4, 2) facing E, second tile (4, 3).
//     Row y = 2 feeds the anchor's back, row y = 3 feeds the second tile's back.
//   - Three-input lines (sandwich, burger) add a pantry (4, 0) facing S and a processor at
//     (4, 1) facing S, feeding the anchor from the north.
// soupLine: pantry(tomato) -> chopper -> stove -> pass.
// Build costs: saladLine $116, soupLine $89, sandwichLine $127, burgerLine $162,
// riceBowlLine $186. The $150 start cannot pay for these lines, so every new line's
// LAYOUT_SETUP sets $300, unlocks its dish and puts it on the menu (dev loader only, see
// src/sim/layout.ts).

import type { LayoutSetup } from '../sim/layout.ts'
import type { Command } from '../sim/types.ts'

const east = (kind: 'belt' | 'chopper' | 'fryer', x: number): Command => ({ type: 'place', kind, x, y: 2, dir: 1 })
const at = (kind: 'belt' | 'chopper' | 'stove' | 'pantry' | 'assembler', x: number, y: number, dir: 0 | 1 | 2 | 3 = 1): Command => ({
  type: 'place',
  kind,
  x,
  y,
  dir,
})
const pantry = (x: number, y: number, ingredient: string, dir: 0 | 1 | 2 | 3 = 1): Command => ({
  type: 'place',
  kind: 'pantry',
  x,
  y,
  dir,
  config: { ingredient },
})
const first = (ingredient: string): Command => ({ type: 'configure', x: 0, y: 2, ingredient })
const recipe = (dish: string): Command => ({ type: 'configure', x: 4, y: 2, recipe: dish })
/** Belts (5, 2) and (6, 2) carry the dish from the assembler/station into the pass. */
const exit: Command[] = [at('belt', 5, 2), at('belt', 6, 2)]

export const LAYOUTS: Record<string, Command[]> = {
  demoBeltLine: [1, 2, 3, 4, 5, 6].map((x) => east('belt', x)),
  routingDemo: [
    east('belt', 1),
    east('belt', 2),
    { type: 'place', kind: 'pantry', x: 2, y: 1, dir: 2, config: { ingredient: 'tomato' } },
    east('belt', 3),
    { type: 'place', kind: 'filter', x: 4, y: 2, dir: 1 },
    { type: 'configure', x: 4, y: 2, filterItem: 'tomato' },
    { type: 'place', kind: 'belt', x: 4, y: 1, dir: 1 },
    { type: 'place', kind: 'splitter', x: 5, y: 2, dir: 1 },
    { type: 'place', kind: 'merger', x: 5, y: 1, dir: 1 },
    { type: 'place', kind: 'bin', x: 5, y: 3, dir: 1 },
    { type: 'place', kind: 'bin', x: 6, y: 1, dir: 1 },
  ],
  friesLine: [east('belt', 1), east('chopper', 2), east('belt', 3), east('fryer', 4), east('belt', 5), east('belt', 6)],
  // lettuce -> chopper -> anchor back; tomato -> chopper -> second tile back.
  saladLine: [
    first('lettuce'),
    at('belt', 1, 2),
    at('chopper', 2, 2),
    at('belt', 3, 2),
    pantry(0, 3, 'tomato'),
    at('belt', 1, 3),
    at('chopper', 2, 3),
    at('belt', 3, 3),
    at('assembler', 4, 2),
    recipe('salad'),
    ...exit,
  ],
  soupLine: [first('tomato'), at('belt', 1, 2), at('chopper', 2, 2), at('belt', 3, 2), at('stove', 4, 2), ...exit],
  // bread -> anchor back; tomato -> chopper -> second tile back; lettuce -> chopper -> anchor north.
  sandwichLine: [
    first('bread'),
    at('belt', 1, 2),
    at('belt', 2, 2),
    at('belt', 3, 2),
    pantry(0, 3, 'tomato'),
    at('belt', 1, 3),
    at('chopper', 2, 3),
    at('belt', 3, 3),
    pantry(4, 0, 'lettuce', 2),
    at('chopper', 4, 1, 2),
    at('assembler', 4, 2),
    recipe('sandwich'),
    ...exit,
  ],
  // bun -> anchor back; patty -> stove -> second tile back; tomato -> chopper -> anchor north.
  burgerLine: [
    first('bun'),
    at('belt', 1, 2),
    at('belt', 2, 2),
    at('belt', 3, 2),
    pantry(0, 3, 'patty'),
    at('belt', 1, 3),
    at('stove', 2, 3),
    at('belt', 3, 3),
    pantry(4, 0, 'tomato', 2),
    at('chopper', 4, 1, 2),
    at('assembler', 4, 2),
    recipe('burger'),
    ...exit,
  ],
  // rice -> stove -> anchor back; patty -> stove -> second tile back.
  riceBowlLine: [
    first('rice'),
    at('belt', 1, 2),
    at('stove', 2, 2),
    at('belt', 3, 2),
    pantry(0, 3, 'patty'),
    at('belt', 1, 3),
    at('stove', 2, 3),
    at('belt', 3, 3),
    at('assembler', 4, 2),
    recipe('riceBowl'),
    ...exit,
  ],
}

/** Dev-loader setup per layout: unlocks (and money) the commands alone cannot provide. */
export const LAYOUT_SETUP: Record<string, LayoutSetup> = {
  saladLine: { menu: ['salad'], money: 30000 },
  soupLine: { menu: ['soup'], unlock: ['soup'], money: 30000 },
  sandwichLine: { menu: ['sandwich'], unlock: ['sandwich'], money: 30000 },
  burgerLine: { menu: ['burger'], unlock: ['burger'], money: 30000 },
  riceBowlLine: { menu: ['riceBowl'], unlock: ['riceBowl'], money: 30000 },
}
