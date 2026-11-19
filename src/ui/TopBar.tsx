// Top bar: day, money and the speed segmented control (pause / 1x / 2x / 4x).

import { formatMoney } from './format.ts'
import { SPEEDS } from './store.ts'
import type { GameStore, Snapshot, Speed } from './store.ts'

const SPEED_LABEL: Record<Speed, string> = { 0: 'Pause', 1: '1×', 2: '2×', 4: '4×' }

export default function TopBar({ store, snap }: { store: GameStore; snap: Snapshot }) {
  return (
    <header className="topbar">
      <dl className="stat">
        <dt>Day</dt>
        <dd className="num">{snap.state.day}</dd>
      </dl>
      <dl className="stat">
        <dt>Money</dt>
        <dd className="num money">{formatMoney(snap.state.money)}</dd>
      </dl>
      <div className="segmented" role="group" aria-label="Game speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className="seg-btn"
            aria-pressed={snap.speed === s}
            onClick={() => store.setSpeed(s)}
          >
            <span aria-hidden="true">{s === 0 ? '⏸' : ''}</span>
            {SPEED_LABEL[s]}
          </button>
        ))}
      </div>
    </header>
  )
}
