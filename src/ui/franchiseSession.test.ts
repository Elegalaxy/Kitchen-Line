// Tests for the franchise glue (GAME_DESIGN 8.2): the meta key, franchiseOut and new game in a session,
// with fake storage. The meta is written before the new run replaces the state; a dev session writes nothing.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { META_CORRUPT_KEY, META_KEY, serializeMeta } from '../persist/meta.ts'
import { SAVE_KEY, serializeSave } from '../persist/save.ts'
import { emptyMeta, franchisePoints } from '../sim/franchise.ts'
import { stateHash } from '../sim/hash.ts'
import type { MetaState } from '../sim/types.ts'
import { readMeta, sanitizeMeta, writeMeta } from './metaPersistence.ts'
import type { StorageLike } from './persistence.ts'
import { createSession } from './session.ts'
import { applyCheat, newGameState } from './store.ts'

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

const NOW = '2026-11-24T00:00:00.000Z'
const noPage = (): (() => void) => () => undefined

/** A chain-won state, as the dev cheat builds it. */
function wonState() {
  return applyCheat(DEFS, newGameState(DEFS, 'friesSaladLine'), 'chainwon')
}

function wonSession(storage: StorageLike) {
  const raw = serializeSave(wonState(), NOW)
  storage.setItem(SAVE_KEY, raw)
  return createSession(DEFS, { storage, dev: null, now: () => NOW, attachPage: noPage })
}

describe('metaPersistence', () => {
  it('round-trips and treats no storage or no key as an empty meta', () => {
    const storage = fakeStorage()
    expect(readMeta(storage, DEFS)).toEqual({ meta: emptyMeta(), notice: null })
    expect(readMeta(null, DEFS).meta).toEqual(emptyMeta())
    const meta: MetaState = { ...emptyMeta(), runsCompleted: 1, points: 7, perks: { seedMoney: 1 }, recipeBook: ['fries'] }
    expect(writeMeta(storage, meta, NOW)).toBe(true)
    expect(readMeta(storage, DEFS).meta).toEqual(meta)
    expect(writeMeta(null, meta, NOW)).toBe(false)
  })

  it('keeps a corrupt file under the .corrupt key and falls back to an empty meta', () => {
    const storage = fakeStorage({ [META_KEY]: '{"version":1,"sav' })
    const out = readMeta(storage, DEFS)
    expect(out.meta).toEqual(emptyMeta())
    expect(out.notice).not.toBeNull()
    expect(storage.data.get(META_CORRUPT_KEY)).toBe('{"version":1,"sav')
  })

  it('drops unknown dish and perk ids', () => {
    const meta: MetaState = { ...emptyMeta(), perks: { seedMoney: 2, ghost: 1 }, recipeBook: ['fries', 'moonpie'] }
    const clean = sanitizeMeta(meta, DEFS)
    expect(clean.perks).toEqual({ seedMoney: 2 })
    expect(clean.recipeBook).toEqual(['fries'])
    const storage = fakeStorage({ [META_KEY]: serializeMeta(meta, NOW) })
    expect(readMeta(storage, DEFS).meta.recipeBook).toEqual(['fries'])
  })
})

describe('session franchiseOut', () => {
  it('writes both keys and gives run 2 day 1 with the perks and the recipe book', () => {
    const storage = fakeStorage()
    const session = wonSession(storage)
    const state = session.store.getState()
    expect(state.chainWon).toBe(true)
    const fp = franchisePoints(state).total
    expect(fp).toBeGreaterThanOrEqual(6)
    const out = session.franchiseOut(['seedMoney'])
    expect(out).toEqual({ ok: true })
    expect(session.meta.runsCompleted).toBe(1)
    expect(session.meta.points).toBe(fp - 6)
    expect(session.meta.perks).toEqual({ seedMoney: 1 })
    const run2 = session.store.getState()
    expect(run2.seed).toBe('kitchen-line-run2')
    expect(run2.day).toBe(1)
    expect(run2.chainWon).not.toBe(true)
    expect(run2.money).toBe(15000 + 25000)
    expect(session.meta.recipeBook.length).toBeGreaterThan(0)
    for (const id of session.meta.recipeBook) expect(run2.unlocked).toContain(id)
    expect(storage.data.has(META_KEY)).toBe(true)
    expect(readMeta(storage, DEFS).meta).toEqual(session.meta)
    expect(storage.data.get(SAVE_KEY)).toContain('kitchen-line-run2')
  })

  it('refuses a second franchise of the same seed', () => {
    const storage = fakeStorage()
    const session = wonSession(storage)
    const won = session.store.getState()
    expect(session.franchiseOut([]).ok).toBe(true)
    const points = session.meta.points
    session.store.replaceState(won, 0) // a reloaded tab with the old save
    const again = session.franchiseOut([])
    expect(again.ok).toBe(false)
    expect(session.meta.points).toBe(points)
    expect(session.meta.runsCompleted).toBe(1)
  })

  it('refuses when the chain is not built or a perk is not affordable, and writes nothing', () => {
    const storage = fakeStorage()
    const fresh = createSession(DEFS, { storage, dev: null, now: () => NOW, attachPage: noPage })
    expect(fresh.franchiseOut([]).ok).toBe(false)
    const session = wonSession(fakeStorage())
    const before = stateHash(session.store.getState())
    expect(session.franchiseOut(['seedMoney', 'seedMoney', 'seedMoney', 'seedMoney']).ok).toBe(false)
    expect(session.franchiseOut(['nope']).ok).toBe(false)
    expect(session.meta).toEqual(emptyMeta())
    expect(stateHash(session.store.getState())).toBe(before)
  })

  it('newGame keeps the perks and restarts the current run number', () => {
    const storage = fakeStorage()
    const session = wonSession(storage)
    session.franchiseOut(['seedMoney'])
    session.store.dispatch({ type: 'openService' })
    session.newGame()
    const s = session.store.getState()
    expect(s.seed).toBe('kitchen-line-run2')
    expect(s.money).toBe(40000)
    expect(session.meta.perks).toEqual({ seedMoney: 1 })
  })

  it('a first-run new game is the plain game', () => {
    const session = createSession(DEFS, { storage: fakeStorage(), dev: null, now: () => NOW, attachPage: noPage })
    session.newGame()
    expect(stateHash(session.store.getState())).toBe(stateHash(newGameState(DEFS, null)))
  })

  it('a dev session franchises in memory and writes nothing', () => {
    const storage = fakeStorage()
    const session = createSession(DEFS, { storage, dev: { layout: 'friesSaladLine', cheat: 'chainwon' }, now: () => NOW, attachPage: noPage })
    expect(session.ephemeral).toBe(true)
    expect(session.franchiseOut([]).ok).toBe(true)
    expect(session.meta.runsCompleted).toBe(1)
    expect(session.store.getState().seed).toBe('kitchen-line-run2')
    expect(storage.data.size).toBe(0)
  })
})

describe('session franchiseOut with the blueprint library', () => {
  it('saves the run kitchen into the chosen slot, buys the perk and starts the next run with it', () => {
    const storage = fakeStorage()
    const session = wonSession(storage)
    const out = session.franchiseOut(['starterKit'], { saveSlot: 2, useSlot: 2 })
    expect(out).toEqual({ ok: true })
    expect(session.meta.library?.map((e) => e?.run ?? null)).toEqual([null, null, 1])
    expect(session.meta.activeKit).toBe(2)
    expect(session.meta.perks.starterKit).toBe(1)
    expect(Object.keys(session.store.getState().buildings).length).toBeGreaterThan(2)
    const stored = readMeta(storage, DEFS).meta
    expect(stored.library?.[2]?.run).toBe(1)
  })

  it('without a save slot nothing is saved and the starter kitchen cannot be bought', () => {
    const session = wonSession(fakeStorage())
    const out = session.franchiseOut(['starterKit'])
    expect(out.ok).toBe(false)
    expect(session.meta.runsCompleted).toBe(0)
    expect(session.franchiseOut([], { saveSlot: null }).ok).toBe(true)
    expect(session.meta.library).toBeUndefined()
  })

  it('refuses a bad slot or a choice of an empty slot without writing anything', () => {
    const storage = fakeStorage()
    const session = wonSession(storage)
    expect(session.franchiseOut([], { saveSlot: 7 }).ok).toBe(false)
    expect(session.franchiseOut([], { saveSlot: null, useSlot: 1 }).ok).toBe(false)
    expect(storage.data.has(META_KEY)).toBe(false)
    expect(session.meta.runsCompleted).toBe(0)
  })
})
