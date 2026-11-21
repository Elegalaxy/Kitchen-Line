// Remembers that the getting-started guide has finished on this machine. The checklist
// itself is derived from the kitchen. This flag only stops it coming back after a Salad
// sale has rolled out of the last three days of stats. A new game clears it.

import type { StorageLike } from './persistence.ts'

export const TUTORIAL_DONE_KEY = 'kitchen-line.tutorial-done.v1'

export function readTutorialDone(storage: StorageLike | null): boolean {
  if (storage === null) return false
  try {
    return storage.getItem(TUTORIAL_DONE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeTutorialDone(storage: StorageLike | null): void {
  if (storage === null) return
  try {
    storage.setItem(TUTORIAL_DONE_KEY, '1')
  } catch {
    // Storage can be missing or full. The guide still hides for this session via ui state.
  }
}

export function clearTutorialDone(storage: StorageLike | null): void {
  if (storage === null) return
  try {
    storage.removeItem(TUTORIAL_DONE_KEY)
  } catch {
    // Same as write: a storage failure must not break starting a new game.
  }
}
