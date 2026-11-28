// Tests for the touch gesture rules: tap on release, panning never acts, belt drawing,
// two-finger pan, cancel and tool changes mid-gesture.

import { describe, expect, it } from 'vitest'
import type { Tool } from '../uiState.ts'
import { IDLE_TOUCH, splitPan, TAP_SLOP, touchStep } from './touchGesture.ts'
import type { TouchEffect, TouchInput } from './touchGesture.ts'

const at = (x: number, y: number) => ({ x, y })
const down = (id: number, x: number, y: number, tool: Tool, extra: { scrolling?: boolean; isPrimary?: boolean; fast?: boolean } = {}): TouchInput => ({
  type: 'down', id, at: at(x, y), tool, fast: extra.fast ?? false, isPrimary: extra.isPrimary ?? id === 1, scrolling: extra.scrolling ?? false,
})
const move = (id: number, x: number, y: number, tool: Tool, fast = false): TouchInput => ({ type: 'move', id, at: at(x, y), tool, fast })
const up = (id: number, x: number, y: number, tool: Tool, fast = false): TouchInput => ({ type: 'up', id, at: at(x, y), tool, fast })
const cancel = (id: number): TouchInput => ({ type: 'cancel', id })

function run(...inputs: TouchInput[]) {
  let state = IDLE_TOUCH
  const effects: TouchEffect[] = []
  for (const input of inputs) {
    const out = touchStep(state, input)
    state = out.state
    effects.push(...out.effects)
  }
  return { state, effects, types: effects.map((e) => e.type) }
}

const TAP_TOOLS: Tool[] = [null, 'remove', 'pause', 'pantry']

describe('tap tools', () => {
  it('act only on release', () => {
    for (const tool of TAP_TOOLS) {
      expect(run(down(1, 50, 50, tool)).types).toEqual(['press'])
      expect(run(down(1, 50, 50, tool), up(1, 50, 50, tool)).types).toEqual(['press', 'tap'])
    }
  })

  it('still tap after a wobble within the slop', () => {
    const r = run(down(1, 50, 50, 'remove'), move(1, 50 + TAP_SLOP, 50, 'remove'), up(1, 50 + TAP_SLOP, 50, 'remove'))
    expect(r.types).toEqual(['press', 'tap'])
  })

  it('never act after a pan, even when the finger returns to where it started', () => {
    for (const tool of TAP_TOOLS) {
      const r = run(down(1, 50, 50, tool), move(1, 50, 80, tool), move(1, 50, 50, tool), up(1, 50, 50, tool))
      expect(r.types).toEqual(['press'])
      expect(r.state).toBe(IDLE_TOUCH)
    }
  })

  it('never act when the finger is released far away without a move event', () => {
    expect(run(down(1, 50, 50, 'pantry'), up(1, 90, 50, 'pantry')).types).toEqual(['press'])
  })

  it('never act when the browser takes the gesture over', () => {
    const r = run(down(1, 50, 50, 'remove'), cancel(1), up(1, 50, 50, 'remove'))
    expect(r.types).toEqual(['press'])
    expect(r.state).toBe(IDLE_TOUCH)
  })

  it('never act when a second finger joins, whichever lifts first', () => {
    const a = run(down(1, 50, 50, null), down(2, 90, 50, null), up(2, 90, 50, null), up(1, 50, 50, null))
    const b = run(down(1, 50, 50, null), down(2, 90, 50, null), up(1, 50, 50, null), up(2, 90, 50, null))
    expect(a.types).toEqual(['press'])
    expect(b.types).toEqual(['press'])
    expect(b.state).toBe(IDLE_TOUCH)
  })

  it('never act when the tool changed mid-gesture', () => {
    expect(run(down(1, 50, 50, 'pantry'), up(1, 50, 50, 'remove')).types).toEqual(['press'])
    expect(run(down(1, 50, 50, 'fryer'), up(1, 50, 50, 'fryer', true)).types).toEqual(['press'])
  })

  it('ignore a finger that lands to stop a scroll', () => {
    expect(run(down(1, 50, 50, 'remove', { scrolling: true }), up(1, 50, 50, 'remove')).types).toEqual([])
  })

  it('work again on the next gesture', () => {
    const r = run(down(1, 50, 50, null), cancel(1), down(1, 60, 60, null), up(1, 60, 60, null))
    expect(r.types).toEqual(['press', 'press', 'tap'])
  })

  it('drop a stale finger when a new primary one lands', () => {
    const r = run(down(1, 50, 50, null), down(7, 60, 60, null, { isPrimary: true }), up(7, 60, 60, null))
    expect(r.types).toEqual(['press', 'press', 'tap'])
  })
})

describe('belt tool', () => {
  it('draws with one finger and commits on release', () => {
    const r = run(down(1, 10, 10, 'belt'), move(1, 100, 10, 'belt'), up(1, 100, 10, 'belt'))
    expect(r.types).toEqual(['drawStart', 'drawMove', 'drawEnd'])
  })

  it('pans with two fingers, dropping the drawing', () => {
    const r = run(
      down(1, 100, 100, 'belt'),
      down(2, 200, 100, 'belt'),
      move(1, 70, 90, 'belt'),
      move(2, 170, 90, 'belt'),
      up(1, 70, 90, 'belt'),
      move(2, 100, 90, 'belt'),
      up(2, 100, 90, 'belt'),
    )
    expect(r.types).toEqual(['drawStart', 'drawAbort', 'panStart', 'pan', 'pan'])
    // Both fingers moved left 30 and up 10: scroll right 30 and down 10.
    expect(r.effects.at(-1)).toEqual({ type: 'pan', dx: 30, dy: 10 })
    expect(r.state).toBe(IDLE_TOUCH)
  })

  it('does not commit when the second finger lifts first', () => {
    const r = run(down(1, 10, 10, 'belt'), down(2, 50, 10, 'belt'), up(2, 50, 10, 'belt'), move(1, 90, 10, 'belt'), up(1, 90, 10, 'belt'))
    expect(r.types).toEqual(['drawStart', 'drawAbort', 'panStart'])
  })

  it('restarts the pan baseline when a finger is swapped or added', () => {
    const r = run(down(1, 0, 0, 'belt'), down(2, 40, 0, 'belt'), down(3, 80, 0, 'belt'), up(3, 80, 0, 'belt'), up(2, 40, 0, 'belt'), down(4, 40, 0, 'belt'))
    expect(r.types).toEqual(['drawStart', 'drawAbort', 'panStart', 'panStart', 'panStart', 'panStart'])
    expect(r.state.mode).toBe('pan')
  })

  it('aborts on pointercancel', () => {
    const r = run(down(1, 10, 10, 'belt'), cancel(1), up(1, 10, 10, 'belt'))
    expect(r.types).toEqual(['drawStart', 'drawAbort'])
  })

  it('aborts when the tool changes mid-draw', () => {
    expect(run(down(1, 10, 10, 'belt'), move(1, 90, 10, null), up(1, 90, 10, null)).types).toEqual(['drawStart', 'drawAbort'])
    expect(run(down(1, 10, 10, 'belt'), up(1, 90, 10, 'belt', true)).types).toEqual(['drawStart', 'drawAbort'])
  })

  it('ignores fingers it never saw land', () => {
    expect(run(down(1, 10, 10, 'belt'), up(9, 10, 10, 'belt')).state.mode).toBe('draw')
  })
})

describe('splitPan', () => {
  it('lets the inner scroller take what it can and passes the rest on', () => {
    expect(splitPan(30, 0, 100)).toEqual({ inner: 30, rest: 0 })
    expect(splitPan(150, 20, 100)).toEqual({ inner: 100, rest: 70 })
    expect(splitPan(-50, 20, 100)).toEqual({ inner: 0, rest: -30 })
    expect(splitPan(40, 0, 0)).toEqual({ inner: 0, rest: 40 })
  })
})
