// Undo (plan Step 5). The stack holds up to 50 entries; each entry is a list of inverse
// commands that undoes one player action (a drag of 6 belts is ONE entry):
//   setPantriesPaused -> configure each changed pantry back; place -> remove at the same tile; remove -> place with the same kind, dir and config;
//   rotate -> rotate x3; configure -> configure back to the previous values.
// Inverses are computed from the state BEFORE the command. A group of commands is applied
// all-or-nothing: if any command is rejected, the original state is kept. Undo pops the top
// entry; if its inverse is rejected (e.g. cannot afford to re-place) the entry is dropped and
// the rejection is returned so the UI can show a toast. Items that were inside a removed
// building are not restored (the sim counts them as destroyed waste).
// Undo is not time travel: ticks that passed in between are kept, and `nextId` / `events`
// are not rolled back (the tests compare states with those two fields normalised).

import { applyCommand } from '../sim/commands.ts'
import { buildingAt } from '../sim/grid.ts'
import type { Building, Command, ConfigFields, Defs, GameState, PlaceConfig, RejectReason, SimEvent } from '../sim/types.ts'

export const UNDO_LIMIT = 50

export type UndoEntry = { label: string; inverse: Command[] }

export type GroupResult =
  | { ok: true; state: GameState; inverse: Command[] }
  | { ok: false; state: GameState; reason: RejectReason; event: SimEvent; index: number }

/** Only these command types are undoable (build commands). */
export function isUndoable(cmd: Command): boolean {
  return (
    cmd.type === 'place' ||
    cmd.type === 'remove' ||
    cmd.type === 'rotate' ||
    cmd.type === 'configure' ||
    cmd.type === 'setPantriesPaused'
  )
}

function configOf(b: Building): PlaceConfig | undefined {
  switch (b.kind) {
    case 'belt':
      return b.fast ? { fast: true } : undefined
    case 'pantry':
      return { ingredient: b.ingredient, interval: b.interval, ...(b.paused === true ? { paused: true } : {}) }
    case 'filter':
      return { filterItem: b.filterItem }
    case 'assembler':
      return { recipe: b.recipe, ...(b.pro === true ? { pro: true } : {}) }
    case 'fryer':
    case 'stove':
      return b.pro === true ? { pro: true } : undefined
    default:
      return undefined
  }
}

function previousConfig(b: Building, cmd: Extract<Command, { type: 'configure' }>): ConfigFields {
  const prev: ConfigFields = {}
  if (b.kind === 'pantry') {
    if (cmd.ingredient !== undefined) prev.ingredient = b.ingredient
    if (cmd.interval !== undefined) prev.interval = b.interval
    if (cmd.paused !== undefined) prev.paused = b.paused === true
  }
  if (b.kind === 'filter' && cmd.filterItem !== undefined) prev.filterItem = b.filterItem
  if (b.kind === 'assembler' && cmd.recipe !== undefined) prev.recipe = b.recipe
  return prev
}

/** Inverse of `cmd` against `state` (the state before it runs), or null if it has none. */
export function inverseOf(state: GameState, cmd: Command): Command[] | null {
  if (cmd.type === 'place') return [{ type: 'remove', x: cmd.x, y: cmd.y }]
  if (cmd.type === 'setPantriesPaused') {
    // One configure per pantry whose state would change, so the whole bulk action is ONE undo entry.
    return Object.values(state.buildings).flatMap((b): Command[] =>
      b.kind === 'pantry' && (b.paused === true) !== cmd.paused
        ? [{ type: 'configure', x: b.x, y: b.y, paused: b.paused === true }]
        : [],
    )
  }
  if (cmd.type !== 'remove' && cmd.type !== 'rotate' && cmd.type !== 'configure') return null
  const id = buildingAt(state, cmd.x, cmd.y)
  const b = id === null ? undefined : state.buildings[id]
  if (b === undefined) return null
  if (cmd.type === 'remove') {
    const config = configOf(b)
    return [{ type: 'place', kind: b.kind, x: b.x, y: b.y, dir: b.dir, ...(config === undefined ? {} : { config }) }]
  }
  if (cmd.type === 'rotate') {
    const r: Command = { type: 'rotate', x: b.x, y: b.y }
    return [r, r, r]
  }
  const prev = previousConfig(b, cmd)
  if (Object.keys(prev).length === 0) return null
  return [{ type: 'configure', x: b.x, y: b.y, ...prev }]
}

/**
 * Apply commands in order, all-or-nothing. On success `inverse` undoes the whole group
 * (inverses of each command, in reverse order). On failure the original state is returned.
 */
export function applyGroup(state: GameState, defs: Defs, cmds: Command[]): GroupResult {
  let current = state
  const parts: Command[][] = []
  for (let index = 0; index < cmds.length; index += 1) {
    const cmd = cmds[index]
    const inv = inverseOf(current, cmd)
    const out = applyCommand(current, defs, cmd)
    if (!out.result.ok) return { ok: false, state, reason: out.result.reason, event: out.result.event, index }
    current = out.state
    if (inv !== null) parts.push(inv)
  }
  return { ok: true, state: current, inverse: parts.reverse().flat() }
}

/** New stack with `entry` on top, oldest entries dropped beyond UNDO_LIMIT. */
export function pushUndo(stack: readonly UndoEntry[], entry: UndoEntry): UndoEntry[] {
  const next = [...stack, entry]
  return next.length > UNDO_LIMIT ? next.slice(next.length - UNDO_LIMIT) : next
}

export type UndoOutcome =
  | { ok: true; state: GameState; stack: UndoEntry[]; label: string }
  | { ok: false; state: GameState; stack: UndoEntry[]; reason: RejectReason | 'empty'; label: string }

/** Pop the top entry and apply its inverse. A rejected inverse drops the entry. */
export function undoLast(state: GameState, defs: Defs, stack: readonly UndoEntry[]): UndoOutcome {
  if (stack.length === 0) return { ok: false, state, stack: [], reason: 'empty', label: '' }
  const entry = stack[stack.length - 1]
  const rest = stack.slice(0, -1)
  const out = applyGroup(state, defs, entry.inverse)
  if (!out.ok) return { ok: false, state, stack: rest, reason: out.reason, label: entry.label }
  return { ok: true, state: out.state, stack: rest, label: entry.label }
}

/** Short label for the Undo button, e.g. "Place Belt". Computed against the state before `cmd`. */
export function labelFor(state: GameState, defs: Defs, cmd: Command): string {
  if (cmd.type === 'place') return `Place ${defs.buildings[cmd.kind]?.name ?? cmd.kind}`
  if (cmd.type === 'setPantriesPaused') return cmd.paused ? 'Pause pantries' : 'Resume pantries'
  if (cmd.type !== 'remove' && cmd.type !== 'rotate' && cmd.type !== 'configure') return cmd.type
  const id = buildingAt(state, cmd.x, cmd.y)
  const name = id === null ? '' : (defs.buildings[state.buildings[id].kind]?.name ?? '')
  const verb = cmd.type === 'remove' ? 'Sell' : cmd.type === 'rotate' ? 'Rotate' : 'Configure'
  return `${verb} ${name}`.trim()
}
