// Top bar: day, money, reputation (4.2★ with a change arrow since the day started), clock, phase badge, day bar, the "Open for service" button (build
// phase only) and the speed segmented control (pause / 1x / 2x / 4x). The closing and critic cues share a
// live region: a reserved row on wide screens, an overlay below the day bar on phones.

import { useCallback, useState } from 'react'
import { DAY_PHASE_STARTS, DAY_TICKS } from '../sim/constants.ts'
import { reputationOf } from '../sim/customers.ts'
import { togglePantriesAction } from './actions.ts'
import type { Ctx } from './actions.ts'
import { closingSoonView } from './closingSoon.ts'
import { clockText, PHASE_TEXT, phaseKey, reputationView } from './format.ts'
import Money from './Money.tsx'
import SettingsMenu from './SettingsMenu.tsx'
import { SPEEDS } from './store.ts'
import type { GameStore, Snapshot, Speed } from './store.ts'
import { criticCueKey, criticNotice } from './criticView.ts'
import { seasonDetails, seasonView } from './seasonView.ts'
import StatDisclosure from './StatDisclosure.tsx'
import { trendDetails, trendView } from './trendView.ts'

const SPEED_LABEL: Record<Speed, string> = { 0: 'Pause', 1: '1×', 2: '2×', 4: '4×' }

/** Rush bands for the day bar, as percentages of the day. Stripes and a label mark them. */
const RUSH_BANDS = DAY_PHASE_STARTS.flatMap((p, i) => {
  if (p.phase !== 'open' && p.phase !== 'closing' && p.phase !== 'quiet') {
    const end = DAY_PHASE_STARTS[i + 1]?.from ?? DAY_TICKS
    return [{ label: p.phase === 'lunchRush' ? 'Lunch' : 'Dinner', left: (p.from / DAY_TICKS) * 100, width: ((end - p.from) / DAY_TICKS) * 100 }]
  }
  return []
})

export default function TopBar({ ctx, store, snap, run, onNewGame }: { ctx: Ctx; store: GameStore; snap: Snapshot; run: number; onNewGame: () => void }) {
  const s = snap.state
  const phase = PHASE_TEXT[phaseKey(s)]
  const pct = (Math.min(s.dayTick, DAY_TICKS) / DAY_TICKS) * 100
  const rep = reputationView(reputationOf(s), s.repAtDayStart)
  const closing = closingSoonView(s)
  const trend = trendView(s, ctx.store.defs)
  const season = seasonView(s, ctx.store.defs)
  const critic = criticNotice(s, ctx.store.defs)
  // Phones only (CSS): the cue lies over the content below the day bar, so the critic notice can be closed.
  const [hiddenCue, setHiddenCue] = useState<string | null>(null)
  const criticKey = critic === null ? null : criticCueKey(s.day, critic)
  // Stat details: one open at a time.
  const [openStat, setOpenStat] = useState<string | null>(null)
  const closeStat = useCallback(() => setOpenStat(null), [])
  const disclosure = (id: string) => ({
    id,
    open: openStat === id,
    onToggle: () => setOpenStat((cur) => (cur === id ? null : id)),
    onClose: closeStat,
  })
  const repLabel = `Reputation ${rep.text} stars${rep.dir === null ? '' : rep.dir === 'up' ? ', up since day start' : ', down since day start'}`
  return (
    <header className="topbar">
      {run >= 2 && (
        <dl className="stat stat-run" title={`Franchise run ${run}`}>
          <dt>Run</dt>
          <dd className="num">{run}</dd>
        </dl>
      )}
      <dl className="stat">
        <dt>Day</dt>
        <dd className="num">{s.day}</dd>
      </dl>
      <dl className="stat">
        <dt>Money</dt>
        <dd className="num money">
          <Money cents={s.money} />
        </dd>
      </dl>
      <StatDisclosure {...disclosure('rating')} label="Rating" lines={[repLabel]} valueClass="rep">
        <span aria-hidden="true">{rep.text}★</span>
        <span className="sr-only">{repLabel}</span>
        <span className={`rep-delta${rep.dir === null ? '' : ` ${rep.dir}`}`} aria-hidden="true">
          {rep.dir === 'up' ? '▲' : rep.dir === 'down' ? '▼' : ''}
        </span>
      </StatDisclosure>
      <dl className="stat">
        <dt>Time</dt>
        <dd className="num clock">{clockText(s.dayTick)}</dd>
      </dl>
      {season !== null && (
        <StatDisclosure {...disclosure('season')} label="Season" lines={seasonDetails(season)} className="stat-season">
          <span aria-hidden="true">{season.emoji}</span> {season.short}
          <span className="sr-only">: {season.progress}</span>
        </StatDisclosure>
      )}
      {trend !== null && (
        <StatDisclosure {...disclosure('trend')} label="Trend" lines={trendDetails(trend)} className="stat-trend">
          <span aria-hidden="true">🔥</span> {trend.short}
          <span className="sr-only">: {trend.text}</span>
        </StatDisclosure>
      )}
      <span className="phase-badge" role="status" aria-label={`Phase: ${phase.word}`}>
        <span aria-hidden="true">{phase.icon}</span> {phase.word}
      </span>
      {s.phase === 'build' && (
        <button type="button" className="btn-primary" onClick={() => store.dispatch({ type: 'openService' })}>
          <span aria-hidden="true">▶</span> Open for service
        </button>
      )}
      <div className="topbar-controls">
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
        <SettingsMenu run={run} onNewGame={onNewGame} />
      </div>
      <div className="closing-slot" role="status" aria-live="polite">
        {closing.active && (
          <div className="closing-cue">
            <span className="closing-text">
              <span aria-hidden="true">⚠</span> {closing.text} <span className="num">({closing.secondsLeft} s)</span>
            </span>
            {closing.showPauseButton && (
              <button type="button" className="btn-closing" onClick={() => togglePantriesAction(ctx)}>
                <span aria-hidden="true">⏸</span> Pause pantries
              </button>
            )}
            {closing.pausedNote !== null && (
              <span className="closing-note">
                <span aria-hidden="true">✓</span> {closing.pausedNote}
              </span>
            )}
          </div>
        )}
        {!closing.active && critic !== null && (
          <div className={`critic-cue critic-${critic.kind}${hiddenCue === criticKey ? ' cue-hidden' : ''}`}>
            <span className="critic-badge">
              <span aria-hidden="true">★</span> CRITIC
            </span>
            <span className="critic-text">{critic.text}</span>
            <button
              type="button"
              className="btn-quiet cue-dismiss"
              aria-label="Hide critic notice"
              onClick={(e) => {
                // The button disappears with the cue: keep keyboard focus in the top bar.
                const bar = e.currentTarget.closest('.topbar')
                setHiddenCue(criticKey)
                bar?.querySelector<HTMLButtonElement>('.seg-btn[aria-pressed="true"]')?.focus({ preventScroll: true })
              }}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        )}
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
