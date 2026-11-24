// The app's game session (plan Step 17): the store plus its save handling.
// - Normal start: load the stored save if there is one and resume PAUSED at the same tick and
//   phase; otherwise a fresh game. A save that fails to load is kept under the .corrupt key and
//   `notice` carries the reason; nothing is autosaved until the player picks "Start new game".
// - Dev params (`?layout=` / `?cheat=`, dev builds only): the session is throwaway. The stored
//   save is neither loaded nor overwritten, so a dev URL can never destroy real progress.
// - Autosave and the page-hide saves run only when the session is allowed to save.

import { DEFS } from '../content/index.ts'
import { buyPerk, canFranchise, createRun, emptyMeta, recordFranchise } from '../sim/franchise.ts'
import type { Defs, MetaState } from '../sim/types.ts'
import { applyCheat, createStore, newGameState } from './store.ts'
import type { GameStore } from './store.ts'
import { debugLog } from './debug.ts'
import { clearSavedGame, createAutosaver, getBrowserStorage, readSavedGame, writeSavedGame } from './persistence.ts'
import type { Autosaver, StorageLike } from './persistence.ts'
import { readMeta, writeMeta } from './metaPersistence.ts'

export type GameSession = {
  store: GameStore
  /** Why the stored save could not be loaded, or null. The player must start a new game to go on. */
  notice: string | null
  /** True when saving is switched off for this session (dev params). */
  ephemeral: boolean
  /** Franchise progress (GAME_DESIGN 8.2). Empty until the first franchise-out. */
  readonly meta: MetaState
  /** Why the stored franchise progress could not be loaded (it was kept under the .corrupt key), or null. */
  readonly metaNotice: string | null
  /**
   * Replace the game with a fresh run of the current number (perks and recipe book kept) and
   * overwrite the save. Also clears `notice`.
   */
  newGame(): void
  /**
   * Sell the chain: book the points, buy `perkIds` (one id per level, in order), write the meta FIRST,
   * then start run N+1 and write the save. Refused (nothing changes, nothing is written) when the chain
   * is not built, the run is already franchised, or a perk cannot be bought.
   */
  franchiseOut(perkIds: string[]): { ok: true } | { ok: false; reason: string }
}

export type SessionOptions = {
  storage: StorageLike | null
  /** Dev-only start (`?layout=` / `?cheat=`); when set the session neither loads nor saves. */
  dev: { layout: string | null; cheat: string | null } | null
  now?: () => string
  /** Installs page-hide handlers; returns a remover. Defaults to window events. */
  attachPage?: (saveNow: () => void) => () => void
}

/** Save when the page is hidden or going away (tab switch, close, mobile app switch). */
export function attachPageSaves(saveNow: () => void): () => void {
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') saveNow()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', saveNow)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', saveNow)
  }
}

export function createSession(defs: Defs, options: SessionOptions): GameSession {
  const now = options.now ?? ((): string => new Date().toISOString())
  const { storage, dev } = options
  const ephemeral = dev !== null
  let notice: string | null = null
  let store: GameStore
  // A dev session keeps its meta in memory only: it is never read from or written to storage.
  const metaRead = ephemeral ? { meta: emptyMeta(), notice: null } : readMeta(storage, defs)
  let meta = metaRead.meta

  if (dev !== null) {
    const start = newGameState(defs, dev.layout)
    store = createStore(defs, dev.cheat === null ? start : applyCheat(defs, start, dev.cheat))
    debugLog('[save]', 'dev params present: not loading or saving')
  } else {
    const outcome = readSavedGame(storage, defs)
    if (outcome.kind === 'loaded') {
      store = createStore(defs, outcome.state)
      store.setSpeed(0) // resume paused
    } else {
      store = createStore(defs, newGameState(defs, null))
      if (outcome.kind === 'error') notice = outcome.reason
    }
  }

  let saver: Autosaver | null = null
  const startSaving = (): void => {
    if (saver !== null || ephemeral) return
    saver = createAutosaver(store, {
      storage,
      now,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    })
    const attach = options.attachPage ?? attachPageSaves
    attach(() => {
      if (notice === null) saver?.saveNow()
    })
  }
  if (notice === null) startSaving()

  const session: GameSession = {
    store,
    get notice() {
      return notice
    },
    ephemeral,
    get meta() {
      return meta
    },
    metaNotice: metaRead.notice,
    newGame() {
      notice = null
      clearSavedGame(storage)
      store.replaceState(createRun(defs, undefined, meta), 1)
      startSaving()
      if (!ephemeral) writeSavedGame(storage, store.getState(), now())
      debugLog('[save]', `new game started (run ${meta.runsCompleted + 1})`)
    },
    franchiseOut(perkIds) {
      const state = store.getState()
      if (!canFranchise(state)) return { ok: false, reason: 'The chain is not built yet.' }
      const booked = recordFranchise(meta, state, defs)
      if (!booked.ok) return { ok: false, reason: booked.reason }
      let next = booked.meta
      for (const id of perkIds) {
        const bought = buyPerk(next, defs, id)
        if (!bought.ok) return { ok: false, reason: bought.reason }
        next = bought.meta
      }
      if (!ephemeral && storage !== null && !writeMeta(storage, next, now())) {
        return { ok: false, reason: 'The franchise progress could not be saved, so the chain was kept.' }
      }
      meta = next
      notice = null
      store.replaceState(createRun(defs, undefined, meta), 1)
      startSaving()
      if (!ephemeral) writeSavedGame(storage, store.getState(), now())
      debugLog('[save]', `franchised out: now run ${meta.runsCompleted + 1}, points ${meta.points}`)
      return { ok: true }
    },
  }
  return session
}

let singleton: GameSession | null = null

/** The app's session. `?layout=<name>` and `?cheat=<name>` are honoured in dev builds only. */
export function getGameSession(): GameSession {
  if (singleton === null) {
    const params = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
    const layout = params?.get('layout') ?? null
    const cheat = params?.get('cheat') ?? null
    singleton = createSession(DEFS, {
      storage: getBrowserStorage(),
      dev: layout === null && cheat === null ? null : { layout, cheat },
    })
  }
  return singleton
}
