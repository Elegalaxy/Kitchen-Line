// Named starter layouts, each a list of `place` commands applied to a fresh game.
// demoBeltLine (plan Step 4): the pre-placed potato pantry at (0, 2) feeds a straight
// belt line east into the pass at (7, 2). The grid is 8 wide, so the gap between the
// two needs 6 belt tiles (x = 1..6).

import type { Command } from '../sim/types.ts'

export const LAYOUTS: Record<string, Command[]> = {
  demoBeltLine: [1, 2, 3, 4, 5, 6].map((x) => ({ type: 'place', kind: 'belt', x, y: 2, dir: 1 })),
}
