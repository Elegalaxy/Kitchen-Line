// Orders strip (plan Step 11), above the grid: one fixed-size chip per waiting-order slot.
// Capacity is shown as empty slots, so the strip never changes size while customers come
// and go. A chip shows the dish glyph, a patience bar and the seconds left. The bar is
// green from 50%, yellow from 25 to 50% and red below 25%, and under 25% the chip also
// shows an alarm icon (colour is never the only cue). Read-only: nothing here is clickable.

import { WAITING_CAP } from '../sim/constants.ts'
import type { Customer, Defs, GameState } from '../sim/types.ts'
import { formatMoney } from './format.ts'
import { patienceLeft, patienceLevel } from './orders.ts'

const TICKS_PER_SECOND = 10

function secondsLeft(c: Pick<Customer, 'arriveTick' | 'patience'>, tick: number): number {
  return Math.max(0, Math.ceil((c.arriveTick + c.patience - tick) / TICKS_PER_SECOND))
}

function Chip({ c, tick, defs }: { c: Customer; tick: number; defs: Defs }) {
  const dish = defs.dishes[c.dish]
  const name = dish?.name ?? c.dish
  const frac = patienceLeft(c, tick)
  const level = patienceLevel(frac)
  const secs = secondsLeft(c, tick)
  const label = `${name} order, ${formatMoney(c.price)}, ${secs} seconds of patience left`
  return (
    <li className={`order-chip order-${level}`} aria-label={label} title={label}>
      <span className="order-glyph" aria-hidden="true">
        {dish?.emoji ?? '?'}
      </span>
      <span className="order-bar" aria-hidden="true">
        <span className="order-bar-fill" style={{ width: `${Math.round(frac * 100)}%` }} />
      </span>
      <span className="order-time num" aria-hidden="true">
        {level === 'bad' ? '⏰' : ''}
        {secs}s
      </span>
    </li>
  )
}

export default function OrdersStrip({ state, defs }: { state: GameState; defs: Defs }) {
  const cap = WAITING_CAP[state.tier]
  const slots = Array.from({ length: cap }, (_, i) => state.waiting[i] ?? null)
  return (
    <section className="orders" aria-label="Waiting orders">
      <h2 className="panel-title">
        Orders <span className="num">{state.waiting.length} / {cap}</span>
      </h2>
      <ul className="orders-list">
        {slots.map((c, i) =>
          c === null ? (
            <li key={`empty-${i}`} className="order-chip order-empty" aria-label="Empty slot" />
          ) : (
            <Chip key={c.id} c={c} tick={state.tick} defs={defs} />
          ),
        )}
      </ul>
    </section>
  )
}
