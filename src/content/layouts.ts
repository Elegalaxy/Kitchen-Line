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

import type { Command } from '../sim/types.ts'

const east = (kind: 'belt' | 'chopper' | 'fryer', x: number): Command => ({ type: 'place', kind, x, y: 2, dir: 1 })

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
}
