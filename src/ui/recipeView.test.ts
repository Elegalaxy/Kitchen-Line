// The menu recipe lists every step from the dish back to pantry ingredients, with the
// machine and time. Station dishes are a single chain; assembler dishes branch per input.

import { describe, expect, it } from 'vitest'
import { DEFS } from '../content/index.ts'
import { recipeSteps } from './recipeView.ts'

const line = (id: string) => recipeSteps(DEFS, id).map((s) => `${s.depth} ${s.name}: ${s.made}`)

describe('recipeSteps', () => {
  it('walks a station dish from the fryer back to the pantry', () => {
    expect(line('fries')).toEqual([
      '0 Fries: Fryer, 6 s',
      '1 Potato strips: Chopper, 2 s',
      '2 Potato: Pantry',
    ])
  })

  it('walks soup through the chopper and the stove', () => {
    expect(line('soup')).toEqual([
      '0 Soup: Stove, 6 s',
      '1 Sliced tomato: Chopper, 2 s',
      '2 Tomato: Pantry',
    ])
  })

  it('lists each assembler input and that input’s chain', () => {
    expect(line('salad')).toEqual([
      '0 Salad: Assembler, 3 s',
      '1 Chopped lettuce: Chopper, 2 s',
      '2 Lettuce: Pantry',
      '1 Sliced tomato: Chopper, 2 s',
      '2 Tomato: Pantry',
    ])
    expect(line('burger')).toEqual([
      '0 Burger: Assembler, 3 s',
      '1 Bun: Pantry',
      '1 Cooked patty: Stove, 6 s',
      '2 Patty (raw): Pantry',
      '1 Sliced tomato: Chopper, 2 s',
      '2 Tomato: Pantry',
    ])
  })

  it('returns nothing for an unknown dish', () => {
    expect(recipeSteps(DEFS, 'nope')).toEqual([])
  })
})
