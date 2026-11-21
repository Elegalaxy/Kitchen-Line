// Argument parsing for the harness CLI (plan Step 13). Pure: returns a result instead of
// exiting, so validation is unit-testable. cli.ts prints the error and exits with code 1.

import type { Defs } from '../sim/types.ts'
import type { MenuEntry } from './run.ts'

export const USAGE = [
  'usage: npm run sim -- --layout <name> --seed <text> --days <1-100> [--menu dish:cents,dish:cents] [--speedtest] [--no-pause]',
  '       npm run sim -- --journey [--seeds <1-200>] [--cautious] [--no-throttle] [--fryer auto|always|never] [--max-days <1-100>] [--example <n>] [--no-pause]',
  '       npm run sim -- --list',
  '  --menu       dishes on the menu with prices in cents (fries:300,salad:450); default: the layout menu',
  '  --no-pause   pause all pantries for the last 400 ticks of each day and resume them next morning by default; this turns it off',
  '  --speedtest  also print ticks per second (wall-clock time, harness only)',
  '  --list       print layouts and dishes',
  '  --journey    scripted player from the empty start to the end screen over many seeds (stall, upgrade, restaurant goals)',
  '  --seeds      journey: number of seeds journey-1..journey-N (default 20)',
  '  --cautious   journey: slower to spend (one purchase a day, bigger cash reserve)',
  '  --no-throttle  journey: leave the pantries of the two lines sharing the east pass side at 20 ticks',
  '  --fryer      journey: second fryer line at the restaurant tier: auto (default, when fries customers gave up), always, never',
  '  --max-days   journey: give up after this many days (default 40)',
  '  --example    journey: per-day table for seed journey-<n> (default 1)',
].join('\n')

export const DAYS_MAX = 100
export const SEEDS_MAX = 200

export type FryerMode = 'auto' | 'always' | 'never'

export type CliOptions =
  | { mode: 'list' }
  | { mode: 'journey'; seeds: number; cautious: boolean; throttle: boolean; fryer: FryerMode; maxDays: number; example: number; pause: boolean }
  | { mode: 'run'; layout: string; seed: string; days: number; menu: MenuEntry[] | undefined; speedtest: boolean; pause: boolean }

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
  let journey = false
  let cautious = false
  let throttle = true
  let pause = true
  let fryer: FryerMode = 'auto'
  let seeds = 20
  let maxDays = 40
  let example = 1
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--list') list = true
    else if (arg === '--speedtest') speedtest = true
    else if (arg === '--journey') journey = true
    else if (arg === '--cautious') cautious = true
    else if (arg === '--no-throttle') throttle = false
    else if (arg === '--no-pause') pause = false
    else if (arg === '--fryer') {
      const value = argv[i + 1]
      if (value !== 'auto' && value !== 'always' && value !== 'never') return bad(`--fryer must be auto, always or never, received ${JSON.stringify(value)}`)
      i += 1
      fryer = value
    } else if (arg === '--seeds' || arg === '--max-days' || arg === '--example') {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) return bad(`${arg} requires a value`)
      i += 1
      const max = arg === '--seeds' ? SEEDS_MAX : DAYS_MAX
      if (!/^[1-9][0-9]*$/.test(value) || Number(value) > max) {
        return bad(`${arg} must be an integer from 1 to ${max}, received ${JSON.stringify(value)}`)
      }
      if (arg === '--seeds') seeds = Number(value)
      else if (arg === '--max-days') maxDays = Number(value)
      else example = Number(value)
    } else if (arg === '--layout' || arg === '--seed' || arg === '--days' || arg === '--menu') {
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
  if (journey) {
    if (example > seeds) return bad(`--example ${example} is beyond --seeds ${seeds}`)
    return { ok: true, options: { mode: 'journey', seeds, cautious, throttle, fryer, maxDays, example, pause } }
  }
  if (layout === undefined) return bad('--layout is required')
  if (seed === undefined) return bad('--seed is required')
  if (days === undefined) return bad('--days is required')
  return { ok: true, options: { mode: 'run', layout, seed, days, menu, speedtest, pause } }
}
