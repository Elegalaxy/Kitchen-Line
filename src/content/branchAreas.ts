// Branch sites for the chain stage (GAME_DESIGN 8.1). Provisional numbers: `demandPercent` scales the arrival
// chance of the branch's test day, `rent` is charged every night (cents). A branch gets one site, picked by a
// hash among the sites not used yet (sim/branches.ts `nextArea`).

import type { BranchAreaDef } from '../sim/types.ts'

export const BRANCH_AREAS: BranchAreaDef[] = [
  { id: 'suburb', name: 'Quiet suburb', emoji: '🏡', demandPercent: 80, rent: 6000 },
  { id: 'college', name: 'College town', emoji: '🎓', demandPercent: 100, rent: 9000 },
  { id: 'riverside', name: 'Riverside', emoji: '🌊', demandPercent: 110, rent: 11000 },
  { id: 'oldTown', name: 'Old town', emoji: '🏛️', demandPercent: 120, rent: 14000 },
  { id: 'station', name: 'Station square', emoji: '🚉', demandPercent: 140, rent: 19000 },
]
