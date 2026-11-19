// Shown when the stored save could not be loaded (plan Step 17). It blocks the game behind it
// until the player picks "Start new game"; the unreadable text is kept under the .corrupt key.
// The warning icon and the heading carry the meaning, not colour. Focus starts on the button
// and stays inside; Esc does nothing.

import { useEffect, useRef } from 'react'
import { handleModalKeys } from './modalKeys.ts'

export default function SaveNotice({ reason, onStartNew }: { reason: string; onStartNew: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    buttonRef.current?.focus()
  }, [])
  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal save-notice"
        role="alert"
        aria-labelledby="save-notice-title"
        aria-describedby="save-notice-reason"
        onKeyDown={(e) => handleModalKeys(e, dialogRef.current)}
      >
        <h2 id="save-notice-title" className="sum-title">
          <span aria-hidden="true">⚠</span> Could not load your saved game
        </h2>
        <p id="save-notice-reason" className="notice-reason">
          <span className="notice-label">Reason</span> {reason}
        </p>
        <p className="notice-help">A copy of the unreadable save is kept in this browser, so nothing is lost until you save again.</p>
        <button ref={buttonRef} type="button" className="btn-primary sum-button" onClick={onStartNew}>
          Start new game
        </button>
      </div>
    </div>
  )
}
