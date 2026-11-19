// Tests for the undo stack: inverses of place / remove / rotate / configure, hash equality
// after undo, the 50-entry cap, rejected inverses, all-or-nothing groups and the drag path.
// `nextId` and `events` are not rolled back by undo, so states are compared with those two
// fields normalised (everything else, including money and the grid, must hash equal).

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { applyCommand } from '../sim/commands.ts'
import { createGame } from '../sim/game.ts'
import { stateHash } from '../sim/hash.ts'
import type { Command, GameState } from '../sim/types.ts'
import { planBeltDrag } from './canvas/input.ts'
import { createStore } from './store.ts'
import { applyGroup, pushUndo, undoLast, UNDO_LIMIT } from './undo.ts'
import type { UndoEntry } from './undo.ts'

const hashOf = (s: GameState): string => stateHash({ ...s, nextId: 0, events: [] })
const fresh = (): GameState => createGame(DEFS, 'undo-test')
const noTimers = { now: () => 0, setTimer: () => undefined }
const makeStore = () => createStore(DEFS, fresh(), noTimers)

function run(state: GameState, cmd: Command): GameState {
  const out = applyCommand(state, DEFS, cmd)
  if (!out.result.ok) throw new Error(`rejected: ${out.result.reason}`)
  return out.state
}

describe('undo of a single command', () => {
  it('place: undo restores money and grid (hash equal)', () => {
    const store = makeStore()
    const before = store.getState()
    expect(store.dispatch({ type: 'place', kind: 'bin', x: 3, y: 4, dir: 0 }).ok).toBe(true)
    expect(store.getState().money).toBe(before.money - 500)
    expect(store.undo().ok).toBe(true)
    expect(store.getState().money).toBe(before.money)
    expect(store.getState().tiles).toEqual(before.tiles)
    expect(hashOf(store.getState())).toBe(hashOf(before))
  })

  it('remove: undo re-places the building with its facing and config', () => {
    const store = makeStore()
    store.dispatch({ type: 'place', kind: 'pantry', x: 2, y: 4, dir: 2, config: { ingredient: 'tomato', interval: 40 } })
    const placed = store.getState()
    expect(store.dispatch({ type: 'remove', x: 2, y: 4 }).ok).toBe(true)
    expect(store.getState().money).toBe(placed.money + 1000)
    expect(store.undo().ok).toBe(true)
    // The re-placed building gets a new id, so the hash cannot match; money and config do.
    expect(store.getState().money).toBe(placed.money)
    const b = Object.values(store.getState().buildings).find((x) => x.x === 2 && x.y === 4)
    expect(b).toMatchObject({ kind: 'pantry', dir: 2, ingredient: 'tomato', interval: 40 })
  })

  it('rotate: undo (three rotations) restores the facing', () => {
    const store = makeStore()
    store.dispatch({ type: 'place', kind: 'belt', x: 3, y: 3, dir: 1 })
    const placed = store.getState()
    expect(store.dispatch({ type: 'rotate', x: 3, y: 3 }).ok).toBe(true)
    expect(Object.values(store.getState().buildings).find((b) => b.x === 3 && b.y === 3)?.dir).toBe(2)
    expect(store.undo().ok).toBe(true)
    expect(hashOf(store.getState())).toBe(hashOf(placed))
  })

  it('rotate: an assembler (2 tiles) rotates back too', () => {
    const store = makeStore()
    store.dispatch({ type: 'place', kind: 'assembler', x: 3, y: 3, dir: 1 })
    const placed = store.getState()
    store.dispatch({ type: 'rotate', x: 3, y: 3 })
    expect(hashOf(store.getState())).not.toBe(hashOf(placed))
    expect(store.undo().ok).toBe(true)
    expect(hashOf(store.getState())).toBe(hashOf(placed))
  })

  it('configure: undo restores the previous value', () => {
    const store = makeStore()
    const before = store.getState()
    expect(store.dispatch({ type: 'configure', x: 0, y: 2, ingredient: 'lettuce', interval: 80 }).ok).toBe(true)
    expect(hashOf(store.getState())).not.toBe(hashOf(before))
    expect(store.undo().ok).toBe(true)
    expect(hashOf(store.getState())).toBe(hashOf(before))
  })

  it('configure: filter item and assembler recipe go back to null', () => {
    const store = makeStore()
    store.dispatch({ type: 'place', kind: 'filter', x: 3, y: 4, dir: 1 })
    store.dispatch({ type: 'place', kind: 'assembler', x: 3, y: 1, dir: 1 })
    const before = store.getState()
    expect(store.dispatch({ type: 'configure', x: 3, y: 4, filterItem: 'potato' }).ok).toBe(true)
    expect(store.dispatch({ type: 'configure', x: 3, y: 1, recipe: 'salad' }).ok).toBe(true)
    store.undo()
    store.undo()
    expect(hashOf(store.getState())).toBe(hashOf(before))
  })

  it('records one entry per build command and nothing for a rejected one', () => {
    const store = makeStore()
    expect(store.dispatch({ type: 'remove', x: 5, y: 5 }).ok).toBe(false)
    expect(store.getSnapshot().undo.count).toBe(0)
    store.dispatch({ type: 'place', kind: 'bin', x: 3, y: 4, dir: 0 })
    expect(store.getSnapshot().undo).toEqual({ count: 1, label: 'Place Bin' })
  })
})

describe('groups (drag-to-draw belts)', () => {
  it('a 6-tile drag is one action costing $6.00 and one undo entry; undo removes the whole path', () => {
    const store = makeStore()
    const before = store.getState()
    const plan = planBeltDrag(before, DEFS, { x: 1, y: 4 }, { x: 6, y: 4 }, 1)
    expect(plan.place).toHaveLength(6)
    expect(plan.cost).toBe(600)
    expect(store.dispatchGroup(plan.place, 'Place Belt ×6').ok).toBe(true)
    expect(store.getState().money).toBe(before.money - 600)
    expect(Object.keys(store.getState().buildings)).toHaveLength(Object.keys(before.buildings).length + 6)
    expect(store.getSnapshot().undo.count).toBe(1)
    expect(store.undo().ok).toBe(true)
    expect(store.getSnapshot().undo.count).toBe(0)
    expect(store.getState().money).toBe(before.money)
    expect(hashOf(store.getState())).toBe(hashOf(before))
  })

  it('is all-or-nothing: a rejected command in the group leaves the state untouched', () => {
    const state = fresh()
    const cmds: Command[] = [
      { type: 'place', kind: 'belt', x: 1, y: 4, dir: 1 },
      { type: 'place', kind: 'belt', x: 0, y: 2, dir: 1 }, // occupied by the pantry
    ]
    const out = applyGroup(state, DEFS, cmds)
    expect(out.ok).toBe(false)
    expect(out.state).toBe(state)
    if (!out.ok) expect(out.index).toBe(1)
  })

  it('cannot afford the whole path: nothing is placed and no undo entry is added', () => {
    const poor = { ...fresh(), money: 450 }
    const store = createStore(DEFS, poor, noTimers)
    const plan = planBeltDrag(poor, DEFS, { x: 1, y: 4 }, { x: 6, y: 4 }, 1)
    expect(plan.cost).toBe(600)
    expect(plan.reason).toBe('cannot afford')
    const res = store.dispatchGroup(plan.place, 'Place Belt ×6')
    expect(res).toMatchObject({ ok: false, reason: 'cannot afford' })
    expect(store.getState()).toBe(poor)
    expect(store.getSnapshot().undo.count).toBe(0)
  })
})

describe('stack', () => {
  const entry = (n: number): UndoEntry => ({ label: `e${n}`, inverse: [] })

  it('keeps at most 50 entries, dropping the oldest', () => {
    let stack: UndoEntry[] = []
    for (let i = 0; i < UNDO_LIMIT + 5; i += 1) stack = pushUndo(stack, entry(i))
    expect(stack).toHaveLength(UNDO_LIMIT)
    expect(stack[0].label).toBe('e5')
    expect(stack[stack.length - 1].label).toBe(`e${UNDO_LIMIT + 4}`)
  })

  it('undo on an empty stack reports "empty"', () => {
    const state = fresh()
    const out = undoLast(state, DEFS, [])
    expect(out).toMatchObject({ ok: false, reason: 'empty' })
    expect(out.state).toBe(state)
  })

  it('a rejected inverse (tile occupied) drops the entry and keeps the state', () => {
    let state = fresh()
    state = run(state, { type: 'place', kind: 'belt', x: 4, y: 4, dir: 1 })
    const stack: UndoEntry[] = [
      entry(0),
      { label: 'Sell Bin', inverse: [{ type: 'place', kind: 'bin', x: 4, y: 4, dir: 0 }] },
    ]
    const out = undoLast(state, DEFS, stack)
    expect(out).toMatchObject({ ok: false, reason: 'occupied', label: 'Sell Bin' })
    expect(out.state).toBe(state)
    expect(out.stack).toHaveLength(1)
  })

  it('a rejected inverse (cannot afford) drops the entry and keeps the state', () => {
    const state = { ...fresh(), money: 100 }
    const stack: UndoEntry[] = [
      { label: 'Sell Stove', inverse: [{ type: 'place', kind: 'stove', x: 4, y: 4, dir: 1 }] },
    ]
    const out = undoLast(state, DEFS, stack)
    expect(out).toMatchObject({ ok: false, reason: 'cannot afford' })
    expect(out.state).toBe(state)
    expect(out.stack).toHaveLength(0)
  })

  it('the store reports "empty" when there is nothing to undo', () => {
    const store = makeStore()
    expect(store.undo()).toMatchObject({ ok: false, reason: 'empty' })
  })
})
