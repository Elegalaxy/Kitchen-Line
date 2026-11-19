# Project Handoff State

- **Last Updated By:** Claude (portfolio chat, 2026-11-19)
- **Current Goal:** Start implementing the approved first-playable plan, `doc/plans/2026-11-19-first-playable.md`, at Step 1 (scaffold the app and the architecture test).
- **Recent Changes & Files Touched:**
  - `doc/GAME_DESIGN.md`: first design doc, written from the user's answers. Section 13's open questions are resolved; no open questions remain for the first playable.
  - `doc/plans/2026-11-19-first-playable.md`: 18-step plan, status approved. The user confirmed every section 3 decision (Q1 to Q7) on 2026-11-19.
  - `CLAUDE.md`: made from `../docs/templates/CLAUDE.md` and filled in from the plan.
  - `HANDOFF.md`: this file.
  - Repo: an `origin` remote and an "Initial commit" (`.gitattributes`). `doc/`, `CLAUDE.md` and `HANDOFF.md` are not committed yet.
- **Active Decisions / Constraints:**
  - Stack: TypeScript, React 19, Vite, Vitest, oxlint, Canvas 2D (no PixiJS). Step 1 copies config and `tests/architecture.test.ts` from `../trading-sim/` as new files; never import from sibling projects.
  - Money is integer cents in `src/sim`. All randomness goes through seeded streams (`arrivals`, `reviews`).
  - Numbers are provisional and tuned in Step 18 with the harness.
  - Work in a git worktree, and commit and push each finished step (see CLAUDE.md Workflow).
  - The user said not to start coding until they give the go-ahead. They plan to run `/init` and continue in a new chat.
- **Exact Next Step:** Commit `doc/`, `CLAUDE.md` and `HANDOFF.md`. Then, once the user says go, the implementer runs Step 1 of the plan in a worktree. Step 1's acceptance: install, typecheck, test, lint and build all pass, and a probe `Math.random()` in `src/sim` fails the architecture test.
