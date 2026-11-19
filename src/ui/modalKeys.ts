// Keyboard handling shared by the modal dialogs (day summary, end screen): every key stays
// inside the dialog (no hotkeys behind it), Esc does nothing and Tab cycles between the
// dialog's focusable elements.

import type { KeyboardEvent } from 'react'

export function handleModalKeys(e: KeyboardEvent<HTMLElement>, dialog: HTMLElement | null): void {
  e.stopPropagation()
  if (e.key === 'Escape') {
    e.preventDefault()
    return
  }
  if (e.key !== 'Tab') return
  const nodes = dialog?.querySelectorAll<HTMLElement>('button, [tabindex="0"]')
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
