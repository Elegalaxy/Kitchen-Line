// Dish pack saves (GAME_DESIGN 5.4): a save made before the pack still loads against the new content,
// and a save with the new dishes unlocked and on the menu round-trips and passes the content check.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { loadSave, serializeSave } from '../persist/save.ts'
import { createGame } from '../sim/game.ts'
import { stateHash } from '../sim/hash.ts'
import { checkAgainstDefs } from './persistence.ts'

describe('dish pack saves', () => {
  it('a save made before the pack loads, and one with the new dishes round-trips', () => {
    const old = createGame(DEFS, 'save')
    old.tier = 'restaurant'
    const a = loadSave(serializeSave(old, '2026-11-24T00:00:00Z'))
    expect(a.ok && checkAgainstDefs(a.state, DEFS)).toBe(null)
    const withNew = { ...old, unlocked: [...old.unlocked, 'fishAndChips', 'cheeseburger'], menu: [{ dish: 'cheeseburger', price: 1000 }] }
    const b = loadSave(serializeSave(withNew, '2026-11-24T00:00:00Z'))
    expect(b.ok && b.state.unlocked).toEqual(withNew.unlocked)
    expect(b.ok && stateHash(b.state)).toBe(stateHash(withNew))
    expect(b.ok && checkAgainstDefs(b.state, DEFS)).toBe(null)
  })
})
