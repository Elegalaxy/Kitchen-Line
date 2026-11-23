// The Inspector's Sell button follows the sim's remove rule: only the last pass cannot be sold.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { applyCommand, removeBlocked } from '../sim/commands.ts'
import { createGame } from '../sim/game.ts'
import type { GameState } from '../sim/types.ts'

const restaurant = (): GameState => ({ ...createGame(DEFS, 'sell'), tier: 'restaurant', money: 100000 })

describe('removeBlocked (Inspector Sell)', () => {
  it('refuses only the last pass; non-pass buildings and a pass with another remaining can be sold', () => {
    const one = restaurant()
    const pass = Object.values(one.buildings).find((b) => b.kind === 'pass')
    const pantry = Object.values(one.buildings).find((b) => b.kind === 'pantry')
    if (pass === undefined || pantry === undefined) throw new Error('fixture')
    expect(removeBlocked(one, pass)).toBe('pass cannot be removed')
    expect(removeBlocked(one, pantry)).toBeNull()
    const out = applyCommand(one, DEFS, { type: 'place', kind: 'pass', x: 7, y: 4, dir: 3 })
    if (!out.result.ok) throw new Error(out.result.reason)
    const two = out.state
    for (const b of Object.values(two.buildings)) if (b.kind === 'pass') expect(removeBlocked(two, b)).toBeNull()
  })
})
