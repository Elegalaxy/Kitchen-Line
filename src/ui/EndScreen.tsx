// "Ready to expand" end screen (and, for `chainWon`, the "Chain built" variant) (plan Step 16), shown when the phase is `won` (all restaurant
// goals done; it triggers once). Totals as key-value rows and one primary button, "Keep
// playing" (dismissSummary: back to the build phase, goals stay done). Esc does not dismiss;
// focus starts on the button and is trapped, like the day summary. The chain variant also shows the
// franchise points preview and makes "Franchise out..." (the Franchise modal, GAME_DESIGN 8.2) the
// primary button, with "Keep playing" as the quieter one.

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { BRANCH_MAX } from '../sim/constants.ts'
import { reputationOf } from '../sim/customers.ts'
import { profitOf } from '../sim/economy.ts'
import type { Defs, GameState, MetaState } from '../sim/types.ts'
import Money from './Money.tsx'
import { starsFloor } from './goalsView.ts'
import { franchiseView } from './franchiseView.ts'
import { handleModalKeys } from './modalKeys.ts'

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="sum-row">
      <dt>{k}</dt>
      <dd className="num">{v}</dd>
    </div>
  )
}

export default function EndScreen({
  state,
  defs,
  meta,
  onKeepPlaying,
  onFranchise,
}: {
  state: GameState
  defs: Defs
  meta: MetaState
  onKeepPlaying: () => void
  /** Opens the Franchise modal (chain variant only). */
  onFranchise: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    // Open at the top, also when the dialog is taller than the screen.
    buttonRef.current?.focus({ preventScroll: true })
  }, [])
  const last = state.lastDay
  const chain = state.chainWon === true
  const franchise = chain ? franchiseView(state, meta, defs, []) : null
  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal end-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-title"
        onKeyDown={(e) => handleModalKeys(e, dialogRef.current)}
      >
        <h2 id="end-title" className="sum-title">
          <span aria-hidden="true">{chain ? '🏬' : '🏆'}</span> {chain ? 'Chain built' : 'Ready to expand'}
        </h2>
        <p className="end-lead">
          {chain
            ? 'Every chain goal is done. Your branches run the flagship kitchen all over town.'
            : 'Every restaurant goal is done. Your kitchen is ready for the next step.'}
        </p>
        {chain ? (
          <dl className="sum-kv">
            <Row k="Branches" v={`${state.branches?.length ?? 0} / ${BRANCH_MAX}`} />
            <Row k="Chain profit" v={<Money cents={state.chainProfit ?? 0} />} />
            <Row k="Days played" v={state.totals.days} />
            <Row k="Total profit" v={<Money cents={state.totals.profit} />} />
            <Row k="Reputation" v={`${starsFloor(reputationOf(state))}★`} />
            <Row k="Money" v={<Money cents={state.money} />} />
          </dl>
        ) : (
          <dl className="sum-kv">
            <Row k="Days played" v={state.totals.days} />
            <Row k="Dishes served" v={state.totals.served.toLocaleString('en-US')} />
            <Row k="Total profit" v={<Money cents={state.totals.profit} />} />
            <Row k="Last day profit" v={last === null ? '–' : <Money cents={profitOf(last)} />} />
            <Row k="Reputation" v={`${starsFloor(reputationOf(state))}★`} />
            <Row k="Money" v={<Money cents={state.money} />} />
            <Row k="Kitchen size" v={`${state.width} × ${state.height}`} />
            <Row k="Dishes on the menu" v={state.menu.length} />
          </dl>
        )}
        {franchise !== null && (
          <section className="franchise-preview" aria-label="Franchise preview">
            <h3 className="franchise-h">Franchise out: points earned</h3>
            <dl className="sum-kv">
              {franchise.rows.map((r) => (
                <Row key={r.id} k={r.label} v={r.text} />
              ))}
              <Row k="Total" v={`+${franchise.earned}`} />
            </dl>
            <p className="franchise-book">
              <span aria-hidden="true">📖</span> {franchise.bookText}. {franchise.kept[1]}.
            </p>
          </section>
        )}
        {franchise !== null ? (
          <div className="confirm-actions">
            <button type="button" className="btn-quiet" onClick={onKeepPlaying}>
              Keep playing
            </button>
            <button ref={buttonRef} type="button" className="btn-primary" onClick={onFranchise}>
              Franchise out…
            </button>
          </div>
        ) : (
          <button ref={buttonRef} type="button" className="btn-primary sum-button" onClick={onKeepPlaying}>
            Keep playing
          </button>
        )}
      </div>
    </div>
  )
}
