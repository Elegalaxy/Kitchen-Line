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

/** Values below this many cents ($1,000,000) show in full; at or above it, compact. */
export const COMPACT_MONEY_FROM = 100_000_000

const COMPACT_UNITS = [
  { suffix: 'M', size: 1e6 },
  { suffix: 'B', size: 1e9 },
  { suffix: 'T', size: 1e12 },
] as const

/**
 * Money for tight spots (top bar, summary): full "$12.50" below $1M, then one decimal with
 * a suffix ("$1.2M", "-$3.4B"). The full value belongs in a title / aria-label next to it.
 */
export function formatMoneyCompact(cents: number): string {
  const abs = Math.abs(cents)
  if (abs < COMPACT_MONEY_FROM) return formatMoney(cents)
  const sign = cents < 0 ? '-' : ''
  const dollars = abs / 100
  for (let i = 0; i < COMPACT_UNITS.length; i += 1) {
    const { suffix, size } = COMPACT_UNITS[i]
    const rounded = Math.round((dollars / size) * 10) / 10
    // 999.96M rounds to 1000.0M: move up one unit instead ("$1.0B").
    if (rounded < 1000 || i === COMPACT_UNITS.length - 1) return `${sign}$${rounded.toFixed(1)}${suffix}`
  }
  return formatMoney(cents)
}

/** Cut `text` to at most `max` characters with an ellipsis; shorter text is returned as is. */
export function clipText(text: string, max: number): string {
  if (max < 1 || text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
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
  'already unlocked': 'Already unlocked',
  'menu full': 'The menu is full',
  'not on menu': 'That dish is not on the menu',
  'price out of range': 'Price is outside the allowed range',
  'invalid price': 'Enter a price in 10-cent steps',
  'nothing there': 'Nothing there',
  'pass cannot be removed': 'The last pass cannot be removed',
  'pass cannot be placed': 'The pass cannot be placed',
  'pass limit': 'You already have two passes',
  'already owned': 'Already bought',
  'not implemented': 'Not available yet',
  'goals not done': 'Finish all stall goals first',
  'already restaurant': 'Already a restaurant',
  'no more expansions': 'The kitchen is fully expanded',
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
  paused: { icon: '⏸', word: 'Paused' },
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
