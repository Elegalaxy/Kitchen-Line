// Dishes. Reference prices and recipe unlock costs are in cents and provisional
// (GAME_DESIGN 6.1 and 5.4, plan 2.5). Popularity is the taste draw weight.
// Fries and soup are made by stations; the others by an assembler from `inputs`.
// Fries and salad start unlocked.

import type { DishDef } from '../sim/types.ts'
import { ITEMS } from './items.ts'
import { STATION_RECIPES } from './recipes.ts'

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
  // Dish pack (GAME_DESIGN 5.4, 6.1): restaurant tier only. Ingredient cost: fish and chips 180 (fish 150 + potato 30),
  // cheeseburger 230 (bun 50 + patty 120 + cheese 60).
  {
    id: 'fishAndChips',
    name: 'Fish and chips',
    emoji: '🐠',
    refPrice: 900,
    popularity: 2,
    startsUnlocked: false,
    unlockCost: 12000,
    inputs: ['friedFish', 'fries'],
    requiresTier: 'restaurant',
  },
  {
    id: 'cheeseburger',
    name: 'Cheeseburger',
    emoji: '🧀',
    refPrice: 1000,
    popularity: 3,
    startsUnlocked: false,
    unlockCost: 15000,
    inputs: ['bun', 'cookedPatty', 'cheese'],
    requiresTier: 'restaurant',
  },
]

export const DISHES: Record<string, DishDef> = Object.fromEntries(list.map((d) => [d.id, d]))

/**
 * Cost in cents of the raw ingredients behind one dish, followed through the recipe chain:
 * a raw item costs its pantry price, a processed item or dish made by a station costs what
 * its station input costs, and an assembler dish is the sum of its inputs (plan 2.5).
 * Display helper for the menu panel; the sim never imports it. Unknown ids cost 0.
 */
export function ingredientCostOf(dish: string): number {
  const walk = (id: string, depth: number): number => {
    if (depth > 8) return 0
    const item = ITEMS[id]
    if (item?.cost !== undefined) return item.cost
    const station = STATION_RECIPES.find((r) => r.output === id)
    if (station !== undefined) return walk(station.input, depth + 1)
    const inputs = DISHES[id]?.inputs
    return inputs === undefined ? 0 : inputs.reduce((sum, input) => sum + walk(input, depth + 1), 0)
  }
  return walk(dish, 0)
}
