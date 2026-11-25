// Sound setting and playback glue (GAME_DESIGN section 10).
// - Off by default. The choice is a per-browser preference under its own localStorage key
//   (not in the game save or the franchise meta); storage may be missing or blocked.
// - Only live store feedback makes sound: loading, new game and franchising send `reset`,
//   which plays nothing. Nothing plays while the page is hidden. A paused game runs no ticks,
//   so only a purchase made while paused is heard.

import type { Feedback, GameStore } from '../store.ts'
import { debugLog } from '../debug.ts'
import { getBrowserStorage } from '../persistence.ts'
import type { StorageLike } from '../persistence.ts'
import { createCueGate, CUES, cuesFor } from './cues.ts'
import { browserAudioFactory, createAudioDevice } from './device.ts'
import type { AudioDevice } from './device.ts'

export const SOUND_KEY = 'kitchen-line.sound.v1'

export type SoundController = {
  available(): boolean
  isOn(): boolean
  /** Switch sound on or off. Call from a user gesture (switching on creates the audio context). */
  setOn(on: boolean): void
  /** A user gesture happened: if sound is on, make sure the context is running. */
  unlock(): void
  subscribe(listener: () => void): () => void
  handle(feedback: Feedback): void
}

export type SoundDeps = {
  storage: StorageLike | null
  device: AudioDevice
  now: () => number
  hidden: () => boolean
}

function readOn(storage: StorageLike | null): boolean {
  try {
    return storage?.getItem(SOUND_KEY) === 'on'
  } catch {
    return false
  }
}

export function createSoundController(deps: SoundDeps): SoundController {
  const { storage, device } = deps
  const gate = createCueGate()
  const listeners = new Set<() => void>()
  let on = readOn(storage)
  return {
    available: () => device.available(),
    isOn: () => on,
    setOn(next) {
      on = next
      try {
        storage?.setItem(SOUND_KEY, next ? 'on' : 'off')
      } catch {
        debugLog('[ui]', 'sound setting not saved')
      }
      if (next) device.unlock()
      else device.suspend()
      gate.reset()
      debugLog('[ui]', `sound ${next ? 'on' : 'off'}`)
      for (const l of [...listeners]) l()
    },
    unlock() {
      if (on) device.unlock()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    handle(feedback) {
      if (feedback.type === 'reset') {
        gate.reset()
        return
      }
      if (!on || deps.hidden()) return
      const cues = cuesFor(feedback.events, feedback.type === 'ticks' && feedback.dayEnded)
      if (cues.length === 0) return
      for (const id of gate.admit(cues, deps.now())) device.play(CUES[id].notes)
    },
  }
}

let singleton: SoundController | null = null

export function getSoundController(): SoundController {
  singleton ??= createSoundController({
    storage: getBrowserStorage(),
    device: createAudioDevice(browserAudioFactory()),
    now: () => performance.now(),
    hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  })
  return singleton
}

/** Listen to the store and to user gestures (browsers only start audio after one). Returns a remover. */
export function attachSound(store: GameStore, sound: SoundController = getSoundController()): () => void {
  const stop = store.onFeedback(sound.handle)
  const onGesture = (e: Event): void => {
    // Escape is not a user activation in browsers.
    if (e instanceof KeyboardEvent && e.key === 'Escape') return
    sound.unlock()
  }
  window.addEventListener('pointerup', onGesture, true)
  window.addEventListener('keydown', onGesture, true)
  return () => {
    stop()
    window.removeEventListener('pointerup', onGesture, true)
    window.removeEventListener('keydown', onGesture, true)
  }
}
