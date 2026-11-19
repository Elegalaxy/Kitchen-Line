// Canvas 2D scene drawing (plan Step 4, shape encoding from 2.6). Pure drawing: it takes
// the state, the item positions from itemMotion and a palette read from the CSS tokens.
// Coordinates: one tile = `tile` CSS pixels; the canvas is exactly the grid.
// Shape encoding (never colour alone): raw = circle, processed = rounded square,
// dish = circle with a plate ring, spoiling = warning badge. Stalled belt = hatching + no-entry glyph.

import { footprint } from '../../sim/grid.ts'
import type { BuildingKind, Defs, Dir, GameState, ItemDef } from '../../sim/types.ts'
import type { MotionItem } from './itemMotion.ts'

export const MIN_TILE = 32
export const MAX_TILE = 64

export type Palette = {
  surface: string
  surfaceRaised: string
  text: string
  textMuted: string
  textFaint: string
  good: string
  bad: string
  warn: string
  info: string
  money: string
}

/** Read the colour tokens from styles.css (single source of truth; no palette here). */
export function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string): string => css.getPropertyValue(name).trim()
  return {
    surface: v('--surface'),
    surfaceRaised: v('--surface-raised'),
    text: v('--text'),
    textMuted: v('--text-muted'),
    textFaint: v('--text-faint'),
    good: v('--good'),
    bad: v('--bad'),
    warn: v('--warn'),
    info: v('--info'),
    money: v('--money'),
  }
}

/** Tile size that fits the container, clamped to [MIN_TILE, MAX_TILE]. */
export function fitTile(containerW: number, containerH: number, cols: number, rows: number): number {
  const fit = Math.floor(Math.min(containerW / cols, containerH / rows))
  return Math.max(MIN_TILE, Math.min(MAX_TILE, Number.isFinite(fit) ? fit : MIN_TILE))
}

const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'

function glyph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number): void {
  ctx.font = `${size}px ${EMOJI_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Building tint, by token. Meaning: pantry = warn, pass = good, bin = bad, stations = info. */
function tintOf(kind: BuildingKind, p: Palette): string {
  switch (kind) {
    case 'pantry':
      return p.warn
    case 'pass':
      return p.good
    case 'bin':
      return p.bad
    case 'belt':
      return p.textFaint
    default:
      return p.info
  }
}

function drawFloor(ctx: CanvasRenderingContext2D, state: GameState, tile: number, p: Palette): void {
  ctx.fillStyle = p.surface
  ctx.fillRect(0, 0, state.width * tile, state.height * tile)
  ctx.fillStyle = p.surfaceRaised
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      if ((x + y) % 2 === 1) ctx.fillRect(x * tile, y * tile, tile, tile)
    }
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, dir: Dir, tile: number, color: string): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((dir * Math.PI) / 2)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -tile * 0.47)
  ctx.lineTo(tile * 0.1, -tile * 0.35)
  ctx.lineTo(-tile * 0.1, -tile * 0.35)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawBelt(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Dir, fast: boolean, stalled: boolean, tile: number, p: Palette): void {
  const cx = x * tile + tile / 2
  const cy = y * tile + tile / 2
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((dir * Math.PI) / 2)
  ctx.fillStyle = p.surfaceRaised
  ctx.strokeStyle = fast ? p.info : p.textFaint
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.rect(-tile * 0.36, -tile / 2, tile * 0.72, tile)
  ctx.fill()
  // Edge lines only (no end caps) so neighbouring belts read as one strip.
  ctx.beginPath()
  ctx.moveTo(-tile * 0.36, -tile / 2)
  ctx.lineTo(-tile * 0.36, tile / 2)
  ctx.moveTo(tile * 0.36, -tile / 2)
  ctx.lineTo(tile * 0.36, tile / 2)
  ctx.stroke()
  ctx.strokeStyle = p.textFaint
  ctx.lineWidth = Math.max(1.5, tile / 20)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const dy of [-0.3, 0.05, 0.4]) {
    ctx.beginPath()
    ctx.moveTo(-tile * 0.14, tile * (dy + 0.05))
    ctx.lineTo(0, tile * (dy - 0.05))
    ctx.lineTo(tile * 0.14, tile * (dy + 0.05))
    ctx.stroke()
  }
  ctx.restore()
  if (stalled) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x * tile, y * tile, tile, tile)
    ctx.clip()
    ctx.strokeStyle = p.bad
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let d = -tile; d < tile * 2; d += tile / 4) {
      ctx.moveTo(x * tile + d, y * tile + tile)
      ctx.lineTo(x * tile + d + tile, y * tile)
    }
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = p.text
    glyph(ctx, '⛔', x * tile + tile * 0.8, y * tile + tile * 0.2, tile * 0.28)
  }
}

function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tile: number, p: Palette): void {
  const r = tile * 0.16
  ctx.fillStyle = p.surface
  ctx.strokeStyle = p.text
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = p.text
  ctx.font = `bold ${Math.round(tile * 0.2)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y + 0.5)
}

const STATUS_GLYPH: Partial<Record<string, string>> = { noCash: '💸', blocked: '⛔', warming: '⏳', noRecipe: '❓' }

function drawStation(ctx: CanvasRenderingContext2D, state: GameState, defs: Defs, id: number, tile: number, p: Palette): void {
  const b = state.buildings[id]
  const tint = tintOf(b.kind, p)
  const tiles = footprint(b.kind, b.x, b.y, b.dir)
  for (const t of tiles) {
    const px = t.x * tile
    const py = t.y * tile
    roundRect(ctx, px + tile * 0.06, py + tile * 0.06, tile * 0.88, tile * 0.88, tile * 0.12)
    ctx.globalAlpha = 0.22
    ctx.fillStyle = tint
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = tint
    ctx.lineWidth = 2
    ctx.stroke()
  }
  const cx = b.x * tile + tile / 2
  const cy = b.y * tile + tile / 2
  ctx.fillStyle = p.text
  glyph(ctx, defs.buildings[b.kind].emoji, cx, cy, tile * 0.46)
  drawArrow(ctx, cx, cy, b.dir, tile, tint)
  const sg = STATUS_GLYPH[b.status]
  if (sg !== undefined && b.status !== 'blocked') glyph(ctx, sg, b.x * tile + tile * 0.8, b.y * tile + tile * 0.2, tile * 0.26)
  if (b.status === 'blocked' && b.kind !== 'pass' && b.kind !== 'bin') glyph(ctx, '⛔', b.x * tile + tile * 0.8, b.y * tile + tile * 0.2, tile * 0.26)
  // Items inside stations are a count, not moving shapes.
  let count = 0
  if (b.kind === 'pass') count = b.delivered
  else if (b.kind === 'chopper' || b.kind === 'fryer' || b.kind === 'stove') count = b.input.length + (b.output === null ? 0 : 1)
  else if (b.kind === 'splitter' || b.kind === 'merger' || b.kind === 'filter') count = b.buf === null ? 0 : 1
  else if (b.kind === 'assembler') count = Object.values(b.inputs).reduce((n, l) => n + l.length, 0) + (b.output === null ? 0 : 1)
  if (count > 0) badge(ctx, String(count), b.x * tile + tile * 0.2, b.y * tile + tile * 0.82, tile, p)
}

function isSpoiling(def: ItemDef | undefined, tick: number, bornTick: number): boolean {
  if (def?.spoilTicks === undefined) return false
  return tick - bornTick > (def.spoilTicks * 2) / 3
}

export function drawItem(ctx: CanvasRenderingContext2D, def: ItemDef | undefined, cx: number, cy: number, tile: number, spoiling: boolean, p: Palette): void {
  const r = tile * 0.2
  ctx.fillStyle = p.text
  ctx.strokeStyle = p.surface
  ctx.lineWidth = 1.5
  if (def?.kind === 'processed') {
    roundRect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.45)
  } else {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()
  if (def?.kind === 'dish') {
    ctx.strokeStyle = p.info
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = p.surface
  glyph(ctx, def?.emoji ?? '?', cx, cy + 0.5, r * 1.35)
  if (spoiling) glyph(ctx, '⚠️', cx + r, cy - r, tile * 0.22)
}

/** Draw the whole scene for one frame. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  defs: Defs,
  items: MotionItem[],
  tile: number,
  p: Palette,
): void {
  drawFloor(ctx, state, tile, p)
  const stations: number[] = []
  for (const b of Object.values(state.buildings)) {
    if (b.kind === 'belt') drawBelt(ctx, b.x, b.y, b.dir, b.fast, b.stalled, tile, p)
    else stations.push(b.id)
  }
  for (const id of stations) drawStation(ctx, state, defs, id, tile, p)
  for (const it of items) {
    const def = defs.items[it.type]
    drawItem(ctx, def, it.pos.x * tile, it.pos.y * tile, tile, isSpoiling(def, state.tick, it.bornTick), p)
  }
}
