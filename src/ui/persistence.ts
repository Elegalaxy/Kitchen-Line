// Save glue for the UI (plan Step 17): everything that touches localStorage or the page lifecycle.
// The format and its validation live in src/persist/save.ts (pure). Here:
// - `checkAgainstDefs`: the part of validation persist cannot do (ids against the content defs).
// - `readSavedGame` / `writeSavedGame` / `clearSavedGame`: storage access, every call wrapped in
//   try/catch because storage can be missing, full or blocked. A failure never reaches the game.
// - `createAutosaver`: saves on every phase change (service opened, day ended, summary dismissed),
//   a second after the last build-phase change, and on demand (page hidden or closing).
//   Mid-service ticks do not trigger a save by themselves; a placement made during service waits
//   for the next phase change or the page being hidden.

import { CORRUPT_KEY, loadSave, SAVE_KEY, serializeSave } from '../persist/save.ts'
import type { Defs, GameState } from '../sim/types.ts'
import { debugLog } from './debug.ts'
import type { GameStore } from './store.ts'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type LoadOutcome =
  | { kind: 'none' }
  | { kind: 'loaded'; state: GameState }
  | { kind: 'error'; reason: string }

export const AUTOSAVE_DEBOUNCE_MS = 1000

/** The browser's localStorage, or null when it is missing or blocked (reading the property can throw). */
export function getBrowserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function checkItem(it: { type: string } | null, defs: Defs, path: string): string | null {
  if (it !== null && defs.items[it.type] === undefined) return `${path}: unknown item "${it.type}"`
  return null
}

/** Reason the state mentions an id the content does not know, or null when every id is known. */
export function checkAgainstDefs(state: GameState, defs: Defs): string | null {
  const dish = (id: string, path: string): string | null => (defs.dishes[id] === undefined ? `${path}: unknown dish "${id}"` : null)
  const itemId = (id: string, path: string): string | null => (defs.items[id] === undefined ? `${path}: unknown item "${id}"` : null)
  const checks: (string | null)[] = []
  for (const b of Object.values(state.buildings)) {
    const p = `building ${b.id}`
    if (defs.buildings[b.kind] === undefined) checks.push(`${p}: unknown building "${b.kind}"`)
    switch (b.kind) {
      case 'belt':
        for (const s of b.slots) checks.push(checkItem(s, defs, p))
        break
      case 'pantry':
        checks.push(itemId(b.ingredient, p))
        break
      case 'splitter':
      case 'merger':
        checks.push(checkItem(b.buf, defs, p))
        break
      case 'filter':
        if (b.filterItem !== null) checks.push(itemId(b.filterItem, p))
        checks.push(checkItem(b.buf, defs, p))
        break
      case 'chopper':
      case 'fryer':
      case 'stove':
        for (const it of b.input) checks.push(checkItem(it, defs, p))
        checks.push(checkItem(b.output, defs, p))
        break
      case 'assembler':
        if (b.recipe !== null) checks.push(dish(b.recipe, p))
        for (const [id, list] of Object.entries(b.inputs)) {
          checks.push(itemId(id, p))
          for (const it of list) checks.push(checkItem(it, defs, p))
        }
        checks.push(checkItem(b.output, defs, p))
        break
      case 'pass':
        for (const it of b.shelf) checks.push(checkItem(it, defs, p))
        break
      case 'bin':
        break
    }
  }
  for (const id of state.unlocked) checks.push(dish(id, 'unlocked'))
  for (const m of state.menu) checks.push(dish(m.dish, 'menu'))
  for (const c of state.waiting) {
    checks.push(dish(c.dish, `customer ${c.id}`))
    for (const pref of c.prefs) checks.push(dish(pref, `customer ${c.id}`))
  }
  for (const stats of [state.today, state.lastDay, state.prevDay]) {
    if (stats === null) continue
    for (const id of Object.keys(stats.byDish)) checks.push(dish(id, 'day stats'))
    for (const id of Object.keys(stats.spoiledByItem)) checks.push(itemId(id, 'day stats'))
    for (const r of stats.reviews) if (r.dish !== null) checks.push(dish(r.dish, 'review'))
  }
  if (defs.goals !== undefined) {
    const known = new Set(defs.goals.map((g) => g.id))
    for (const id of state.goalsDone) if (!known.has(id)) checks.push(`goalsDone: unknown goal "${id}"`)
  }
  if (state.expansion > (defs.expansions?.length ?? 0)) checks.push(`expansion ${state.expansion} is more than the game has`)
  return checks.find((c) => c !== null) ?? null
}

/** Read and fully validate the stored save. On an error the raw text is kept under the .corrupt key. */
export function readSavedGame(storage: StorageLike | null, defs: Defs): LoadOutcome {
  if (storage === null) return { kind: 'none' }
  let raw: string | null
  try {
    raw = storage.getItem(SAVE_KEY)
  } catch (e) {
    debugLog('[save]', `error storage unreadable: ${String(e)}`)
    return { kind: 'none' }
  }
  if (raw === null) return { kind: 'none' }
  const result = loadSave(raw)
  const reason = result.ok ? checkAgainstDefs(result.state, defs) : result.reason
  if (result.ok && reason === null) {
    debugLog('[save]', `loaded day=${result.state.day}`)
    return { kind: 'loaded', state: result.state }
  }
  const why = reason ?? 'unknown problem'
  debugLog('[save]', `error ${why}`)
  console.error(`[save] could not load the saved game: ${why}`)
  try {
    storage.setItem(CORRUPT_KEY, raw)
  } catch {
    // Keeping the copy is best effort.
  }
  return { kind: 'error', reason: why }
}

/** Store the state. Returns false (and logs) when storage is missing or refuses the write. */
export function writeSavedGame(storage: StorageLike | null, state: GameState, savedAt: string): boolean {
  if (storage === null) return false
  try {
    const raw = serializeSave(state, savedAt)
    storage.setItem(SAVE_KEY, raw)
    debugLog('[save]', `saved bytes=${new TextEncoder().encode(raw).length} day=${state.day}`)
    return true
  } catch (e) {
    debugLog('[save]', `error write failed: ${String(e)}`)
    return false
  }
}

export function clearSavedGame(storage: StorageLike | null): void {
  try {
    storage?.removeItem(SAVE_KEY)
  } catch {
    // Nothing to do: the next save overwrites it.
  }
}

export type AutosaverDeps = {
  storage: StorageLike | null
  now: () => string
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
}

export type Autosaver = {
  /** Save the store's current state now and cancel a pending debounced save. */
  saveNow(): void
  /** Stop listening to the store and drop a pending save. */
  dispose(): void
}

export function createAutosaver(store: GameStore, deps: AutosaverDeps): Autosaver {
  let lastState = store.getState()
  let lastPhase = lastState.phase
  let timer: unknown = null
  const cancel = (): void => {
    if (timer !== null) deps.clearTimer(timer)
    timer = null
  }
  const saveNow = (): void => {
    cancel()
    writeSavedGame(deps.storage, store.getState(), deps.now())
  }
  const unsubscribe = store.subscribe(() => {
    const s = store.getState()
    if (s.phase !== lastPhase) {
      lastPhase = s.phase
      lastState = s
      saveNow()
      return
    }
    if (s === lastState) return
    lastState = s
    if (s.phase === 'build') {
      cancel()
      timer = deps.setTimer(saveNow, AUTOSAVE_DEBOUNCE_MS)
    }
  })
  return {
    saveNow,
    dispose() {
      cancel()
      unsubscribe()
    },
  }
}
