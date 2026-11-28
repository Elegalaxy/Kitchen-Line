// The status a building is shown with (Inspector, tile info, canvas badge). The sim keeps a
// building's last status while time is stopped, so in the build phase a pantry would still read
// "Working" or "Blocked" from the day before. There it reads "Ready", unless the player paused it.

import type { Building, BuildingStatus, GameState } from '../sim/types.ts'

export type ShownStatus = BuildingStatus | 'ready'

export function shownStatus(phase: GameState['phase'], b: Building): ShownStatus {
  if (b.kind !== 'pantry' || phase !== 'build') return b.status
  return b.paused === true ? 'paused' : 'ready'
}
