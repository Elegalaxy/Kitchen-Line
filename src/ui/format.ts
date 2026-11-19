// Display helpers shared by the UI: money, reject reasons, directions, building status.

import { DAY_TICKS } from '../sim/constants.ts'
import { phaseAt } from '../sim/day.ts'
import type { BuildingStatus, DayPhase, Dir, GameState, RejectReason } from '../sim/types.ts'

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
  'Menu is locked during service': 'Menu is locked during service',
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

/** Day clock "HH:MM": 11:00 at dayTick 0 to 22:00 at DAY_TICKS (11 hours over the day). */
export function clockText(dayTick: number): string {
  const clamped = Math.min(Math.max(dayTick, 0), DAY_TICKS)
  const minutes = 11 * 60 + Math.floor((clamped * 11 * 60) / DAY_TICKS)
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Phase badge text: icon plus word (never colour alone). `service` uses the part of the day. */
export const PHASE_TEXT: Record<DayPhase | 'build' | 'summary' | 'won', { icon: string; word: string }> = {
  build: { icon: '🔧', word: 'Build' },
  open: { icon: '🔔', word: 'Opening' },
  lunchRush: { icon: '🔥', word: 'Lunch rush' },
  quiet: { icon: '🍃', word: 'Quiet' },
  dinnerRush: { icon: '🌙', word: 'Dinner rush' },
  closing: { icon: '🔒', word: 'Closing' },
  summary: { icon: '📋', word: 'Day over' },
  won: { icon: '🏆', word: 'Done' },
}

export function phaseKey(state: Pick<GameState, 'phase' | 'dayTick'>): keyof typeof PHASE_TEXT {
  return state.phase === 'service' ? phaseAt(state.dayTick) : state.phase
}

/** Reputation text plus the change since the day started (compared at the one decimal shown). */
export function reputationView(rep: number, atDayStart: number): { text: string; dir: 'up' | 'down' | null } {
  const now = Math.round(rep * 10)
  const before = Math.round(atDayStart * 10)
  return { text: rep.toFixed(1), dir: now > before ? 'up' : now < before ? 'down' : null }
}
