// Confirm dialog for "New game" (plan Step 17). Destructive, so it is an alertdialog: Cancel has
// focus by default, Esc cancels, Tab stays inside, and the confirm button names what it does.

import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'

export default function NewGameConfirm({ run = 1, onCancel, onConfirm }: { run?: number; onCancel: () => void; onConfirm: () => void }) {
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
        aria-labelledby="confirm-title"
        aria-describedby="confirm-text"
        onKeyDown={onKeyDown}
        onKeyUp={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="sum-title">
          <span aria-hidden="true">⚠</span> Start a new game?
        </h2>
        <p id="confirm-text" className="notice-help">
          This deletes your current save: the kitchen, money, goals and every day played. It cannot be undone.
        </p>
        {run >= 2 && (
          <p className="notice-help">
            Your franchise points, perks and recipe book are kept. Run {run} starts over with its perks.
          </p>
        )}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn-primary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm}>
            Delete save and start over
          </button>
        </div>
      </div>
    </div>
  )
}
