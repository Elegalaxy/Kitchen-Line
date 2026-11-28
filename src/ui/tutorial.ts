// Getting-started checklist (plan Q4, extended 2026-11-21). Progress is derived from the
// kitchen (buildings, menu, phase, the last three days of sales), so there is no sim
// field to save. The card stays up until a Salad has been served and the earlier steps
// are done. `tutorialHints` lists faint ghost tiles: the Fries line first (pantry at
// (0,2), pass at (7,2)), then a Salad line on the north side of the pass. The hints are
// drawn only. Clicking a ghost places that building with the ghost's facing and, for a
// pantry or assembler, the ingredient or recipe the line needs.

import { PANTRY_POS, PASS_POS } from '../sim/constants.ts'
import { buildingAt, neighbor } from '../sim/grid.ts'
import type { Building, BuildingKind, Defs, Dir, DishId, GameState } from '../sim/types.ts'

export type TutorialStepId = 'chopper' | 'fryer' | 'connect' | 'open' | 'day' | 'summary' | 'menu' | 'salad'

export type TutorialStep = { id: TutorialStepId; label: string; hint: string; done: boolean }

export type TutorialCoach =
  | { kind: 'tool'; tool: 'chopper' | 'fryer' | 'belt' | 'pantry' | 'assembler' | 'remove' }
  | { kind: 'open' }
  | { kind: 'menu' }
  | { kind: 'select'; x: number; y: number }

export type TutorialView = {
  /** True until every step is done (a Salad served, and the day summary already read). */
  open: boolean
  steps: TutorialStep[]
  /** Index of the first step that is not done, or -1 when all are done. */
  current: number
  doneCount: number
  /** What the current step's button does, or null when the step is only "wait". */
  coach: TutorialCoach | null
}

export type TutorialSections = {
  /** Finished steps (folded into one line on the card). */
  done: TutorialStep[]
  current: TutorialStep | null
  /** Steps still to do after the current one (listed under its hint and button). */
  upcoming: TutorialStep[]
  /** "1 step done" / "4 steps done". */
  doneLabel: string
}

/** The card's three parts, so the current hint and its button sit near the top of the card. */
export function tutorialSections(view: Pick<TutorialView, 'steps' | 'current'>): TutorialSections {
  const done = view.steps.filter((s) => s.done)
  const current = view.current === -1 ? null : (view.steps[view.current] ?? null)
  const upcoming = view.steps.filter((s) => !s.done && s !== current)
  return { done, current, upcoming, doneLabel: `${done.length} ${done.length === 1 ? 'step' : 'steps'} done` }
}

export type HintTile = {
  kind: BuildingKind
  x: number
  y: number
  dir: Dir
  ingredient?: string
  recipe?: DishId
}

/** Suggested spots on the starting layout: pantry, belt, chopper, belt, fryer, belt, belt, pass. */
export const CHOPPER_HINT = { x: PANTRY_POS.x + 2, y: PANTRY_POS.y } as const
export const FRYER_HINT = { x: PANTRY_POS.x + 4, y: PANTRY_POS.y } as const
const HINT_DIR: Dir = 1

/** Salad line on rows 0 and 1, feeding the pass from the north (the friesSaladLine layout). */
const SALAD_PANTRIES = [
  { x: 0, y: 0, ingredient: 'lettuce', name: 'Lettuce' },
  { x: 0, y: 1, ingredient: 'tomato', name: 'Tomato' },
] as const
const SALAD_CHOPPERS = [
  { x: 2, y: 0 },
  { x: 2, y: 1 },
] as const
const SALAD_ASSEMBLER = { x: 4, y: 0 } as const
const SALAD_BELTS: readonly { x: number; y: number; dir: Dir }[] = [
  { x: 1, y: 0, dir: 1 },
  { x: 3, y: 0, dir: 1 },
  { x: 1, y: 1, dir: 1 },
  { x: 3, y: 1, dir: 1 },
  { x: 5, y: 0, dir: 1 },
  { x: 6, y: 0, dir: 1 },
  { x: 7, y: 0, dir: 2 },
  { x: 7, y: 1, dir: 2 },
]

const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir

function hasKind(state: GameState, kind: BuildingKind): boolean {
  return Object.values(state.buildings).some((b) => b.kind === kind)
}

function at(state: GameState, x: number, y: number): Building | null {
  const id = buildingAt(state, x, y)
  return id === null ? null : state.buildings[id]
}

/**
 * True when some pantry feeds the pass through a chain of belts, a chopper and a fryer, each
 * handing over to the tile in front of it (a belt or station refuses an item from its own
 * front, so a building facing the sender breaks the chain). Mirrors the sim's hand-over rule.
 */
export function lineReachesPass(state: GameState): boolean {
  for (const start of Object.values(state.buildings)) {
    if (start.kind !== 'pantry') continue
    let cur: Building = start
    const seen = new Set<BuildingKind>()
    for (let steps = 0; steps < 64; steps += 1) {
      const n = neighbor(cur.x, cur.y, cur.dir)
      const id = buildingAt(state, n.x, n.y)
      if (id === null) break
      const next = state.buildings[id]
      if (next.kind === 'pass') {
        if (seen.has('chopper') && seen.has('fryer')) return true
        break
      }
      if (next.kind !== 'belt' && next.kind !== 'chopper' && next.kind !== 'fryer') break
      if (next.dir === opposite(cur.dir)) break
      seen.add(next.kind)
      cur = next
    }
  }
  return false
}

/**
 * Cents still needed to buy the suggested salad line (missing pantries, choppers, assembler
 * and belts). 0 unless that step is the current one, or when the player already has enough.
 */
export function saladShortfall(state: GameState, defs: Defs): number {
  const view = tutorialView(state)
  if (view.steps[view.current]?.id !== 'salad') return 0
  const price = (kind: BuildingKind): number => defs.buildings[kind].cost
  let need = 0
  for (const p of SALAD_PANTRIES) {
    if (at(state, p.x, p.y)?.kind !== 'pantry') need += price('pantry')
  }
  for (const c of SALAD_CHOPPERS) {
    if (at(state, c.x, c.y)?.kind !== 'chopper') need += price('chopper')
  }
  if (at(state, SALAD_ASSEMBLER.x, SALAD_ASSEMBLER.y)?.kind !== 'assembler') need += price('assembler')
  for (const belt of SALAD_BELTS) {
    if (at(state, belt.x, belt.y)?.kind !== 'belt') need += price('belt')
  }
  return Math.max(0, need - state.money)
}

/** A dish sold today, yesterday, or the day before (those are the days the state still holds). */
function dishServed(state: GameState, dish: DishId): boolean {
  return [state.today, state.lastDay, state.prevDay].some((d) => (d?.byDish[dish]?.served ?? 0) > 0)
}

/** The player has closed at least one end-of-day summary. Later summaries do not undo this. */
function summaryRead(state: GameState): boolean {
  if (state.lastDay === null) return false
  if (state.phase === 'summary' || state.phase === 'won') return state.totals.days >= 2
  return true
}

function saladGuide(state: GameState): { hint: string; coach: TutorialCoach } {
  for (const p of SALAD_PANTRIES) {
    const b = at(state, p.x, p.y)
    if (b === null) {
      return {
        hint: `Click the ${p.name} ghost. That pantry is set to ${p.name}. The other ghost is the second ingredient.`,
        coach: { kind: 'tool', tool: 'pantry' },
      }
    }
    if (b.kind !== 'pantry') {
      return {
        hint: `The ${p.name} pantry needs that tile. Sell what is there, or build your own line into the north side of the pass.`,
        coach: { kind: 'tool', tool: 'remove' },
      }
    }
    if (b.ingredient !== p.ingredient) {
      return {
        hint: `Select that pantry and set its ingredient to ${p.name}.`,
        coach: { kind: 'select', x: p.x, y: p.y },
      }
    }
  }
  for (const c of SALAD_CHOPPERS) {
    const b = at(state, c.x, c.y)
    if (b === null) {
      return {
        hint: 'Place a chopper on each ghost between the pantries and the assembler.',
        coach: { kind: 'tool', tool: 'chopper' },
      }
    }
    if (b.kind !== 'chopper') {
      return {
        hint: 'A chopper belongs on that ghost. Sell what is there, or route around it.',
        coach: { kind: 'tool', tool: 'remove' },
      }
    }
  }
  const assembler = at(state, SALAD_ASSEMBLER.x, SALAD_ASSEMBLER.y)
  if (assembler === null) {
    return {
      hint: 'Place the assembler on its ghost. It covers two tiles and faces the pass.',
      coach: { kind: 'tool', tool: 'assembler' },
    }
  }
  if (assembler.kind !== 'assembler') {
    return {
      hint: 'The assembler needs that tile. Sell what is there.',
      coach: { kind: 'tool', tool: 'remove' },
    }
  }
  if (assembler.recipe !== 'salad') {
    return {
      hint: 'Select the assembler and set its recipe to Salad.',
      coach: { kind: 'select', x: SALAD_ASSEMBLER.x, y: SALAD_ASSEMBLER.y },
    }
  }
  return {
    hint: 'Click the belt ghosts. The two beside the pass face south, into it. A click on a ghost uses the arrow. Salad sells once it reaches the pass.',
    coach: { kind: 'tool', tool: 'belt' },
  }
}

export function tutorialView(state: GameState): TutorialView {
  const pass = Object.values(state.buildings).find((b) => b.kind === 'pass')
  const delivered = pass !== undefined && pass.kind === 'pass' && pass.delivered > 0
  const served = state.totals.served > 0
  const salad = saladGuide(state)
  const steps: TutorialStep[] = [
    {
      id: 'chopper',
      label: 'Place a chopper',
      hint: 'Pick Chopper in the Build tab, then click a free tile on the pantry row.',
      done: hasKind(state, 'chopper'),
    },
    {
      id: 'fryer',
      label: 'Place a fryer',
      hint: 'Pick Fryer in the Build tab, then click a free tile further along the row.',
      done: hasKind(state, 'fryer'),
    },
    {
      id: 'connect',
      label: 'Connect to the pass',
      hint: 'Pick Belt, then drag across the empty tiles so potatoes flow from the pantry through both stations into the pass.',
      done: served || delivered || lineReachesPass(state),
    },
    {
      id: 'open',
      label: 'Open for service',
      hint: 'Press Open for service in the top bar. Fries sell when they reach the pass.',
      done: state.phase !== 'build' || state.tick > 0,
    },
    {
      id: 'day',
      label: 'Finish the day',
      hint: 'The line keeps cooking. Let the day finish. A summary opens at the end.',
      done: state.lastDay !== null,
    },
    {
      id: 'summary',
      label: 'Read the summary',
      hint: 'Sales, customers who left, and waste. The hint names the biggest problem. Then go back to the kitchen.',
      done: summaryRead(state),
    },
    {
      id: 'menu',
      label: 'Add Salad',
      hint: 'Open the Menu tab and turn Salad on. Its price starts at the reference price. Customers walk away when a price is over their budget.',
      done: state.menu.some((m) => m.dish === 'salad'),
    },
    {
      id: 'salad',
      label: 'Serve a salad',
      hint: salad.hint,
      done: dishServed(state, 'salad'),
    },
  ]
  const current = steps.findIndex((s) => !s.done)
  const step = current === -1 ? null : steps[current]
  let coach: TutorialCoach | null = null
  if (step !== null) {
    switch (step.id) {
      case 'chopper':
        coach = { kind: 'tool', tool: 'chopper' }
        break
      case 'fryer':
        coach = { kind: 'tool', tool: 'fryer' }
        break
      case 'connect':
        coach = { kind: 'tool', tool: 'belt' }
        break
      case 'open':
        coach = { kind: 'open' }
        break
      case 'menu':
        coach = { kind: 'menu' }
        break
      case 'salad':
        coach = salad.coach
        break
      default:
        coach = null
    }
  }
  return { open: current !== -1, steps, current, doneCount: steps.filter((s) => s.done).length, coach }
}

function friesHints(state: GameState): HintTile[] {
  const out: HintTile[] = []
  const free = (x: number, y: number): boolean => buildingAt(state, x, y) === null
  const hasChopper = hasKind(state, 'chopper')
  const hasFryer = hasKind(state, 'fryer')
  if (!hasChopper && free(CHOPPER_HINT.x, CHOPPER_HINT.y)) out.push({ kind: 'chopper', ...CHOPPER_HINT, dir: HINT_DIR })
  if (!hasFryer && free(FRYER_HINT.x, FRYER_HINT.y)) out.push({ kind: 'fryer', ...FRYER_HINT, dir: HINT_DIR })
  const placed = (x: number, kind: BuildingKind): boolean => {
    const id = buildingAt(state, x, PANTRY_POS.y)
    return id !== null && state.buildings[id].kind === kind
  }
  if (placed(CHOPPER_HINT.x, 'chopper') && placed(FRYER_HINT.x, 'fryer')) {
    for (let x = PANTRY_POS.x + 1; x < PASS_POS.x; x += 1) {
      if (x !== CHOPPER_HINT.x && x !== FRYER_HINT.x && free(x, PANTRY_POS.y)) {
        out.push({ kind: 'belt', x, y: PANTRY_POS.y, dir: HINT_DIR })
      }
    }
  }
  return out
}

function saladHints(state: GameState): HintTile[] {
  const pantriesReady = SALAD_PANTRIES.every((p) => {
    const b = at(state, p.x, p.y)
    return b?.kind === 'pantry' && b.ingredient === p.ingredient
  })
  if (!pantriesReady) {
    return SALAD_PANTRIES.flatMap((p) => {
      if (at(state, p.x, p.y) !== null) return []
      return [{ kind: 'pantry' as const, x: p.x, y: p.y, dir: HINT_DIR, ingredient: p.ingredient }]
    })
  }
  const choppersReady = SALAD_CHOPPERS.every((c) => at(state, c.x, c.y)?.kind === 'chopper')
  if (!choppersReady) {
    return SALAD_CHOPPERS.flatMap((c) => {
      if (at(state, c.x, c.y) !== null) return []
      return [{ kind: 'chopper' as const, x: c.x, y: c.y, dir: HINT_DIR }]
    })
  }
  const assembler = at(state, SALAD_ASSEMBLER.x, SALAD_ASSEMBLER.y)
  if (assembler?.kind !== 'assembler' || assembler.recipe !== 'salad') {
    if (assembler !== null) return []
    return [{ kind: 'assembler', x: SALAD_ASSEMBLER.x, y: SALAD_ASSEMBLER.y, dir: HINT_DIR, recipe: 'salad' }]
  }
  return SALAD_BELTS.flatMap((b) => {
    if (at(state, b.x, b.y) !== null) return []
    return [{ kind: 'belt' as const, x: b.x, y: b.y, dir: b.dir }]
  })
}

/** Ghost tiles for the current step (empty once the guide is finished or the step has no ghosts). */
export function tutorialHints(state: GameState): HintTile[] {
  const view = tutorialView(state)
  const step = view.current === -1 ? null : view.steps[view.current]
  if (step === null) return []
  if (step.id === 'chopper' || step.id === 'fryer' || step.id === 'connect') return friesHints(state)
  if (step.id === 'salad') return saladHints(state)
  return []
}
