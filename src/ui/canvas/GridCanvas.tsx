// The grid canvas. React renders only the container and the <canvas>; everything else is
// imperative: each animation frame reads store.getState(), eases item positions and
// redraws, so ticks never trigger React renders. The tile size is derived from the
// container size (ResizeObserver) and applied in the frame, so a resize cannot make
// items jump (item positions are in tile units).

import { useEffect, useRef } from 'react'
import { beginDrag, cancelAction, endDrag, primaryAt, removeAt } from '../actions.ts'
import { debugLog } from '../debug.ts'
import type { GameStore } from '../store.ts'
import type { UiStore } from '../uiState.ts'
import { drawOverlay, drawScene, fitTile, PUFF_MS, readPalette } from './draw.ts'
import type { Puff } from './draw.ts'
import { computeOverlay, tileAt } from './input.ts'
import { createItemMotion } from './itemMotion.ts'

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
      const tile = fitTile(box.w, box.h, state.width, state.height)
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
      drawScene(ctx, state, store.defs, items, tile, palette, { now: t, reducedMotion: motionQuery.matches, puffs })
      const uiState = ui.get()
      const overlay = computeOverlay(state, store.defs, uiState)
      drawOverlay(ctx, overlay, store.defs, uiState.cursor, tile, state.width, state.height, palette)
      canvas.style.cursor = overlay.clickable ? 'pointer' : uiState.tool !== null ? 'crosshair' : 'default'
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    // Pointer input. The canvas is exactly the grid, so a tile is floor(offset / tile).
    const ctxActions = { store, ui }
    const tileOf = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const s = store.getState()
      const px = e.clientX - rect.left - canvas.clientLeft
      const py = e.clientY - rect.top - canvas.clientTop
      return tileAt(px, py, applied.tile, s.width, s.height)
    }
    const onPointerDown = (e: PointerEvent): void => {
      const at = tileOf(e)
      if (at === null) return
      ui.setCursor(at, false)
      if (e.button === 2) {
        if (ui.get().drag !== null) cancelAction(ctxActions)
        else removeAt(ctxActions, at)
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
      const at = tileOf(e)
      if (at !== null) ui.setCursor(at, false)
      else if (ui.get().drag === null) ui.setCursor(null, false)
    }
    const onPointerUp = (e: PointerEvent): void => {
      if (e.button === 0 && ui.get().drag !== null) endDrag(ctxActions)
    }
    const onPointerCancel = (): void => {
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
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('contextmenu', onContextMenu)
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
