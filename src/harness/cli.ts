// Headless harness CLI (plan Step 13): runs a named layout for N days and prints [sim] lines.
// See USAGE in args.ts. This file only parses arguments, prints and times; the run logic is
// in run.ts. It is the one place wall-clock time is allowed (--speedtest).
// May import src/sim and src/content only; never src/ui or src/persist.

import { DEFS } from '../content/index.ts'
import { DAY_TICKS } from '../sim/constants.ts'
import { USAGE, parseArgs } from './args.ts'
import { formatFailures, formatFryerLoad, formatJourneyDays, formatJourneyTable, runJourneySet } from './journey.ts'
import { formatRun, layoutNames, runDays } from './run.ts'
import type { RunResult } from './run.ts'

function fail(message: string): never {
  process.stderr.write(`error: ${message}\n${USAGE}\n`)
  process.exit(1)
}

const parsed = parseArgs(process.argv.slice(2), DEFS, layoutNames())
if (!parsed.ok) fail(parsed.error)
const options = parsed.options

if (options.mode === 'list') {
  console.log(`[sim] layouts: ${layoutNames().join(', ')}`)
  console.log(`[sim] dishes: ${Object.keys(DEFS.dishes).join(', ')}`)
} else if (options.mode === 'journey') {
  const interval = options.throttle ? 80 : 20
  const results = runJourneySet(DEFS, {
    seeds: options.seeds,
    cautious: options.cautious,
    maxDays: options.maxDays,
    sharedInterval: interval,
    secondFryer: options.fryer,
    pausePantries: options.pause,
    upgrades: options.upgrades,
    pass2: options.pass2,
    pro: options.pro,
    chain: options.chain,
  })
  console.log(`[journey] ${options.cautious ? 'cautious' : 'efficient'} player, shared-line pantry interval ${interval}, second fryer ${options.fryer}, pantry pause ${options.pause ? 'on' : 'off'}, upgrades ${options.upgrades ? 'on' : 'off'}, second pass ${options.pass2 ? 'on' : 'off'}, pro fryer ${options.pro ? 'on' : 'off'}${options.chain ? ', chain on' : ''}, ${options.seeds} seeds, max ${options.maxDays} days`)
  for (const line of formatJourneyTable(results)) console.log(line)
  for (const line of formatFryerLoad(results)) console.log(line)
  for (const line of formatJourneyDays(results[options.example - 1])) console.log(line)
  const failures = formatFailures(results)
  console.log(`issues (rejected commands, dishes that sold 0): ${failures.length === 0 ? 'none' : ''}`)
  for (const line of failures) console.log(line)
} else {
  const start = performance.now()
  let result: RunResult
  try {
    result = runDays(DEFS, options)
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e))
  }
  const elapsedMs = performance.now() - start
  for (const line of formatRun(result)) console.log(line)
  if (options.speedtest) {
    const ticks = options.days * DAY_TICKS
    const perSec = Math.round(ticks / (elapsedMs / 1000))
    console.log(`[sim] speedtest ticks=${ticks} ms=${elapsedMs.toFixed(1)} ticksPerSec=${perSec}`)
  }
}
