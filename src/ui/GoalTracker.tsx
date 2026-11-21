// Pinned goal tracker (above the orders strip): the current tier's goals as compact chips with
// a count and a bar each, so progress is visible while building. A done goal shows a check
// mark and "Done" colour plus text. Read-only; the full list, the upgrade and the expansion
// live in the Goals tab. Once every goal of the tier is done it shrinks to one line.

import { goalRows } from './goalsView.ts'
import type { Snapshot } from './store.ts'
import type { Defs } from '../sim/types.ts'

export default function GoalTracker({ snap, defs }: { snap: Snapshot; defs: Defs }) {
  const state = snap.state
  const rows = goalRows(state, defs, state.tier)
  if (rows.length === 0) return null
  const left = rows.filter((r) => !r.done).length
  return (
    <section className="panel goal-tracker" aria-label="Goals">
      <h2 className="panel-title">
        Goals <span className="num goal-tracker-count">{rows.length - left} / {rows.length}</span>
      </h2>
      {left === 0 ? (
        <p className="goal-tracker-done">✓ All {state.tier} goals done</p>
      ) : (
        <ul className="goal-tracker-list">
          {rows.map((r) => (
            <li key={r.id} className={`goal-chip${r.done ? ' done' : ''}`} title={`${r.label}: ${r.text}`}>
              <span className="goal-chip-head">
                <span aria-hidden="true">{r.done ? '✓' : '○'}</span>
                <span className="goal-chip-label">
                  {r.label}
                  <span className="sr-only">{r.done ? ' (done)' : ` (${r.text})`}</span>
                </span>
              </span>
              <span className="num goal-chip-count">{r.done ? 'Done' : r.text}</span>
              <span className="goal-bar" aria-hidden="true">
                <span className="goal-bar-fill" style={{ width: `${r.pct}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
