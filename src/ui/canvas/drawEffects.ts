// Drawing for the feedback effects (effects.ts) and the working pulse on processing stations.
// Drawn over the scene and under the build overlay. The caller draws none of this with reduced
// motion, and no pulse while paused or outside service (nothing loops on a frozen kitchen).
// Meaning never rests on these alone: progress bar, status badge, the "+$" text and the bin
// mark say the same. The pulse walks the buildings once per frame and allocates nothing per tile.

import type { Building, GameState } from '../../sim/types.ts'
import type { Palette } from './draw.ts'
import { lifeOf } from './effects.ts'
import type { Effect } from './effects.ts'

const PULSE_HZ = 1.4
// Offset of a 2-tile assembler's second tile: to the right of its facing (dir 0 = north).
const SECOND_DX = [1, 0, -1, 0]
const SECOND_DY = [0, 1, 0, -1]

/** True for a chopper, fryer, stove or assembler that is processing right now. */
export function isWorking(b: Building): boolean {
  return (b.kind === 'chopper' || b.kind === 'fryer' || b.kind === 'stove' || b.kind === 'assembler') && b.status === 'ok'
}

/** The ring around one tile, stroked with the current style. */
function ring(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number): void {
  ctx.beginPath()
  ctx.roundRect(x * tile + tile * 0.06, y * tile + tile * 0.06, tile * 0.88, tile * 0.88, tile * 0.12)
  ctx.stroke()
}

/** A breathing outline around every station that is processing. */
export function drawWorkPulses(ctx: CanvasRenderingContext2D, state: GameState, tile: number, p: Palette, now: number): void {
  const wave = 0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 2 * PULSE_HZ)
  ctx.save()
  ctx.strokeStyle = p.good
  ctx.lineWidth = Math.max(2.5, tile / 14)
  ctx.globalAlpha = 0.15 + 0.75 * wave
  for (const key in state.buildings) {
    const b = state.buildings[key]
    if (!isWorking(b)) continue
    ring(ctx, b.x, b.y, tile)
    if (b.kind === 'assembler') ring(ctx, b.x + SECOND_DX[b.dir], b.y + SECOND_DY[b.dir], tile)
  }
  ctx.restore()
}

function drawFlash(ctx: CanvasRenderingContext2D, e: Effect, t: number, color: string, tile: number): void {
  ctx.beginPath()
  ctx.roundRect(e.x * tile + 1, e.y * tile + 1, tile - 2, tile - 2, tile * 0.12)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.45 * (1 - t)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.globalAlpha = 1 - t
  ctx.stroke()
}

/** The rising "+$X.XX" label, kept inside the canvas. */
function drawMoney(ctx: CanvasRenderingContext2D, e: Effect, t: number, tile: number, cols: number, p: Palette): void {
  const size = Math.max(12, Math.round(tile * 0.3))
  ctx.font = `bold ${size}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = ctx.measureText(e.label).width + 8
  const h = size + 6
  const x = Math.max(w / 2 + 1, Math.min(cols * tile - w / 2 - 1, (e.x + 0.5) * tile))
  const y = Math.max(h / 2 + 1, (e.y + 0.3) * tile - t * tile * 0.9)
  ctx.globalAlpha = t < 0.6 ? 1 : (1 - t) / 0.4
  ctx.beginPath()
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 5)
  ctx.fillStyle = p.surface
  ctx.fill()
  ctx.strokeStyle = p.money
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = p.money
  ctx.fillText(e.label, x, y + 0.5)
}

/** Flashes first, then the money labels on top of them. */
export function drawEffects(ctx: CanvasRenderingContext2D, effects: readonly Effect[], tile: number, cols: number, p: Palette, now: number): void {
  if (effects.length === 0) return
  ctx.save()
  for (const labels of [false, true]) {
    for (const e of effects) {
      if ((e.kind === 'money') !== labels) continue
      const t = Math.max(0, (now - e.start) / lifeOf(e.kind))
      if (t >= 1) continue
      if (e.kind === 'money') drawMoney(ctx, e, t, tile, cols, p)
      else drawFlash(ctx, e, t, e.kind === 'serve' ? p.good : p.bad, tile)
    }
  }
  ctx.restore()
}
