// Ephemeral UI state (plan Step 5): the active tool, ghost rotation, tile cursor, an
// in-progress belt drag, the selected building and the toast. A tiny external store like
// the game store: the canvas reads `get()` every frame, React panels subscribe through
// `useUi`. `setCursor` ignores moves inside the same tile, so hovering does not re-render.

import { useSyncExternalStore } from 'react'
import type { BuildingKind, Dir } from '../sim/types.ts'
import type { Point } from '../sim/grid.ts'
import type { SideTab } from './sideTabs.ts'

/** A building kind to place, 'remove' (sell mode) or null (select mode). */
export type Tool = BuildingKind | 'remove' | null
export type Toast = { id: number; text: string; tone: 'bad' | 'info' }

export type UiState = {
  tool: Tool
  /** Facing of the ghost (R rotates it). */
  dir: Dir
  cursor: Point | null
  /** True when the cursor was moved by the keyboard (it is drawn even without a tool). */
  cursorFromKeys: boolean
  drag: { from: Point } | null
  selectedId: number | null
  toast: Toast | null
  /** The belt tool places fast belts (the "Fast belt" palette entry); only read with tool 'belt'. */
  fast: boolean
  /** The player hid the tutorial hint tiles on the grid (per session; not saved). */
  hintsHidden: boolean
  /** Which side-panel tab is showing. The guide switches this when it says to open the menu. */
  tab: SideTab
  /** The getting-started guide has finished (also stored on this machine; a new game clears it). */
  guideDone: boolean
}

export const TOAST_MS = 3200

export type UiStore = {
  get(): UiState
  subscribe(listener: () => void): () => void
  set(patch: Partial<UiState>): void
  setCursor(cursor: Point | null, fromKeys: boolean): void
  showToast(text: string, tone?: Toast['tone']): void
  dismissToast(): void
}

export type UiDeps = { setTimer: (fn: () => void, ms: number) => unknown }

export function createUiStore(deps?: Partial<UiDeps>): UiStore {
  let state: UiState = {
    tool: null,
    dir: 1,
    cursor: null,
    cursorFromKeys: false,
    drag: null,
    selectedId: null,
    toast: null,
    fast: false,
    hintsHidden: false,
    tab: 'build',
    guideDone: false,
  }
  let toastId = 0
  const listeners = new Set<() => void>()
  const setTimer = deps?.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const commit = (next: UiState): void => {
    state = next
    for (const l of [...listeners]) l()
  }
  const store: UiStore = {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(patch) {
      const keys = Object.keys(patch) as (keyof UiState)[]
      if (keys.every((k) => Object.is(state[k], patch[k]))) return
      commit({ ...state, ...patch })
    },
    setCursor(cursor, fromKeys) {
      const prev = state.cursor
      const same = prev === cursor || (prev !== null && cursor !== null && prev.x === cursor.x && prev.y === cursor.y)
      if (same && state.cursorFromKeys === fromKeys) return
      commit({ ...state, cursor, cursorFromKeys: fromKeys })
    },
    showToast(text, tone = 'bad') {
      toastId += 1
      const id = toastId
      commit({ ...state, toast: { id, text, tone } })
      setTimer(() => {
        if (state.toast?.id === id) store.dismissToast()
      }, TOAST_MS)
    },
    dismissToast() {
      if (state.toast !== null) commit({ ...state, toast: null })
    },
  }
  return store
}

export function useUi(store: UiStore): UiState {
  return useSyncExternalStore(store.subscribe, store.get)
}
