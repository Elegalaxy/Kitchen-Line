// Feedback effects on the grid (GAME_DESIGN section 10): which short effects are alive.
// UI only: nothing here is read by the sim, and times are wall-clock ms passed in by the canvas.
// - A sale adds "+$X.XX" and a serve flash at the pass that sold it; spoiled food flashes its tile.
// - `served` events carry no position, so the selling pass is replayed from the tick events
//   with the sim's own rule (customers.ts): the lowest-id pass holding the dish serves first.
// - Bounded: one flash per tile and kind, sales close together on one pass add up into one
//   label, and at most MAX_EFFECTS live at once (the oldest goes first).
// - Effects expire on their own, also while the game is paused. A replaced state clears them.
//   With reduced motion none are created.

import type { GameState, SimEvent } from '../../sim/types.ts'
import { formatMoney } from '../format.ts'
import type { Feedback } from '../store.ts'

export const MONEY_MS = 900
export const SERVE_MS = 350
export const SPOIL_MS = 450
/** A second sale on the same pass within this time joins the label already rising there. */
export const MONEY_MERGE_MS = 450
export const MAX_EFFECTS = 48

export type EffectKind = 'money' | 'serve' | 'spoil'
export type Effect = { kind: EffectKind; x: number; y: number; start: number; cents: number; label: string }
export type Sale = { x: number; y: number; cents: number }

const LIFE: Record<EffectKind, number> = { money: MONEY_MS, serve: SERVE_MS, spoil: SPOIL_MS }

export function lifeOf(kind: EffectKind): number {
  return LIFE[kind]
}

type Shelf = { id: number; x: number; y: number; dishes: Map<string, number> }

/** Where each sale of a batch of ticks happened. `before` is the state the ticks started from. */
export function salesAt(before: GameState, events: readonly SimEvent[]): Sale[] {
  if (!events.some((e) => e.type === 'served')) return []
  const shelves: Shelf[] = []
  for (const b of Object.values(before.buildings)) {
    if (b.kind !== 'pass') continue
    const dishes = new Map<string, number>()
    for (const item of b.shelf) dishes.set(item.type, (dishes.get(item.type) ?? 0) + 1)
    shelves.push({ id: b.id, x: b.x, y: b.y, dishes })
  }
  shelves.sort((a, b) => a.id - b.id)
  const change = (x: number, y: number, dish: string, by: number): void => {
    const shelf = shelves.find((s) => s.x === x && s.y === y)
    if (shelf !== undefined) shelf.dishes.set(dish, Math.max(0, (shelf.dishes.get(dish) ?? 0) + by))
  }
  const sales: Sale[] = []
  for (const e of events) {
    if (e.type === 'delivered') change(e.x, e.y, e.item, 1)
    else if (e.type === 'spoiled') change(e.x, e.y, e.item, -1)
    else if (e.type === 'served') {
      const shelf = shelves.find((s) => (s.dishes.get(e.dish) ?? 0) > 0) ?? shelves[0]
      if (shelf === undefined) continue
      change(shelf.x, shelf.y, e.dish, -1)
      sales.push({ x: shelf.x, y: shelf.y, cents: e.price })
    }
  }
  return sales
}

export type Effects = {
  /** Take in store feedback at `now`. `animate` false (reduced motion) creates nothing. */
  ingest(feedback: Feedback, now: number, animate: boolean): void
  /** Drop the effects whose time is up. */
  prune(now: number): void
  clear(): void
  list(): readonly Effect[]
}

export function createEffects(): Effects {
  const live: Effect[] = []
  const add = (kind: EffectKind, x: number, y: number, now: number, cents: number): void => {
    const window = kind === 'money' ? MONEY_MERGE_MS : LIFE[kind]
    const same = live.find((e) => e.kind === kind && e.x === x && e.y === y && now - e.start < window)
    if (same !== undefined) {
      if (kind === 'money') {
        same.cents += cents
        same.label = `+${formatMoney(same.cents)}`
      }
      return
    }
    live.push({ kind, x, y, start: now, cents, label: kind === 'money' ? `+${formatMoney(cents)}` : '' })
    if (live.length > MAX_EFFECTS) live.shift()
  }
  const prune = (now: number): void => {
    let kept = 0
    for (const e of live) if (now - e.start < LIFE[e.kind]) live[kept++] = e
    live.length = kept
  }
  return {
    ingest(feedback, now, animate) {
      if (feedback.type === 'reset' || !animate) {
        live.length = 0
        return
      }
      if (feedback.type !== 'ticks') return
      prune(now)
      for (const e of feedback.events) if (e.type === 'spoiled') add('spoil', e.x, e.y, now, 0)
      for (const s of salesAt(feedback.before, feedback.events)) {
        add('serve', s.x, s.y, now, 0)
        add('money', s.x, s.y, now, s.cents)
      }
    },
    prune,
    clear() {
      live.length = 0
    },
    list: () => live,
  }
}
