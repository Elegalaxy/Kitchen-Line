// Sound cues (GAME_DESIGN section 10): the pure mapping from sim events to short synthesized
// blips, plus the throttle. No audio and no clock here (the caller passes `now` in ms).
// - One batch of events (one loop frame, or one command) asks for each cue at most once.
// - A cue repeats no sooner than its `gapMs` (wall time), so 4x speed stays calm.
// - At most MAX_VOICES cues sound at once; the more important cue wins a free voice.
// - Customers still waiting at closing are not "lost". Building tiles has no sound (dragging a
//   belt would fire dozens); "purchase" is the tier, kitchen size, upgrade and branch spends.

import type { SimEvent } from '../../sim/types.ts'

export type CueId = 'dayEnd' | 'goal' | 'purchase' | 'lost' | 'sale' | 'waste'

/** One oscillator blip: frequency in Hz, start and length in ms (from the cue start), peak 0..1. */
export type Note = { freq: number; at: number; ms: number; wave: 'sine' | 'triangle' | 'square'; peak: number }

export type Cue = { gapMs: number; notes: readonly Note[] }

export const CUES: Record<CueId, Cue> = {
  dayEnd: {
    gapMs: 1000,
    notes: [
      { freq: 523, at: 0, ms: 140, wave: 'triangle', peak: 0.8 },
      { freq: 392, at: 130, ms: 140, wave: 'triangle', peak: 0.8 },
      { freq: 262, at: 260, ms: 260, wave: 'triangle', peak: 0.8 },
    ],
  },
  goal: {
    gapMs: 600,
    notes: [
      { freq: 523, at: 0, ms: 100, wave: 'triangle', peak: 0.8 },
      { freq: 659, at: 90, ms: 100, wave: 'triangle', peak: 0.8 },
      { freq: 784, at: 180, ms: 220, wave: 'triangle', peak: 0.8 },
    ],
  },
  purchase: {
    gapMs: 250,
    notes: [
      { freq: 440, at: 0, ms: 80, wave: 'sine', peak: 0.8 },
      { freq: 660, at: 70, ms: 140, wave: 'sine', peak: 0.8 },
    ],
  },
  lost: {
    gapMs: 600,
    notes: [
      { freq: 330, at: 0, ms: 110, wave: 'sine', peak: 0.7 },
      { freq: 247, at: 100, ms: 180, wave: 'sine', peak: 0.7 },
    ],
  },
  sale: {
    gapMs: 180,
    notes: [
      { freq: 880, at: 0, ms: 60, wave: 'sine', peak: 0.6 },
      { freq: 1319, at: 50, ms: 90, wave: 'sine', peak: 0.5 },
    ],
  },
  waste: {
    gapMs: 1500,
    notes: [{ freq: 150, at: 0, ms: 130, wave: 'square', peak: 0.25 }],
  },
}

/** Most important first: this order decides who gets a free voice. */
export const CUE_PRIORITY: readonly CueId[] = ['dayEnd', 'goal', 'purchase', 'lost', 'sale', 'waste']
export const MAX_VOICES = 3

export function cueLength(id: CueId): number {
  return Math.max(...CUES[id].notes.map((n) => n.at + n.ms))
}

function cueOf(e: SimEvent): CueId | null {
  switch (e.type) {
    case 'served':
      return 'sale'
    case 'customerLeft':
      return e.reason === 'closing' ? null : 'lost'
    case 'spoiled':
    case 'binned':
      return 'waste'
    case 'goalDone':
    case 'won':
    case 'chainWon':
      return 'goal'
    case 'tierUpgraded':
    case 'upgradeBought':
    case 'expanded':
    case 'branchOpened':
    case 'branchRefit':
      return 'purchase'
    default:
      return null
  }
}

/** The cues a batch asks for, without repeats, in priority order. `dayEnded` adds the day-end cue. */
export function cuesFor(events: readonly SimEvent[], dayEnded: boolean): CueId[] {
  const wanted = new Set<CueId>()
  if (dayEnded) wanted.add('dayEnd')
  for (const e of events) {
    const cue = cueOf(e)
    if (cue !== null) wanted.add(cue)
  }
  return CUE_PRIORITY.filter((id) => wanted.has(id))
}

export type CueGate = {
  /** The cues allowed to start at `now` (ms): repeat gap passed and a voice is free. */
  admit(cues: readonly CueId[], now: number): CueId[]
  /** Forget the history (new game or load). */
  reset(): void
}

export function createCueGate(maxVoices: number = MAX_VOICES): CueGate {
  const lastStart = new Map<CueId, number>()
  let endTimes: number[] = []
  return {
    admit(cues, now) {
      endTimes = endTimes.filter((end) => end > now)
      const out: CueId[] = []
      for (const id of cues) {
        if (endTimes.length >= maxVoices) break
        const last = lastStart.get(id)
        if (last !== undefined && now - last < CUES[id].gapMs) continue
        lastStart.set(id, now)
        endTimes.push(now + cueLength(id))
        out.push(id)
      }
      return out
    },
    reset() {
      lastStart.clear()
      endTimes = []
    },
  }
}
