// The grid canvas. React renders only the container and the <canvas>; everything else is
// imperative: each animation frame reads store.getState(), eases item positions and
// redraws, so ticks never trigger React renders. The tile size is derived from the
// container size (ResizeObserver) and applied in the frame, so a resize cannot make
// items jump (item positions are in tile units). Feedback effects (effects.ts) come from
// store.onFeedback and run on the wall clock; reduced motion is read live and turns them off.
// Mouse and pen act on pointer down; touch goes through touchGesture.ts (pan, tap, draw).

import { useEffect, useRef } from 'react'
import { beginDrag, cancelAction, endDrag, primaryAt } from '../actions.ts'
import { debugLog } from '../debug.ts'
import type { GameStore } from '../store.ts'
import type { UiStore } from '../uiState.ts'
import { tutorialHints } from '../tutorial.ts'
import { drawHints, drawOverlay, drawScene, fitTile, PUFF_MS, readPalette } from './draw.ts'
import type { Puff } from './draw.ts'
import { drawEffects, drawWorkPulses } from './drawEffects.ts'
import { createEffects } from './effects.ts'
import { computeOverlay, tileAt } from './input.ts'
import { createItemMotion } from './itemMotion.ts'
import { IDLE_TOUCH, SCROLL_GRACE_MS, splitPan, touchStep } from './touchGesture.ts'
import type { ScreenPoint, TouchEffect, TouchInput } from './touchGesture.ts'

export default function GridCanvas({ store, ui }: { store: GameStore; ui: UiStore }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (wrap === null || canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) {
      console.error('[canvas] 2D context unavailable')
      return
    }
    const palette = readPalette()
    const motion = createItemMotion()
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let puffs: Puff[] = []
    const effects = createEffects()
    const stopFeedback = store.onFeedback((f) => {
      if (f.type === 'reset') puffs = []
      effects.ingest(f, performance.now(), !motionQuery.matches)
    })
    const box = { w: wrap.clientWidth, h: wrap.clientHeight }
    const ro = new ResizeObserver(() => {
      box.w = wrap.clientWidth
      box.h = wrap.clientHeight
    })
    ro.observe(wrap)

    let applied = { tile: 0, cols: 0, rows: 0, dpr: 0 }
    let raf = 0
    let last: number | null = null
    const frame = (t: number): void => {
      const dt = last === null ? 0 : Math.min(t - last, 100)
      last = t
      const state = store.getState()
      // Leave room for the canvas border (1px a side), or an exact fit shows a scrollbar.
      const tile = fitTile(box.w - 2, box.h - 2, state.width, state.height)
      const dpr = window.devicePixelRatio || 1
      if (applied.tile !== tile || applied.cols !== state.width || applied.rows !== state.height || applied.dpr !== dpr) {
        applied = { tile, cols: state.width, rows: state.height, dpr }
        canvas.width = Math.round(state.width * tile * dpr)
        canvas.height = Math.round(state.height * tile * dpr)
        canvas.style.width = `${state.width * tile}px`
        canvas.style.height = `${state.height * tile}px`
        debugLog('[canvas]', `tile=${tile} grid=${state.width}x${state.height}`)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const items = motion.update(state, dt, store.getSpeed())
      for (const s of store.takeSpoils()) puffs.push({ x: s.x, y: s.y, start: t })
      puffs = puffs.filter((pf) => t - pf.start < PUFF_MS)
      const frozen = state.phase !== 'service' || store.getSpeed() === 0
      drawScene(ctx, state, store.defs, items, tile, palette, { now: t, reducedMotion: motionQuery.matches, frozen, puffs })
      if (motionQuery.matches) effects.clear()
      else {
        const now = performance.now()
        if (!frozen) drawWorkPulses(ctx, state, tile, palette, now)
        effects.prune(now)
        drawEffects(ctx, effects.list(), tile, state.width, palette, now)
      }
      const uiState = ui.get()
      if (!uiState.hintsHidden && !uiState.guideDone) drawHints(ctx, tutorialHints(state), store.defs, tile, palette, t, motionQuery.matches)
      const overlay = computeOverlay(state, store.defs, uiState)
      drawOverlay(ctx, overlay, store.defs, uiState.cursor, tile, state.width, state.height, palette)
      canvas.style.cursor = overlay.clickable ? 'pointer' : uiState.tool !== null ? 'crosshair' : 'default'
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    // Pointer input. The canvas is exactly the grid, so a tile is floor(offset / tile).
    const ctxActions = { store, ui }
    const tileOf = (at: ScreenPoint) => {
      const rect = canvas.getBoundingClientRect()
      const s = store.getState()
      const px = at.x - rect.left - canvas.clientLeft
      const py = at.y - rect.top - canvas.clientTop
      return tileAt(px, py, applied.tile, s.width, s.height)
    }
    const screenPoint = (e: PointerEvent): ScreenPoint => ({ x: e.clientX, y: e.clientY })

    // Only the belt tool turns native touch panning off (styles.css, data-draw).
    const syncTouchAction = (): void => {
      canvas.dataset.draw = String(ui.get().tool === 'belt')
    }
    syncTouchAction()
    const stopToolWatch = ui.subscribe(syncTouchAction)

    let touch = IDLE_TOUCH
    let pressed: ReturnType<typeof tileOf> = null
    let panBase = { left: 0, top: 0, pageX: 0, pageY: 0 }
    let lastScroll = -Infinity
    const onScroll = (e: Event): void => {
      if (e.target === document || (e.target instanceof Node && e.target.contains(canvas))) lastScroll = performance.now()
    }
    const runTouchEffect = (effect: TouchEffect): void => {
      switch (effect.type) {
        case 'press':
          pressed = tileOf(effect.at)
          if (pressed !== null) ui.setCursor(pressed, false)
          return
        case 'tap':
          if (pressed === null) return
          ui.setCursor(pressed, false)
          primaryAt(ctxActions, pressed)
          return
        case 'drawStart': {
          const at = tileOf(effect.at)
          if (at === null) return
          ui.setCursor(at, false)
          beginDrag(ctxActions, at)
          return
        }
        case 'drawMove': {
          const at = tileOf(effect.at)
          if (at !== null) ui.setCursor(at, false)
          return
        }
        case 'drawEnd':
          if (ui.get().drag !== null) endDrag(ctxActions)
          return
        case 'drawAbort':
          ui.set({ drag: null })
          ui.setCursor(null, false)
          return
        case 'panStart':
          panBase = { left: wrap.scrollLeft, top: wrap.scrollTop, pageX: window.scrollX, pageY: window.scrollY }
          return
        case 'pan': {
          // The grid scrolls first; what it cannot take goes to the page.
          const x = splitPan(effect.dx, panBase.left, wrap.scrollWidth - wrap.clientWidth)
          const y = splitPan(effect.dy, panBase.top, wrap.scrollHeight - wrap.clientHeight)
          wrap.scrollLeft = x.inner
          wrap.scrollTop = y.inner
          window.scrollTo(panBase.pageX + x.rest, panBase.pageY + y.rest)
          return
        }
      }
    }
    const feedTouch = (input: TouchInput): void => {
      const out = touchStep(touch, input)
      touch = out.state
      out.effects.forEach(runTouchEffect)
    }
    const touchInput = (type: 'move' | 'up', e: PointerEvent): TouchInput => {
      const { tool, fast } = ui.get()
      return { type, id: e.pointerId, at: screenPoint(e), tool, fast }
    }

    // A pen keeps drawing and placing as a mouse does: its movement must not scroll.
    let penDown = false
    const onTouchMove = (e: TouchEvent): void => {
      if (penDown) e.preventDefault()
    }

    const onPointerDown = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') {
        const { tool, fast } = ui.get()
        const scrolling = performance.now() - lastScroll < SCROLL_GRACE_MS
        feedTouch({ type: 'down', id: e.pointerId, at: screenPoint(e), tool, fast, isPrimary: e.isPrimary, scrolling })
        return
      }
      if (e.pointerType === 'pen') penDown = true
      const at = tileOf(screenPoint(e))
      if (at === null) return
      ui.setCursor(at, false)
      if (e.button === 2) {
        // Right-click backs out one level, like Esc: drag, then tool, then selection.
        cancelAction(ctxActions)
        return
      }
      if (e.button !== 0) return
      if (ui.get().tool === 'belt') {
        canvas.setPointerCapture(e.pointerId)
        beginDrag(ctxActions, at)
      } else {
        primaryAt(ctxActions, at)
      }
    }
    const onPointerMove = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') return feedTouch(touchInput('move', e))
      const at = tileOf(screenPoint(e))
      if (at !== null) ui.setCursor(at, false)
      else if (ui.get().drag === null) ui.setCursor(null, false)
    }
    const onPointerUp = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') return feedTouch(touchInput('up', e))
      if (e.pointerType === 'pen') penDown = false
      if (e.button === 0 && ui.get().drag !== null) endDrag(ctxActions)
    }
    const onPointerCancel = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') return feedTouch({ type: 'cancel', id: e.pointerId })
      if (e.pointerType === 'pen') penDown = false
      if (ui.get().drag !== null) ui.set({ drag: null })
    }
    const onPointerLeave = (): void => {
      const s = ui.get()
      if (s.drag === null && !s.cursorFromKeys) ui.setCursor(null, false)
    }
    const onContextMenu = (e: Event): void => e.preventDefault()
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerCancel)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      cancelAnimationFrame(raf)
      stopFeedback()
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('scroll', onScroll, { capture: true })
      stopToolWatch()
    }
  }, [store, ui])

  return (
    <div className="grid-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="grid-canvas"
        tabIndex={0}
        role="application"
        aria-label="Kitchen grid. Arrow keys move the tile cursor, Enter places or selects, R rotates, Delete sells."
      />
    </div>
  )
}
