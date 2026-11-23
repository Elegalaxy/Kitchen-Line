// Canvas 2D scene drawing (plan Step 4, shape encoding from 2.6). Pure drawing: it takes
// the state, the item positions from itemMotion and a palette read from the CSS tokens.
// Coordinates: one tile = `tile` CSS pixels; the canvas is exactly the grid.
// Shape encoding (never colour alone): raw = circle, processed = rounded square,
// dish = circle with a plate ring, spoiling = warning badge. Stalled belt = hatching + no-entry glyph.

import { ASSEMBLER_TICKS } from '../../sim/constants.ts'
import { buildingAt, footprint, neighbor } from '../../sim/grid.ts'
import { isPro, stationTicks } from '../../sim/stations.ts'
import { buildingItems } from '../../sim/spoil.ts'
import type { Building, BuildingKind, Defs, Dir, GameState, ItemDef } from '../../sim/types.ts'
import type { HintTile } from '../tutorial.ts'
import type { Overlay } from './input.ts'
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
  focus: string
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
    focus: v('--focus'),
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

function drawArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, dir: Dir, tile: number, color: string, big = false): void {
  const w = big ? 0.17 : 0.1
  const base = big ? 0.28 : 0.35
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((dir * Math.PI) / 2)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -tile * 0.47)
  ctx.lineTo(tile * w, -tile * base)
  ctx.lineTo(-tile * w, -tile * base)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** Small arrow at a tile edge: `side` is the edge (from the tile centre); `outward` points it away from the tile. */
function drawEdgeArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, side: Dir, outward: boolean, tile: number, color: string): void {
  const ux = [0, 1, 0, -1][side] ?? 0
  const uy = [-1, 0, 1, 0][side] ?? 0
  if (outward) drawArrow(ctx, cx, cy, side, tile, color)
  else drawArrow(ctx, cx + ux * tile * 0.85, cy + uy * tile * 0.85, ((side + 2) % 4) as Dir, tile, color)
}

/**
 * Exits and entrances of the routing buildings (arrows beside the glyph, so the shape
 * differs even without colour): splitter = in from the back, out left and right (no front arrow), merger = in from left,
 * right and back, filter = out left (with the chosen item's emoji, or a dash) plus the
 * main front arrow.
 */
function drawRouting(ctx: CanvasRenderingContext2D, b: Building, defs: Defs, cx: number, cy: number, tile: number, color: string): void {
  if (b.kind !== 'splitter' && b.kind !== 'merger' && b.kind !== 'filter') return
  const left = ((b.dir + 3) % 4) as Dir
  const right = ((b.dir + 1) % 4) as Dir
  const back = ((b.dir + 2) % 4) as Dir
  if (b.kind === 'splitter') {
    drawEdgeArrow(ctx, cx, cy, left, true, tile, color)
    drawEdgeArrow(ctx, cx, cy, right, true, tile, color)
    drawEdgeArrow(ctx, cx, cy, back, false, tile, color) // the one input
  } else if (b.kind === 'merger') {
    for (const side of [left, right, back]) drawEdgeArrow(ctx, cx, cy, side, false, tile, color)
  } else {
    drawEdgeArrow(ctx, cx, cy, left, true, tile, color)
    const ux = [0, 1, 0, -1][left] ?? 0
    const uy = [-1, 0, 1, 0][left] ?? 0
    const item = b.filterItem === null ? undefined : defs.items[b.filterItem]
    ctx.fillStyle = color
    if (item === undefined) {
      ctx.font = `bold ${Math.round(tile * 0.2)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('–', cx + ux * tile * 0.3, cy + uy * tile * 0.3)
    } else {
      glyph(ctx, item.emoji, cx + ux * tile * 0.3, cy + uy * tile * 0.3, tile * 0.22)
    }
  }
}

/** -1 / +1 when this belt turns a corner (fed only from its left / right), else 0. */
function beltBend(state: GameState, x: number, y: number, dir: Dir): -1 | 0 | 1 {
  const feeds = (side: Dir): boolean => {
    const n = neighbor(x, y, side)
    const id = buildingAt(state, n.x, n.y)
    const nb = id === null ? undefined : state.buildings[id]
    return nb !== undefined && nb.kind === 'belt' && nb.dir === (((side + 2) % 4) as Dir)
  }
  if (feeds(((dir + 2) % 4) as Dir)) return 0
  const left = feeds(((dir + 3) % 4) as Dir)
  const right = feeds(((dir + 1) % 4) as Dir)
  if (left === right) return 0
  return left ? -1 : 1
}

function drawBelt(ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number, dir: Dir, fast: boolean, stalled: boolean, tile: number, p: Palette): void {
  const cx = x * tile + tile / 2
  const cy = y * tile + tile / 2
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((dir * Math.PI) / 2)
  const bend = beltBend(state, x, y, dir)
  ctx.fillStyle = p.surfaceRaised
  ctx.strokeStyle = fast ? p.info : p.textFaint
  ctx.lineWidth = 1.5
  if (bend !== 0) {
    // Corner: a quarter ring around the tile corner between the entry side and the front.
    ctx.scale(bend === -1 ? 1 : -1, 1)
    const rIn = tile * 0.14
    const rOut = tile * 0.86
    ctx.beginPath()
    ctx.arc(-tile / 2, -tile / 2, rOut, 0, Math.PI / 2)
    ctx.arc(-tile / 2, -tile / 2, rIn, Math.PI / 2, 0, true)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.arc(-tile / 2, -tile / 2, rOut, 0, Math.PI / 2)
    ctx.moveTo(-tile / 2 + rIn, -tile / 2)
    ctx.arc(-tile / 2, -tile / 2, rIn, 0, Math.PI / 2)
    ctx.stroke()
    // Arrow chevron at the middle of the arc, pointing along the turn.
    ctx.strokeStyle = p.textFaint
    ctx.lineWidth = Math.max(1.5, tile / 20)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const mid = Math.PI / 4
    const r = tile * 0.5
    const mx = -tile / 2 + r * Math.cos(mid)
    const my = -tile / 2 + r * Math.sin(mid)
    ctx.beginPath()
    ctx.moveTo(mx + tile * 0.1, my + tile * 0.02)
    ctx.lineTo(mx, my - tile * 0.07)
    ctx.lineTo(mx - tile * 0.02, my + tile * 0.1)
    ctx.stroke()
    ctx.restore()
    if (stalled) drawStall(ctx, x, y, tile, p)
    return
  }
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
  if (stalled) drawStall(ctx, x, y, tile, p)
}

function drawStall(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number, p: Palette): void {
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

/** Status badges (glyph plus colour, never colour alone): idle muted, blocked bad, warming info, no cash warn. */
function statusBadge(status: string, p: Palette): { glyph: string; color: string } | null {
  switch (status) {
    case 'idle':
      return { glyph: '⏸', color: p.textMuted }
    case 'blocked':
      return { glyph: '⛔', color: p.bad }
    case 'warming':
      return { glyph: '⏳', color: p.info }
    case 'noCash':
      return { glyph: '$', color: p.warn }
    case 'noRecipe':
      return { glyph: '❓', color: p.warn }
    case 'paused':
      return { glyph: '⏸', color: p.info }
    default:
      return null
  }
}

function drawStatusBadge(ctx: CanvasRenderingContext2D, status: string, x: number, y: number, tile: number, p: Palette): void {
  const sb = statusBadge(status, p)
  if (sb === null) return
  const cx = x * tile + tile * 0.8
  const cy = y * tile + tile * 0.2
  ctx.fillStyle = p.surface
  ctx.strokeStyle = sb.color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, tile * 0.17, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = sb.color
  if (sb.glyph === '$') {
    ctx.font = `bold ${Math.round(tile * 0.24)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(sb.glyph, cx, cy + 0.5)
  } else {
    glyph(ctx, sb.glyph, cx, cy + 0.5, tile * 0.2)
  }
}

/** Thin progress bar along the bottom of a processing station (progress counts up from 0). */
function drawProgress(ctx: CanvasRenderingContext2D, b: Building, defs: Defs, tile: number, p: Palette): void {
  let ticks: number | undefined
  if (b.kind === 'chopper' || b.kind === 'fryer' || b.kind === 'stove') {
    const first = b.input[0]
    const base = first === undefined ? undefined : defs.stationRecipes.find((r) => r.station === b.kind && r.input === first.type)?.ticks
    ticks = base === undefined ? undefined : stationTicks(base, isPro(b))
  } else if (b.kind === 'assembler') {
    ticks = stationTicks(ASSEMBLER_TICKS, isPro(b))
  }
  if (ticks === undefined || b.kind === 'belt' || !('progress' in b) || b.progress <= 0) return
  const w = tile * 0.7
  const x = b.x * tile + (tile - w) / 2
  const y = b.y * tile + tile * 0.88
  ctx.fillStyle = p.surface
  ctx.fillRect(x, y, w, tile * 0.07)
  ctx.fillStyle = p.good
  ctx.fillRect(x, y, w * Math.min(1, b.progress / ticks), tile * 0.07)
}

/**
 * Assembler input pips on the second tile: one column per recipe input with the ingredient
 * emoji above a pip. Filled disc = held (at least 1), hollow dashed ring = missing, so the
 * state is readable without colour. The chosen dish shows in the anchor's lower right.
 */
function drawAssemblerPips(ctx: CanvasRenderingContext2D, b: Building, defs: Defs, tile: number, p: Palette): void {
  if (b.kind !== 'assembler' || b.recipe === null) return
  const dish = defs.dishes[b.recipe]
  const inputs = dish?.inputs
  if (dish === undefined || inputs === undefined) return
  ctx.fillStyle = p.text
  glyph(ctx, dish.emoji, b.x * tile + tile * 0.8, b.y * tile + tile * 0.78, tile * 0.26)
  const second = footprint(b.kind, b.x, b.y, b.dir)[1]
  if (second === undefined) return
  const gap = tile * 0.3
  const startX = second.x * tile + tile / 2 - (gap * (inputs.length - 1)) / 2
  inputs.forEach((type, i) => {
    const cx = startX + gap * i
    const held = (b.inputs[type]?.length ?? 0) > 0
    ctx.fillStyle = p.text
    glyph(ctx, defs.items[type]?.emoji ?? '?', cx, second.y * tile + tile * 0.34, tile * 0.22)
    const cy = second.y * tile + tile * 0.7
    ctx.beginPath()
    ctx.arc(cx, cy, tile * 0.09, 0, Math.PI * 2)
    if (held) {
      ctx.fillStyle = p.good
      ctx.fill()
      ctx.strokeStyle = p.text
      ctx.setLineDash([])
    } else {
      ctx.strokeStyle = p.textMuted
      ctx.setLineDash([tile * 0.04, tile * 0.04])
    }
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.setLineDash([])
  })
}

/** Pro stations: a second, inner outline plus a "PRO" tag in the top-left corner (a shape and a word, not only a colour). */
function drawProMark(ctx: CanvasRenderingContext2D, x: number, y: number, tiles: { x: number; y: number }[], tile: number, p: Palette): void {
  for (const t of tiles) {
    roundRect(ctx, t.x * tile + tile * 0.14, t.y * tile + tile * 0.14, tile * 0.72, tile * 0.72, tile * 0.08)
    ctx.strokeStyle = p.info
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  const w = tile * 0.44
  const h = tile * 0.2
  roundRect(ctx, x * tile + tile * 0.08, y * tile + tile * 0.08, w, h, tile * 0.05)
  ctx.fillStyle = p.surface
  ctx.fill()
  ctx.strokeStyle = p.info
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = p.info
  ctx.font = `bold ${Math.round(tile * 0.15)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('PRO', x * tile + tile * 0.08 + w / 2, y * tile + tile * 0.08 + h / 2 + 0.5)
}

function drawStation(ctx: CanvasRenderingContext2D, state: GameState, defs: Defs, id: number, tile: number, p: Palette, fx?: Fx): void {
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
  if (isPro(b)) drawProMark(ctx, b.x, b.y, tiles, tile, p)
  const cx = b.x * tile + tile / 2
  const cy = b.y * tile + tile / 2
  ctx.fillStyle = p.text
  glyph(ctx, defs.buildings[b.kind].emoji, cx, cy, tile * 0.46)
  // A splitter has no front output (it exits left and right), so no front arrow there.
  if (b.kind !== 'splitter') drawArrow(ctx, cx, cy, b.dir, tile, tint, true)
  drawRouting(ctx, b, defs, cx, cy, tile, tint)
  // The pass and bin flip status every tick (idle between deliveries), so they get no badge.
  if (b.kind !== 'pass' && b.kind !== 'bin') drawStatusBadge(ctx, b.status, b.x, b.y, tile, p)
  drawProgress(ctx, b, defs, tile, p)
  drawAssemblerPips(ctx, b, defs, tile, p)
  // Items inside stations are a count, not moving shapes.
  let count = 0
  if (b.kind === 'pass') count = b.delivered
  else if (b.kind === 'chopper' || b.kind === 'fryer' || b.kind === 'stove') count = b.input.length + (b.output === null ? 0 : 1)
  else if (b.kind === 'splitter' || b.kind === 'merger' || b.kind === 'filter') count = b.buf === null ? 0 : 1
  else if (b.kind === 'assembler') count = Object.values(b.inputs).reduce((n, l) => n + l.length, 0) + (b.output === null ? 0 : 1)
  if (count > 0) badge(ctx, String(count), b.x * tile + tile * 0.2, b.y * tile + tile * 0.82, tile, p)
  // A held item in the last third of its shelf life: warning badge plus pulsing outline.
  if (buildingItems(b).some((i) => isSpoiling(defs.items[i.type], state.tick, i.bornTick))) {
    ctx.save()
    ctx.globalAlpha = pulseAlpha(fx)
    outlineTiles(ctx, tiles, tile, p.warn, 3)
    ctx.restore()
    ctx.fillStyle = p.text
    glyph(ctx, '⚠️', b.x * tile + tile * 0.82, b.y * tile + tile * 0.2, tile * 0.24)
  }
}

function isSpoiling(def: ItemDef | undefined, tick: number, bornTick: number): boolean {
  if (def?.spoilTicks === undefined) return false
  return tick - bornTick > (def.spoilTicks * 2) / 3
}

/** Per-frame effects state (UI only). `now` is a millisecond clock; puffs are brief 🗑 marks. */
export type Fx = { now: number; reducedMotion: boolean; puffs: Puff[] }
export type Puff = { x: number; y: number; start: number }
export const PUFF_MS = 600

/** Warn outline alpha: pulses unless the user prefers reduced motion (then steady). */
function pulseAlpha(fx: Fx | undefined): number {
  if (fx === undefined || fx.reducedMotion) return 1
  return 0.55 + 0.45 * Math.sin((fx.now / 1000) * Math.PI * 2 * 1.2)
}

export function drawItem(ctx: CanvasRenderingContext2D, def: ItemDef | undefined, cx: number, cy: number, tile: number, spoiling: boolean, p: Palette, fx?: Fx): void {
  const r = tile * 0.2
  if (spoiling) {
    ctx.save()
    ctx.globalAlpha = pulseAlpha(fx)
    ctx.strokeStyle = p.warn
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
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

function outlineTiles(ctx: CanvasRenderingContext2D, tiles: { x: number; y: number }[], tile: number, color: string, width: number, dash: number[] = []): void {
  strokeTiles(ctx, tiles, tile, color, width, dash, 0)
}

function strokeTiles(ctx: CanvasRenderingContext2D, tiles: { x: number; y: number }[], tile: number, color: string, width: number, dash: number[], fillAlpha: number): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dash)
  for (const t of tiles) {
    roundRect(ctx, t.x * tile + 2, t.y * tile + 2, tile - 4, tile - 4, tile * 0.1)
    if (fillAlpha > 0) {
      ctx.globalAlpha = fillAlpha
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** Text pill next to the cursor tile, kept inside the canvas. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, ok: boolean, at: { x: number; y: number }, tile: number, cols: number, rows: number, p: Palette): void {
  ctx.save()
  ctx.font = 'bold 13px system-ui, sans-serif'
  const padX = 8
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2
  const h = 24
  const maxX = cols * tile
  const maxY = rows * tile
  let x = (at.x + 1) * tile + 4
  if (x + w > maxX) x = at.x * tile - w - 4
  x = Math.max(2, Math.min(maxX - w - 2, x))
  let y = at.y * tile - h - 2
  if (y < 2) y = (at.y + 1) * tile + 2
  y = Math.max(2, Math.min(maxY - h - 2, y))
  ctx.fillStyle = p.surface
  ctx.strokeStyle = ok ? p.good : p.bad
  ctx.lineWidth = 1.5
  roundRect(ctx, x, y, w, h, 6)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = p.text
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + padX, y + h / 2 + 0.5)
  ctx.restore()
}

/** Multi-line item tooltip (name and freshness per item) next to the hovered tile. */
function drawTip(ctx: CanvasRenderingContext2D, lines: string[], at: { x: number; y: number }, tile: number, cols: number, rows: number, p: Palette): void {
  ctx.save()
  ctx.font = '13px system-ui, sans-serif'
  const padX = 8
  const lineH = 18
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + padX * 2
  const h = lines.length * lineH + 8
  const maxX = cols * tile
  const maxY = rows * tile
  let x = (at.x + 1) * tile + 4
  if (x + w > maxX) x = at.x * tile - w - 4
  x = Math.max(2, Math.min(maxX - w - 2, x))
  let y = at.y * tile - h - 2
  if (y < 2) y = (at.y + 1) * tile + 2
  y = Math.max(2, Math.min(maxY - h - 2, y))
  ctx.fillStyle = p.surface
  ctx.strokeStyle = p.textFaint
  ctx.lineWidth = 1.5
  roundRect(ctx, x, y, w, h, 6)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = p.text
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  lines.forEach((l, i) => ctx.fillText(l, x + padX, y + 4 + lineH * i + lineH / 2 + 0.5))
  ctx.restore()
}

/**
 * Faint tutorial hint tiles (plan Step 18): a dashed outline, the building glyph and a small
 * "hint" tag, drawn under the overlay. Drawing only: they never take pointer input.
 */
export function drawHints(ctx: CanvasRenderingContext2D, hints: HintTile[], defs: Defs, tile: number, p: Palette, now: number, reducedMotion: boolean): void {
  if (hints.length === 0) return
  const pulse = reducedMotion ? 0.7 : 0.55 + 0.25 * Math.sin(now / 450)
  for (const h of hints) {
    const tiles = footprint(h.kind, h.x, h.y, h.dir)
    const cx = h.x * tile + tile / 2
    const cy = h.y * tile + tile / 2
    ctx.save()
    ctx.fillStyle = p.info
    ctx.globalAlpha = pulse * 0.18
    for (const t of tiles) ctx.fillRect(t.x * tile + 2, t.y * tile + 2, tile - 4, tile - 4)
    ctx.globalAlpha = pulse
    outlineTiles(ctx, tiles, tile, p.info, 2, [6, 4])
    ctx.fillStyle = p.text
    if (h.kind !== 'belt') glyph(ctx, defs.buildings[h.kind].emoji, cx, cy, tile * 0.46)
    drawArrow(ctx, cx, cy, h.dir, tile, p.info)
    ctx.restore()
  }
}

/** Ghost, drag preview, selection, hover and keyboard cursor, drawn over the scene. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  o: Overlay,
  defs: Defs,
  cursor: { x: number; y: number } | null,
  tile: number,
  cols: number,
  rows: number,
  p: Palette,
): void {
  if (o.hover !== null) outlineTiles(ctx, o.hover, tile, o.hoverBad ? p.bad : p.text, 2)
  if (o.selection.length > 0) strokeTiles(ctx, o.selection, tile, p.focus, 3, [], 0.12)
  for (const g of o.ghosts) {
    const color = g.status === 'ok' ? p.good : g.status === 'bad' ? p.bad : p.textFaint
    strokeTiles(ctx, g.tiles, tile, color, 2.5, g.status === 'skip' ? [5, 4] : [], g.status === 'skip' ? 0.05 : 0.2)
    const a = g.tiles[0]
    const cx = a.x * tile + tile / 2
    const cy = a.y * tile + tile / 2
    ctx.save()
    ctx.globalAlpha = g.status === 'skip' ? 0.35 : 0.8
    ctx.fillStyle = p.text
    if (g.kind !== 'belt') glyph(ctx, defs.buildings[g.kind].emoji, cx, cy, tile * 0.46)
    drawArrow(ctx, cx, cy, g.dir, tile, color)
    if (g.kind === 'belt') {
      ctx.strokeStyle = color
      ctx.lineWidth = Math.max(2, tile / 14)
      ctx.lineCap = 'round'
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate((g.dir * Math.PI) / 2)
      ctx.beginPath()
      ctx.moveTo(0, tile * 0.2)
      ctx.lineTo(0, -tile * 0.2)
      ctx.moveTo(-tile * 0.12, -tile * 0.08)
      ctx.lineTo(0, -tile * 0.22)
      ctx.lineTo(tile * 0.12, -tile * 0.08)
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
    if (g.status !== 'skip') {
      ctx.fillStyle = color
      glyph(ctx, g.status === 'ok' ? '✓' : '✕', a.x * tile + tile * 0.8, a.y * tile + tile * 0.2, tile * 0.3)
    }
  }
  if (o.keyCursor !== null) outlineTiles(ctx, [o.keyCursor], tile, p.focus, 2, [4, 3])
  if (o.tip !== null && cursor !== null) drawTip(ctx, o.tip, cursor, tile, cols, rows, p)
  if (o.label !== null && cursor !== null) drawLabel(ctx, o.label.text, o.label.ok, cursor, tile, cols, rows, p)
}

/** Draw the whole scene for one frame. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  defs: Defs,
  items: MotionItem[],
  tile: number,
  p: Palette,
  fx?: Fx,
): void {
  drawFloor(ctx, state, tile, p)
  const stations: number[] = []
  for (const b of Object.values(state.buildings)) {
    if (b.kind === 'belt') drawBelt(ctx, state, b.x, b.y, b.dir, b.fast, b.stalled, tile, p)
    else stations.push(b.id)
  }
  for (const id of stations) drawStation(ctx, state, defs, id, tile, p, fx)
  for (const it of items) {
    const def = defs.items[it.type]
    drawItem(ctx, def, it.pos.x * tile, it.pos.y * tile, tile, isSpoiling(def, state.tick, it.bornTick), p, fx)
  }
  if (fx !== undefined) drawPuffs(ctx, fx, tile)
}

/** A 🗑 that rises and fades over PUFF_MS at the tile where an item spoiled. */
function drawPuffs(ctx: CanvasRenderingContext2D, fx: Fx, tile: number): void {
  for (const pf of fx.puffs) {
    const t = (fx.now - pf.start) / PUFF_MS
    if (t < 0 || t >= 1) continue
    ctx.save()
    ctx.globalAlpha = 1 - t
    const rise = fx.reducedMotion ? 0 : t * tile * 0.35
    glyph(ctx, '🗑️', pf.x * tile + tile / 2, pf.y * tile + tile * 0.4 - rise, tile * (fx.reducedMotion ? 0.5 : 0.4 + 0.2 * t))
    ctx.restore()
  }
}
