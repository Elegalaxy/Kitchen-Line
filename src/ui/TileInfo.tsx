// One line under the grid about the tile under the pointer or the keyboard cursor (plan
// Step 18): the building and each held item with its freshness in seconds. It is the text
// twin of the canvas hover tooltip. The visible line updates with the game; a separate
// polite status region only announces when the keyboard cursor moves to another tile, so a
// screen reader is not interrupted by the per-second countdown.

import { useEffect, useState } from 'react'
import type { Defs, GameState } from '../sim/types.ts'
import { tileSummary } from './tileInfo.ts'
import type { UiState } from './uiState.ts'

export default function TileInfo({ state, defs, ui }: { state: GameState; defs: Defs; ui: UiState }) {
  const c = ui.cursor
  const summary = c === null ? null : tileSummary(state, defs, c.x, c.y)
  const text =
    c === null
      ? 'Hover a tile, or move the cursor with the arrow keys, to see what is on it.'
      : (summary ?? `Tile ${c.x}, ${c.y}: empty.`)
  const [announced, setAnnounced] = useState('')
  const cx = c?.x ?? -1
  const cy = c?.y ?? -1
  const fromKeys = ui.cursorFromKeys
  useEffect(() => {
    setAnnounced(fromKeys && cx >= 0 ? text : '')
    // Only the tile changing re-announces; the countdown in `text` does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cx, cy, fromKeys])
  return (
    <>
      <p className="tile-info num" title={text}>
        {text}
      </p>
      <p className="sr-only" role="status">
        {announced}
      </p>
    </>
  )
}
