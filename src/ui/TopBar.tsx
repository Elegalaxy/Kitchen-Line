// Top bar: day, money, reputation (4.2★ with a change arrow since the day started), clock, phase badge, day bar, the "Open for service" button (build
// phase only) and the speed segmented control (pause / 1x / 2x / 4x).

import { DAY_PHASE_STARTS, DAY_TICKS } from '../sim/constants.ts'
import { reputationOf } from '../sim/customers.ts'
import { clockText, formatMoney, PHASE_TEXT, phaseKey, reputationView } from './format.ts'
import { SPEEDS } from './store.ts'
import type { GameStore, Snapshot, Speed } from './store.ts'

const SPEED_LABEL: Record<Speed, string> = { 0: 'Pause', 1: '1×', 2: '2×', 4: '4×' }

/** Rush bands for the day bar, as percentages of the day. Stripes and a label mark them. */
const RUSH_BANDS = DAY_PHASE_STARTS.flatMap((p, i) => {
  if (p.phase !== 'open' && p.phase !== 'closing' && p.phase !== 'quiet') {
    const end = DAY_PHASE_STARTS[i + 1]?.from ?? DAY_TICKS
    return [{ label: p.phase === 'lunchRush' ? 'Lunch' : 'Dinner', left: (p.from / DAY_TICKS) * 100, width: ((end - p.from) / DAY_TICKS) * 100 }]
  }
  return []
})

export default function TopBar({ store, snap }: { store: GameStore; snap: Snapshot }) {
  const s = snap.state
  const phase = PHASE_TEXT[phaseKey(s)]
  const pct = (Math.min(s.dayTick, DAY_TICKS) / DAY_TICKS) * 100
  const rep = reputationView(reputationOf(s), s.repAtDayStart)
  const repLabel = `Reputation ${rep.text} stars${rep.dir === null ? '' : rep.dir === 'up' ? ', up since day start' : ', down since day start'}`
  return (
    <header className="topbar">
      <dl className="stat">
        <dt>Day</dt>
        <dd className="num">{s.day}</dd>
      </dl>
      <dl className="stat">
        <dt>Money</dt>
        <dd className="num money">{formatMoney(s.money)}</dd>
      </dl>
      <dl className="stat" title={repLabel}>
        <dt>Rating</dt>
        <dd className="num rep">
          <span aria-hidden="true">{rep.text}★</span>
          <span className="sr-only">{repLabel}</span>
          <span className={`rep-delta${rep.dir === null ? '' : ` ${rep.dir}`}`} aria-hidden="true">
            {rep.dir === 'up' ? '▲' : rep.dir === 'down' ? '▼' : ''}
          </span>
        </dd>
      </dl>
      <dl className="stat">
        <dt>Time</dt>
        <dd className="num clock">{clockText(s.dayTick)}</dd>
      </dl>
      <span className="phase-badge" role="status" aria-label={`Phase: ${phase.word}`}>
        <span aria-hidden="true">{phase.icon}</span> {phase.word}
      </span>
      {s.phase === 'build' && (
        <button type="button" className="btn-primary" onClick={() => store.dispatch({ type: 'openService' })}>
          <span aria-hidden="true">▶</span> Open for service
        </button>
      )}
      <div className="segmented" role="group" aria-label="Game speed">
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            type="button"
            className="seg-btn"
            aria-pressed={snap.speed === sp}
            onClick={() => store.setSpeed(sp)}
          >
            <span aria-hidden="true">{sp === 0 ? '⏸' : ''}</span>
            {SPEED_LABEL[sp]}
          </button>
        ))}
      </div>
      <div
        className="daybar"
        role="progressbar"
        aria-label="Day progress"
        aria-valuemin={0}
        aria-valuemax={DAY_TICKS}
        aria-valuenow={Math.min(s.dayTick, DAY_TICKS)}
        aria-valuetext={`${clockText(s.dayTick)}, ${phase.word}`}
      >
        {RUSH_BANDS.map((b) => (
          <span key={b.label} className="daybar-band" style={{ left: `${b.left}%`, width: `${b.width}%` }}>
            {b.label}
          </span>
        ))}
        <span className="daybar-fill" style={{ width: `${pct}%` }} />
      </div>
    </header>
  )
}
