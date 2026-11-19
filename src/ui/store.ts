// Game store (plan Step 4): holds the live GameState and Defs for the UI.
// - The canvas reads `getState()` every animation frame (no React involved).
// - React reads `getSnapshot()` through useSyncExternalStore. The snapshot object is only
//   replaced when subscribers are notified, which is throttled to 5 times a second for
//   tick updates; commands and speed changes publish immediately.
// - `state.events` only holds the last tick's events after `advance(n)`; nothing here
//   relies on event history.

import { useSyncExternalStore } from 'react'
import { DEFS } from '../content/index.ts'
import { LAYOUTS } from '../content/layouts.ts'
import { applyCommand } from '../sim/commands.ts'
import { createGame } from '../sim/game.ts'
import { runTicks } from '../sim/tick.ts'
import type { Command, CommandResult, Defs, GameState } from '../sim/types.ts'
import { debugLog } from './debug.ts'

export type Speed = 0 | 1 | 2 | 4
export const SPEEDS: readonly Speed[] = [0, 1, 2, 4]
export const NOTIFY_INTERVAL_MS = 200 // 5 notifications a second

export type Snapshot = { state: GameState; speed: Speed }

export type GameStore = {
  defs: Defs
  getState(): GameState
  getSpeed(): Speed
  /** Referentially stable between notifications (for useSyncExternalStore). */
  getSnapshot(): Snapshot
  subscribe(listener: () => void): () => void
  dispatch(cmd: Command): CommandResult
  setSpeed(speed: Speed): void
  /** Pause, or resume at the last non-zero speed (1x if none). */
  togglePause(): void
  /** Run `n` ticks (called by the loop). */
  advance(n: number): void
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
  let snapshot: Snapshot = { state, speed }
  const listeners = new Set<() => void>()
  const publish = (): void => {
    snapshot = { state, speed }
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
    advance(n) {
      if (n <= 0) return
      state = runTicks(state, defs, n)
      throttle.fire()
    },
  }
  return store
}

/** Fresh game with the named layout's commands applied; unknown names are ignored. */
export function newGameState(defs: Defs, layout: string | null, seed = 'kitchen-line'): GameState {
  let state = createGame(defs, seed)
  if (layout === null) return state
  const commands = LAYOUTS[layout]
  if (commands === undefined) {
    debugLog('[store]', `unknown layout ${layout}`)
    return state
  }
  for (const cmd of commands) {
    const out = applyCommand(state, defs, cmd)
    if (out.result.ok) state = out.state
    else debugLog('[store]', `layout ${layout}: ${cmd.type} -> rejected ${out.result.reason}`)
  }
  return state
}

let singleton: GameStore | null = null

/** The app's store. `?layout=<name>` is honoured in dev builds only. */
export function getGameStore(): GameStore {
  if (singleton === null) {
    const layout = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('layout') : null
    singleton = createStore(DEFS, newGameState(DEFS, layout))
  }
  return singleton
}

export function useSnapshot(store: GameStore): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
