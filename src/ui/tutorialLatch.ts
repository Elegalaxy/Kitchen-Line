// Remembers that the getting-started guide has finished on this machine. The checklist
// itself is derived from the kitchen. This flag only stops it coming back after a Salad
// sale has rolled out of the last three days of stats. A new game clears it.

import type { StorageLike } from './persistence.ts'

export const TUTORIAL_DONE_KEY = 'kitchen-line.tutorial-done.v1'
/** Set once the salad-line top-up has been paid, so a reload does not pay it again. */
export const TUTORIAL_HELP_KEY = 'kitchen-line.tutorial-help.v1'

/** Remember a paid top-up when storage is missing (tests and private mode). */
let helpWithoutStorage = false

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

export function readTutorialHelp(storage: StorageLike | null): boolean {
  if (storage === null) return helpWithoutStorage
  try {
    return storage.getItem(TUTORIAL_HELP_KEY) === '1'
  } catch {
    return false
  }
}

export function writeTutorialHelp(storage: StorageLike | null): void {
  if (storage === null) {
    helpWithoutStorage = true
    return
  }
  try {
    storage.setItem(TUTORIAL_HELP_KEY, '1')
  } catch {
    helpWithoutStorage = true
  }
}

export function clearTutorialHelp(storage: StorageLike | null): void {
  helpWithoutStorage = false
  if (storage === null) return
  try {
    storage.removeItem(TUTORIAL_HELP_KEY)
  } catch {
    // A new game must still start if storage is blocked.
  }
}
