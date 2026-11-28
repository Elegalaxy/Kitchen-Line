// Touch gestures on the grid canvas: which finger movements pan, tap or draw. Mouse and pen
// do not go through here. No DOM in here: GridCanvas feeds in pointer events (viewport
// pixels) and carries out the effects.
// Rules:
// - Outside the belt tool one finger pans natively (CSS touch-action). A tap acts on release,
//   only if the finger stayed within TAP_SLOP, no second finger joined, the tool did not
//   change and the page was not still scrolling when the finger landed.
// - With the belt tool one finger draws. A second finger drops the drawing (nothing is
//   placed) and two fingers pan, handled in code because native panning is off.
// - Once a gesture is spent, it does nothing until every finger is up.

import type { Tool } from '../uiState.ts'

/** Movement (CSS px) a finger may make and still count as a tap. */
export const TAP_SLOP = 10
/** A finger landing this soon (ms) after a scroll event is stopping the scroll, not tapping. */
export const SCROLL_GRACE_MS = 100

export type ScreenPoint = { x: number; y: number }

type Held = { tool: Tool; fast: boolean }

export type TouchState = {
  fingers: ReadonlyMap<number, ScreenPoint>
  mode: 'idle' | 'tap' | 'draw' | 'pan' | 'spent'
  /** Tool when the gesture began; a change spends the gesture. */
  held: Held
  /** Where the first finger landed. */
  start: ScreenPoint
  /** Centre of the fingers when the current two-finger pan began. */
  panFrom: ScreenPoint
}

export type TouchInput =
  | ({ type: 'down'; id: number; at: ScreenPoint; isPrimary: boolean; scrolling: boolean } & Held)
  | ({ type: 'move'; id: number; at: ScreenPoint } & Held)
  | ({ type: 'up'; id: number; at: ScreenPoint } & Held)
  | { type: 'cancel'; id: number }

export type TouchEffect =
  /** A finger rests on a tile that a tap would act on. */
  | { type: 'press'; at: ScreenPoint }
  /** Act on the pressed tile. */
  | { type: 'tap' }
  | { type: 'drawStart'; at: ScreenPoint }
  | { type: 'drawMove'; at: ScreenPoint }
  | { type: 'drawEnd' }
  | { type: 'drawAbort' }
  /** Remember the scroll positions; later `pan` offsets are relative to them. */
  | { type: 'panStart' }
  /** Scroll offset since `panStart`, in CSS px (positive = further right / down). */
  | { type: 'pan'; dx: number; dy: number }

export type TouchStep = { state: TouchState; effects: TouchEffect[] }

export const IDLE_TOUCH: TouchState = {
  fingers: new Map(),
  mode: 'idle',
  held: { tool: null, fast: false },
  start: { x: 0, y: 0 },
  panFrom: { x: 0, y: 0 },
}

function centre(fingers: ReadonlyMap<number, ScreenPoint>): ScreenPoint {
  let x = 0
  let y = 0
  for (const p of fingers.values()) {
    x += p.x
    y += p.y
  }
  return { x: x / fingers.size, y: y / fingers.size }
}

function moved(a: ScreenPoint, b: ScreenPoint): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) > TAP_SLOP
}

function sameTool(held: Held, now: Held): boolean {
  return held.tool === now.tool && held.fast === now.fast
}

function down(state: TouchState, input: Extract<TouchInput, { type: 'down' }>): TouchStep {
  const effects: TouchEffect[] = []
  // A primary pointer means no other finger is down: anything still tracked is stale.
  let prev = state
  if (input.isPrimary && prev.fingers.size > 0) {
    if (prev.mode === 'draw') effects.push({ type: 'drawAbort' })
    prev = IDLE_TOUCH
  }
  const fingers = new Map(prev.fingers).set(input.id, input.at)
  const held: Held = { tool: input.tool, fast: input.fast }
  if (fingers.size === 1) {
    const next: TouchState = { ...prev, fingers, held, start: input.at, mode: 'spent' }
    if (input.scrolling) return { state: next, effects }
    if (input.tool === 'belt') {
      effects.push({ type: 'drawStart', at: input.at })
      return { state: { ...next, mode: 'draw' }, effects }
    }
    effects.push({ type: 'press', at: input.at })
    return { state: { ...next, mode: 'tap' }, effects }
  }
  if (prev.mode === 'draw') effects.push({ type: 'drawAbort' })
  if (input.tool !== 'belt') return { state: { ...prev, fingers, held, mode: 'spent' }, effects }
  effects.push({ type: 'panStart' })
  return { state: { ...prev, fingers, held, mode: 'pan', panFrom: centre(fingers) }, effects }
}

export function touchStep(state: TouchState, input: TouchInput): TouchStep {
  if (input.type === 'down') return down(state, input)
  if (!state.fingers.has(input.id)) return { state, effects: [] }

  const fingers = new Map(state.fingers)
  if (input.type === 'move') fingers.set(input.id, input.at)
  else fingers.delete(input.id)

  let mode = state.mode
  let panFrom = state.panFrom
  const effects: TouchEffect[] = []
  if (input.type === 'cancel' || (mode !== 'spent' && !sameTool(state.held, input))) {
    if (mode === 'draw') effects.push({ type: 'drawAbort' })
    mode = 'spent'
  } else if (input.type === 'move') {
    if (mode === 'tap' && moved(state.start, input.at)) mode = 'spent'
    else if (mode === 'draw') effects.push({ type: 'drawMove', at: input.at })
    else if (mode === 'pan') {
      const c = centre(fingers)
      effects.push({ type: 'pan', dx: panFrom.x - c.x, dy: panFrom.y - c.y })
    }
  } else {
    if (mode === 'tap' && !moved(state.start, input.at)) effects.push({ type: 'tap' })
    if (mode === 'draw') effects.push({ type: 'drawEnd' })
    if (mode === 'pan' && fingers.size >= 2) {
      panFrom = centre(fingers)
      effects.push({ type: 'panStart' })
    } else mode = 'spent'
  }
  if (fingers.size === 0) return { state: IDLE_TOUCH, effects }
  return { state: { ...state, fingers, mode, panFrom }, effects }
}

/**
 * Share a scroll offset between an inner scroller (now at `from`, scrollable to `max`) and
 * whatever is outside it: the inner one takes what it can, `rest` goes to the page.
 */
export function splitPan(delta: number, from: number, max: number): { inner: number; rest: number } {
  const inner = Math.max(0, Math.min(Math.max(0, max), from + delta))
  return { inner, rest: delta - (inner - from) }
}
