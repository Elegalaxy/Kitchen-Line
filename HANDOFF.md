# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 17, 2026-11-20)
- **Current Goal:** Step 18 of `doc/plans/2026-11-19-first-playable.md`: tutorial start, polish states, balance pass. Steps 1 to 17 are done.
- **Recent Changes & Files Touched (Step 17):**
  - `src/persist/save.ts` (+ `save.test.ts`): pure `serializeSave(state, savedAt)` / `loadSave(raw)`; keys `SAVE_KEY` `kitchen-line.save.v1` and `CORRUPT_KEY` `.corrupt`. Validates every `GameState` field (types, integers, enums, rng, tiles length, building footprints vs tiles, items, customers, day stats, events). Returns the parsed object as is, so `stateHash` survives a round trip. Persist tests use an inline Defs fixture (persist may not import content).
  - `src/ui/persistence.ts` (+ `persistence.test.ts`): storage glue in try/catch, `checkAgainstDefs` (unknown item/dish/building/goal ids and expansion count reject the save), `.corrupt` copy plus `console.error`, `createAutosaver`.
  - `src/ui/session.ts`: `getGameSession()` replaces the old `getGameStore()` singleton (removed from `store.ts`); loads the save and resumes PAUSED, `newGame()`, page-hide saves. `store.replaceState` added.
  - UI: `SaveNotice.tsx` (role="alert", blocks the game), `SettingsMenu.tsx` (icon button in the TopBar, `aria-haspopup`), `NewGameConfirm.tsx` (alertdialog); styles appended to `styles.css`; `TopBar` takes `onNewGame`; `App.tsx` wired.
- **Active Decisions / Constraints:**
  - Autosave: 1 s after a build-phase change, at once on every phase change (open service, day end, summary dismissed, won), on `visibilitychange` hidden and `pagehide`. A placement made during service is saved only at the next of those. Undo, selection, toasts and speed are not saved; a loaded game is paused.
  - Dev params `?layout=` / `?cheat=` (DEV only) make the session throwaway: no load, no save.
  - A save that fails to load shows the notice; nothing is autosaved until "Start new game" (the raw text stays under `.corrupt`).
  - A new `GameState` field must be added to `validateState` in `save.ts`; the missing-field test loops over all keys, so it will fail until you do.
  - Sim tests import only `vitest` and `src/sim`. Commit and push each finished step (CLAUDE.md Workflow); work in a worktree.
- **Exact Next Step:** Step 18. Leftovers already noted: (1) fast-belt palette entry (the sim unlocks fast belts after the upgrade; `place` config `fast`); (2) the summary `avgWait` always reads 0.0 (check how `waitTicksTotal` feeds `summary` / `daySummaryView`); (3) balance numbers via the harness (targets in the Step 18 section), tuned only in `constants.ts` and `src/content/*`. Then the tutorial checklist, polish states and the AA token check.
