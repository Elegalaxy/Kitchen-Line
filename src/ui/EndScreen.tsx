// "Ready to expand" end screen (plan Step 16), shown when the phase is `won` (all restaurant
// goals done; it triggers once). Totals as key-value rows and one primary button, "Keep
// playing" (dismissSummary: back to the build phase, goals stay done). Esc does not dismiss;
// focus starts on the button and is trapped, like the day summary.

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { reputationOf } from '../sim/customers.ts'
import { profitOf } from '../sim/economy.ts'
import type { GameState } from '../sim/types.ts'
import Money from './Money.tsx'
import { starsFloor } from './goalsView.ts'
import { handleModalKeys } from './modalKeys.ts'

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="sum-row">
      <dt>{k}</dt>
      <dd className="num">{v}</dd>
    </div>
  )
}

export default function EndScreen({ state, onKeepPlaying }: { state: GameState; onKeepPlaying: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    buttonRef.current?.focus()
  }, [])
  const last = state.lastDay
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
          <span aria-hidden="true">🏆</span> Ready to expand
        </h2>
        <p className="end-lead">Every restaurant goal is done. Your kitchen is ready for the next step.</p>
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
        <button ref={buttonRef} type="button" className="btn-primary sum-button" onClick={onKeepPlaying}>
          Keep playing
        </button>
      </div>
    </div>
  )
}
