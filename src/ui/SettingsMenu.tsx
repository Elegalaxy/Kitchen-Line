// Settings menu in the top bar (plan Step 17): a button that opens a small menu with the Sound
// switch (off by default; its state is written as "On" / "Off" and it keeps the menu open) and
// "New game", which asks for confirmation before deleting the save. The button has aria-haspopup="menu";
// Enter / Space / ArrowDown open it, arrows move, Esc closes and returns focus, a click outside
// closes it. Keys are stopped here so the game hotkeys (Space = pause) do not fire behind it.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import NewGameConfirm from './NewGameConfirm.tsx'
import { getSoundController } from './sound/controller.ts'

export default function SettingsMenu({ run, onNewGame }: { run: number; onNewGame: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const sound = getSoundController()
  const soundOn = useSyncExternalStore(sound.subscribe, sound.isOn, sound.isOn)
  const canPlay = sound.available()

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
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
      const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      const at = items.indexOf(document.activeElement as HTMLButtonElement)
      const step = e.key === 'ArrowDown' ? 1 : -1
      items[at < 0 ? 0 : (at + step + items.length) % items.length]?.focus()
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
        <div ref={menuRef} id="settings-menu" className="settings-menu" role="menu" aria-label="Settings">
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={soundOn && canPlay}
            className="menu-item menu-item-switch"
            disabled={!canPlay}
            onClick={() => sound.setOn(!soundOn)}
          >
            <span>Sound</span>
            <span className="menu-item-state">{!canPlay ? 'Not available in this browser' : soundOn ? 'On' : 'Off'}</span>
          </button>
          <button
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
          run={run}
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
