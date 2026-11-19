// Named starter layouts, each a list of `place` commands applied to a fresh game.
// demoBeltLine (plan Step 4): the pre-placed potato pantry at (0, 2) feeds a straight
// belt line east into the pass at (7, 2). The grid is 8 wide, so the gap between the
// two needs 6 belt tiles (x = 1..6). Since Step 6 the pass takes dishes only, so raw
// potatoes stall at the pass; the line is kept as a belt-stall demo.
// friesLine (plan Step 6): pantry(potato) -> belt -> chopper -> belt -> fryer -> 2 belts
// -> pass, all facing east along y = 2. Costs $69 (2 stations + 4 belts), within $150.

import type { Command } from '../sim/types.ts'

const east = (kind: 'belt' | 'chopper' | 'fryer', x: number): Command => ({ type: 'place', kind, x, y: 2, dir: 1 })

export const LAYOUTS: Record<string, Command[]> = {
  demoBeltLine: [1, 2, 3, 4, 5, 6].map((x) => east('belt', x)),
  friesLine: [east('belt', 1), east('chopper', 2), east('belt', 3), east('fryer', 4), east('belt', 5), east('belt', 6)],
}
