// Game loop (plan Step 4): requestAnimationFrame with a time accumulator. At speed s a
// tick is due every 100 / s ms. At most MAX_TICKS_PER_FRAME run per frame, so a
// background tab or a long frame cannot spiral; the backlog is then dropped.

import type { GameStore } from './store.ts'

export const TICK_MS = 100
export const MAX_TICKS_PER_FRAME = 40

/** Pure accumulator step. `acc` is in "sim milliseconds" (real dt * speed). */
export function advanceAccumulator(
  acc: number,
  dtMs: number,
  speed: number,
  tickMs: number = TICK_MS,
  maxTicks: number = MAX_TICKS_PER_FRAME,
): { ticks: number; acc: number } {
  if (!(speed > 0)) return { ticks: 0, acc: 0 }
  if (!(dtMs > 0)) return { ticks: 0, acc }
  const total = acc + dtMs * speed
  const due = Math.floor(total / tickMs)
  if (due > maxTicks) return { ticks: maxTicks, acc: 0 }
  return { ticks: due, acc: total - due * tickMs }
}

/** Start the loop; returns a stop function. */
export function startLoop(store: GameStore): () => void {
  let raf = 0
  let last: number | null = null
  let acc = 0
  const frame = (t: number): void => {
    const dt = last === null ? 0 : t - last
    last = t
    const r = advanceAccumulator(acc, dt, store.getSpeed())
    acc = r.acc
    if (r.ticks > 0) store.advance(r.ticks)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(raf)
}
