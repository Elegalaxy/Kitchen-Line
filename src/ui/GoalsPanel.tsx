// Goals tab: the stall checklist and the restaurant checklist, and the chain checklist once the restaurant end screen was seen. Buying the tier, a bigger
// kitchen or a recipe happens on the Upgrades tab. A done goal shows a check mark and the
// word "Done" (never colour alone). Restaurant goals stay greyed until the tier upgrade.

import { UPGRADE_COST } from '../sim/constants.ts'
import { goalsOfTier } from '../sim/goals.ts'
import type { Ctx } from './actions.ts'
import { formatMoney } from './format.ts'
import { goalRows } from './goalsView.ts'
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
  const { defs } = ctx.store
  const state = snap.state
  const isRestaurant = state.tier === 'restaurant'
  const stall = goalRows(state, defs, 'stall')
  const restaurant = goalRows(state, defs, 'restaurant')
  const chain = goalRows(state, defs, 'chain')
  const doneCount = (rows: GoalRow[]): number => rows.filter((r) => r.done).length

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
        {isRestaurant && (
          <p className="goal-tier">
            <span aria-hidden="true">✓</span> Restaurant tier
          </p>
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
            <p className="goal-reason">🔒 Unlocks after the restaurant upgrade on the Upgrades tab ({formatMoney(UPGRADE_COST)}).</p>
          )}
          {state.won && <p className="goal-tier">🏆 Ready to expand: all goals done.</p>}
        </section>
      )}

      {state.won === true && chain.length > 0 && (
        <section className="panel" aria-label="Chain goals">
          <h2 className="panel-title goal-title">
            <span>Chain goals</span>
            <span className="num goal-total">
              {doneCount(chain)} / {chain.length}
            </span>
          </h2>
          <GoalList rows={chain} locked={false} />
          <p className="goal-reason ready">Open branches on the Branches tab. Profit and day goals count in the day summary.</p>
          {state.chainWon === true && <p className="goal-tier">🏆 Chain built: all goals done.</p>}
        </section>
      )}
    </>
  )
}
