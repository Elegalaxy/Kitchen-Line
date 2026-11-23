// Save format (plan Step 17): the versioned envelope `{ version: 1, savedAt, state }` as JSON text.
// Pure and I/O free: no storage, no clock (the UI passes `savedAt`), no value imports. The UI layer
// reads and writes localStorage under `SAVE_KEY`.
//
// `loadSave` never trusts its input and never throws. It checks the envelope, then every field of
// `GameState`: types, integer-ness where the sim assumes integers, enums, array lengths
// (`tiles.length === width * height`), that every building sits in bounds and owns exactly the
// tiles its footprint covers, that no tile points at a missing building, and the shape of every
// item, customer, rng stream and day stats. The parsed object is returned as is, so the key order
// (and with it `stateHash`) survives a round trip. Ids of items, dishes and buildings can only be
// checked for shape here (persist cannot see the content defs); the UI checks them against DEFS.
// The chain stage fields (GAME_DESIGN 8.1: `branches`, `chainProfit`, `chainWon`, `DayStats.branches`) are
// optional; each branch's blueprint goes through the same grid checks as the live state (`validateGrid`).

import type { GameState } from '../sim/types.ts'

export const SAVE_KEY = 'kitchen-line.save.v1'
/** The raw text of a save that failed to load is kept here so it is not lost. */
export const CORRUPT_KEY = 'kitchen-line.save.v1.corrupt'
export const SAVE_VERSION = 1

export type LoadResult = { ok: true; state: GameState } | { ok: false; reason: string }

/** Largest grid side accepted; keeps `width * height` small for a hostile file. */
const MAX_SIDE = 64
/** Generous caps on array sizes so a hostile file cannot make the loader do unbounded work. */
const MAX_ITEMS_PER_BUILDING = 64
const MAX_LIST = 100000
/** Persist cannot import the game's branch limit (sim values); this only bounds a hostile file. */
const MAX_BRANCHES = 16

const KINDS = ['belt', 'pantry', 'splitter', 'merger', 'filter', 'chopper', 'fryer', 'stove', 'assembler', 'pass', 'bin']
const STATUSES = ['ok', 'idle', 'blocked', 'warming', 'noCash', 'noRecipe', 'paused']
const PHASES = ['build', 'service', 'summary', 'won']
const TIERS = ['stall', 'restaurant']
const REASONS = ['waitedLong', 'overpriced', 'notFirstChoice', 'noMatch', 'queueFull', 'gaveUp', 'great']
const STREAMS = ['arrivals', 'reviews']
/** N E S W, as in sim/grid.ts. */
const DX = [0, 1, 0, -1]
const DY = [-1, 0, 1, 0]

type Obj = Record<string, unknown>

/** Thrown inside the validator only; `loadSave` turns it into a reason string. */
class Invalid extends Error {}

function bad(path: string, why: string): never {
  throw new Invalid(`${path}: ${why}`)
}

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function obj(v: unknown, path: string): Obj {
  if (!isObj(v)) bad(path, 'expected an object')
  return v
}

function arr(v: unknown, path: string, max = MAX_LIST): unknown[] {
  if (!Array.isArray(v)) bad(path, 'expected an array')
  if (v.length > max) bad(path, `too many entries (${v.length})`)
  return v
}

function int(v: unknown, path: string, min = 0): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) bad(path, 'expected an integer')
  if (v < min) bad(path, `expected an integer >= ${min}`)
  return v
}

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(path, 'expected a finite number')
  return v
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) bad(path, 'expected a non-empty string')
  return v
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') bad(path, 'expected true or false')
  return v
}

function oneOf(v: unknown, path: string, allowed: readonly string[]): string {
  if (typeof v !== 'string' || !allowed.includes(v)) bad(path, `expected one of ${allowed.join(', ')}`)
  return v
}

function strList(v: unknown, path: string): void {
  arr(v, path).forEach((x, i) => str(x, `${path}[${i}]`))
}

function item(v: unknown, path: string): void {
  const o = obj(v, path)
  int(o.id, `${path}.id`, 1)
  str(o.type, `${path}.type`)
  int(o.bornTick, `${path}.bornTick`)
}

function maybeItem(v: unknown, path: string): void {
  if (v !== null) item(v, path)
}

function itemList(v: unknown, path: string): void {
  arr(v, path, MAX_ITEMS_PER_BUILDING).forEach((x, i) => item(x, `${path}[${i}]`))
}

function rngStream(v: unknown, path: string): void {
  const o = obj(v, path)
  for (const k of ['a', 'b', 'c', 'd']) {
    const n = int(o[k], `${path}.${k}`)
    if (n > 0xffffffff) bad(`${path}.${k}`, 'expected an unsigned 32-bit integer')
  }
  if (o.spare !== undefined) finite(o.spare, `${path}.spare`)
}

function review(v: unknown, path: string): void {
  const o = obj(v, path)
  int(o.stars, `${path}.stars`)
  if (typeof o.text !== 'string') bad(`${path}.text`, 'expected a string')
  if (o.dish !== null) str(o.dish, `${path}.dish`)
  oneOf(o.reason, `${path}.reason`, REASONS)
}

function dayStats(v: unknown, path: string): void {
  const o = obj(v, path)
  int(o.day, `${path}.day`, 1)
  for (const k of [
    'sales',
    'ingredientCost',
    'spent',
    'customers',
    'served',
    'lostPatience',
    'lostNoMatch',
    'lostFull',
    'waitTicksTotal',
    'wasteSpoiled',
    'wasteBinned',
    'wasteDestroyed',
  ]) {
    int(o[k], `${path}.${k}`)
  }
  for (const [id, n] of Object.entries(obj(o.spoiledByItem, `${path}.spoiledByItem`))) {
    int(n, `${path}.spoiledByItem.${id}`)
  }
  // Saves from before the overnight cleanup have neither field: they mean 0 / none.
  if (o.wasteOvernight === undefined) o.wasteOvernight = 0
  int(o.wasteOvernight, `${path}.wasteOvernight`)
  if (o.overnightByItem === undefined) o.overnightByItem = {}
  for (const [id, n] of Object.entries(obj(o.overnightByItem, `${path}.overnightByItem`))) {
    int(n, `${path}.overnightByItem.${id}`)
  }
  for (const [id, d] of Object.entries(obj(o.byDish, `${path}.byDish`))) {
    const e = obj(d, `${path}.byDish.${id}`)
    for (const k of ['served', 'lost', 'sales']) int(e[k], `${path}.byDish.${id}.${k}`)
  }
  arr(o.reviews, `${path}.reviews`).forEach((r, i) => review(r, `${path}.reviews[${i}]`))
  // Only present once branches exist (the chain stage): each branch's night, net after rent.
  if (o.branches !== undefined) {
    arr(o.branches, `${path}.branches`, MAX_BRANCHES).forEach((b, i) => {
      const e = obj(b, `${path}.branches[${i}]`)
      int(e.id, `${path}.branches[${i}].id`, 1)
      int(e.net, `${path}.branches[${i}].net`, Number.MIN_SAFE_INTEGER)
      int(e.rent, `${path}.branches[${i}].rent`)
    })
  }
  if (o.critic !== undefined) {
    const c = obj(o.critic, `${path}.critic`)
    int(c.stars, `${path}.critic.stars`, 1)
    if (typeof c.served !== 'boolean') bad(`${path}.critic.served`, 'expected a boolean')
    if (c.dish !== null) str(c.dish, `${path}.critic.dish`)
  }
}

function customer(v: unknown, path: string): void {
  const o = obj(v, path)
  int(o.id, `${path}.id`)
  int(o.arriveTick, `${path}.arriveTick`)
  strList(o.prefs, `${path}.prefs`)
  int(o.budget, `${path}.budget`)
  int(o.patience, `${path}.patience`)
  str(o.dish, `${path}.dish`)
  int(o.price, `${path}.price`)
  if (o.critic !== undefined && o.critic !== true) bad(`${path}.critic`, 'expected true')
}

/** Validates one building; returns its footprint tiles (anchor first). */
function building(v: unknown, path: string, key: string, width: number, height: number): { x: number; y: number }[] {
  const o = obj(v, path)
  const id = int(o.id, `${path}.id`, 1)
  if (String(id) !== key) bad(`${path}.id`, `does not match its key ${key}`)
  const kind = oneOf(o.kind, `${path}.kind`, KINDS)
  const x = int(o.x, `${path}.x`)
  const y = int(o.y, `${path}.y`)
  const dir = int(o.dir, `${path}.dir`)
  if (dir > 3) bad(`${path}.dir`, 'expected 0 to 3')
  int(o.onlineAt, `${path}.onlineAt`)
  oneOf(o.status, `${path}.status`, STATUSES)
  switch (kind) {
    case 'belt': {
      bool(o.fast, `${path}.fast`)
      bool(o.stalled, `${path}.stalled`)
      const slots = arr(o.slots, `${path}.slots`)
      if (slots.length !== 2) bad(`${path}.slots`, 'expected 2 slots')
      slots.forEach((s, i) => maybeItem(s, `${path}.slots[${i}]`))
      break
    }
    case 'pantry':
      str(o.ingredient, `${path}.ingredient`)
      int(o.interval, `${path}.interval`, 1)
      int(o.cooldown, `${path}.cooldown`)
      // Saves from before the pause toggle have no `paused`: that means running.
      if (o.paused !== undefined) bool(o.paused, `${path}.paused`)
      break
    case 'splitter':
    case 'merger':
      maybeItem(o.buf, `${path}.buf`)
      int(o.rr, `${path}.rr`)
      break
    case 'filter':
      if (o.filterItem !== null) str(o.filterItem, `${path}.filterItem`)
      maybeItem(o.buf, `${path}.buf`)
      break
    case 'chopper':
    case 'fryer':
    case 'stove':
      // `pro` is only present on a pro fryer or stove (the chopper has none).
      if (o.pro !== undefined) {
        if (kind === 'chopper') bad(`${path}.pro`, 'a chopper has no pro variant')
        bool(o.pro, `${path}.pro`)
      }
      itemList(o.input, `${path}.input`)
      maybeItem(o.output, `${path}.output`)
      int(o.progress, `${path}.progress`)
      break
    case 'assembler':
      if (o.pro !== undefined) bool(o.pro, `${path}.pro`)
      if (o.recipe !== null) str(o.recipe, `${path}.recipe`)
      for (const [id2, list] of Object.entries(obj(o.inputs, `${path}.inputs`))) itemList(list, `${path}.inputs.${id2}`)
      maybeItem(o.output, `${path}.output`)
      int(o.progress, `${path}.progress`)
      break
    case 'pass':
      itemList(o.shelf, `${path}.shelf`)
      int(o.delivered, `${path}.delivered`)
      break
    default:
      break
  }
  const tiles = [{ x, y }]
  if (kind === 'assembler') {
    const right = (dir + 1) % 4
    tiles.push({ x: x + DX[right], y: y + DY[right] })
  }
  for (const t of tiles) {
    if (t.x < 0 || t.y < 0 || t.x >= width || t.y >= height) bad(path, `covers a tile outside the ${width} x ${height} grid`)
  }
  return tiles
}

/**
 * Validates the grid part of `o` (the live state or a blueprint): width, height, the tile index and every
 * building with its footprint. Returns the highest building id (0 when there are none). `path` prefixes
 * every message, e.g. `state` or `state.branches[0].blueprint`.
 */
function validateGrid(o: Obj, path: string): number {
  const width = int(o.width, `${path}.width`, 1)
  const height = int(o.height, `${path}.height`, 1)
  if (width > MAX_SIDE || height > MAX_SIDE) bad(`${path}.width`, `grid is larger than ${MAX_SIDE} x ${MAX_SIDE}`)

  const tiles = arr(o.tiles, `${path}.tiles`)
  if (tiles.length !== width * height) {
    bad(`${path}.tiles`, `length ${tiles.length} does not match width * height (${width * height})`)
  }
  const buildings = obj(o.buildings, `${path}.buildings`)
  const expected = new Array<number | null>(width * height).fill(null)
  let maxId = 0
  for (const [key, b] of Object.entries(buildings)) {
    const bpath = `${path}.buildings.${key}`
    for (const t of building(b, bpath, key, width, height)) {
      const at = t.y * width + t.x
      if (expected[at] !== null) bad(bpath, `overlaps another building at (${t.x}, ${t.y})`)
      expected[at] = Number(key)
    }
    maxId = Math.max(maxId, Number(key))
  }
  tiles.forEach((t, i) => {
    if (t === null) {
      if (expected[i] !== null) bad(`${path}.tiles[${i}]`, `is empty but building ${expected[i]} covers it`)
      return
    }
    const id = int(t, `${path}.tiles[${i}]`, 1)
    if (buildings[String(id)] === undefined) bad(`${path}.tiles[${i}]`, `references missing building ${id}`)
    if (expected[i] !== id) bad(`${path}.tiles[${i}]`, `building ${id} does not cover this tile`)
  })
  return maxId
}

/** A branch's blueprint (GAME_DESIGN 8.1): the same grid checks as the live state, plus its menu and value. */
function blueprint(v: unknown, path: string): void {
  const o = obj(v, path)
  validateGrid(o, path)
  int(o.expansion, `${path}.expansion`)
  strList(o.unlocked, `${path}.unlocked`)
  arr(o.menu, `${path}.menu`).forEach((m, i) => {
    const e = obj(m, `${path}.menu[${i}]`)
    str(e.dish, `${path}.menu[${i}].dish`)
    int(e.price, `${path}.menu[${i}].price`)
  })
  int(o.value, `${path}.value`)
}

/** One branch of the chain stage: ids are unique and counted up from 1. */
function branch(v: unknown, path: string, seen: Set<number>): void {
  const o = obj(v, path)
  const id = int(o.id, `${path}.id`, 1)
  if (seen.has(id)) bad(`${path}.id`, `duplicates branch ${id}`)
  seen.add(id)
  str(o.areaId, `${path}.areaId`)
  int(o.openedDay, `${path}.openedDay`, 1)
  int(o.blueprintDay, `${path}.blueprintDay`, 1)
  int(o.refits, `${path}.refits`)
  blueprint(o.blueprint, `${path}.blueprint`)
  const e = obj(o.expected, `${path}.expected`)
  int(e.profit, `${path}.expected.profit`, Number.MIN_SAFE_INTEGER)
  for (const k of ['sales', 'served', 'customers']) int(e[k], `${path}.expected.${k}`)
}

function validateState(v: unknown): GameState {
  const s = obj(v, 'state')
  if (s.version !== SAVE_VERSION) bad('state.version', `expected ${SAVE_VERSION}`)
  str(s.seed, 'state.seed')
  const rng = obj(s.rng, 'state.rng')
  for (const name of STREAMS) rngStream(rng[name], `state.rng.${name}`)
  int(s.tick, 'state.tick')
  int(s.day, 'state.day', 1)
  int(s.dayTick, 'state.dayTick')
  oneOf(s.phase, 'state.phase', PHASES)
  oneOf(s.tier, 'state.tier', TIERS)
  int(s.expansion, 'state.expansion')
  const maxId = validateGrid(s, 'state')
  const nextId = int(s.nextId, 'state.nextId', 1)
  if (nextId <= maxId) bad('state.nextId', 'is not above the highest building id')
  int(s.nextItemId, 'state.nextItemId', 1)
  int(s.money, 'state.money', Number.MIN_SAFE_INTEGER)
  strList(s.unlocked, 'state.unlocked')
  arr(s.menu, 'state.menu').forEach((m, i) => {
    const e = obj(m, `state.menu[${i}]`)
    str(e.dish, `state.menu[${i}].dish`)
    int(e.price, `state.menu[${i}].price`)
  })
  arr(s.waiting, 'state.waiting').forEach((c, i) => customer(c, `state.waiting[${i}]`))
  arr(s.ratings, 'state.ratings').forEach((r, i) => int(r, `state.ratings[${i}]`))
  finite(s.repAtDayStart, 'state.repAtDayStart')
  dayStats(s.today, 'state.today')
  if (s.lastDay !== null) dayStats(s.lastDay, 'state.lastDay')
  if (s.prevDay !== null) dayStats(s.prevDay, 'state.prevDay')
  const totals = obj(s.totals, 'state.totals')
  int(totals.served, 'state.totals.served')
  int(totals.profit, 'state.totals.profit', Number.MIN_SAFE_INTEGER)
  int(totals.days, 'state.totals.days')
  strList(s.goalsDone, 'state.goalsDone')
  if (s.upgrades !== undefined) strList(s.upgrades, 'state.upgrades')
  if (s.tierDay !== undefined) int(s.tierDay, 'state.tierDay', 1)
  if (s.tierProfitStart !== undefined) int(s.tierProfitStart, 'state.tierProfitStart', Number.MIN_SAFE_INTEGER)
  bool(s.won, 'state.won')
  // Chain stage (GAME_DESIGN 8.1): all three are absent in saves from before it, and in games with no branches.
  if (s.branches !== undefined) {
    const seen = new Set<number>()
    arr(s.branches, 'state.branches', MAX_BRANCHES).forEach((b, i) => branch(b, `state.branches[${i}]`, seen))
  }
  if (s.chainProfit !== undefined) int(s.chainProfit, 'state.chainProfit', Number.MIN_SAFE_INTEGER)
  if (s.chainWon !== undefined && s.chainWon !== true) bad('state.chainWon', 'expected true')
  arr(s.events, 'state.events').forEach((e, i) => {
    const o = obj(e, `state.events[${i}]`)
    str(o.type, `state.events[${i}].type`)
    int(o.tick, `state.events[${i}].tick`)
  })
  return s as unknown as GameState
}

/** The JSON text to store. `savedAt` is an ISO timestamp supplied by the caller. */
export function serializeSave(state: GameState, savedAt: string): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt, state })
}

/** Parse and validate saved text. Never throws; a failure carries a human-readable reason. */
export function loadSave(raw: string): LoadResult {
  try {
    if (typeof raw !== 'string') return { ok: false, reason: 'save is not text' }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { ok: false, reason: 'the save is not valid JSON (it may be cut off)' }
    }
    const env = obj(parsed, 'save')
    if (env.version !== SAVE_VERSION) return { ok: false, reason: `unsupported save version ${JSON.stringify(env.version) ?? 'missing'}` }
    if (typeof env.savedAt !== 'string') return { ok: false, reason: 'save.savedAt: expected a string' }
    return { ok: true, state: validateState(env.state) }
  } catch (e) {
    return { ok: false, reason: e instanceof Invalid ? e.message : 'the save could not be read' }
  }
}
