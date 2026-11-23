// Restaurant upgrades (GAME_DESIGN 6.4). Bought once each in the build phase, restaurant tier only.
// Costs in cents and effect sizes are provisional.

import type { UpgradeDef } from '../sim/types.ts'

export const UPGRADES: UpgradeDef[] = [
  { id: 'tables', name: 'More tables', emoji: '🪑', cost: 30000, requiresTier: 'restaurant', effect: { waitingCapBonus: 3 } },
  { id: 'sign', name: 'Street sign', emoji: '🪧', cost: 40000, requiresTier: 'restaurant', effect: { arrivalPercent: 15 } },
  { id: 'music', name: 'Music', emoji: '🎵', cost: 30000, requiresTier: 'restaurant', effect: { patiencePercent: 25 } },
  { id: 'plates', name: 'Nice plates', emoji: '🍽️', cost: 60000, requiresTier: 'restaurant', effect: { budgetPercent: 15 } },
]
