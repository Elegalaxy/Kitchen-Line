// Meta save glue for the UI (franchise, GAME_DESIGN 8.2): everything that touches localStorage for the
// second key, `kitchen-line.meta.v1`. The format and its validation live in src/persist/meta.ts (pure).
// Here: storage access wrapped in try/catch (storage can be missing, full or blocked), the corrupt copy
// under META_CORRUPT_KEY, and `sanitizeMeta`, the part persist cannot do: drop dish ids and perk ids
// the content does not know (an old save from another version never breaks the game).

import { loadMeta, META_CORRUPT_KEY, META_KEY, serializeMeta } from '../persist/meta.ts'
import { emptyMeta } from '../sim/franchise.ts'
import type { Defs, MetaState } from '../sim/types.ts'
import { debugLog } from './debug.ts'
import type { StorageLike } from './persistence.ts'

export type MetaOutcome = { meta: MetaState; notice: string | null }

/** The meta without ids the content does not know. Never changes counts or points. */
export function sanitizeMeta(meta: MetaState, defs: Defs): MetaState {
  const perkIds = new Set((defs.perks ?? []).map((p) => p.id))
  const perks: Record<string, number> = {}
  for (const [id, level] of Object.entries(meta.perks)) {
    if (perkIds.has(id)) perks[id] = level
  }
  return { ...meta, perks, recipeBook: meta.recipeBook.filter((id) => defs.dishes[id] !== undefined) }
}

/** Read the stored meta. Missing or unreadable storage gives an empty meta; a bad file is kept under the .corrupt key. */
export function readMeta(storage: StorageLike | null, defs: Defs): MetaOutcome {
  if (storage === null) return { meta: emptyMeta(), notice: null }
  let raw: string | null
  try {
    raw = storage.getItem(META_KEY)
  } catch (e) {
    debugLog('[save]', `meta storage unreadable: ${String(e)}`)
    return { meta: emptyMeta(), notice: null }
  }
  if (raw === null) return { meta: emptyMeta(), notice: null }
  const result = loadMeta(raw)
  if (result.ok) {
    debugLog('[save]', `meta loaded runs=${result.meta.runsCompleted} points=${result.meta.points}`)
    return { meta: sanitizeMeta(result.meta, defs), notice: null }
  }
  debugLog('[save]', `meta error ${result.reason}`)
  console.error(`[save] could not load the franchise progress: ${result.reason}`)
  try {
    storage.setItem(META_CORRUPT_KEY, raw)
  } catch {
    // Keeping the copy is best effort.
  }
  return { meta: emptyMeta(), notice: result.reason }
}

/** Store the meta. Returns false (and logs) when storage is missing or refuses the write. */
export function writeMeta(storage: StorageLike | null, meta: MetaState, savedAt: string): boolean {
  if (storage === null) return false
  try {
    storage.setItem(META_KEY, serializeMeta(meta, savedAt))
    debugLog('[save]', `meta saved runs=${meta.runsCompleted} points=${meta.points}`)
    return true
  } catch (e) {
    debugLog('[save]', `meta write failed: ${String(e)}`)
    return false
  }
}

export function clearMeta(storage: StorageLike | null): void {
  try {
    storage?.removeItem(META_KEY)
  } catch {
    // Nothing to do.
  }
}
