// Settings menu in the top bar (plan Step 17): a button that opens a small menu with "New game",
// which asks for confirmation before deleting the save. The button has aria-haspopup="menu";
// Enter / Space / ArrowDown open it, arrows move, Esc closes and returns focus, a click outside
// closes it. Keys are stopped here so the game hotkeys (Space = pause) do not fire behind it.

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import NewGameConfirm from './NewGameConfirm.tsx'

export default function SettingsMenu({ onNewGame }: { onNewGame: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) itemRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const close = (): void => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab' && open) {
      setOpen(false)
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
      e.preventDefault()
      setOpen(true)
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && open) {
      e.preventDefault()
      itemRef.current?.focus() // one item: the arrows just keep focus on it
    }
  }

  return (
    <div
      ref={rootRef}
      className="settings"
      onKeyDown={onKeyDown}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        className="btn-quiet settings-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="settings-menu"
        aria-label="Settings"
        title="Settings"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">⚙</span>
      </button>
      {open && (
        <div id="settings-menu" className="settings-menu" role="menu" aria-label="Settings">
          <button
            ref={itemRef}
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false)
              setConfirming(true)
            }}
          >
            New game…
          </button>
        </div>
      )}
      {confirming && (
        <NewGameConfirm
          onCancel={() => {
            setConfirming(false)
            buttonRef.current?.focus()
          }}
          onConfirm={() => {
            setConfirming(false)
            onNewGame()
            buttonRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}
