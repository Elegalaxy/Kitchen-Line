// Tests for the store: notification throttle, dispatch handling, speed and pause.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { createStore, createThrottle, newGameState } from './store.ts'

function manualClock() {
  let t = 0
  const timers: { at: number; fn: () => void }[] = []
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => {
      timers.push({ at: t + ms, fn })
    },
    advance(ms: number) {
      t += ms
      for (const x of timers.filter((q) => q.at <= t)) {
        timers.splice(timers.indexOf(x), 1)
        x.fn()
      }
    },
  }
}

describe('createThrottle', () => {
  it('fires at once, then at most once per interval with a trailing call', () => {
    const clock = manualClock()
    let calls = 0
    const th = createThrottle(() => (calls += 1), 200, clock)
    th.fire()
    expect(calls).toBe(1)
    clock.advance(50)
    th.fire()
    th.fire()
    expect(calls).toBe(1)
    clock.advance(149)
    expect(calls).toBe(1)
    clock.advance(1)
    expect(calls).toBe(2)
    clock.advance(1000)
    th.fire()
    expect(calls).toBe(3)
  })
})

describe('store', () => {
  const make = () => {
    const clock = manualClock()
    return { clock, store: createStore(DEFS, newGameState(DEFS, 'demoBeltLine'), clock) }
  }

  it('applies the demo layout (6 belts, pantry, pass)', () => {
    const { store } = make()
    expect(Object.keys(store.getState().buildings)).toHaveLength(8)
  })

  it('notifies subscribers at most 5 times a second while ticking', () => {
    const { store, clock } = make()
    let notified = 0
    store.subscribe(() => (notified += 1))
    for (let i = 0; i < 20; i += 1) {
      store.advance(1)
      clock.advance(10) // 200 ms in total
    }
    expect(store.getState().tick).toBe(20)
    expect(notified).toBeLessThanOrEqual(2)
    expect(notified).toBeGreaterThanOrEqual(1)
  })

  it('keeps the snapshot stable until a notification', () => {
    const { store, clock } = make()
    store.advance(1)
    const snap = store.getSnapshot()
    clock.advance(10)
    store.advance(1)
    expect(store.getSnapshot()).toBe(snap)
  })

  it('returns a rejection and leaves the state alone', () => {
    const { store } = make()
    const before = store.getState()
    const res = store.dispatch({ type: 'remove', x: 3, y: 5 })
    expect(res.ok).toBe(false)
    expect(store.getState()).toBe(before)
  })

  it('publishes accepted commands and speed changes immediately', () => {
    const { store } = make()
    const snap = store.getSnapshot()
    expect(store.dispatch({ type: 'place', kind: 'bin', x: 3, y: 4, dir: 0 }).ok).toBe(true)
    expect(store.getSnapshot()).not.toBe(snap)
    expect(store.getSnapshot().state.buildings[store.getState().nextId - 1].kind).toBe('bin')
    store.setSpeed(4)
    expect(store.getSnapshot().speed).toBe(4)
  })

  it('toggles pause and resumes at the previous speed', () => {
    const { store } = make()
    store.setSpeed(2)
    store.togglePause()
    expect(store.getSpeed()).toBe(0)
    store.togglePause()
    expect(store.getSpeed()).toBe(2)
  })
})
