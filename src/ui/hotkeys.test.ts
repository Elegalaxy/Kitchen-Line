// Tests for the hotkey mapping, palette contents and the action layer (store + ui store,
// no DOM).

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { createGame } from '../sim/game.ts'
import { beginDrag, confirmAction, endDrag, handleHotkey, moveCursor, rotateAction, removeAction, undoAction } from './actions.ts'
import type { Ctx } from './actions.ts'
import { indexForKey, interpretKey, labelForIndex } from './hotkeys.ts'
import { paletteKinds, paletteReason } from './palette.ts'
import { createStore } from './store.ts'
import { createUiStore } from './uiState.ts'

const key = (k: string, extra: Partial<Parameters<typeof interpretKey>[0]> = {}) =>
  interpretKey({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...extra })

describe('hotkey mapping', () => {
  it('1-9 then 0 map to palette indexes 0..9', () => {
    expect([...'1234567890'].map(indexForKey)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(indexForKey('a')).toBeNull()
    expect(indexForKey('12')).toBeNull()
    expect(Array.from({ length: 10 }, (_, i) => labelForIndex(i)).join('')).toBe('1234567890')
    expect(labelForIndex(10)).toBe('')
  })

  it('maps the action keys', () => {
    expect(key('3')).toEqual({ type: 'tool', index: 2 })
    expect(key('0')).toEqual({ type: 'tool', index: 9 })
    expect(key('r')).toEqual({ type: 'rotate' })
    expect(key('R')).toEqual({ type: 'rotate' })
    expect(key('x')).toEqual({ type: 'removeMode' })
    expect(key('Delete')).toEqual({ type: 'remove' })
    expect(key('Escape')).toEqual({ type: 'cancel' })
    expect(key('z', { ctrlKey: true })).toEqual({ type: 'undo' })
    expect(key('Z', { metaKey: true })).toEqual({ type: 'undo' })
    expect(key('ArrowLeft')).toEqual({ type: 'move', dx: -1, dy: 0 })
    expect(key('ArrowDown')).toEqual({ type: 'move', dx: 0, dy: 1 })
    expect(key('Enter')).toEqual({ type: 'confirm' })
  })

  it('ignores other keys, Ctrl+other and Alt combinations', () => {
    expect(key('q')).toBeNull()
    expect(key('r', { ctrlKey: true })).toBeNull()
    expect(key('1', { altKey: true })).toBeNull()
    expect(key('z', { ctrlKey: true, shiftKey: true })).toBeNull()
  })
})

describe('palette', () => {
  const state = createGame(DEFS, 'palette-test')

  it('lists the placeable buildings in DEFS order (10 with hotkeys, then the extra pass)', () => {
    const kinds = paletteKinds(DEFS)
    expect(kinds).toHaveLength(11)
    expect(kinds[0]).toBe('belt')
    expect(kinds[9]).toBe('bin')
    expect(kinds[10]).toBe('pass')
  })

  it('shows why a building is disabled', () => {
    expect(paletteReason(state, DEFS, 'belt')).toBeNull()
    expect(paletteReason({ ...state, money: 3999 }, DEFS, 'fryer')).toBe('Needs $40.00')
    expect(paletteReason({ ...state, money: 4000 }, DEFS, 'fryer')).toBeNull()
    expect(paletteReason(state, DEFS, 'pass')).toBe('Restaurant tier')
    expect(paletteReason({ ...state, tier: 'restaurant', money: 40000 }, DEFS, 'pass')).toBeNull()
  })
})

describe('actions', () => {
  const make = (): Ctx => ({
    store: createStore(DEFS, createGame(DEFS, 'actions-test'), { now: () => 0, setTimer: () => undefined }),
    ui: createUiStore({ setTimer: () => undefined }),
  })
  const count = (ctx: Ctx) => Object.keys(ctx.store.getState().buildings).length

  it('number hotkey picks a tool; the same key again leaves it', () => {
    const ctx = make()
    handleHotkey(ctx, { type: 'tool', index: 0 }, false)
    expect(ctx.ui.get().tool).toBe('belt')
    handleHotkey(ctx, { type: 'tool', index: 0 }, false)
    expect(ctx.ui.get().tool).toBeNull()
  })

  it('an unaffordable tool is refused with a toast giving the reason', () => {
    const ctx = make()
    const poor = createStore(DEFS, { ...createGame(DEFS, 'poor'), money: 100 }, { now: () => 0, setTimer: () => undefined })
    handleHotkey({ ...ctx, store: poor }, { type: 'tool', index: 7 }, false) // stove
    expect(ctx.ui.get().tool).toBeNull()
    expect(ctx.ui.get().toast?.text).toBe('Stove: Needs $60.00')
  })

  it('belt drag: one commit, 6 belts, $6.00, one undo entry, undo removes the whole path', () => {
    const ctx = make()
    const money = ctx.store.getState().money
    handleHotkey(ctx, { type: 'tool', index: 0 }, false)
    beginDrag(ctx, { x: 1, y: 4 })
    ctx.ui.setCursor({ x: 6, y: 4 }, false)
    expect(endDrag(ctx)).toBe(true)
    expect(count(ctx)).toBe(8)
    expect(ctx.store.getState().money).toBe(money - 600)
    expect(ctx.store.getSnapshot().undo).toEqual({ count: 1, label: 'Place Belt ×6' })
    undoAction(ctx)
    expect(count(ctx)).toBe(2)
    expect(ctx.store.getState().money).toBe(money)
    expect(ctx.ui.get().toast?.text).toBe('Undid: Place Belt ×6')
  })

  it('a rejected drag toasts the reason and places nothing', () => {
    const ctx = make()
    handleHotkey(ctx, { type: 'tool', index: 0 }, false)
    beginDrag(ctx, { x: 0, y: 2 })
    ctx.ui.setCursor({ x: 0, y: 2 }, false)
    expect(endDrag(ctx)).toBe(false)
    expect(ctx.ui.get().toast?.text).toBe('Tile is occupied')
    expect(ctx.store.getSnapshot().undo.count).toBe(0)
  })

  it('keyboard: arrows move the cursor, Enter places belts and advances, R rotates the ghost', () => {
    const ctx = make()
    handleHotkey(ctx, { type: 'tool', index: 0 }, true)
    moveCursor(ctx, 0, 0)
    ctx.ui.setCursor({ x: 1, y: 4 }, true)
    moveCursor(ctx, 1, 0)
    expect(ctx.ui.get().cursor).toEqual({ x: 2, y: 4 })
    confirmAction(ctx)
    expect(count(ctx)).toBe(3)
    expect(ctx.ui.get().cursor).toEqual({ x: 3, y: 4 })
    rotateAction(ctx)
    expect(ctx.ui.get().dir).toBe(2)
  })

  it('R rotates and Delete sells the selected building; Esc deselects', () => {
    const ctx = make()
    ctx.store.dispatch({ type: 'place', kind: 'bin', x: 3, y: 4, dir: 0 })
    const id = ctx.store.getState().tiles[4 * 8 + 3]
    ctx.ui.set({ selectedId: id })
    rotateAction(ctx)
    expect(ctx.store.getState().buildings[id!].dir).toBe(1)
    removeAction(ctx)
    expect(ctx.store.getState().buildings[id!]).toBeUndefined()
    expect(ctx.ui.get().selectedId).toBeNull()
  })

  it('selling the pass is rejected with a toast', () => {
    const ctx = make()
    ctx.ui.set({ tool: 'remove' })
    ctx.ui.setCursor({ x: 7, y: 2 }, true)
    confirmAction(ctx)
    expect(ctx.ui.get().toast?.text).toBe('The last pass cannot be removed')
  })
})
