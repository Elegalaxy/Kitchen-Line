// The thin Web Audio wrapper (GAME_DESIGN section 10). No game knowledge: it plays notes.
// - The AudioContext is created only by `unlock()`, which the caller runs from a user gesture
//   while sound is on. Nothing here creates one earlier.
// - Missing or broken Web Audio never throws: `play` just returns false.
// - One quiet master gain; every note fades in and out and is disconnected after it ends.

import { debugLog } from '../debug.ts'
import type { Note } from './cues.ts'

export const MASTER_GAIN = 0.12
const FLOOR = 0.0001
const ATTACK_S = 0.008

export type AudioDevice = {
  /** False when the browser has no Web Audio (or creating a context failed). */
  available(): boolean
  /** Create the context, or resume it. Call only from a user gesture. */
  unlock(): void
  /** Play the notes now. False when nothing could play (not unlocked, suspended, unsupported). */
  play(notes: readonly Note[]): boolean
  /** Stop the context's clock (sound switched off). */
  suspend(): void
}

export function createAudioDevice(factory: (() => AudioContext) | null): AudioDevice {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let broken = factory === null
  const quiet = (p: Promise<void>): void => {
    p.catch((e: unknown) => debugLog('[ui]', `audio state change refused: ${String(e)}`))
  }
  return {
    available: () => !broken,
    unlock() {
      if (broken || factory === null) return
      try {
        if (ctx === null) {
          ctx = factory()
          master = ctx.createGain()
          master.gain.value = MASTER_GAIN
          master.connect(ctx.destination)
          debugLog('[ui]', 'audio context created')
        }
        if (ctx.state === 'suspended') quiet(ctx.resume())
      } catch (e) {
        broken = true
        ctx = null
        master = null
        debugLog('[ui]', `audio unavailable: ${String(e)}`)
      }
    },
    play(notes) {
      if (ctx === null || master === null || ctx.state !== 'running') return false
      try {
        const now = ctx.currentTime
        for (const n of notes) {
          const start = now + n.at / 1000
          const end = start + n.ms / 1000
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = n.wave
          osc.frequency.setValueAtTime(n.freq, start)
          gain.gain.setValueAtTime(FLOOR, start)
          gain.gain.exponentialRampToValueAtTime(n.peak, start + ATTACK_S)
          gain.gain.exponentialRampToValueAtTime(FLOOR, end)
          osc.connect(gain)
          gain.connect(master)
          osc.onended = () => {
            osc.disconnect()
            gain.disconnect()
          }
          osc.start(start)
          osc.stop(end + 0.02)
        }
        return true
      } catch (e) {
        debugLog('[ui]', `audio play failed: ${String(e)}`)
        return false
      }
    },
    suspend() {
      if (ctx !== null && ctx.state === 'running') quiet(ctx.suspend())
    },
  }
}

/** The browser's AudioContext constructor as a factory, or null when there is none. */
export function browserAudioFactory(): (() => AudioContext) | null {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null
  return () => new window.AudioContext()
}
