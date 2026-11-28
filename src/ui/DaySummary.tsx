// End-of-day summary modal (plan Step 15), shown when the phase is `summary`. KPI cards,
// a key-value block, a per-dish table, up to 3 reviews (lowest first), the bottleneck hint
// and one primary button. Esc does not dismiss; focus starts on the button and is trapped.
// Layout is fixed from day to day: all dishes always get a row, there are always 3 review
// slots and the delta lines are always reserved, so the dialog does not change size.

import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { TIER_RANK } from '../sim/constants.ts'
import { reputationOf } from '../sim/customers.ts'
import { summarizeDay } from '../sim/summary.ts'
import type { Defs, GameState, Tier } from '../sim/types.ts'
import {
  countDelta,
  hintText,
  MAX_REVIEWS,
  moneyDelta,
  pickReviews,
  pointsDelta,
  secondsDelta,
  starsDelta,
  starsText,
} from './daySummaryView.ts'
import type { DeltaView } from './daySummaryView.ts'
import Money from './Money.tsx'
import { branchSummary, signedMoney } from './branchesView.ts'
import { clipText } from './format.ts'
import { handleModalKeys } from './modalKeys.ts'
import { pantryPauseView } from './pantryPause.ts'
import { tutorialView } from './tutorial.ts'
import { criticSummary } from './criticView.ts'
import { seasonForecast } from './seasonView.ts'
import { trendSummary } from './trendView.ts'

function Delta({ d }: { d: DeltaView | null }) {
  if (d === null) return <span className="sum-delta flat">&nbsp;</span>
  return (
    <span className={`sum-delta ${d.tone}`}>
      <span aria-hidden="true">{d.arrow}</span> {d.text}
    </span>
  )
}

function Card(props: { label: string; value: ReactNode; sub?: string; delta: DeltaView | null; tone?: string }) {
  return (
    <div className="sum-card">
      <dt>{props.label}</dt>
      <dd className={`num sum-value ${props.tone ?? ''}`}>{props.value}</dd>
      <dd className="num sum-sub">{props.sub ?? ' '}</dd>
      <dd className="sum-deltarow num">
        <Delta d={props.delta} />
      </dd>
    </div>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="sum-row">
      <dt>{k}</dt>
      <dd className="num">{v}</dd>
    </div>
  )
}

/** Review text longer than this is cut with an ellipsis (the full text is in the title and read by screen readers). */
const REVIEW_MAX_CHARS = 90

export default function DaySummary({
  state,
  defs,
  onDismiss,
  onTogglePantries,
}: {
  state: GameState
  defs: Defs
  onDismiss: () => void
  onTogglePantries: () => void
}) {
  const last = state.lastDay
  const rep = reputationOf(state)
  const sum = useMemo(
    () => (last === null ? null : summarizeDay(last, state.prevDay, { now: rep, atDayStart: state.repAtDayStart })),
    [last, state.prevDay, rep, state.repAtDayStart],
  )
  const dialogRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Open at the top: the results come first, the button is at the end.
    buttonRef.current?.focus({ preventScroll: true })
  }, [])

  if (last === null || sum === null) return null

  const pantries = pantryPauseView(state)
  const trend = trendSummary(state, defs)
  const forecast = seasonForecast(state, defs)
  const critic = criticSummary(state)
  const chain = branchSummary(state, defs)
  const hint = hintText(sum.bottleneckHint, defs)
  const guide = tutorialView(state)
  const teachingSummary = guide.steps[guide.current]?.id === 'summary'
  const reviews = pickReviews(last.reviews)
  const d = sum.deltas
  const dishName = (id: string): string => defs.dishes[id]?.name ?? id
  const stats = new Map(sum.dishes.map((r) => [r.dish, r]))
  // Dishes of a higher tier (dish pack) get no row until the restaurant tier.
  const inTier = (d: { requiresTier?: Tier }): boolean => d.requiresTier === undefined || TIER_RANK[d.requiresTier] <= TIER_RANK[state.tier]
  const dishIds = [...Object.values(defs.dishes).filter(inTier).map((d) => d.id), ...sum.dishes.map((r) => r.dish).filter((id) => defs.dishes[id] === undefined)]

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal summary-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sum-title"
        onKeyDown={(e) => handleModalKeys(e, dialogRef.current)}
      >
        <h2 id="sum-title" className="sum-title">
          Day {sum.day} summary
        </h2>

        <dl className="sum-cards">
          <Card
            label="Profit"
            value={<Money cents={sum.profit} />}
            tone={sum.profit < 0 ? 'bad' : 'money'}
            delta={moneyDelta(d === null ? null : d.profit)}
          />
          <Card
            label="Served / Customers"
            value={`${sum.served} / ${sum.customers}`}
            sub={sum.servedPct === null ? 'No customers today' : `${sum.servedPct}% served`}
            delta={countDelta(d === null ? null : d.served)}
          />
          <Card
            label="Reputation"
            value={`${sum.reputation.toFixed(1)}★`}
            sub="change over the day"
            delta={starsDelta(sum.reputationDelta)}
          />
          <Card
            label="Average wait"
            value={sum.avgWaitSec === null ? '–' : `${sum.avgWaitSec.toFixed(1)} s`}
            delta={secondsDelta(d === null ? null : d.avgWaitSec)}
          />
        </dl>
        <p className="sum-note num">
          {d === null ? (
            'First day: nothing to compare with yet.'
          ) : (
            <>
              Versus day {sum.day - 1}. Served rate: <Delta d={pointsDelta(d.servedPct)} />
              {d.servedPct === null && '–'}
            </>
          )}
        </p>

        {trend !== null && (
          <p className="sum-trend num">
            <span aria-hidden="true">🔥</span> Trend: {trend.name} ({trend.served} served, {trend.lost} lost)
            {trend.onMenu ? '' : ' - not on the menu'}
          </p>
        )}

        {forecast !== null && (
          <p className="sum-trend sum-season">
            {forecast.text}
          </p>
        )}

        {critic !== null && (
          <p className="sum-trend sum-critic num">
            <span aria-hidden="true">★</span> {critic.text}
          </p>
        )}

        <div className="sum-grid">
          <section aria-labelledby="sum-money">
            <h3 id="sum-money" className="panel-title">
              Money, losses and waste
            </h3>
            <dl className="sum-kv">
              <Row k="Sales" v={<Money cents={sum.sales} />} />
              <Row k="Ingredient cost" v={<Money cents={sum.ingredientCost} />} />
              <Row k="Lost: ran out of patience" v={last.lostPatience} />
              <Row k="Lost: no match" v={last.lostNoMatch} />
              <Row k="Lost: queue full" v={last.lostFull} />
              <Row k="Waste: spoiled" v={last.wasteSpoiled - last.wasteOvernight} />
              <Row k="Waste: left at close" v={last.wasteOvernight} />
              <Row k="Waste: binned" v={last.wasteBinned} />
              <Row k="Waste: destroyed" v={last.wasteDestroyed} />
            </dl>
          </section>

          <section aria-labelledby="sum-dishes">
            <h3 id="sum-dishes" className="panel-title">
              By dish
            </h3>
            <table className="sum-table">
              <thead>
                <tr>
                  <th scope="col">Dish</th>
                  <th scope="col" className="num">
                    Served
                  </th>
                  <th scope="col" className="num">
                    Lost
                  </th>
                  <th scope="col" className="num">
                    Sales
                  </th>
                </tr>
              </thead>
              <tbody>
                {dishIds.map((id) => {
                  const r = stats.get(id)
                  return (
                    <tr key={id} className={r === undefined ? 'idle' : ''}>
                      <th scope="row" title={dishName(id)}>
                        <span className="sum-dishname">{dishName(id)}</span>
                        {sum.worstDish === id && (
                          <span title="Most customers lost on this dish">
                            <span aria-hidden="true"> ⚠</span>
                            <span className="sr-only"> most lost</span>
                          </span>
                        )}
                      </th>
                      <td className="num">{r?.served ?? 0}</td>
                      <td className="num">{r?.lost ?? 0}</td>
                      <td className="num"><Money cents={r?.sales ?? 0} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </div>

        {chain !== null && (
          <section aria-labelledby="sum-branches">
            <h3 id="sum-branches" className="panel-title">
              Branches (net after rent)
            </h3>
            <dl className="sum-kv">
              {chain.rows.map((r) => (
                <Row
                  key={r.id}
                  k={`${r.emoji} ${r.name}`.trim()}
                  v={
                    <>
                      {signedMoney(r.net)} <span className="sum-rent">(rent <Money cents={r.rent} />)</span>
                    </>
                  }
                />
              ))}
              <div className="sum-row total">
                <dt>Chain total (with flagship)</dt>
                <dd className="num">{signedMoney(chain.chainTotal)}</dd>
              </div>
            </dl>
          </section>
        )}

        <section aria-labelledby="sum-reviews">
          <h3 id="sum-reviews" className="panel-title">
            Reviews (lowest first)
          </h3>
          <ul className="sum-reviews">
            {Array.from({ length: MAX_REVIEWS }, (_, i) => {
              const r = reviews[i]
              if (r === undefined) {
                return (
                  <li key={i} className="sum-review empty">
                    {i === 0 ? 'No reviews today.' : ' '}
                  </li>
                )
              }
              return (
                <li key={i} className="sum-review">
                  <span className="sum-stars num" aria-label={`${r.stars} of 5 stars`}>
                    <span aria-hidden="true">
                      {starsText(r.stars)} {r.stars}
                    </span>
                  </span>
                  <span className="sum-reviewtext" title={r.text}>
                    <span aria-hidden="true">{clipText(r.text, REVIEW_MAX_CHARS)}</span>
                    <span className="sr-only">{r.text}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        {teachingSummary && (
          <p className="sum-hint">
            This is the day's result: sales, customers who left, and waste. The line below names the biggest problem. When you go back, add Salad to the menu.
          </p>
        )}

        <p className={`sum-hint${hint === null ? ' none' : ''}`}>
          <span aria-hidden="true">{hint === null ? 'ℹ' : '💡'}</span>{' '}
          {hint ??
            (sum.customers === 0
              ? 'No customers came today. Check your menu, prices and reputation.'
              : 'No bottleneck: nobody was lost and nothing spoiled.')}
        </p>

        <div className="sum-pantries">
          <button
            type="button"
            className="btn pause-all-btn"
            aria-pressed={pantries.total > 0 && pantries.paused === pantries.total}
            disabled={pantries.disabledReason !== null}
            onClick={onTogglePantries}
          >
            <span className="btn-main">
              <span aria-hidden="true">{pantries.next === 'resume' ? '▶' : '⏸'}</span> {pantries.label}
            </span>
            <span className="btn-sub">{pantries.disabledReason ?? pantries.summary}</span>
          </button>
          <span className="sum-pantries-note">Paused pantries buy nothing. Resume them before the next day starts.</span>
        </div>

        <button ref={buttonRef} type="button" className="btn-primary sum-button" onClick={onDismiss}>
          Back to kitchen
        </button>
      </div>
    </div>
  )
}
