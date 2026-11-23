// Tests for the restaurant upgrade rows: effect text, owned state and the visible reason.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { applyCommand } from '../sim/commands.ts'
import { createGame } from '../sim/game.ts'
import type { GameState } from '../sim/types.ts'
import { upgradeRows } from './upgradesView.ts'

function restaurant(money: number): GameState {
  return { ...createGame(DEFS, 'rows'), tier: 'restaurant', money }
}

describe('upgradeRows', () => {
  it('lists the four upgrades with effect and cost', () => {
    const rows = upgradeRows(restaurant(1_000_000), DEFS)
    expect(rows.map((r) => [r.id, r.effectText, r.costText, r.reason])).toEqual([
      ['tables', '+3 waiting places', '$300.00', null],
      ['sign', '+15% customers', '$400.00', null],
      ['music', '+25% patience', '$300.00', null],
      ['plates', '+15% budget', '$600.00', null],
    ])
  })

  it('explains why a row is disabled', () => {
    expect(upgradeRows(restaurant(29999), DEFS)[0].reason).toBe('Needs $300.00')
    expect(upgradeRows({ ...restaurant(1_000_000), phase: 'service' }, DEFS)[0].reason).toBe('Only between days: wait for the day to end')
    expect(upgradeRows({ ...restaurant(1_000_000), tier: 'stall' }, DEFS)[0].reason).toBe('Needs the restaurant tier')
  })

  it('marks a bought upgrade as owned with no reason', () => {
    const bought = applyCommand(restaurant(1_000_000), DEFS, { type: 'buyUpgrade', id: 'sign' }).state
    const row = upgradeRows(bought, DEFS)[1]
    expect(row.owned).toBe(true)
    expect(row.reason).toBeNull()
  })
})
