// Branches tab (GAME_DESIGN 8.1, chain stage): KPI row, the next site with its cost and one primary
// "Open branch" button, and one card per branch with a secondary "Refit" button. The test day that opens
// or refits a branch takes about half a second, so the panel first shows a busy state, yields one frame so
// it paints, and only then dispatches the command. Reasons are shown under the buttons.

import { useState } from 'react'
import { report } from './actions.ts'
import type { Ctx } from './actions.ts'
import { branchCards, branchKpis, nextSiteView } from './branchesView.ts'
import type { BranchCardView } from './branchesView.ts'
import { debugLog } from './debug.ts'
import type { Snapshot } from './store.ts'

type Pending = 'open' | number | null

function BranchCard({ card, busy, pending, onRefit }: { card: BranchCardView; busy: boolean; pending: Pending; onRefit: () => void }) {
  const disabled = busy || card.refitReason !== null
  const reasonId = `refit-reason-${card.id}`
  return (
    <li className="branch-card">
      <div className="branch-head">
        <span className="dish-name">
          <span aria-hidden="true">{card.emoji}</span> {card.name}
        </span>
        <span className={`branch-badge ${card.upToDate ? 'ok' : 'stale'}`}>
          <span aria-hidden="true">{card.upToDate ? '✓' : '⚠'}</span> {card.badge}
        </span>
      </div>
      <dl className="kv">
        <div className="kv-row">
          <dt>Expected per night</dt>
          <dd className="num">{card.expectedText}</dd>
        </div>
        <div className="kv-row">
          <dt>Last night</dt>
          <dd className={`num branch-${card.lastNightTone}`}>{card.lastNightText}</dd>
        </div>
        <div className="kv-row">
          <dt>Demand · rent</dt>
          <dd className="num">
            {card.demandText} · {card.rentText}
          </dd>
        </div>
      </dl>
      <button type="button" className="btn branch-btn" disabled={disabled} aria-describedby={reasonId} onClick={onRefit}>
        <span className="btn-main">
          {pending === card.id ? (
            'Running a test day…'
          ) : (
            <>
              Refit <span className="num">{card.refitCostText}</span>
            </>
          )}
        </span>
      </button>
      <p id={reasonId} className="pal-reason">
        {card.refitReason === null ? '' : `⚠ ${card.refitReason}`}
      </p>
    </li>
  )
}

export default function BranchesPanel({ ctx, snap }: { ctx: Ctx; snap: Snapshot }) {
  const { store } = ctx
  const state = snap.state
  const [pending, setPending] = useState<Pending>(null)
  const busy = pending !== null
  const kpis = branchKpis(state)
  const site = nextSiteView(state, store.defs)
  const cards = branchCards(state, store.defs)

  // Paint the busy label first, then run the test day (it blocks the main thread for a moment).
  const run = (what: Pending, fn: () => void): void => {
    setPending(what)
    setTimeout(() => {
      try {
        fn()
      } finally {
        setPending(null)
      }
    }, 0)
  }
  const open = (): void => {
    debugLog('[ui]', 'open branch')
    run('open', () => {
      if (report(ctx, store.dispatch({ type: 'openBranch' }))) ctx.ui.showToast(`${site?.name ?? 'Branch'} opened`, 'info')
    })
  }
  const refit = (card: BranchCardView): void => {
    debugLog('[ui]', 'refit branch', card.id)
    run(card.id, () => {
      if (report(ctx, store.dispatch({ type: 'refitBranch', id: card.id }))) ctx.ui.showToast(`${card.name} refitted`, 'info')
    })
  }

  return (
    <>
      <section className="panel" aria-label="Chain">
        <h2 className="panel-title">Chain</h2>
        <dl className="branch-kpis">
          <div className="branch-kpi">
            <dt>Branches</dt>
            <dd className="num branch-kpi-value">{kpis.countText}</dd>
          </div>
          <div className="branch-kpi">
            <dt>Last night</dt>
            <dd className={`num branch-kpi-value branch-${kpis.lastNightTone}`}>{kpis.lastNightText}</dd>
            <dd className="num branch-kpi-sub">
              {kpis.lastNightDelta === null ? (
                ' '
              ) : (
                <span className={`sum-delta ${kpis.lastNightDelta.tone}`}>
                  <span aria-hidden="true">{kpis.lastNightDelta.arrow}</span> {kpis.lastNightDelta.text}
                </span>
              )}
            </dd>
          </div>
          <div className="branch-kpi">
            <dt>Chain profit</dt>
            <dd className="num branch-kpi-value money">{kpis.chainProfitText}</dd>
          </div>
        </dl>
      </section>

      <section className="panel" aria-label="Next site">
        <h2 className="panel-title">Next site</h2>
        {site === null ? (
          <p className="empty">Every site is open.</p>
        ) : (
          <div className="goal-action">
            <p className="branch-site">
              <span aria-hidden="true">{site.emoji}</span> {site.name}
            </p>
            <dl className="kv">
              <div className="kv-row">
                <dt>Demand</dt>
                <dd className="num">{site.demandText}</dd>
              </div>
              <div className="kv-row">
                <dt>Rent</dt>
                <dd className="num">{site.rentText}</dd>
              </div>
              <div className="kv-row">
                <dt>Kitchen copy</dt>
                <dd className="num">{site.valueText}</dd>
              </div>
              <div className="kv-row">
                <dt>Opening fee</dt>
                <dd className="num">{site.feeText}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="btn-primary goal-btn"
              disabled={busy || site.reason !== null}
              aria-describedby="open-reason"
              onClick={open}
            >
              {pending === 'open' ? (
                'Running a test day…'
              ) : (
                <>
                  Open branch · <span className="num">{site.totalText}</span>
                </>
              )}
            </button>
            <p id="open-reason" className={`goal-reason${site.reason === null ? ' ready' : ''}`}>
              {site.reason === null ? 'The kitchen is copied and tested for one day first.' : `⚠ ${site.reason}`}
            </p>
          </div>
        )}
      </section>

      <section className="panel" aria-label="Your branches">
        <h2 className="panel-title">Your branches</h2>
        {cards.length === 0 ? (
          <p className="empty">No branches yet. Open the first one above.</p>
        ) : (
          <ul className="upgrade-list">
            {cards.map((c) => (
              <BranchCard key={c.id} card={c} busy={busy} pending={pending} onRefit={() => refit(c)} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
