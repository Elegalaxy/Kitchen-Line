// Tests for the Branches tab view helpers: KPIs, the next-site card with its reasons, branch cards and the summary rows.

import { describe, expect, it } from 'vitest'
import { chainReady, DEFS, must } from '../sim/chainKit.ts'
import type { GameState } from '../sim/types.ts'
import { formatMoney } from './format.ts'
import { branchCards, branchKpis, branchReason, branchSummary, nextSiteView, signedMoney } from './branchesView.ts'

function withBranch(): GameState {
  return must(chainReady(), { type: 'openBranch' })
}

describe('branchesView', () => {
  it('formats signed money', () => {
    expect(signedMoney(1200)).toBe('+$12.00')
    expect(signedMoney(-350)).toBe('-$3.50')
    expect(signedMoney(0)).toBe('$0.00')
  })

  it('maps reasons to visible text', () => {
    expect(branchReason(null, 100)).toBeNull()
    expect(branchReason('cannot afford', 12345)).toBe('Needs $123.45')
    expect(branchReason('wrong phase', 0)).toContain('Only between days')
    expect(branchReason('branch limit', 0)).toBe('You already have three branches')
  })

  it('shows the next site and its cost before any branch exists', () => {
    const s = chainReady()
    const v = nextSiteView(s, DEFS)
    expect(v).not.toBeNull()
    expect(v?.reason).toBeNull()
    expect(v?.totalText).toMatch(/^\$/)
    expect(branchKpis(s)).toMatchObject({ countText: '0 / 3', lastNightText: '–', chainProfitText: '$0.00' })
    expect(branchCards(s, DEFS)).toEqual([])
  })

  it('explains why the open button is disabled', () => {
    const poor = { ...chainReady(), money: 0 }
    expect(nextSiteView(poor, DEFS)?.reason).toMatch(/^Needs \$/)
    const service = { ...chainReady(), phase: 'service' as const }
    expect(nextSiteView(service, DEFS)?.reason).toContain('Only between days')
  })

  it('lists a branch as up to date, then flags a changed flagship', () => {
    const s = withBranch()
    expect(nextSiteView(s, DEFS)).not.toBeNull()
    const [card] = branchCards(s, DEFS)
    expect(card.badge).toBe('Up to date')
    expect(card.refitReason).toBe('The kitchen is the same as the branch already has')
    const changed = must(s, { type: 'place', kind: 'belt', x: 6, y: 4, dir: 1 })
    const [c2] = branchCards(changed, DEFS)
    expect(c2.badge).toBe('Flagship changed')
    expect(c2.refitReason).toBeNull()
    expect(c2.refitCostText).toMatch(/^\$/)
  })

  it('has no summary rows without branches and sums them with', () => {
    expect(branchSummary(chainReady(), DEFS)).toBeNull()
    const s = withBranch()
    s.lastDay = { ...(s.lastDay as NonNullable<GameState['lastDay']>), sales: 1000, ingredientCost: 400, branches: [{ id: 1, net: 500, rent: 100 }] }
    const sum = branchSummary(s, DEFS)
    expect(sum?.rows).toHaveLength(1)
    expect(sum?.totalNet).toBe(500)
    expect(sum?.chainTotal).toBe(600 + 500)
    expect(branchKpis(s).lastNightText).toBe('+$5.00')
  })
})

describe('branchesView close', () => {
  it('shows the refund and blocks closing outside the build phase with the refit reason', () => {
    const s = withBranch()
    const [card] = branchCards(s, DEFS)
    expect(card.closeReason).toBeNull()
    expect(card.closeRefundText).toBe(formatMoney(Math.floor(s.branches![0].blueprint.value / 2)))
    const [busy] = branchCards({ ...s, phase: 'service' }, DEFS)
    expect(busy.closeReason).toContain('Only between days')
    expect(busy.closeReason).toBe(busy.refitReason)
  })
})
