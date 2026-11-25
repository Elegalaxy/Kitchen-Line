// Tests for the Web Audio wrapper with a fake context.

import { describe, expect, it } from 'vitest'
import { CUES } from './cues.ts'
import { createAudioDevice } from './device.ts'

function fakeContext() {
  const log = { started: 0 }
  const param = { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined, value: 0 }
  const ctx = {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    createGain: () => ({ gain: param, connect: () => undefined, disconnect: () => undefined }),
    createOscillator: () => ({
      type: 'sine',
      frequency: param,
      connect: () => undefined,
      disconnect: () => undefined,
      start: () => (log.started += 1),
      stop: () => undefined,
      onended: null,
    }),
    resume: () => {
      ctx.state = 'running'
      return Promise.resolve()
    },
    suspend: () => {
      ctx.state = 'suspended'
      return Promise.resolve()
    },
  }
  return { ctx: ctx as unknown as AudioContext, log }
}

describe('createAudioDevice', () => {
  it('creates no context until unlocked, then plays one oscillator per note', () => {
    const fake = fakeContext()
    let made = 0
    const device = createAudioDevice(() => {
      made += 1
      return fake.ctx
    })
    expect(device.play(CUES.sale.notes)).toBe(false)
    expect(made).toBe(0)
    device.unlock()
    device.unlock()
    expect(made).toBe(1)
    expect(device.play(CUES.sale.notes)).toBe(true)
    expect(fake.log.started).toBe(CUES.sale.notes.length)
    device.suspend()
    expect(device.play(CUES.sale.notes)).toBe(false)
  })

  it('is harmless without Web Audio or when the context cannot be made', () => {
    const none = createAudioDevice(null)
    none.unlock()
    expect(none.available()).toBe(false)
    expect(none.play(CUES.sale.notes)).toBe(false)
    const broken = createAudioDevice(() => {
      throw new Error('blocked')
    })
    expect(() => broken.unlock()).not.toThrow()
    expect(broken.available()).toBe(false)
    expect(broken.play(CUES.sale.notes)).toBe(false)
  })
})
