// Franchise modal (GAME_DESIGN 8.2): the only place perks are bought. Shows the points earned this run
// in four parts, the balance after the picks, the perk cards (level, next cost, next effect, Buy
// disabled with its reason), what is kept, the blueprint library (which slot saves this run's kitchen, and
// once the Starter kitchen perk is owned which saved kitchen starts the next run), and one primary button
// that opens the confirm dialog. Picks are local until the player confirms; "Back" (or Esc) leaves without
// changing anything.

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { Defs, GameState, MetaState } from '../sim/types.ts'
import FranchiseConfirm from './FranchiseConfirm.tsx'
import { franchiseView } from './franchiseView.ts'
import type { KitChoices, SlotView } from './franchiseView.ts'
import { handleModalKeys } from './modalKeys.ts'

function Row({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <div className={`sum-row${strong ? ' total' : ''}`}>
      <dt>{k}</dt>
      <dd className="num">{v}</dd>
    </div>
  )
}

/** A radio list: one option per slot plus a last "none" option (value null). */
function SlotChoice({
  name,
  legend,
  note,
  slots,
  selected,
  noneLabel,
  onSelect,
  selectable,
}: {
  name: string
  legend: string
  note?: string
  slots: SlotView[]
  selected: number | null
  noneLabel: string
  onSelect: (slot: number | null) => void
  selectable: (s: SlotView) => boolean
}) {
  return (
    <fieldset className="kit-choice">
      <legend className="franchise-h">{legend}</legend>
      {note !== undefined && <p className="franchise-book">{note}</p>}
      {slots.map((s) => (
        <label key={s.slot} className={`kit-option${selectable(s) ? '' : ' kit-option-off'}`}>
          <input type="radio" name={name} checked={selected === s.slot} disabled={!selectable(s)} onChange={() => onSelect(s.slot)} />
          <span className="kit-slot">{s.name}</span>
          <span className={`kit-text${s.empty ? ' kit-empty' : ''}`}>
            {s.text}
            {s.warning !== null && (
              <span className="kit-warning">
                <span aria-hidden="true">⚠ </span>
                {s.warning}
              </span>
            )}
          </span>
        </label>
      ))}
      <label className="kit-option">
        <input type="radio" name={name} checked={selected === null} onChange={() => onSelect(null)} />
        <span className="kit-text">{noneLabel}</span>
      </label>
    </fieldset>
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
  onFranchise: (picks: string[], kit: KitChoices) => { ok: true } | { ok: false; reason: string }
}) {
  const [picks, setPicks] = useState<string[]>([])
  // undefined = the default (first empty slot to save into, the newest saved kitchen to start with)
  const [saveSlot, setSaveSlot] = useState<number | null | undefined>(undefined)
  const [useSlot, setUseSlot] = useState<number | null | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    startRef.current?.focus()
  }, [])
  const view = franchiseView(state, meta, defs, picks, { saveSlot, useSlot })
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    handleModalKeys(e, dialogRef.current)
    if (e.key === 'Escape') onClose()
  }
  const confirm = (): void => {
    const out = onFranchise(picks, { saveSlot: view.saveSelected, useSlot: view.useSelected })
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
                      {c.kitText !== null && (
                        <div className="kv-row">
                          <dt>Saved kitchen</dt>
                          <dd>{c.kitText}</dd>
                        </div>
                      )}
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

          {view.runKitText !== null && (
            <section aria-label="Blueprint library">
              <h3 className="franchise-h">Blueprint library</h3>
              <SlotChoice
                name="save-slot"
                legend="Save this run's kitchen"
                note={`This run's stall kitchen: ${view.runKitText}. Saving into a full slot replaces it.`}
                slots={view.saveSlots}
                selected={view.saveSelected}
                noneLabel="Don't save"
                onSelect={setSaveSlot}
                selectable={() => true}
              />
            </section>
          )}
          {view.kitOwned && view.useSlots.some((x) => !x.empty) && (
            <section aria-label="Next run's kitchen">
              <SlotChoice
                name="use-slot"
                legend="Start run with"
                note="The Starter kitchen builds this saved kitchen free on day 1."
                slots={view.useSlots}
                selected={view.useSelected}
                noneLabel="None (start empty)"
                onSelect={setUseSlot}
                selectable={(x) => !x.empty && x.warning === null}
              />
            </section>
          )}

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
