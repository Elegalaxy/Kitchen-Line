// Franchise modal (GAME_DESIGN 8.2): the only place perks are bought. Shows the points earned this run
// in four parts, the balance after the picks, the perk cards (level, next cost, next effect, Buy
// disabled with its reason), what is kept, and one primary button that opens the confirm dialog.
// Picks are local until the player confirms; "Back" (or Esc) leaves without changing anything.

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { Defs, GameState, MetaState } from '../sim/types.ts'
import FranchiseConfirm from './FranchiseConfirm.tsx'
import { franchiseView } from './franchiseView.ts'
import { handleModalKeys } from './modalKeys.ts'

function Row({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <div className={`sum-row${strong ? ' total' : ''}`}>
      <dt>{k}</dt>
      <dd className="num">{v}</dd>
    </div>
  )
}

export default function FranchiseModal({
  state,
  meta,
  defs,
  onClose,
  onFranchise,
}: {
  state: GameState
  meta: MetaState
  defs: Defs
  onClose: () => void
  onFranchise: (picks: string[]) => { ok: true } | { ok: false; reason: string }
}) {
  const [picks, setPicks] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    startRef.current?.focus()
  }, [])
  const view = franchiseView(state, meta, defs, picks)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    handleModalKeys(e, dialogRef.current)
    if (e.key === 'Escape') onClose()
  }
  const confirm = (): void => {
    const out = onFranchise(picks)
    if (!out.ok) setError(out.reason)
  }
  const undoPick = (id: string): void => {
    const at = picks.lastIndexOf(id)
    if (at >= 0) setPicks(picks.filter((_, i) => i !== at))
  }
  return (
    <>
      <div className="modal-backdrop">
        <div
          ref={dialogRef}
          className="modal franchise-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="franchise-title"
          onKeyDown={onKeyDown}
          onKeyUp={(e) => e.stopPropagation()}
        >
          <h2 id="franchise-title" className="sum-title">
            <span aria-hidden="true">🏬</span> Franchise out
          </h2>
          <p className="end-lead">Sell the chain and start run {view.nextRun} with a new stall. Spend your points on perks first.</p>

          <div className="franchise-top">
            <section aria-label="Points earned this run">
              <h3 className="franchise-h">Points earned</h3>
              <dl className="sum-kv">
                {view.rows.map((r) => (
                  <Row key={r.id} k={r.label} v={r.text} />
                ))}
                <Row k="Earned this run" v={`+${view.earned}`} strong />
                <Row k="Held before" v={view.balanceBefore} />
                <Row k="Spent on perks" v={`−${view.spent}`} />
                <Row k="Points left" v={<span className="franchise-left">{view.left}</span>} strong />
              </dl>
            </section>
            <section aria-label="Kept for the next run">
              <h3 className="franchise-h">Kept</h3>
              <ul className="franchise-kept">
                <li>
                  <span aria-hidden="true">📖</span> {view.bookText}
                </li>
                <li>
                  <span aria-hidden="true">✓</span> {view.kept[1]}
                </li>
              </ul>
              <p className="franchise-book">{view.bookNames.join(', ')}</p>
            </section>
          </div>

          <section aria-label="Perks">
            <h3 className="franchise-h">Perks</h3>
            <ul className="perk-grid">
              {view.cards.map((c) => {
                const reasonId = `perk-reason-${c.id}`
                return (
                  <li key={c.id} className="perk-card">
                    <div className="perk-head">
                      <span className="dish-name">
                        <span aria-hidden="true">{c.emoji}</span> {c.name}
                      </span>
                      <span className={`branch-badge${c.nextCost === null ? ' ok' : ''}`}>
                        {c.nextCost === null && <span aria-hidden="true">✓ </span>}
                        {c.levelText}
                      </span>
                    </div>
                    <dl className="kv">
                      <div className="kv-row">
                        <dt>Now</dt>
                        <dd>{c.currentEffect}</dd>
                      </div>
                      <div className="kv-row">
                        <dt>Next level</dt>
                        <dd>{c.nextEffect ?? '–'}</dd>
                      </div>
                      <div className="kv-row">
                        <dt>Cost</dt>
                        <dd className="num">{c.costText}</dd>
                      </div>
                    </dl>
                    <div className="perk-actions">
                      <button
                        type="button"
                        className="btn-primary perk-buy"
                        disabled={!c.canBuy}
                        aria-describedby={reasonId}
                        onClick={() => setPicks([...picks, c.id])}
                      >
                        Buy
                      </button>
                      {c.pending > 0 && (
                        <button type="button" className="btn-quiet" onClick={() => undoPick(c.id)}>
                          Undo
                        </button>
                      )}
                    </div>
                    <p id={reasonId} className="pal-reason">
                      {c.reason === null ? '' : `⚠ ${c.reason}`}
                    </p>
                  </li>
                )
              })}
            </ul>
          </section>

          {view.blocked !== null && (
            <p className="goal-reason">
              <span aria-hidden="true">⚠</span> {view.blocked}
            </p>
          )}
          <div className="confirm-actions">
            <button type="button" className="btn-quiet" onClick={onClose}>
              Back
            </button>
            <button ref={startRef} type="button" className="btn-primary" disabled={view.blocked !== null} onClick={() => setConfirming(true)}>
              {view.startLabel}
            </button>
          </div>
        </div>
      </div>
      {confirming && (
        <FranchiseConfirm
          run={view.nextRun}
          error={error}
          onCancel={() => {
            setConfirming(false)
            setError(null)
          }}
          onConfirm={confirm}
        />
      )}
    </>
  )
}
