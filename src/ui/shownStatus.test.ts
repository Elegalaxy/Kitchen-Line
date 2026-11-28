// A pantry reads "Ready" while time is stopped in the build phase, everywhere its status shows;
// a paused one still reads as paused, and other phases and buildings keep the sim's status.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import type { Building, GameState } from '../sim/types.ts'
import { blockReason } from './blockReason.ts'
import { STATUS_TEXT } from './format.ts'
import { shownStatus } from './shownStatus.ts'
import { newGameState } from './store.ts'
import { tileSummary } from './tileInfo.ts'

function line(): { state: GameState; pantry: Building; chopper: Building } {
  const state = newGameState(DEFS, 'friesLine')
  const all = Object.values(state.buildings)
  return { state, pantry: all.find((b) => b.kind === 'pantry')!, chopper: all.find((b) => b.kind === 'chopper')! }
}

describe('shownStatus', () => {
  it('reads Ready for a pantry in the build phase, whatever the last day left behind', () => {
    const { pantry } = line()
    for (const status of ['ok', 'idle', 'blocked', 'noCash', 'warming'] as const) {
      expect(shownStatus('build', { ...pantry, status })).toBe('ready')
    }
    expect(STATUS_TEXT.ready.word).toBe('Ready')
  })

  it('keeps a paused pantry paused', () => {
    const { pantry } = line()
    expect(shownStatus('build', { ...pantry, paused: true, status: 'paused' } as Building)).toBe('paused')
    expect(shownStatus('build', { ...pantry, paused: true, status: 'warming' } as Building)).toBe('paused')
  })

  it('leaves service and other buildings alone', () => {
    const { pantry, chopper } = line()
    expect(shownStatus('service', { ...pantry, status: 'ok' })).toBe('ok')
    expect(shownStatus('build', { ...chopper, status: 'idle' })).toBe('idle')
  })

  it('shows Ready in the tile info and gives no stale reason', () => {
    const { state, pantry } = line()
    state.phase = 'build'
    state.buildings[pantry.id].status = 'ok'
    expect(tileSummary(state, DEFS, pantry.x, pantry.y)).toContain('(Ready)')
    expect(blockReason(state, DEFS, { ...pantry, status: 'noCash' })).toBeNull()
  })
})
