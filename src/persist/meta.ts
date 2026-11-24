// Meta save (GAME_DESIGN 8.2, franchise): the second save key, `{ version: 1, savedAt, meta }` as JSON text.
// Pure and I/O free like save.ts: no storage, no clock (the UI passes `savedAt`), no value imports. The UI
// reads and writes localStorage under `META_KEY` and keeps a bad file under `META_CORRUPT_KEY`, then
// carries on with an empty meta.
//
// `loadMeta` never trusts its input and never throws. Every field is required. Persist cannot see the
// content defs, so perk ids and dish ids are checked for shape only (the UI ignores ids it does not know);
// counts are bounded so a hostile file cannot make the loader do unbounded work. The helpers are small
// copies of the ones in save.ts on purpose (save.ts is not refactored for this); the optional saved kitchens
// (the blueprint library, and the legacy single `starterKit` of older files) reuse save.ts's blueprint check.

import type { MetaState } from '../sim/types.ts'
import { blueprint, Invalid } from './save.ts'

export const META_KEY = 'kitchen-line.meta.v1'
/** The raw text of a meta file that failed to load is kept here so it is not lost. */
export const META_CORRUPT_KEY = 'kitchen-line.meta.v1.corrupt'
export const META_VERSION = 1

export type MetaLoadResult = { ok: true; meta: MetaState } | { ok: false; reason: string }

/** Bounds for a hostile file; the real game keeps at most 100 history rows (FRANCHISE_HISTORY_MAX). */
const MAX_HISTORY = 100
const MAX_BOOK = 200
const MAX_PERKS = 64
const MAX_PERK_LEVEL = 99
const MAX_POINTS = 1_000_000
/** Same as LIBRARY_SLOTS in sim/constants.ts (persist imports no sim values). */
const MAX_LIBRARY = 3

type Obj = Record<string, unknown>

function bad(path: string, why: string): never {
  throw new Invalid(`${path}: ${why}`)
}

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) bad(path, 'expected an object')
  return v as Obj
}

function arr(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v)) bad(path, 'expected an array')
  if (v.length > max) bad(path, `too many entries (${v.length})`)
  return v
}

function int(v: unknown, path: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) bad(path, 'expected an integer')
  if (v < min || v > max) bad(path, `expected an integer from ${min} to ${max}`)
  return v
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 200) bad(path, 'expected a short non-empty string')
  return v
}

function history(v: unknown, path: string): void {
  arr(v, path, MAX_HISTORY).forEach((x, i) => {
    const p = `${path}[${i}]`
    const o = obj(x, p)
    int(o.run, `${p}.run`, 1)
    str(o.seed, `${p}.seed`)
    int(o.days, `${p}.days`)
    int(o.profit, `${p}.profit`, Number.MIN_SAFE_INTEGER)
    int(o.chainProfit, `${p}.chainProfit`, Number.MIN_SAFE_INTEGER)
    int(o.points, `${p}.points`, 0, MAX_POINTS)
  })
}

function validateMeta(v: unknown): MetaState {
  const m = obj(v, 'meta')
  int(m.runsCompleted, 'meta.runsCompleted')
  int(m.points, 'meta.points', 0, MAX_POINTS)
  const perks = obj(m.perks, 'meta.perks')
  const ids = Object.keys(perks)
  if (ids.length > MAX_PERKS) bad('meta.perks', `too many perks (${ids.length})`)
  for (const id of ids) {
    if (id === '__proto__') bad('meta.perks', 'bad perk id')
    int(perks[id], `meta.perks.${id}`, 0, MAX_PERK_LEVEL)
  }
  arr(m.recipeBook, 'meta.recipeBook', MAX_BOOK).forEach((x, i) => str(x, `meta.recipeBook[${i}]`))
  history(m.history, 'meta.history')
  // Optional, so older meta files load. The same grid checks as a branch's blueprint (bounded sizes).
  if (m.starterKit !== undefined) blueprint(m.starterKit, 'meta.starterKit')
  if (m.library !== undefined) {
    arr(m.library, 'meta.library', MAX_LIBRARY).forEach((x, i) => {
      if (x === null) return
      const p = `meta.library[${i}]`
      const e = obj(x, p)
      int(e.run, `${p}.run`, 1)
      blueprint(e.kit, `${p}.kit`)
    })
  }
  if (m.activeKit !== undefined && m.activeKit !== null) int(m.activeKit, 'meta.activeKit', 0, MAX_LIBRARY - 1)
  return m as unknown as MetaState
}

/** The JSON text to store. `savedAt` is an ISO timestamp supplied by the caller. */
export function serializeMeta(meta: MetaState, savedAt: string): string {
  return JSON.stringify({ version: META_VERSION, savedAt, meta })
}

/** Parse and validate saved text. Never throws; a failure carries a human-readable reason. */
export function loadMeta(raw: string): MetaLoadResult {
  try {
    if (typeof raw !== 'string') return { ok: false, reason: 'meta save is not text' }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { ok: false, reason: 'the meta save is not valid JSON (it may be cut off)' }
    }
    const env = obj(parsed, 'meta save')
    if (env.version !== META_VERSION) {
      return { ok: false, reason: `unsupported meta save version ${JSON.stringify(env.version) ?? 'missing'}` }
    }
    if (typeof env.savedAt !== 'string') return { ok: false, reason: 'meta save.savedAt: expected a string' }
    return { ok: true, meta: validateMeta(env.meta) }
  } catch (e) {
    return { ok: false, reason: e instanceof Invalid ? e.message : 'the meta save could not be read' }
  }
}
