// Confirm dialog for "Sell chain and start run N" (GAME_DESIGN 8.2). The current game is replaced, so it
// is an alertdialog like NewGameConfirm: Cancel has focus, Esc cancels, Tab stays inside, and the confirm
// button names what it does. A refused franchise (duplicate seed, storage) is shown here.

import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'

export default function FranchiseConfirm({
  run,
  error,
  onCancel,
  onConfirm,
}: {
  run: number
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }
    if (e.key !== 'Tab') return
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>('button')
    if (nodes === undefined || nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  return (
    <div className="modal-backdrop franchise-confirm-backdrop">
      <div
        ref={dialogRef}
        className="modal confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="franchise-confirm-title"
        aria-describedby="franchise-confirm-text"
        onKeyDown={onKeyDown}
        onKeyUp={(e) => e.stopPropagation()}
      >
        <h2 id="franchise-confirm-title" className="sum-title">
          <span aria-hidden="true">⚠</span> Sell the chain?
        </h2>
        <p id="franchise-confirm-text" className="notice-help">
          Your current game is replaced. Points, perks and recipe book are kept.
        </p>
        {error !== null && (
          <p className="goal-reason" role="alert">
            <span aria-hidden="true">⚠</span> {error}
          </p>
        )}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn-primary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm}>
            Sell chain and start run {run}
          </button>
        </div>
      </div>
    </div>
  )
}
