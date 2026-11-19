// Player actions shared by the mouse, touch and keyboard handlers (plan Step 5). Each one
// reads the stores, dispatches build commands and shows a toast when the sim rejects them.
// No DOM in here, so it is unit-tested with a plain game store and ui store.

import { buildingAt, inBounds } from '../sim/grid.ts'
import type { Point } from '../sim/grid.ts'
import type { CommandResult, Dir } from '../sim/types.ts'
import { planBeltDrag, stepTile } from './canvas/input.ts'
import { reasonText } from './format.ts'
import type { HotkeyAction } from './hotkeys.ts'
import { paletteKinds, paletteReason } from './palette.ts'
import type { GameStore } from './store.ts'
import type { Tool, UiStore } from './uiState.ts'

export type Ctx = { store: GameStore; ui: UiStore }

/** Toast the rejection (if any) and return whether the command went through. */
export function report(ctx: Ctx, result: CommandResult): boolean {
  if (result.ok) return true
  ctx.ui.showToast(reasonText(result.reason))
  return false
}

/**
 * Pick a tool; picking the active one again goes back to select mode. `fast` picks the fast
 * belt variant (the belt tool with fast belts); the belt and the fast belt are two entries,
 * so switching between them selects the other one instead of deselecting.
 */
export function selectTool(ctx: Ctx, tool: Tool, fast = false): void {
  const { ui, store } = ctx
  const useFast = tool === 'belt' && fast
  if (tool === ui.get().tool && useFast === ui.get().fast) {
    ui.set({ tool: null, drag: null })
    return
  }
  if (tool !== null && tool !== 'remove') {
    const why = paletteReason(store.getState(), store.defs, tool, useFast)
    if (why !== null) {
      const name = useFast ? 'Fast belt' : store.defs.buildings[tool].name
      ui.showToast(`${name}: ${why}`)
      return
    }
  }
  ui.set({ tool, drag: null, fast: useFast })
}

export function placeAt(ctx: Ctx, at: Point): boolean {
  const { ui, store } = ctx
  const tool = ui.get().tool
  if (tool === null || tool === 'remove') return false
  const cmd = { type: 'place' as const, kind: tool, x: at.x, y: at.y, dir: ui.get().dir }
  return report(ctx, store.dispatch(tool === 'belt' && ui.get().fast ? { ...cmd, config: { fast: true } } : cmd))
}

/** Sell the building covering `at`; clears the selection if it was selected. */
export function removeAt(ctx: Ctx, at: Point): boolean {
  const { ui, store } = ctx
  const state = store.getState()
  const id = buildingAt(state, at.x, at.y)
  if (id === null) {
    ui.showToast(reasonText('nothing there'))
    return false
  }
  const ok = report(ctx, store.dispatch({ type: 'remove', x: at.x, y: at.y }))
  if (ok && ui.get().selectedId === id) ui.set({ selectedId: null })
  return ok
}

export function selectAt(ctx: Ctx, at: Point): void {
  const id = buildingAt(ctx.store.getState(), at.x, at.y)
  ctx.ui.set({ selectedId: id === ctx.ui.get().selectedId ? null : id })
}

/** Click on a tile (not a belt drag): select, sell or place depending on the tool. */
export function primaryAt(ctx: Ctx, at: Point): void {
  const tool = ctx.ui.get().tool
  if (tool === null) selectAt(ctx, at)
  else if (tool === 'remove') removeAt(ctx, at)
  else placeAt(ctx, at)
}

export function beginDrag(ctx: Ctx, from: Point): void {
  ctx.ui.set({ drag: { from } })
}

/** Commit the belt drag as ONE action (one undo entry); all-or-nothing. */
export function endDrag(ctx: Ctx): boolean {
  const { ui, store } = ctx
  const drag = ui.get().drag
  const to = ui.get().cursor
  ui.set({ drag: null })
  if (drag === null || to === null) return false
  const plan = planBeltDrag(store.getState(), store.defs, drag.from, to, ui.get().dir, ui.get().fast)
  if (plan.reason !== null) {
    ui.showToast(reasonText(plan.reason))
    return false
  }
  const n = plan.place.length
  const name = ui.get().fast ? 'Fast Belt' : 'Belt'
  return report(ctx, store.dispatchGroup(plan.place, n === 1 ? `Place ${name}` : `Place ${name} ×${n}`))
}

/** The building R / Delete act on: the selection, else the one under the cursor. */
function targetBuilding(ctx: Ctx): { id: number; at: Point } | null {
  const state = ctx.store.getState()
  const { selectedId, cursor } = ctx.ui.get()
  if (selectedId !== null && state.buildings[selectedId] !== undefined) {
    const b = state.buildings[selectedId]
    return { id: b.id, at: { x: b.x, y: b.y } }
  }
  if (cursor !== null) {
    const id = buildingAt(state, cursor.x, cursor.y)
    if (id !== null) return { id, at: { x: state.buildings[id].x, y: state.buildings[id].y } }
  }
  return null
}

/** R: rotate the ghost while a tool is active, otherwise rotate the targeted building. */
export function rotateAction(ctx: Ctx): void {
  const { ui, store } = ctx
  const tool = ui.get().tool
  if (tool !== null && tool !== 'remove') {
    ui.set({ dir: ((ui.get().dir + 1) % 4) as Dir })
    return
  }
  const target = targetBuilding(ctx)
  if (target === null) {
    ui.showToast('Select a building to rotate')
    return
  }
  report(ctx, store.dispatch({ type: 'rotate', x: target.at.x, y: target.at.y }))
}

/** Delete: sell the selection, else the building under the cursor. */
export function removeAction(ctx: Ctx): void {
  const target = targetBuilding(ctx)
  if (target === null) {
    ctx.ui.showToast('Select a building to sell')
    return
  }
  removeAt(ctx, target.at)
}

export function undoAction(ctx: Ctx): void {
  const out = ctx.store.undo()
  if (out.ok) ctx.ui.showToast(`Undid: ${out.label}`, 'info')
  else if (out.reason === 'empty') ctx.ui.showToast('Nothing to undo')
  else ctx.ui.showToast(`Cannot undo ${out.label}: ${reasonText(out.reason)}`)
}

/** Esc: cancel the drag, else leave the tool, else deselect. */
export function cancelAction(ctx: Ctx): void {
  const s = ctx.ui.get()
  if (s.drag !== null) ctx.ui.set({ drag: null })
  else if (s.tool !== null) ctx.ui.set({ tool: null })
  else ctx.ui.set({ selectedId: null })
}

export function moveCursor(ctx: Ctx, dx: number, dy: number): void {
  const state = ctx.store.getState()
  const cur = ctx.ui.get().cursor ?? { x: Math.floor(state.width / 2) - dx, y: Math.floor(state.height / 2) - dy }
  const next = { x: Math.max(0, Math.min(state.width - 1, cur.x + dx)), y: Math.max(0, Math.min(state.height - 1, cur.y + dy)) }
  ctx.ui.setCursor(next, true)
}

/** Enter: place at the cursor, sell in remove mode, or select. Belts advance the cursor. */
export function confirmAction(ctx: Ctx): void {
  const { ui, store } = ctx
  const { cursor, tool, dir } = ui.get()
  if (cursor === null || !inBounds(store.getState(), cursor.x, cursor.y)) return
  if (tool === 'belt') {
    if (placeAt(ctx, cursor)) {
      const next = stepTile(store.getState(), cursor, dir)
      if (next !== null) ui.setCursor(next, true)
    }
    return
  }
  primaryAt(ctx, cursor)
}

/** Apply a mapped hotkey. `onGrid` is true when the grid canvas has focus (arrows, Enter). */
export function handleHotkey(ctx: Ctx, action: HotkeyAction, onGrid: boolean): boolean {
  switch (action.type) {
    case 'tool': {
      const kind = paletteKinds(ctx.store.defs)[action.index]
      if (kind === undefined) return false
      selectTool(ctx, kind)
      return true
    }
    case 'rotate':
      rotateAction(ctx)
      return true
    case 'removeMode':
      selectTool(ctx, 'remove')
      return true
    case 'remove':
      removeAction(ctx)
      return true
    case 'cancel':
      cancelAction(ctx)
      return true
    case 'undo':
      undoAction(ctx)
      return true
    case 'move':
      if (!onGrid) return false
      moveCursor(ctx, action.dx, action.dy)
      return true
    case 'confirm':
      if (!onGrid) return false
      confirmAction(ctx)
      return true
  }
}
