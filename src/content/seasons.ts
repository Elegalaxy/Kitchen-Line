// The four seasons (GAME_DESIGN 9, provisional, restaurant tier only), in calendar order. Each season
// is 7 days (`SEASON_DAYS` in sim/constants.ts). Percent maps scale the base value; unlisted entries
// count as 100. `costPercent` scales pantry prices (7), `tastePercent` the taste weight of a dish
// (6.2), `branchPercent` a branch's nightly profit (8.1). Spring is the baseline: cheaper lettuce,
// dear pumpkin and its dish, nothing else. The seasonal dishes are in dishes.ts (`DishDef.season`).

import type { SeasonDef } from '../sim/types.ts'

export const SEASONS: SeasonDef[] = [
  {
    id: 'spring',
    name: 'Spring',
    emoji: '🌱',
    costPercent: { lettuce: 75, pumpkin: 200 },
    tastePercent: {},
    branchPercent: 100,
  },
  {
    id: 'summer',
    name: 'Summer',
    emoji: '☀️',
    costPercent: { tomato: 75, lettuce: 75, fish: 125, pumpkin: 200 },
    tastePercent: { salad: 150, sandwich: 125, soup: 50 },
    branchPercent: 105,
  },
  {
    id: 'autumn',
    name: 'Autumn',
    emoji: '🍂',
    costPercent: { potato: 75, tomato: 125, pumpkin: 100 },
    tastePercent: { soup: 150, riceBowl: 125, salad: 75 },
    branchPercent: 100,
  },
  {
    id: 'winter',
    name: 'Winter',
    emoji: '❄️',
    costPercent: { tomato: 150, lettuce: 150, rice: 75, patty: 90, pumpkin: 200 },
    tastePercent: { soup: 200, riceBowl: 125, burger: 125, salad: 50, sandwich: 75 },
    branchPercent: 95,
  },
]
