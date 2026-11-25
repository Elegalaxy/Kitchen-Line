// Confirm dialog for closing a branch (GAME_DESIGN 8.1). Destructive, so it is an alertdialog like
// NewGameConfirm: Cancel has focus by default, Esc cancels, Tab stays inside, and the confirm button names
// what it does. The refund and what is lost are shown above the buttons.

import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { BRANCH_CLOSE_REFUND_PERCENT } from '../sim/constants.ts'

export default function CloseBranchConfirm({
  name,
  refundText,
  onCancel,
  onConfirm,
}: {
  name: string
  refundText: string
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
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="close-branch-title"
        aria-describedby="close-branch-text"
        onKeyDown={onKeyDown}
        onKeyUp={(e) => e.stopPropagation()}
      >
        <h2 id="close-branch-title" className="sum-title">
          <span aria-hidden="true">⚠</span> Close {name}?
        </h2>
        <dl className="kv">
          <div className="kv-row">
            <dt>Refund</dt>
            <dd className="num">{refundText}</dd>
          </div>
        </dl>
        <p id="close-branch-text" className="notice-help">
          The refund is {BRANCH_CLOSE_REFUND_PERCENT}% of the branch's kitchen value. The opening fee is lost. This cannot be undone.
        </p>
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn-primary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm}>
            Close branch
          </button>
        </div>
      </div>
    </div>
  )
}
