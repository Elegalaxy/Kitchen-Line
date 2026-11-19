// Items: raw ingredients, processed ingredients and dishes (plan 2.5, 2.6).
// Provisional numbers: ingredient costs in cents (GAME_DESIGN 7, plan 2.5) and spoil
// times in ticks (GAME_DESIGN 5.2: only fresh produce and finished dishes spoil).

import type { ItemDef } from '../sim/types.ts'

const FRESH_SPOIL_TICKS = 600
// Step 18 balance (GAME_DESIGN 5.2): was 300. A dish no customer wants sits on the pass shelf and
// the line re-makes it as soon as it spoils; at 300 that shelf cycling alone cost a salad or
// sandwich line more than the dish earned. At 600 every dish line is profitable.
const DISH_SPOIL_TICKS = 600

const list: ItemDef[] = [
  { id: 'potato', name: 'Potato', emoji: '🥔', kind: 'raw', cost: 30 },
  { id: 'tomato', name: 'Tomato', emoji: '🍅', kind: 'raw', cost: 40, spoilTicks: FRESH_SPOIL_TICKS },
  { id: 'lettuce', name: 'Lettuce', emoji: '🥬', kind: 'raw', cost: 40, spoilTicks: FRESH_SPOIL_TICKS },
  { id: 'bun', name: 'Bun', emoji: '🍞', kind: 'raw', cost: 50 },
  { id: 'patty', name: 'Patty (raw)', emoji: '🥩', kind: 'raw', cost: 120 },
  { id: 'rice', name: 'Rice', emoji: '🌾', kind: 'raw', cost: 30 },
  { id: 'bread', name: 'Bread', emoji: '🥖', kind: 'raw', cost: 40 },

  { id: 'potatoStrips', name: 'Potato strips', emoji: '🥔', kind: 'processed' },
  {
    id: 'slicedTomato',
    name: 'Sliced tomato',
    emoji: '🍅',
    kind: 'processed',
    spoilTicks: FRESH_SPOIL_TICKS,
  },
  {
    id: 'choppedLettuce',
    name: 'Chopped lettuce',
    emoji: '🥬',
    kind: 'processed',
    spoilTicks: FRESH_SPOIL_TICKS,
  },
  { id: 'cookedPatty', name: 'Cooked patty', emoji: '🥩', kind: 'processed' },
  { id: 'cookedRice', name: 'Cooked rice', emoji: '🍚', kind: 'processed' },

  { id: 'fries', name: 'Fries', emoji: '🍟', kind: 'dish', spoilTicks: DISH_SPOIL_TICKS },
  { id: 'salad', name: 'Salad', emoji: '🥗', kind: 'dish', spoilTicks: DISH_SPOIL_TICKS },
  { id: 'soup', name: 'Soup', emoji: '🍲', kind: 'dish', spoilTicks: DISH_SPOIL_TICKS },
  { id: 'sandwich', name: 'Sandwich', emoji: '🥪', kind: 'dish', spoilTicks: DISH_SPOIL_TICKS },
  { id: 'burger', name: 'Burger', emoji: '🍔', kind: 'dish', spoilTicks: DISH_SPOIL_TICKS },
  { id: 'riceBowl', name: 'Rice bowl', emoji: '🍛', kind: 'dish', spoilTicks: DISH_SPOIL_TICKS },
]

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((i) => [i.id, i]))
