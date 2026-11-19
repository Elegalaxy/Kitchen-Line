// The grid canvas. React renders only the container and the <canvas>; everything else is
// imperative: each animation frame reads store.getState(), eases item positions and
// redraws, so ticks never trigger React renders. The tile size is derived from the
// container size (ResizeObserver) and applied in the frame, so a resize cannot make
// items jump (item positions are in tile units).

import { useEffect, useRef } from 'react'
import { debugLog } from '../debug.ts'
import type { GameStore } from '../store.ts'
import { drawScene, fitTile, readPalette } from './draw.ts'
import { createItemMotion } from './itemMotion.ts'

export default function GridCanvas({ store }: { store: GameStore }) {
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
      drawScene(ctx, state, store.defs, items, tile, palette)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [store])

  return (
    <div className="grid-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="grid-canvas" role="img" aria-label="Kitchen grid" />
    </div>
  )
}
