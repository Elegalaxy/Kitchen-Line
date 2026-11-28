// A top-bar stat that opens its details on tap, click or Enter, so they are not left in a hover
// tooltip (the mouse tooltip stays too). A disclosure: the button carries aria-expanded and the
// lines follow it in reading order. Escape, a press outside or moving focus away closes it.

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export default function StatDisclosure({
  id,
  label,
  lines,
  open,
  onToggle,
  onClose,
  className = '',
  valueClass = '',
  children,
}: {
  id: string
  label: string
  lines: string[]
  open: boolean
  onToggle: () => void
  onClose: () => void
  className?: string
  valueClass?: string
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, onClose])

  return (
    <div
      ref={rootRef}
      className={`stat-disc ${className}`.trim()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return
        // Only this closes; the grid's Escape (cancel tool) must not also run.
        e.preventDefault()
        e.stopPropagation()
        onClose()
        buttonRef.current?.focus()
      }}
      onBlur={(e) => {
        if (open && e.relatedTarget !== null && !e.currentTarget.contains(e.relatedTarget)) onClose()
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="stat stat-btn"
        aria-expanded={open}
        aria-controls={open ? `stat-pop-${id}` : undefined}
        title={lines.join(', ')}
        onClick={onToggle}
      >
        <span className="stat-label">{label}</span>
        <span className={`stat-value num ${valueClass}`.trim()}>{children}</span>
      </button>
      {open && (
        <ul id={`stat-pop-${id}`} className="stat-pop" aria-label={`${label} details`}>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
