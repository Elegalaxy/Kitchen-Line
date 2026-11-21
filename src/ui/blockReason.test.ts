// Tests for the Inspector "Why" text: each stuck case names its real cause.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { applyCommand } from '../sim/commands.ts'
import { createGame } from '../sim/game.ts'
import { runTicks } from '../sim/tick.ts'
import type { Building, Command, GameState } from '../sim/types.ts'
import { blockReason } from './blockReason.ts'

function build(cmds: Command[]): GameState {
  let s = createGame(DEFS, 'why')
  for (const c of cmds) s = applyCommand(s, DEFS, c).state
  return s
}

function at(s: GameState, x: number, y: number): Building {
  const b = Object.values(s.buildings).find((v) => v.x === x && v.y === y)
  if (b === undefined) throw new Error(`no building at ${x},${y}`)
  return b
}

/** Open for service and run long enough for the pantry's first items to jam. */
function run(s: GameState): GameState {
  const open = applyCommand(s, DEFS, { type: 'openService' }).state
  return runTicks(open, DEFS, 300)
}

describe('blockReason', () => {
  it('a pantry facing an empty tile says nothing is there', () => {
    const s = run(build([{ type: 'place', kind: 'pantry', x: 1, y: 2, dir: 1 }]))
    const p = at(s, 1, 2)
    expect(p.status).toBe('blocked')
    expect(blockReason(s, DEFS, p)).toMatch(/nothing is on the tile it faces/)
  })

  it('a pantry feeding a station that faces back says it does not take items from its front', () => {
    const s = run(
      build([
        { type: 'place', kind: 'pantry', x: 1, y: 2, dir: 1 },
        { type: 'place', kind: 'chopper', x: 2, y: 2, dir: 3 },
      ]),
    )
    const reason = blockReason(s, DEFS, at(s, 1, 2))
    expect(reason).toMatch(/faces back at it/)
  })

  it('a chopper whose output faces an empty tile says so, and a pantry behind it says the chopper is busy', () => {
    const s = run(
      build([
        { type: 'place', kind: 'pantry', x: 1, y: 2, dir: 1 },
        { type: 'place', kind: 'chopper', x: 2, y: 2, dir: 1 },
      ]),
    )
    expect(blockReason(s, DEFS, at(s, 2, 2))).toMatch(/nothing is on the tile it faces/)
    expect(blockReason(s, DEFS, at(s, 1, 2))).toMatch(/busy and its input is full/)
  })

  it('a splitter with no exits explains that it never pushes forward', () => {
    const s = run(
      build([
        { type: 'place', kind: 'pantry', x: 1, y: 2, dir: 1 },
        { type: 'place', kind: 'splitter', x: 2, y: 2, dir: 1 },
      ]),
    )
    expect(blockReason(s, DEFS, at(s, 2, 2))).toMatch(/never pushes forward/)
  })

  it('a working building has no reason', () => {
    const s = build([{ type: 'place', kind: 'pantry', x: 1, y: 2, dir: 1 }])
    expect(blockReason(s, DEFS, at(s, 1, 2))).toBeNull()
  })
})

describe('blockReason for a paused pantry', () => {
  it('says the player paused it and how to resume', () => {
    const s = run(build([{ type: 'setPantriesPaused', paused: true }]))
    const p = Object.values(s.buildings).find((x) => x.kind === 'pantry')
    if (p === undefined) throw new Error('no pantry')
    expect(p.status).toBe('paused')
    expect(blockReason(s, DEFS, p)).toContain('Paused by you')
    expect(blockReason(s, DEFS, p)).toContain('Resume pantries')
  })
})
