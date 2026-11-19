@HANDOFF.md

# CLAUDE.md

Guidance for Claude Code in this repository. Machine-wide rules (agent routing, the UI/UX guide, worktrees) live in `~/.claude/CLAUDE.md` and are not repeated here.

## Workflow

- **Worktrees:** follow the machine-wide worktree rule. Never edit the shared main checkout for implementation work.
- **Commit and push each finished stage:** when a stage, plan part or main function is finished (typecheck, tests and lint pass), run `git fetch origin`, rebase onto `origin/main`, commit, and push to `origin/main` before starting the next one. One commit per finished piece. Never force-push. Tell implementers this rule in every brief.
- **Handoff (shared with Cursor):** read `HANDOFF.md` before starting work; Cursor may have changed things. Overwrite it only after a milestone or when the user says "handoff": under 50 lines, with Last Updated By, Current Goal, Recent Changes and files touched, Active Decisions / Constraints, and Exact Next Step. Replace, do not append.

## Docs are the source of truth

- `doc/GAME_DESIGN.md`: rules and numbers. Rules carry `[CONFIRMED]` / `[PROVISIONAL]` / `[LATER]` / `[OPEN]` tags. Don't change a `[CONFIRMED]` rule without a user decision. If evidence needs different numbers, change the design doc first, then the code.
- `doc/plans/2026-11-19-first-playable.md`: the approved first-playable plan (Steps 1 to 18). Each step has a Status (`todo`, `done`, `verified`, `failed`, `blocked`). When finishing a step, set its Status and add a dated Progress line.
- `doc/ARCHITECTURE.md` (create when needed): module walkthroughs and milestone notes that are too long for this file.
- Portfolio brief: `../docs/ideas/kitchen-line.md`. Keep it and `../docs/ideas/README.md` aligned when the concept, scope or status changes.

## Commands

Not scaffolded yet (no `package.json`, no `src/`). Step 1 of the plan creates these (config copied from `../trading-sim/`). Step 1's file list also names `CLAUDE.md`: update this file in place (swap "Not scaffolded yet" for the real state), don't replace it with a shorter one.

```bash
npm run dev                 # Vite dev server
npm run build               # tsc -b && vite build
npm run typecheck           # tsc -b
npm run lint                # oxlint
npm test                    # vitest run --passWithNoTests (all tests)
npx vitest run <path>       # one test file
npx vitest run -t "<name>"  # one test by name
npm run sim -- <args>       # headless harness CLI (tsx src/harness/cli.ts)
```

## Architecture

A kitchen-automation game with a restaurant tycoon layer: the player builds belts and stations on a grid to cook and serve dishes, then runs the restaurant's menu, prices and growth. TypeScript + React 19 + Vite, Canvas 2D for the grid (`src/ui/canvas/`), Vitest, no backend.

Layers under `src/`, with import rules **enforced by `tests/architecture.test.ts`** (plan section 2.2):

- `src/sim`: pure, deterministic game rules. May import only `src/sim` (tests may also import `vitest`). Banned outside tests: `Math.random`, `Date`, `performance.now`, `console`, browser storage, `process`, DOM globals, React. All randomness goes through the seeded named streams in `rng.ts` (`arrivals`, `reviews`).
- `src/content`: items, buildings, recipes, dishes, layouts, goals, exported as `DEFS`. May import sim types. No UI, persist, harness or I/O.
- `src/harness`: Node CLI that runs a layout N days headless and prints summaries. May import `sim` and `content`; not `ui` or `persist`.
- `src/persist`: versioned save (key `kitchen-line.save.v1`). May import only sim types.
- `src/ui`: React components, the store, the game loop and `canvas/`. Must not import `harness`.
- `src/main.tsx` is the entry point, not a layer. Nothing may import from sibling game projects.

## Conventions

- Same seed + same commands give the same run (`stateHash`). Changing RNG draw order, tick order or content numbers changes hashes and fixtures; treat that as a deliberate change.
- Money is integer cents everywhere in `src/sim`; the UI displays `$12.50`.
- Provisional numbers live only in `src/sim/constants.ts` (rules) and `src/content/*` (items, recipes, prices), with a comment naming the GAME_DESIGN section. Never inline in sim logic.
- Unit tests sit next to the source as `*.test.ts`. Files open with a short header comment explaining the module's rules.
- Debug output: the UI uses `debugLog(tag, ...)` from `src/ui/debug.ts` (dev builds only; tags `[ui]`, `[store]`, `[save]`, `[canvas]`); the harness prints `[sim]` lines; tests may print `[DEBUG <area>]` lines.

## Project-specific rules

- UI colours are defined once as CSS custom properties in `src/ui/styles.css` (`--good`, `--bad`, `--warn`, `--info`, `--money`, `--text`, `--text-muted`, `--text-faint`, `--surface`, `--surface-raised`, `--focus`). Reuse them; don't add new palettes.
