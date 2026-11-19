# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 1, 2026-11-19)
- **Current Goal:** Step 2 of `doc/plans/2026-11-19-first-playable.md`: sim core (RNG, content, grid placement, money).
- **Recent Changes & Files Touched (Step 1, done):**
  - Config copied from `../trading-sim/` as new files: `package.json` (kitchen-line), `index.html`, `vite.config.ts`, `tsconfig*.json`, `.oxlintrc.json`, `.gitignore`, `package-lock.json`.
  - `tests/architecture.test.ts`: layer rules from plan 2.2. Also bans imports leaving the project root (sibling projects).
  - `src/main.tsx`, `src/ui/App.tsx` ("Kitchen Line – dev build", logs `[ui] app mounted`), `src/ui/debug.ts`, `src/ui/styles.css` (dark color tokens, AA contrast, `.num`), `src/harness/cli.ts` (stub).
  - `CLAUDE.md`: "Not scaffolded yet" note replaced. Plan Step 1 set to `done`.
  - Verified: typecheck, test, lint, build pass. A probe `Math.random()` in `src/sim` failed the architecture test, then was deleted.
- **Active Decisions / Constraints:**
  - Stack: TypeScript, React 19, Vite, Vitest, oxlint, Canvas 2D. Never import from sibling projects.
  - Money is integer cents in `src/sim`. All randomness through seeded streams (`arrivals`, `reviews`).
  - Work in a git worktree; commit and push each finished step (CLAUDE.md Workflow). Run `npm ci` in a new worktree.
  - `src/sim` does not exist yet (empty dirs are not tracked); Step 2 creates it.
  - Still to confirm by the user: `npm run dev` shows the dev-build text and `[ui] app mounted` in the console.
- **Exact Next Step:** Run Step 2 in a fresh worktree cut from `origin/main`: types, constants, `rng.ts` and `hash.ts` (copy from trading-sim as new files), content, grid and `applyCommand`, with tests per the plan.
