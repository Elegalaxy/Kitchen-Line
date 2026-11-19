// Pure input helpers for the grid canvas (plan Step 5): pixel -> tile, the belt drag path,
// and the overlay (ghost, drag preview, selection, hover) that draw.ts paints each frame.
// Validity always comes from the sim (`canPlace`, `placeCost`), so the preview and the sim
// agree. No DOM and no React in here.

import { buildingAt, canPlace, footprint, inBounds, neighbor, placeCost, tileIndex } from '../../sim/grid.ts'
import type { PlaceCommand, Point } from '../../sim/grid.ts'
import type { BuildingKind, Defs, Dir, GameState, RejectReason } from '../../sim/types.ts'
import { formatMoney, reasonText } from '../format.ts'
import { tileTooltip } from '../tileInfo.ts'
import type { UiState } from '../uiState.ts'

/** Tile under a point given in canvas CSS pixels (the canvas is exactly the grid). */
export function tileAt(px: number, py: number, tile: number, cols: number, rows: number): Point | null {
  if (!(tile > 0) || !Number.isFinite(px) || !Number.isFinite(py)) return null
  const x = Math.floor(px / tile)
  const y = Math.floor(py / tile)
  return x < 0 || y < 0 || x >= cols || y >= rows ? null : { x, y }
}

export type DragPlan = {
  /** The full L-path, including occupied tiles, each with the facing it would get. */
  path: { x: number; y: number; dir: Dir; skipped: boolean }[]
  /** Place commands for the free tiles, in path order. */
  place: PlaceCommand[]
  skipped: Point[]
  /** Total cost in cents of `place`. */
  cost: number
  /** Why the drag cannot be committed as a whole, or null. */
  reason: RejectReason | null
}

function dirBetween(a: Point, b: Point): Dir {
  if (b.x > a.x) return 1
  if (b.x < a.x) return 3
  return b.y > a.y ? 2 : 0
}

/** Tiles of the L-path from `from` to `to`: horizontal first, then vertical. */
export function lPath(from: Point, to: Point): Point[] {
  const out: Point[] = [{ x: from.x, y: from.y }]
  const sx = Math.sign(to.x - from.x)
  for (let x = from.x + sx; sx !== 0 && x - sx !== to.x; x += sx) out.push({ x, y: from.y })
  const sy = Math.sign(to.y - from.y)
  for (let y = from.y + sy; sy !== 0 && y - sy !== to.y; y += sy) out.push({ x: to.x, y })
  return out
}

/**
 * Plan a belt drag: an L-path (horizontal first, then vertical). Each belt faces the next
 * tile; the last one keeps the previous step's direction (or `fallbackDir` for a single
 * tile). Occupied tiles are skipped. The drag is all-or-nothing: `reason` is set when
 * nothing can be placed or the total cannot be afforded.
 */
export function planBeltDrag(
  state: GameState,
  defs: Defs,
  from: Point,
  to: Point,
  fallbackDir: Dir,
  fast = false,
): DragPlan {
  const tiles = lPath(from, to).filter((t) => inBounds(state, t.x, t.y))
  const path: DragPlan['path'] = []
  for (let i = 0; i < tiles.length; i += 1) {
    const t = tiles[i]
    const dir: Dir =
      i + 1 < tiles.length ? dirBetween(t, tiles[i + 1]) : i > 0 ? dirBetween(tiles[i - 1], t) : fallbackDir
    path.push({ x: t.x, y: t.y, dir, skipped: state.tiles[tileIndex(state, t.x, t.y)] !== null })
  }
  const place: PlaceCommand[] = path
    .filter((p) => !p.skipped)
    .map((p) =>
      fast
        ? { type: 'place', kind: 'belt', x: p.x, y: p.y, dir: p.dir, config: { fast: true } }
        : { type: 'place', kind: 'belt', x: p.x, y: p.y, dir: p.dir },
    )
  const skipped = path.filter((p) => p.skipped).map((p) => ({ x: p.x, y: p.y }))
  const cost = place.reduce((sum, cmd) => sum + placeCost(defs, cmd), 0)
  let reason: RejectReason | null = null
  if (place.length === 0) reason = skipped.length > 0 ? 'occupied' : 'out of bounds'
  else {
    // Everything except money, checked on the first tile with unlimited funds.
    reason = canPlace({ ...state, money: Number.MAX_SAFE_INTEGER }, defs, place[0])
    if (reason === null && cost > state.money) reason = 'cannot afford'
  }
  return { path, place, skipped, cost, reason }
}

export type GhostPiece = {
  kind: BuildingKind
  /** Tiles it covers (an assembler covers 2). */
  tiles: Point[]
  dir: Dir
  /** ok = would be placed; bad = invalid; skip = occupied tile left alone in a drag. */
  status: 'ok' | 'bad' | 'skip'
}

export type Overlay = {
  ghosts: GhostPiece[]
  /** Text pill drawn next to the cursor: reason or cost. */
  label: { text: string; ok: boolean } | null
  /** Tiles of the selected building. */
  selection: Point[]
  /** Tiles of the building under the cursor (hover, or the sell target in remove mode). */
  hover: Point[] | null
  hoverBad: boolean
  /** Keyboard cursor tile (drawn so it can be seen). */
  keyCursor: Point | null
  /** The pointer is over something clickable. */
  clickable: boolean
  /** Item lines (name and freshness) for the tile under the cursor in select mode, or null. */
  tip: string[] | null
}

function footprintOf(state: GameState, id: number): Point[] {
  const b = state.buildings[id]
  return footprint(b.kind, b.x, b.y, b.dir)
}

export function computeOverlay(state: GameState, defs: Defs, ui: UiState): Overlay {
  const o: Overlay = { ghosts: [], label: null, selection: [], hover: null, hoverBad: false, keyCursor: null, clickable: false, tip: null }
  if (ui.selectedId !== null && state.buildings[ui.selectedId] !== undefined) o.selection = footprintOf(state, ui.selectedId)
  const c = ui.cursor
  if (c === null || !inBounds(state, c.x, c.y)) return o
  if (ui.cursorFromKeys) o.keyCursor = c
  const underId = buildingAt(state, c.x, c.y)

  if (ui.tool === null) {
    if (underId !== null) {
      o.hover = footprintOf(state, underId)
      o.clickable = true
      const lines = tileTooltip(state, defs, c.x, c.y)
      if (lines.length > 0) o.tip = lines
    }
    return o
  }
  if (ui.tool === 'remove') {
    if (underId !== null) {
      const b = state.buildings[underId]
      o.hover = footprintOf(state, underId)
      o.clickable = true
      if (b.kind === 'pass') {
        o.hoverBad = true
        o.label = { text: `✕ ${reasonText('pass cannot be removed')}`, ok: false }
      } else {
        o.hoverBad = false
        const def = defs.buildings[b.kind]
        const refund = b.kind === 'belt' && b.fast && def.fast !== undefined ? def.fast.cost : def.cost
        o.label = { text: `Sell +${formatMoney(refund)}`, ok: true }
      }
    }
    return o
  }

  const kind = ui.tool
  if (kind === 'belt' && ui.drag !== null) {
    const plan = planBeltDrag(state, defs, ui.drag.from, c, ui.dir, ui.fast)
    for (const p of plan.path) {
      o.ghosts.push({
        kind: 'belt',
        tiles: [{ x: p.x, y: p.y }],
        dir: p.dir,
        status: p.skipped ? 'skip' : plan.reason === null ? 'ok' : 'bad',
      })
    }
    const n = plan.place.length
    const skippedNote = plan.skipped.length > 0 ? ` (${plan.skipped.length} occupied skipped)` : ''
    if (plan.reason === null) {
      o.label = { text: `✓ ${n} ${ui.fast ? 'fast ' : ''}${n === 1 ? 'belt' : 'belts'} · ${formatMoney(plan.cost)}${skippedNote}`, ok: true }
    } else {
      const need = plan.reason === 'cannot afford' ? ` (${n} belts · ${formatMoney(plan.cost)})` : ''
      o.label = { text: `✕ ${reasonText(plan.reason)}${need}`, ok: false }
    }
    return o
  }

  const cmd: PlaceCommand =
    kind === 'belt' && ui.fast
      ? { type: 'place', kind, x: c.x, y: c.y, dir: ui.dir, config: { fast: true } }
      : { type: 'place', kind, x: c.x, y: c.y, dir: ui.dir }
  const reason = canPlace(state, defs, cmd)
  o.ghosts.push({ kind, tiles: footprint(kind, c.x, c.y, ui.dir), dir: ui.dir, status: reason === null ? 'ok' : 'bad' })
  o.label =
    reason === null
      ? { text: `✓ ${formatMoney(placeCost(defs, cmd))}`, ok: true }
      : { text: `✕ ${reasonText(reason)}`, ok: false }
  return o
}

/** Next tile in `dir` from `p`, or null when it falls off the grid. */
export function stepTile(state: GameState, p: Point, dir: Dir): Point | null {
  const n = neighbor(p.x, p.y, dir)
  return inBounds(state, n.x, n.y) ? n : null
}
