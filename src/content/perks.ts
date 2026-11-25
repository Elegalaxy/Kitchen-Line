// Franchise perks (GAME_DESIGN 8.2, provisional, 2026-11-24). Permanent levels bought with franchise
// points between runs; they change the starting state only. `costs[i]` is the price of level i + 1.

import type { PerkDef } from '../sim/types.ts'

export const PERKS: PerkDef[] = [
  // +$250 per level: start $400 / $650 / $900 (the base start is $150, GAME_DESIGN 7)
  { id: 'seedMoney', name: 'Seed money', emoji: '💰', costs: [6, 9, 12], effect: { startMoney: 25000 } },
  // 4 of the 10 starting virtual ratings become 4 stars per level: reputation 3.4, then 3.8
  { id: 'goodName', name: 'Good name', emoji: '⭐', costs: [5, 8], effect: { goodRatings: 4 } },
  // start with expansion 1 (10 x 8), applied free
  { id: 'biggerStall', name: 'Bigger stall', emoji: '📐', costs: [10], effect: { startExpansion: 1 } },
  // Install the stall kitchen saved at the latest run's restaurant upgrade, free, on day 1 (GAME_DESIGN 8.2).
  // The price is the FP only: the $150 start cash could not pay for the buildings. Provisional cost, tuned by
  // the harness; lowered from 14 to 8 by user decision on 2026-11-25 (doc/plans/2026-11-24-starter-kit.md).
  { id: 'starterKit', name: 'Starter kitchen', emoji: '🍳', costs: [8], effect: { starterKit: true } },
]
