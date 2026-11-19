// Goals tab (plan Step 16): the stall goals as a checklist with progress ("63 / 100") and a
// bar each, the tier upgrade, the restaurant goals (greyed until the upgrade) and the grid
// expansion. A done goal shows a check mark and the word "Done" (never colour alone). The
// upgrade and expansion buttons stay in place when unavailable: they are disabled with the
// reason written under them. Both only work between days, like in the sim.

import { MENU_CAP, TIER_ARRIVAL_FACTOR, UPGRADE_COST, WAITING_CAP } from '../sim/constants.ts'
import { goalsOfTier } from '../sim/goals.ts'
import { report } from './actions.ts'
import type { Ctx } from './actions.ts'
import { formatMoney } from './format.ts'
import { expansionView, goalRows, upgradeView } from './goalsView.ts'
import type { GoalRow } from './goalsView.ts'
import type { Snapshot } from './store.ts'

function GoalList({ rows, locked }: { rows: GoalRow[]; locked: boolean }) {
  return (
    <ul className={`goal-list${locked ? ' locked' : ''}`}>
      {rows.map((r) => (
        <li key={r.id} className={`goal${r.done ? ' done' : ''}`}>
          <div className="goal-head">
            <span className="goal-mark" aria-hidden="true">
              {r.done ? '✓' : locked ? '🔒' : '○'}
            </span>
            <span className="goal-label">
              {r.label}
              <span className="sr-only">{r.done ? ' (done)' : locked ? ' (locked)' : ' (not done)'}</span>
            </span>
            <span className="num goal-count">{r.text}</span>
          </div>
          <div
            className="goal-bar"
            role="progressbar"
            aria-label={r.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={r.pct}
            aria-valuetext={r.text}
          >
            <span className="goal-bar-fill" style={{ width: `${r.pct}%` }} />
          </div>
          {r.note !== null && <p className="goal-note num">{r.note}</p>}
        </li>
      ))}
    </ul>
  )
}

export default function GoalsPanel({ ctx, snap }: { ctx: Ctx; snap: Snapshot }) {
  const { store } = ctx
  const { defs } = store
  const state = snap.state
  const isRestaurant = state.tier === 'restaurant'
  const stall = goalRows(state, defs, 'stall')
  const restaurant = goalRows(state, defs, 'restaurant')
  const doneCount = (rows: GoalRow[]): number => rows.filter((r) => r.done).length
  const upgrade = upgradeView(state, defs)
  const exp = expansionView(state, defs)

  const doUpgrade = (): void => {
    if (report(ctx, store.dispatch({ type: 'upgradeTier' }))) ctx.ui.showToast('Upgraded to restaurant', 'info')
  }
  const doExpand = (): void => {
    if (report(ctx, store.dispatch({ type: 'buyExpansion' }))) ctx.ui.showToast('Kitchen expanded', 'info')
  }

  return (
    <>
      <section className="panel" aria-label="Stall goals">
        <h2 className="panel-title goal-title">
          <span>Stall goals</span>
          <span className="num goal-total">
            {doneCount(stall)} / {stall.length}
          </span>
        </h2>
        {stall.length === 0 ? <p className="empty">No goals.</p> : <GoalList rows={stall} locked={false} />}
        {isRestaurant ? (
          <p className="goal-tier">
            <span aria-hidden="true">✓</span> Restaurant tier
          </p>
        ) : (
          <div className="goal-action">
            <button
              type="button"
              className="btn-primary goal-btn"
              disabled={upgrade.reason !== null}
              aria-describedby="upgrade-reason"
              onClick={doUpgrade}
            >
              {upgrade.label} · <span className="num">{upgrade.costText}</span>
            </button>
            <p id="upgrade-reason" className={`goal-reason${upgrade.reason === null ? ' ready' : ''}`}>
              {upgrade.reason === null ? 'Ready: all stall goals are done.' : `⚠ ${upgrade.reason}`}
            </p>
            <dl className="kv goal-perks">
              <div className="kv-row">
                <dt>Menu slots</dt>
                <dd className="num">
                  {MENU_CAP.stall} → {MENU_CAP.restaurant}
                </dd>
              </div>
              <div className="kv-row">
                <dt>Waiting orders</dt>
                <dd className="num">
                  {WAITING_CAP.stall} → {WAITING_CAP.restaurant}
                </dd>
              </div>
              <div className="kv-row">
                <dt>Customers</dt>
                <dd className="num">×{TIER_ARRIVAL_FACTOR.restaurant}</dd>
              </div>
              <div className="kv-row">
                <dt>Fast belts, big grids</dt>
                <dd>Unlocked</dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      {goalsOfTier(defs, 'restaurant').length > 0 && (
        <section className="panel" aria-label="Restaurant goals">
          <h2 className="panel-title goal-title">
            <span>Restaurant goals</span>
            <span className="num goal-total">
              {doneCount(restaurant)} / {restaurant.length}
            </span>
          </h2>
          <GoalList rows={restaurant} locked={!isRestaurant} />
          {!isRestaurant && (
            <p className="goal-reason">🔒 Unlocks after upgrading to restaurant ({formatMoney(UPGRADE_COST)}).</p>
          )}
          {state.won && <p className="goal-tier">🏆 Ready to expand: all goals done.</p>}
        </section>
      )}

      <section className="panel" aria-label="Kitchen size">
        <h2 className="panel-title">Kitchen size</h2>
        <dl className="kv">
          <div className="kv-row">
            <dt>Grid</dt>
            <dd className="num">{exp.size}</dd>
          </div>
        </dl>
        {exp.next === null ? (
          <p className="goal-reason">The kitchen is fully expanded.</p>
        ) : (
          <div className="goal-action">
            <button
              type="button"
              className="btn goal-btn"
              disabled={exp.reason !== null}
              aria-describedby="expand-reason"
              onClick={doExpand}
            >
              Expand to <span className="num">{exp.nextText}</span> · <span className="num">{exp.costText}</span>
            </button>
            <p id="expand-reason" className={`goal-reason${exp.reason === null ? ' ready' : ''}`}>
              {exp.reason === null ? 'Buildings stay where they are.' : `⚠ ${exp.reason}`}
            </p>
          </div>
        )}
      </section>
    </>
  )
}
