// Display helpers shared by the UI: money, reject reasons, directions, building status.

import type { BuildingStatus, Dir, RejectReason } from '../sim/types.ts'

/** Integer cents to "$12.50" (negative: "-$1.00"). */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100).toLocaleString('en-US')
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`
}

const REASON_TEXT: Record<RejectReason, string> = {
  'invalid command': 'Invalid action',
  'invalid config': 'Invalid setting',
  'wrong phase': 'Not possible right now',
  'out of bounds': 'Outside the grid',
  occupied: 'Tile is occupied',
  'cannot afford': 'Not enough money',
  'locked by tier': 'Needs the restaurant tier',
  'locked recipe': 'Recipe is locked',
  'nothing there': 'Nothing there',
  'pass cannot be removed': 'The pass cannot be removed',
  'pass cannot be placed': 'The pass cannot be placed',
  'not implemented': 'Not available yet',
}

/** Player-facing text for a sim rejection reason. */
export function reasonText(reason: RejectReason): string {
  return REASON_TEXT[reason]
}

export const DIR_NAME: readonly string[] = ['North', 'East', 'South', 'West']
export const DIR_ARROW: readonly string[] = ['↑', '→', '↓', '←']

export function dirName(dir: Dir): string {
  return DIR_NAME[dir]
}

/** Status as icon plus word (never colour alone). */
export const STATUS_TEXT: Record<BuildingStatus, { icon: string; word: string }> = {
  ok: { icon: '✅', word: 'Working' },
  idle: { icon: '💤', word: 'Idle' },
  blocked: { icon: '⛔', word: 'Blocked' },
  warming: { icon: '⏳', word: 'Warming up' },
  noCash: { icon: '💸', word: 'No cash' },
  noRecipe: { icon: '❓', word: 'No recipe set' },
}
