// View helper for the Branches tab (GAME_DESIGN 8.1): the KPI row, the next-site card and one card per
// branch. Disabled reasons come from the sim's own checks (openBranchProblem, refitProblem, closeProblem), so
// the buttons and the commands cannot disagree. Pure, unit-tested.

import { BRANCH_MAX, BRANCH_OPEN_FEES } from '../sim/constants.ts'
import { blueprintOf, sameBlueprint } from '../sim/blueprint.ts'
import { profitOf } from '../sim/economy.ts'
import {
  closeProblem,
  closeRefund,
  nextArea,
  openBranchCost,
  openBranchProblem,
  refitCost,
  refitProblem,
} from '../sim/branches.ts'
import type { Defs, GameState, RejectReason } from '../sim/types.ts'
import { formatMoney, reasonText } from './format.ts'
import { moneyDelta } from './daySummaryView.ts'
import type { DeltaView } from './daySummaryView.ts'

/** Signed money, "+$12.00" / "-$3.50" (never colour alone). */
export function signedMoney(cents: number): string {
  return `${cents > 0 ? '+' : ''}${formatMoney(cents)}`
}

/** Visible text for why a Branches action is unavailable. */
export function branchReason(why: RejectReason | null, cost: number): string | null {
  if (why === null) return null
  if (why === 'cannot afford') return `Needs ${formatMoney(cost)}`
  if (why === 'wrong phase') return 'Only between days: wait for the day to end'
  return reasonText(why)
}

/** What the branches made last night in total (cents), or null when no branch ran. */
export function lastNightNet(state: GameState): number | null {
  const rows = state.lastDay?.branches
  if (rows === undefined || rows.length === 0) return null
  return rows.reduce((sum, r) => sum + r.net, 0)
}

export type BranchKpis = {
  count: number
  countText: string
  /** "+$120.00", or "–" before the first branch night. */
  lastNightText: string
  /** Arrow plus change versus the night before (flagship-style delta), or null. */
  lastNightDelta: DeltaView | null
  lastNightTone: 'good' | 'bad' | 'flat'
  chainProfitText: string
}

export function branchKpis(state: GameState): BranchKpis {
  const count = state.branches?.length ?? 0
  const net = lastNightNet(state)
  const prev = state.prevDay?.branches
  const prevNet = prev === undefined || prev.length === 0 ? null : prev.reduce((s, r) => s + r.net, 0)
  return {
    count,
    countText: `${count} / ${BRANCH_MAX}`,
    lastNightText: net === null ? '–' : signedMoney(net),
    lastNightDelta: net === null || prevNet === null ? null : moneyDelta(net - prevNet),
    lastNightTone: net === null || net === 0 ? 'flat' : net > 0 ? 'good' : 'bad',
    chainProfitText: formatMoney(state.chainProfit ?? 0),
  }
}

export type NextSiteView = {
  name: string
  emoji: string
  demandText: string
  rentText: string
  /** Blueprint value, fee and total. */
  valueText: string
  feeText: string
  totalText: string
  reason: string | null
}

/** The next site card, or null when every branch is open (or no sites exist). */
export function nextSiteView(state: GameState, defs: Defs): NextSiteView | null {
  const area = nextArea(state, defs)
  if (area === null || (state.branches?.length ?? 0) >= BRANCH_MAX) return null
  const total = openBranchCost(state, defs)
  const n = state.branches?.length ?? 0
  const fee = BRANCH_OPEN_FEES[Math.min(n, BRANCH_OPEN_FEES.length - 1)] ?? 0
  return {
    name: area.name,
    emoji: area.emoji,
    demandText: `${area.demandPercent}%`,
    rentText: `${formatMoney(area.rent)} / night`,
    valueText: formatMoney(total - fee),
    feeText: formatMoney(fee),
    totalText: formatMoney(total),
    reason: branchReason(openBranchProblem(state, defs), total),
  }
}

export type BranchCardView = {
  id: number
  name: string
  emoji: string
  demandText: string
  rentText: string
  expectedText: string
  /** Last night's net for this branch ("–" when it has not run yet). */
  lastNightText: string
  lastNightTone: 'good' | 'bad' | 'flat'
  upToDate: boolean
  badge: string
  refitCostText: string
  refitReason: string | null
  /** What closing pays back. */
  closeRefundText: string
  closeReason: string | null
}

export function branchCards(state: GameState, defs: Defs): BranchCardView[] {
  const bp = blueprintOf(state, defs)
  return (state.branches ?? []).map((b) => {
    const area = (defs.branchAreas ?? []).find((a) => a.id === b.areaId)
    const rent = area?.rent ?? 0
    const night = state.lastDay?.branches?.find((r) => r.id === b.id)
    const upToDate = sameBlueprint(b.blueprint, bp)
    const cost = refitCost(state, defs, b)
    const expected = b.expected.profit - rent
    return {
      id: b.id,
      name: area?.name ?? b.areaId,
      emoji: area?.emoji ?? '',
      demandText: area === undefined ? '–' : `${area.demandPercent}%`,
      rentText: `${formatMoney(rent)} / night`,
      expectedText: `${signedMoney(expected)} / night`,
      lastNightText: night === undefined ? '–' : signedMoney(night.net),
      lastNightTone: night === undefined || night.net === 0 ? 'flat' : night.net > 0 ? 'good' : 'bad',
      upToDate,
      badge: upToDate ? 'Up to date' : 'Flagship changed',
      refitCostText: formatMoney(cost),
      refitReason: branchReason(refitProblem(state, defs, b.id), cost),
      closeRefundText: formatMoney(closeRefund(b)),
      closeReason: branchReason(closeProblem(state, b.id), 0),
    }
  })
}

/** One line per branch for the day summary plus the chain total; null when no branch ran. */
export type BranchSummaryView = {
  rows: { id: number; name: string; emoji: string; net: number; rent: number }[]
  totalNet: number
  /** Flagship profit plus the branch nets. */
  chainTotal: number
}

export function branchSummary(state: GameState, defs: Defs): BranchSummaryView | null {
  const last = state.lastDay
  if (last === null || last.branches === undefined || last.branches.length === 0) return null
  const rows = last.branches.map((r) => {
    const b = state.branches?.find((x) => x.id === r.id)
    const area = (defs.branchAreas ?? []).find((a) => a.id === b?.areaId)
    return { id: r.id, name: area?.name ?? `Branch ${r.id}`, emoji: area?.emoji ?? '', net: r.net, rent: r.rent }
  })
  const totalNet = rows.reduce((s, r) => s + r.net, 0)
  return { rows, totalNet, chainTotal: profitOf(last) + totalNet }
}

