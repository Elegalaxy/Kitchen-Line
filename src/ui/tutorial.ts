// First-goal checklist (plan Step 18, decision Q4): four steps for a new game (place a
// chopper, place a fryer, connect the line to the pass, open for service). Progress is
// derived from the game state only (buildings, the pass counter, the phase), so there is no
// extra sim state and nothing to save. The checklist is open until the first dish is served.
// `tutorialHints` lists the faint ghost tiles the canvas draws for the starting layout
// (pantry at (0,2) and pass at (7,2), both facing east): chopper at (2,2), fryer at (4,2),
// and belts in the gaps once both stations stand there. The hints are drawn only.

import { PANTRY_POS, PASS_POS } from '../sim/constants.ts'
import { buildingAt, neighbor } from '../sim/grid.ts'
import type { Building, BuildingKind, Dir, GameState } from '../sim/types.ts'

export type TutorialStepId = 'chopper' | 'fryer' | 'connect' | 'open'

export type TutorialStep = { id: TutorialStepId; label: string; hint: string; done: boolean }

export type TutorialView = {
  /** True until the first dish has been served. */
  open: boolean
  steps: TutorialStep[]
  /** Index of the first step that is not done, or -1 when all four are. */
  current: number
  doneCount: number
}

export type HintTile = { kind: BuildingKind; x: number; y: number; dir: Dir }

/** Suggested spots on the starting layout: pantry, belt, chopper, belt, fryer, belt, belt, pass. */
export const CHOPPER_HINT = { x: PANTRY_POS.x + 2, y: PANTRY_POS.y } as const
export const FRYER_HINT = { x: PANTRY_POS.x + 4, y: PANTRY_POS.y } as const
const HINT_DIR: Dir = 1

const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir

function hasKind(state: GameState, kind: BuildingKind): boolean {
  return Object.values(state.buildings).some((b) => b.kind === kind)
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

export function tutorialView(state: GameState): TutorialView {
  const pass = Object.values(state.buildings).find((b) => b.kind === 'pass')
  const delivered = pass !== undefined && pass.kind === 'pass' && pass.delivered > 0
  const served = state.totals.served > 0
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
  ]
  const current = steps.findIndex((s) => !s.done)
  return { open: !served, steps, current, doneCount: steps.filter((s) => s.done).length }
}

/** Ghost tiles to draw while the checklist is open (empty when it is closed or all is placed). */
export function tutorialHints(state: GameState): HintTile[] {
  if (state.totals.served > 0) return []
  const out: HintTile[] = []
  const free = (x: number, y: number): boolean => buildingAt(state, x, y) === null
  const hasChopper = hasKind(state, 'chopper')
  const hasFryer = hasKind(state, 'fryer')
  if (!hasChopper && free(CHOPPER_HINT.x, CHOPPER_HINT.y)) out.push({ kind: 'chopper', ...CHOPPER_HINT, dir: HINT_DIR })
  if (!hasFryer && free(FRYER_HINT.x, FRYER_HINT.y)) out.push({ kind: 'fryer', ...FRYER_HINT, dir: HINT_DIR })
  const at = (x: number, kind: BuildingKind): boolean => {
    const id = buildingAt(state, x, PANTRY_POS.y)
    return id !== null && state.buildings[id].kind === kind
  }
  if (at(CHOPPER_HINT.x, 'chopper') && at(FRYER_HINT.x, 'fryer')) {
    for (let x = PANTRY_POS.x + 1; x < PASS_POS.x; x += 1) {
      if (x !== CHOPPER_HINT.x && x !== FRYER_HINT.x && free(x, PANTRY_POS.y)) {
        out.push({ kind: 'belt', x, y: PANTRY_POS.y, dir: HINT_DIR })
      }
    }
  }
  return out
}
