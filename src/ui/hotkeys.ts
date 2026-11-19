// Keyboard mapping (plan Step 5), kept pure so it can be unit-tested without a DOM.
// 1-9 then 0 pick the palette entries 1..10. R rotates, X toggles remove mode, Delete or
// Backspace removes, Esc cancels, Ctrl/Cmd+Z undoes, arrows move the tile cursor and
// Enter places or selects (the last two only act while the grid has focus).

export type KeyInfo = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey?: boolean }

export type HotkeyAction =
  | { type: 'tool'; index: number }
  | { type: 'rotate' }
  | { type: 'removeMode' }
  | { type: 'remove' }
  | { type: 'cancel' }
  | { type: 'undo' }
  | { type: 'move'; dx: number; dy: number }
  | { type: 'confirm' }

/** Palette index (0-based) for a digit key: '1'..'9' -> 0..8, '0' -> 9; null otherwise. */
export function indexForKey(key: string): number | null {
  if (key.length !== 1 || key < '0' || key > '9') return null
  return key === '0' ? 9 : Number(key) - 1
}

/** Hotkey label shown on the palette button for 0-based `index` (0..9), '' beyond that. */
export function labelForIndex(index: number): string {
  if (index < 0 || index > 9) return ''
  return index === 9 ? '0' : String(index + 1)
}

export function interpretKey(e: KeyInfo): HotkeyAction | null {
  const mod = e.ctrlKey || e.metaKey
  if (mod) {
    return !e.altKey && e.key.toLowerCase() === 'z' && e.shiftKey !== true ? { type: 'undo' } : null
  }
  if (e.altKey) return null
  const digit = indexForKey(e.key)
  if (digit !== null) return { type: 'tool', index: digit }
  switch (e.key) {
    case 'r':
    case 'R':
      return { type: 'rotate' }
    case 'x':
    case 'X':
      return { type: 'removeMode' }
    case 'Delete':
    case 'Backspace':
      return { type: 'remove' }
    case 'Escape':
      return { type: 'cancel' }
    case 'ArrowUp':
      return { type: 'move', dx: 0, dy: -1 }
    case 'ArrowDown':
      return { type: 'move', dx: 0, dy: 1 }
    case 'ArrowLeft':
      return { type: 'move', dx: -1, dy: 0 }
    case 'ArrowRight':
      return { type: 'move', dx: 1, dy: 0 }
    case 'Enter':
      return { type: 'confirm' }
    default:
      return null
  }
}
