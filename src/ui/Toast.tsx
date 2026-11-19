// Toast: one short message at the bottom of the screen (rejected commands, undo results).
// It is a polite live region and is not interactive; it clears itself after a few seconds.

import type { Toast as ToastData } from './uiState.ts'

export default function Toast({ toast }: { toast: ToastData | null }) {
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toast !== null && (
        <p key={toast.id} className={`toast toast-${toast.tone}`}>
          <span aria-hidden="true">{toast.tone === 'bad' ? '⚠' : 'ℹ'}</span> {toast.text}
        </p>
      )}
    </div>
  )
}
