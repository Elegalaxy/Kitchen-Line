// Game store (plan Step 4): holds the live GameState and Defs for the UI.
// - The canvas reads `getState()` every animation frame (no React involved).
// - React reads `getSnapshot()` through useSyncExternalStore. The snapshot object is only
//   replaced when subscribers are notified, which is throttled to 5 times a second for
//   tick updates; commands and speed changes publish immediately.
// - Build commands (place, remove, rotate, configure) are recorded for undo (undo.ts).
//   `dispatchGroup` applies several commands all-or-nothing as ONE action and ONE undo entry
//   (used by drag-to-draw belts).
// - `state.events` only holds the last tick's events after `advance(n)`; nothing here
//   relies on event history.

import { useSyncExternalStore } from 'react'
import { LAYOUTS, LAYOUT_SETUP } from '../content/layouts.ts'
import { applyCommand } from '../sim/commands.ts'
import { createGame } from '../sim/game.ts'
import { updateGoals } from '../sim/goals.ts'
import { applyLayout } from '../sim/layout.ts'
import { runTicks } from '../sim/tick.ts'
import type { Command, CommandResult, Defs, GameState, RejectReason } from '../sim/types.ts'
import { debugLog } from './debug.ts'
import { applyGroup, isUndoable, labelFor, pushUndo, undoLast } from './undo.ts'
import type { UndoEntry } from './undo.ts'

export type Speed = 0 | 1 | 2 | 4
export const SPEEDS: readonly Speed[] = [0, 1, 2, 4]
export const NOTIFY_INTERVAL_MS = 200 // 5 notifications a second
/** Cap on spoil marks waiting for the canvas (it drains them every frame). */
const MAX_PENDING_SPOILS = 200

export type UndoInfo = { count: number; label: string | null }
export type Snapshot = { state: GameState; speed: Speed; undo: UndoInfo }
export type UndoResult = { ok: true; label: string } | { ok: false; reason: RejectReason | 'empty'; label: string }

export type GameStore = {
  defs: Defs
  getState(): GameState
  getSpeed(): Speed
  /** Referentially stable between notifications (for useSyncExternalStore). */
  getSnapshot(): Snapshot
  subscribe(listener: () => void): () => void
  dispatch(cmd: Command): CommandResult
  /** Apply several commands all-or-nothing as one action and one undo entry. */
  dispatchGroup(cmds: Command[], label: string): CommandResult
  /** Undo the latest build action. A rejected inverse drops the entry and is reported. */
  undo(): UndoResult
  setSpeed(speed: Speed): void
  /** Pause, or resume at the last non-zero speed (1x if none). */
  togglePause(): void
  /** Swap in a whole new state (load or new game): undo history and pending spoil marks are cleared. */
  replaceState(next: GameState, speed: Speed): void
  /** Run `n` ticks (called by the loop). */
  advance(n: number): void
  /**
   * Tiles where an item spoiled since the last call, then forgotten. `state.events` only
   * holds the last tick's events, so `advance` collects these per tick while it runs.
   */
  takeSpoils(): { x: number; y: number }[]
}

export type ThrottleDeps = {
  now: () => number
  setTimer: (fn: () => void, ms: number) => unknown
}

/** Trailing-edge throttle: `fire()` runs at most once per `intervalMs`, never dropped. */
export function createThrottle(fn: () => void, intervalMs: number, deps: ThrottleDeps) {
  let last = Number.NEGATIVE_INFINITY
  let pending = false
  const run = (): void => {
    pending = false
    last = deps.now()
    fn()
  }
  return {
    fire(): void {
      if (pending) return
      const wait = last + intervalMs - deps.now()
      if (wait <= 0) run()
      else {
        pending = true
        deps.setTimer(run, wait)
      }
    },
    /** Run now and cancel the need for a pending trailing call. */
    flush(): void {
      run()
    },
  }
}

export function createStore(defs: Defs, initial: GameState, deps?: Partial<ThrottleDeps>): GameStore {
  let state = initial
  let speed: Speed = 1
  let resumeSpeed: Speed = 1
  let undoStack: UndoEntry[] = []
  const undoInfo = (): UndoInfo => ({
    count: undoStack.length,
    label: undoStack.length === 0 ? null : undoStack[undoStack.length - 1].label,
  })
  let snapshot: Snapshot = { state, speed, undo: undoInfo() }
  let spoils: { x: number; y: number }[] = []
  const listeners = new Set<() => void>()
  const publish = (): void => {
    snapshot = { state, speed, undo: undoInfo() }
    for (const l of [...listeners]) l()
  }
  const throttle = createThrottle(publish, NOTIFY_INTERVAL_MS, {
    now: deps?.now ?? (() => performance.now()),
    setTimer: deps?.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
  })

  const store: GameStore = {
    defs,
    getState: () => state,
    getSpeed: () => speed,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispatch(cmd) {
      if (isUndoable(cmd)) return store.dispatchGroup([cmd], labelFor(state, defs, cmd))
      const { state: next, result } = applyCommand(state, defs, cmd)
      if (result.ok) {
        state = next
        debugLog('[store]', `dispatch ${cmd.type} -> ok`)
        throttle.flush()
      } else {
        debugLog('[store]', `dispatch ${cmd.type} -> rejected ${result.reason}`)
      }
      return result
    },
    dispatchGroup(cmds, label) {
      const out = applyGroup(state, defs, cmds)
      if (!out.ok) {
        debugLog('[store]', `dispatch ${label} (${cmds.length}) -> rejected ${out.reason}`)
        return { ok: false, reason: out.reason, event: out.event }
      }
      state = out.state
      if (out.inverse.length > 0) undoStack = pushUndo(undoStack, { label, inverse: out.inverse })
      debugLog('[store]', `dispatch ${label} (${cmds.length}) -> ok, undo depth ${undoStack.length}`)
      throttle.flush()
      return { ok: true }
    },
    undo() {
      const out = undoLast(state, defs, undoStack)
      undoStack = out.stack
      if (out.ok) state = out.state
      debugLog('[store]', out.ok ? `undo ${out.label} -> ok` : `undo ${out.label} -> rejected ${out.reason}`)
      throttle.flush()
      return out.ok ? { ok: true, label: out.label } : { ok: false, reason: out.reason, label: out.label }
    },
    setSpeed(next) {
      if (next === speed) return
      speed = next
      if (next !== 0) resumeSpeed = next
      debugLog('[store]', `speed ${next}x`)
      throttle.flush()
    },
    togglePause() {
      store.setSpeed(speed === 0 ? resumeSpeed : 0)
    },
    replaceState(next, nextSpeed) {
      state = next
      undoStack = []
      spoils = []
      speed = nextSpeed
      if (nextSpeed !== 0) resumeSpeed = nextSpeed
      debugLog('[store]', `state replaced (day ${next.day}, tick ${next.tick}), speed ${nextSpeed}x`)
      throttle.flush()
    },
    advance(n) {
      if (n <= 0) return
      state = runTicks(state, defs, n, (events) => {
        for (const e of events) if (e.type === 'spoiled' && spoils.length < MAX_PENDING_SPOILS) spoils.push({ x: e.x, y: e.y })
      })
      throttle.fire()
    },
    takeSpoils() {
      const out = spoils
      spoils = []
      return out
    },
  }
  return store
}

/** Fresh game with the named layout's commands applied and service open; unknown names are ignored. */
export function newGameState(defs: Defs, layout: string | null, seed = 'kitchen-line'): GameState {
  const state = createGame(defs, seed)
  if (layout === null) return state
  const commands = LAYOUTS[layout]
  if (commands === undefined) {
    debugLog('[store]', `unknown layout ${layout}`)
    return state
  }
  const out = applyLayout(state, defs, commands, LAYOUT_SETUP[layout])
  for (const why of out.rejected) debugLog('[store]', `layout ${layout}: ${why}`)
  // Time only passes in service, so a dev layout opens service right after it is built
  // (nothing warms up: the layout was placed in the build phase).
  return applyCommand(out.state, defs, { type: 'openService' }).state
}

/**
 * Dev-only shortcut (`?cheat=<name>`, honoured under `import.meta.env.DEV` only) to reach goal
 * states without playing for days: `progress` (goals part way), `goals` (all stall goals done,
 * $1,000), `restaurant` (upgraded, $1,000), `won` (the end screen). Unknown names are ignored.
 */
export function applyCheat(defs: Defs, state: GameState, name: string): GameState {
  const next = structuredClone(state)
  const ids = (tier: 'stall' | 'restaurant'): string[] => (defs.goals ?? []).filter((g) => g.tier === tier).map((g) => g.id)
  switch (name) {
    case 'progress':
      next.totals = { served: 63, profit: 12500, days: 3 }
      next.money = 40000
      updateGoals(next, defs)
      return next
    case 'goals':
      next.goalsDone = ids('stall')
      next.totals = { served: 120, profit: 31000, days: 5 }
      next.money = 100000
      return next
    case 'restaurant':
      next.goalsDone = ids('stall')
      next.tier = 'restaurant'
      next.totals = { served: 120, profit: 31000, days: 5 }
      next.money = 100000
      return next
    case 'won':
      next.goalsDone = [...ids('stall'), ...ids('restaurant')]
      next.tier = 'restaurant'
      next.totals = { served: 640, profit: 98000, days: 12 }
      next.money = 100000
      next.won = true
      next.phase = 'won'
      return next
    default:
      debugLog('[store]', `unknown cheat ${name}`)
      return state
  }
}

export function useSnapshot(store: GameStore): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
