// Tests for the sound setting and for which store feedback is audible.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../../content/index.ts'
import { DAY_TICKS } from '../../sim/constants.ts'
import type { StorageLike } from '../persistence.ts'
import { createStore, newGameState } from '../store.ts'
import type { Feedback } from '../store.ts'
import { createSoundController, SOUND_KEY } from './controller.ts'
import type { AudioDevice } from './device.ts'

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

function setup(storage: StorageLike | null = memory()) {
  const log = { unlocks: 0, plays: 0, suspends: 0 }
  const device: AudioDevice = {
    available: () => true,
    unlock: () => void (log.unlocks += 1),
    play: () => {
      log.plays += 1
      return true
    },
    suspend: () => void (log.suspends += 1),
  }
  const page = { hidden: false, now: 0 }
  const sound = createSoundController({ storage, device, now: () => page.now, hidden: () => page.hidden })
  return { sound, log, page }
}

const sale: Feedback = { type: 'command', events: [{ type: 'served', tick: 1, id: 1, dish: 'fries', price: 500, wait: 1 }] }

describe('sound controller', () => {
  it('is off by default: no unlock, no sound', () => {
    const { sound, log } = setup()
    expect(sound.isOn()).toBe(false)
    sound.unlock()
    sound.handle(sale)
    expect(log).toEqual({ unlocks: 0, plays: 0, suspends: 0 })
  })

  it('remembers the choice under its own key', () => {
    const storage = memory()
    const first = setup(storage)
    first.sound.setOn(true)
    expect([...storage.data]).toEqual([[SOUND_KEY, 'on']])
    expect(first.log.unlocks).toBe(1)
    expect(setup(storage).sound.isOn()).toBe(true)
    first.sound.setOn(false)
    expect(first.log.suspends).toBe(1)
    expect(setup(storage).sound.isOn()).toBe(false)
  })

  it('survives blocked or missing storage', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => undefined,
    }
    for (const storage of [throwing, null]) {
      const { sound } = setup(storage)
      expect(sound.isOn()).toBe(false)
      expect(() => sound.setOn(true)).not.toThrow()
      expect(sound.isOn()).toBe(true)
    }
  })

  it('plays nothing while the page is hidden or on reset', () => {
    const { sound, log, page } = setup()
    sound.setOn(true)
    page.hidden = true
    sound.handle(sale)
    sound.handle({ type: 'reset' })
    expect(log.plays).toBe(0)
    page.hidden = false
    sound.handle(sale)
    expect(log.plays).toBe(1)
  })

  it('hears live store ticks but not a replaced state', () => {
    const { sound, log, page } = setup()
    sound.setOn(true)
    const store = createStore(DEFS, newGameState(DEFS, 'friesLine'), { now: () => 0, setTimer: () => undefined })
    store.onFeedback(sound.handle)
    for (let i = 0; i < DAY_TICKS; i += 4) {
      page.now += 100
      store.advance(4)
    }
    expect(log.plays).toBeGreaterThan(0)
    const before = log.plays
    page.now += 5000
    store.replaceState(store.getState(), 1)
    expect(log.plays).toBe(before)
  })
})
