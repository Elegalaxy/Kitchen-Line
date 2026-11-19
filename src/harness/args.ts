// Argument parsing for the harness CLI (plan Step 13). Pure: returns a result instead of
// exiting, so validation is unit-testable. cli.ts prints the error and exits with code 1.

import type { Defs } from '../sim/types.ts'
import type { MenuEntry } from './run.ts'

export const USAGE = [
  'usage: npm run sim -- --layout <name> --seed <text> --days <1-100> [--menu dish:cents,dish:cents] [--speedtest]',
  '       npm run sim -- --list',
  '  --menu       dishes on the menu with prices in cents (fries:300,salad:450); default: the layout menu',
  '  --speedtest  also print ticks per second (wall-clock time, harness only)',
  '  --list       print layouts and dishes',
].join('\n')

export const DAYS_MAX = 100

export type CliOptions =
  | { mode: 'list' }
  | { mode: 'run'; layout: string; seed: string; days: number; menu: MenuEntry[] | undefined; speedtest: boolean }

export type ParseResult = { ok: true; options: CliOptions } | { ok: false; error: string }

const bad = (error: string): ParseResult => ({ ok: false, error })

export function parseMenu(text: string, defs: Defs): { ok: true; menu: MenuEntry[] } | { ok: false; error: string } {
  const menu: MenuEntry[] = []
  for (const part of text.split(',')) {
    const m = /^([A-Za-z0-9]+):(\d+)$/.exec(part)
    if (m === null) return { ok: false, error: `bad menu entry ${JSON.stringify(part)}: expected dish:cents, e.g. fries:300` }
    const dish = m[1]
    const cents = m[2]
    if (defs.dishes[dish] === undefined) {
      return { ok: false, error: `unknown dish ${JSON.stringify(dish)} (dishes: ${Object.keys(defs.dishes).join(', ')})` }
    }
    const price = Number(cents)
    if (!Number.isSafeInteger(price) || price <= 0) return { ok: false, error: `bad price for ${dish}: ${cents} (positive cents)` }
    if (menu.some((e) => e.dish === dish)) return { ok: false, error: `dish ${dish} listed twice` }
    menu.push({ dish, price })
  }
  return { ok: true, menu }
}

export function parseArgs(argv: readonly string[], defs: Defs, layouts: readonly string[]): ParseResult {
  let layout: string | undefined
  let seed: string | undefined
  let days: number | undefined
  let menu: MenuEntry[] | undefined
  let speedtest = false
  let list = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--list') list = true
    else if (arg === '--speedtest') speedtest = true
    else if (arg === '--layout' || arg === '--seed' || arg === '--days' || arg === '--menu') {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) return bad(`${arg} requires a value`)
      i += 1
      if (arg === '--layout') {
        if (!layouts.includes(value)) return bad(`unknown layout ${JSON.stringify(value)} (layouts: ${layouts.join(', ')})`)
        layout = value
      } else if (arg === '--seed') {
        if (value.length === 0) return bad('--seed must not be empty')
        seed = value
      } else if (arg === '--days') {
        if (!/^[1-9][0-9]*$/.test(value) || Number(value) > DAYS_MAX) {
          return bad(`--days must be an integer from 1 to ${DAYS_MAX}, received ${JSON.stringify(value)}`)
        }
        days = Number(value)
      } else {
        const parsed = parseMenu(value, defs)
        if (!parsed.ok) return bad(parsed.error)
        menu = parsed.menu
      }
    } else {
      return bad(`unknown flag ${JSON.stringify(arg)}`)
    }
  }
  if (list) return { ok: true, options: { mode: 'list' } }
  if (layout === undefined) return bad('--layout is required')
  if (seed === undefined) return bad('--seed is required')
  if (days === undefined) return bad('--days is required')
  return { ok: true, options: { mode: 'run', layout, seed, days, menu, speedtest } }
}
