# Blueprint library (franchise)

Status: approved by the user on 2026-11-24 (design below). Replaces the single starter kitchen of doc/plans/2026-11-24-starter-kit.md by a small library; GAME_DESIGN 8.2.

Goal: the player keeps up to three stall kitchens across runs, saves them by choice at franchise out, and picks which one starts the next run (with the one-off Starter kitchen perk).

Rules: one commit per part after `npm run typecheck`, `npm run lint`, `npx vitest run --exclude src/harness/perf.test.ts`. Before each commit: `git fetch origin`, rebase onto `origin/main`, push `HEAD:main`. Never force-push. Allowed status values: `todo`, `done`, `verified`, `failed`, `blocked`. Working folder: `D:\Coding\project\Kitchen-Line-worktrees\kit-library`.

## Design

- `MetaState.library?: (LibraryEntry | null)[]`, `LIBRARY_SLOTS` = 3 (`sim/constants.ts`), `LibraryEntry = { run, kit: Blueprint }`. `MetaState.activeKit?: number | null`: the slot that starts the next run, null for none, absent for the most recently saved (highest run, a tie goes to the later slot). The legacy `starterKit` is read as slot 1 (`libraryOf`, run = last history run or 1) and dropped at the next franchise out. No meta version bump.
- Manual save: `recordFranchise(meta, state, defs, { saveSlot })` saves `state.stallKit` only into the chosen slot (overwrite allowed); no slot, or a run without a kit, saves nothing; a bad slot is refused before anything is booked.
- `buyPerk` for `starterKit`: needs at least one saved kitchen in the library. Franchise out records first (with the save) and buys after, so the kitchen being saved counts; the sim stays pure.
- `chooseKit(meta, slot | null | undefined)` sets `activeKit` (refuses an empty or unknown slot). `applyFranchiseStart` installs `activeKitOf(meta)` when the perk is owned. Empty meta, perks without a kit, a kit without the perk, or "None" all equal `createGame` (same `stateHash`).
- Persist: `meta.library` (at most 3 entries, each null or `{ run >= 1, kit }` through the same blueprint check as a branch blueprint) and `meta.activeKit` (integer 0 to 2 or null); all optional, hostile files are rejected with a reason.
- Session: `franchiseOut(perkIds, { saveSlot, useSlot })`, same atomic order (meta first, then the save), same refusals.
- UI (Franchise modal): "Blueprint library" section with the run's kit summary and a radio list (slots 1 to 3 with what is there, "Don't save"; default the first empty slot, a full library defaults to "Don't save"; hidden when the run has no kit). Once the perk is owned (bought now or before) and a kitchen is saved, "Start run with" lists the saved kitchens ("Run 2, fries + salad, 21 buildings, value $607.00") plus "None (start empty)", default the newest. The perk card says "N of 3 slots used". Dev cheat `?cheat=library` opens the Chain built end screen with two kitchens already saved and 40 points.
- Harness: `--meta` saves each run's kitchen into the first free slot (a full library stays as it is) and the most recent starts the next run; the output has a "blueprint library after each franchise" block. `--no-starterkit` and `--starterkit-only` unchanged.

## Steps

### Step 1: Sim, persist and session
- Status: `done`
- Progress: 2026-11-24: types, `LIBRARY_SLOTS`, `libraryOf` / `latestSlot` / `activeKitOf` / `chooseKit`, `recordFranchise` options, `buyPerk`, `applyFranchiseStart`, meta validation, `session.franchiseOut`, view helper (`franchiseView` choices, `kitLabel`). Tests: franchise.test.ts, meta.test.ts, franchiseView.test.ts, franchiseSession.test.ts. 11 layouts and the 8-seed journey byte-identical to origin/main.
- Files: `src/sim/{types,constants,franchise}.ts`, `src/persist/meta.ts`, `src/ui/{franchiseView,session}.ts` (+ tests)

### Step 2: Content and UI
- Status: `done`
- Progress: 2026-11-24: `FranchiseModal` save and start choices (radio lists), `?cheat=library`, styles with existing tokens, markup test. Browser-checked at 1024 px and 375 px (the pane reports a 404 px wide viewport for the mobile preset): no horizontal overflow (document width equals the viewport, no element wider than the modal), options 54 px high.
- Files: `src/ui/{FranchiseModal.tsx,App.tsx,session.ts,styles.css}`

### Step 3: Harness and measurements
- Status: `done`
- Progress: 2026-11-24: library policy in `runMetaSeed`, `formatMetaLibrary`, tests (including a 3-run test); measurements below.
- Files: `src/harness/{franchise,cli}.ts` (+ test)

### Step 4: Docs
- Status: `done`
- Progress: 2026-11-24: GAME_DESIGN 8.2 (library rule, perk table, meta save, [later] list), 14 changelog; this plan.

## Measurements

`npm run sim -- --journey --seeds 20 --meta --runs 2` (default policy: kit first, then seed money, good name): identical to the starter-kitchen plan (apart from the new library block): FP earned median 35 (min 32, max 37), points spent median 34 (29 to 34), run 1 medians restaurant end screen day 18 / chain day 32, run 2 restaurant day 14 / chain day 27. Every seed reached both end screens (20/20).

`--runs 3 --seeds 8`: the library is used across three runs. After run 1 every seed holds `[1 - -]` and run 2 starts with run 1's kitchen; after run 2 it holds `[1 2 -]` and run 3 starts with run 2's kitchen (the newest).

| 8 seeds, `--runs 3` | restaurant end screen (median) | chain end screen (median) |
|---|---|---|
| Run 1 (no perks) | 19 | 33 |
| Run 2 (kit from run 1 + seed money 2 + good name 1) | 14 | 27 |
| Run 3 (kit from run 2, perks from run 2's franchise) | 14 | 26 |

Reading: the library changes no number for a two-run player (the newest kitchen is the one the old rule kept). Run 3 gains one more day at the chain end screen; the restaurant floor of about day 14 (goal 7) is unchanged.

Checks: 5-day output of all 11 layouts and `--journey --seeds 8` are byte-identical to origin/main (`GameState` is untouched).
