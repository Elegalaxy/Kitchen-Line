// Tests for the save glue and the session (plan Step 17): storage access that can fail, ids checked
// against the real content, the corrupt-copy rule, debounced autosave, and the session start rules
// (resume paused, dev params never touch the save, a bad save blocks saving until "new game").

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFS } from '../content/index.ts'
import { CORRUPT_KEY, SAVE_KEY, serializeSave } from '../persist/save.ts'
import { stateHash } from '../sim/hash.ts'
import { runTicks } from '../sim/tick.ts'
import type { GameState } from '../sim/types.ts'
import { AUTOSAVE_DEBOUNCE_MS, checkAgainstDefs, createAutosaver, readSavedGame, writeSavedGame } from './persistence.ts'
import type { StorageLike } from './persistence.ts'
import { createSession } from './session.ts'
import { createStore, newGameState } from './store.ts'

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('full')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

/** A real content layout a few hundred ticks into service. */
function busy(): GameState {
  return runTicks(newGameState(DEFS, 'friesLine'), DEFS, 600)
}

afterEach(() => vi.restoreAllMocks())

describe('readSavedGame / writeSavedGame', () => {
  it('round-trips a real mid-service state with the same hash', () => {
    const storage = fakeStorage()
    const s = busy()
    expect(writeSavedGame(storage, s, '2026-11-20T00:00:00.000Z')).toBe(true)
    const out = readSavedGame(storage, DEFS)
    expect(out.kind).toBe('loaded')
    if (out.kind === 'loaded') expect(stateHash(out.state)).toBe(stateHash(s))
  })

  it('reports nothing stored, and unavailable or throwing storage, as no save', () => {
    expect(readSavedGame(fakeStorage(), DEFS)).toEqual({ kind: 'none' })
    expect(readSavedGame(null, DEFS)).toEqual({ kind: 'none' })
    expect(readSavedGame(throwing, DEFS)).toEqual({ kind: 'none' })
    expect(writeSavedGame(throwing, busy(), 'x')).toBe(false)
    expect(writeSavedGame(null, busy(), 'x')).toBe(false)
  })

  it('keeps a damaged save under the .corrupt key and logs console.error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const raw = serializeSave(busy(), 'x').slice(0, 200)
    const storage = fakeStorage({ [SAVE_KEY]: raw })
    const out = readSavedGame(storage, DEFS)
    expect(out.kind).toBe('error')
    expect(storage.data.get(CORRUPT_KEY)).toBe(raw)
    expect(err).toHaveBeenCalledTimes(1)
  })

  it('rejects a save that names an unknown item, dish, goal or expansion', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = busy()
    const edits: ((x: GameState) => void)[] = [
      (x) => {
        const p = Object.values(x.buildings).find((b) => b.kind === 'pantry')
        if (p?.kind === 'pantry') p.ingredient = 'caviar'
      },
      (x) => void x.menu.push({ dish: 'ghostDish', price: 100 }),
      (x) => void x.goalsDone.push('ghost-goal'),
      (x) => {
        x.expansion = 99
      },
    ]
    for (const edit of edits) {
      const copy = structuredClone(s)
      edit(copy)
      expect(checkAgainstDefs(copy, DEFS)).not.toBeNull()
      const out = readSavedGame(fakeStorage({ [SAVE_KEY]: serializeSave(copy, 'x') }), DEFS)
      expect(out.kind).toBe('error')
    }
    expect(checkAgainstDefs(s, DEFS)).toBeNull()
  })
})

describe('createAutosaver', () => {
  function clock() {
    const timers: { fn: () => void; id: number }[] = []
    let next = 1
    return {
      setTimer: (fn: () => void) => {
        timers.push({ fn, id: next })
        return next++
      },
      clearTimer: (h: unknown) => {
        const i = timers.findIndex((t) => t.id === h)
        if (i >= 0) timers.splice(i, 1)
      },
      pending: () => timers.length,
      fire: () => timers.splice(0).forEach((t) => t.fn()),
    }
  }

  it('debounces build-phase commands into one save, and saves at once on a phase change', () => {
    const storage = fakeStorage()
    const c = clock()
    const store = createStore(DEFS, newGameState(DEFS, null))
    const saver = createAutosaver(store, { storage, now: () => 'now', setTimer: c.setTimer, clearTimer: c.clearTimer })
    expect(AUTOSAVE_DEBOUNCE_MS).toBe(1000)
    store.dispatch({ type: 'place', kind: 'belt', x: 1, y: 2, dir: 1 })
    store.dispatch({ type: 'place', kind: 'belt', x: 2, y: 2, dir: 1 })
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    expect(c.pending()).toBe(1)
    c.fire()
    expect(storage.data.has(SAVE_KEY)).toBe(true)
    storage.data.clear()
    store.dispatch({ type: 'openService' })
    expect(storage.data.has(SAVE_KEY)).toBe(true)
    expect(c.pending()).toBe(0)
    saver.dispose()
  })

  it('saves at day end and not on ordinary service ticks', () => {
    const storage = fakeStorage()
    const c = clock()
    const store = createStore(DEFS, newGameState(DEFS, null))
    store.dispatch({ type: 'openService' })
    const saver = createAutosaver(store, { storage, now: () => 'now', setTimer: c.setTimer, clearTimer: c.clearTimer })
    store.advance(100)
    store.replaceState(store.getState(), 1) // publishes: a plain mid-service state change
    expect(storage.data.has(SAVE_KEY)).toBe(false)
    store.advance(2400)
    store.replaceState(store.getState(), 1) // publishes the day-end state
    expect(store.getState().phase).toBe('summary')
    expect(storage.data.has(SAVE_KEY)).toBe(true)
    saver.dispose()
  })
})

describe('createSession', () => {
  const noPage = (): (() => void) => () => {}

  it('resumes a stored game paused at the same tick and phase', () => {
    const s = busy()
    const storage = fakeStorage({ [SAVE_KEY]: serializeSave(s, 'x') })
    const session = createSession(DEFS, { storage, dev: null, attachPage: noPage })
    expect(session.notice).toBeNull()
    expect(session.store.getSpeed()).toBe(0)
    expect(session.store.getState().tick).toBe(s.tick)
    expect(session.store.getState().phase).toBe('service')
    expect(stateHash(session.store.getState())).toBe(stateHash(s))
    session.store.togglePause()
    expect(session.store.getSpeed()).toBe(1)
  })

  it('starts fresh with no save', () => {
    const session = createSession(DEFS, { storage: fakeStorage(), dev: null, attachPage: noPage })
    expect(session.notice).toBeNull()
    expect(session.store.getState().tick).toBe(0)
  })

  it('dev params neither load nor overwrite the real save', () => {
    const real = serializeSave(busy(), 'x')
    const storage = fakeStorage({ [SAVE_KEY]: real })
    const session = createSession(DEFS, { storage, dev: { layout: 'friesLine', cheat: null }, attachPage: noPage })
    expect(session.ephemeral).toBe(true)
    expect(session.store.getState().phase).toBe('service')
    session.store.advance(5)
    session.store.replaceState(session.store.getState(), 1)
    expect(storage.data.get(SAVE_KEY)).toBe(real)
  })

  it('a damaged save gives a notice, keeps the copy, saves nothing until new game', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage = fakeStorage({ [SAVE_KEY]: '{"version":1' })
    const session = createSession(DEFS, { storage, dev: null, attachPage: noPage })
    expect(session.notice).not.toBeNull()
    expect(storage.data.get(CORRUPT_KEY)).toBe('{"version":1')
    expect(storage.data.get(SAVE_KEY)).toBe('{"version":1')
    session.newGame()
    expect(session.notice).toBeNull()
    expect(storage.data.get(CORRUPT_KEY)).toBe('{"version":1')
    expect(JSON.parse(storage.data.get(SAVE_KEY) ?? '{}')).toMatchObject({ version: 1 })
    expect(session.store.getState().tick).toBe(0)
  })

  it('new game replaces a running game and overwrites the save', () => {
    const storage = fakeStorage({ [SAVE_KEY]: serializeSave(busy(), 'x') })
    const session = createSession(DEFS, { storage, dev: null, attachPage: noPage })
    session.newGame()
    expect(session.store.getState()).toMatchObject({ tick: 0, phase: 'build', day: 1 })
    expect(stateHash(session.store.getState())).toBe(stateHash(newGameState(DEFS, null)))
    expect(readSavedGame(storage, DEFS)).toMatchObject({ kind: 'loaded' })
  })
})
