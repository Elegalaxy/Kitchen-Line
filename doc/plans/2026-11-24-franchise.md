# Franchise prestige (R8)

Status: approved by the user on 2026-11-24 (starting-state perks only, no rule perks; the blueprint library is DEFERRED and "Copy/paste is [later]" stands; the recipe book is free and automatic, stall dishes only; the tutorial is shown only in the first ever run and later runs get no salad top-up, which changes a **[confirmed]** tutorial rule in GAME_DESIGN 13 by user decision).

Goal: once `chainWon`, the player can "Franchise out": sell the chain and start run N+1 (new stall, day 1, new seed). Meta progress lives in a second save key `kitchen-line.meta.v1`. With an empty meta, run 1 is unchanged: the 11 layouts (`npm run sim -- --layout X --seed demo --days 5`) stay byte-identical.

Rules: one commit per step after `npm run typecheck`, `npm run lint`, `npx vitest run --exclude src/harness/perf.test.ts`. Before each commit: `git fetch origin`, rebase onto `origin/main`, push `HEAD:main`. Never force-push. Allowed status values: `todo`, `done`, `verified`, `failed`, `blocked`.

Working folder: `D:\Coding\project\Kitchen-Line-worktrees\franchise-core`.

## Design

- Franchise points (FP): chain built 10 + earnings 1 per $1,000 of (`totals.profit` + `chainProfit`) capped 25 + speed `max(0, 40 - totals.days)` capped 10 + reputation `2 * max(0, floor(rep) - 3)`. Typical run 1 about 36, maximum 49. Unspent points carry over.
- Perks (costs in FP per level): Seed money +$250 start cash, 3 levels, 6/9/12; Good name 4 of the 10 starting ratings are 4 stars, 2 levels, 5/8; Bigger stall start with expansion 1 (10 x 8) applied free, 1 level, 10.
- Recipe book: union of dishes unlocked in franchised runs, only dishes without `requiresTier`. Book dishes start unlocked.
- `createRun(defs, baseSeed, meta)` = `createGame(defs, runSeed)` + `applyFranchiseStart`. No new `GameState` field, no tick rule. Run 1 seed `kitchen-line`; run N `kitchen-line-runN`.
- Meta save `kitchen-line.meta.v1`: `{ version: 1, savedAt, meta }`, `meta` = `runsCompleted`, `points`, `perks`, `recipeBook`, `history` (max 100). Pure `serializeMeta` / `loadMeta` in `src/persist/meta.ts`. Duplicate guard: franchising refuses if the history already holds the current state's seed.

## Steps

### Step 1: Docs
- Status: `done`
- Progress: 2026-11-24: GAME_DESIGN 2, 8, new 8.2, 10, 11, 12, 13 (dated user decision on the tutorial), 14 changelog; this plan written. No code.
- Files: `doc/GAME_DESIGN.md`, this plan

### Step 2: Types and content
- Status: `done`
- Progress: 2026-11-24: `MetaState`, `RunRecord`, `PerkDef`, `Defs.perks`, `FRANCHISE_*` constants, `content/perks.ts` in `DEFS`. 11 layouts byte-identical.
- Files: `src/sim/types.ts` (`MetaState`, `PerkDef`, `Defs.perks`), `src/sim/constants.ts` (`FRANCHISE_*`), `src/content/perks.ts`, `src/content/index.ts`
- Acceptance: 11 layouts byte-identical.

### Step 3: Sim
- Status: `done`
- Progress: 2026-11-24: `sim/franchise.ts` (+ tests): points with parts, `canFranchise`, `recordFranchise` (duplicate-seed guard, stall-only recipe book, history 100), `buyPerk` / `perkCost`, `runSeed`, `applyFranchiseStart`, `createRun`. Empty meta = same `stateHash` as `createGame`. 11 layouts byte-identical.
- Files: `src/sim/franchise.ts` (+ test): `emptyMeta`, `franchisePoints`, `canFranchise`, `recordFranchise`, `perkCost`, `buyPerk`, `runSeed`, `applyFranchiseStart`, `createRun`.
- Acceptance: empty meta gives the `createGame` hash; 11 layouts byte-identical.

### Step 4: Persist meta
- Status: `done`
- Progress: 2026-11-24: `persist/meta.ts` (+ tests): `META_KEY`, `META_CORRUPT_KEY`, `serializeMeta` / `loadMeta`; all fields required; unknown perk ids kept (shape only), the UI ignores them.
- Files: `src/persist/meta.ts` (+ test): keys, `serializeMeta` / `loadMeta`.

### Step 5: Harness `--meta`
- Status: `todo`
- Files: `src/harness/*`: run the journey as run N with a given meta; print points and the run-2 start.

### Step 6: UI session glue
- Status: `done`
- Progress: 2026-11-24: `ui/metaPersistence.ts` (read/write/clear, `.corrupt` copy, unknown dish and perk ids dropped), `session.meta`, `session.metaNotice`, `franchiseOut(perkIds)` (record, buy, write meta first, then run N+1 and the save; refused for no chain, duplicate seed, unaffordable perk or a failed meta write; dev sessions write nothing), `newGame()` via `createRun` with the meta. Tests in `ui/franchiseSession.test.ts`.
- Files: `src/ui/session.ts`, `persistence.ts`, `store.ts`: meta load/save with a `.corrupt` copy, `franchiseOut`, `buyPerk`, `startRun`.

### Step 7: UI view, Franchise modal, end screen
- Status: `todo`
- Files: `src/ui/franchiseView.ts`, `FranchiseModal.tsx`, `EndScreen.tsx`, `styles.css` (+ tests)

### Step 8: UI extras
- Status: `todo`
- Files: top-bar "Run N" stat, Branches card note, tutorial latch (checklist and `tutorialHelp` only in run 1).

### Step 9: Wrap-up
- Status: `todo`
- Files: measurements (journey run 2 with perks), GAME_DESIGN numbers, docs, HANDOFF by the user's request only.
