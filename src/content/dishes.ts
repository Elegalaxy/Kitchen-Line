// Dishes. Reference prices and recipe unlock costs are in cents and provisional
// (GAME_DESIGN 6.1 and 5.4, plan 2.5). Popularity is the taste draw weight.
// Fries and soup are made by stations; the others by an assembler from `inputs`.
// Fries and salad start unlocked.

import type { DishDef } from '../sim/types.ts'

const list: DishDef[] = [
  { id: 'fries', name: 'Fries', emoji: '🍟', refPrice: 300, popularity: 3, startsUnlocked: true, unlockCost: 0 },
  {
    id: 'salad',
    name: 'Salad',
    emoji: '🥗',
    refPrice: 450,
    popularity: 2,
    startsUnlocked: true,
    unlockCost: 0,
    inputs: ['choppedLettuce', 'slicedTomato'],
  },
  { id: 'soup', name: 'Soup', emoji: '🍲', refPrice: 400, popularity: 1, startsUnlocked: false, unlockCost: 4000 },
  {
    id: 'sandwich',
    name: 'Sandwich',
    emoji: '🥪',
    refPrice: 600,
    popularity: 2,
    startsUnlocked: false,
    unlockCost: 6000,
    inputs: ['bread', 'slicedTomato', 'choppedLettuce'],
  },
  {
    id: 'burger',
    name: 'Burger',
    emoji: '🍔',
    refPrice: 800,
    popularity: 3,
    startsUnlocked: false,
    unlockCost: 8000,
    inputs: ['bun', 'cookedPatty', 'slicedTomato'],
  },
  {
    id: 'riceBowl',
    name: 'Rice bowl',
    emoji: '🍛',
    refPrice: 700,
    popularity: 2,
    startsUnlocked: false,
    unlockCost: 10000,
    inputs: ['cookedRice', 'cookedPatty'],
  },
]

export const DISHES: Record<string, DishDef> = Object.fromEntries(list.map((d) => [d.id, d]))
