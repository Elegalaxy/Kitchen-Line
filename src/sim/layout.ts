// Dev layout loader (plan Step 4 onwards). A layout is a list of commands applied to a
// fresh game, plus an optional `setup` for things no command can do yet: unlocking dishes
// (recipe unlocking arrives in Step 14) and setting the money so a line that costs more
// than the starting $150 can be built. Commands are applied in order; a rejected one is
// skipped and reported. The input state is never mutated.

import { applyCommand } from './commands.ts'
import type { Command, Defs, DishId, GameState } from './types.ts'

export type LayoutSetup = {
  /** Dishes unlocked before the commands run (so an assembler can be given the recipe). */
  unlock?: DishId[]
  /** Money in cents after the setup, replacing the current amount. */
  money?: number
}

export type LayoutResult = { state: GameState; rejected: string[] }

export function applyLayout(state: GameState, defs: Defs, commands: Command[], setup?: LayoutSetup): LayoutResult {
  let current = structuredClone(state)
  for (const dish of setup?.unlock ?? []) {
    if (defs.dishes[dish] !== undefined && !current.unlocked.includes(dish)) current.unlocked.push(dish)
  }
  if (setup?.money !== undefined) current.money = setup.money
  const rejected: string[] = []
  for (const cmd of commands) {
    const out = applyCommand(current, defs, cmd)
    if (out.result.ok) current = out.state
    else rejected.push(`${cmd.type} -> ${out.result.reason}`)
  }
  return { state: current, rejected }
}
