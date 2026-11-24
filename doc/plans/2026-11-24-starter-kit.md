# Starter kitchen (franchise perk)

Status: approved by the user on 2026-11-24 (design below). Slice of the franchise plan (doc/plans/2026-11-24-franchise.md); GAME_DESIGN 8.2.

Goal: run 2 and later can start with the stall kitchen the player had when they upgraded to a restaurant, built free, as one more franchise perk. It is a single saved kitchen, NOT the multi-slot blueprint library (still [later]).

Rules: one commit per part after `npm run typecheck`, `npm run lint`, `npx vitest run --exclude src/harness/perf.test.ts`. Before each commit: `git fetch origin`, rebase onto `origin/main`, push `HEAD:main`. Never force-push. Allowed status values: `todo`, `done`, `verified`, `failed`, `blocked`. Working folder: `D:\Coding\project\Kitchen-Line-worktrees\starter-kit`.

## Design

- `upgradeTier` stores `blueprintOf(state)` (taken before the tier changes) as the optional `GameState.stallKit`. `stateHash` is the JSON of the whole state, so only runs that upgrade gain the key; stall-only runs and all 11 layouts keep their hashes (checked byte-identical).
- `recordFranchise` copies it to the optional `MetaState.starterKit`, always replacing an older kit; a run without a kit keeps the old one.
- Perk `starterKit` (content/perks.ts, `effect.starterKit: true`, one level, 14 FP provisional). `buyPerk` refuses it with "no saved kitchen yet" until a kit exists. `applyFranchiseStart` installs the kit free on day 1: the kit's buildings replace the pre-placed pass and pantry, `nextId` continues after the highest id, saved menu with prices, saved stall dishes unlocked, a Bigger stall grid is kept (kit placed in it). A kit that does not fit (non-stall expansion or building, fast belt, pro station, two passes, mismatching tiles or sizes) installs nothing and never throws. Empty meta, or perks without a kit, equal `createGame` (same `stateHash`).
- Persist: `state.stallKit` and `meta.starterKit` go through the same blueprint check as a branch blueprint (`blueprint` in save.ts); both optional, no version bump.
- UI: the Franchise modal card shows level, effect, cost, Buy with a disabled reason ("Upgrade to a restaurant in a run first") and a "Saved kitchen: N buildings, value $X" row (the kit that will be saved when franchising: this run's, or the one kept from an earlier run). The perk grid is now 2 columns. Dev cheats `restaurant`, `won`, `chain` (and so `chainwon`) save a kit like the upgrade would.
- Harness: `--meta` buys the starter kitchen first (then seed money, good name, bigger stall); `--no-starterkit` restores the old policy, `--starterkit-only` buys only the kit. The scripted player counts already-built stall lines as built and skips place commands whose building already stands.

## Steps

### Step 1: Sim and persist
- Status: `done`
- Progress: 2026-11-24: types (`stallKit`, `starterKit`, `PerkDef.effect.starterKit`), `upgradeTier`, `recordFranchise`, `starterKitProblem` / install in `applyFranchiseStart`, `blueprint` export in save.ts used by meta.ts (shared `Invalid`). Tests: franchise.test.ts (install, hash equality, invalid kits, Bigger stall), save.test.ts, meta.test.ts. 11 layouts and the 8-seed journey byte-identical to origin/main.
- Files: `src/sim/{types,commands,franchise}.ts`, `src/persist/{save,meta}.ts` (+ tests)

### Step 2: Content and UI
- Status: `done`
- Progress: 2026-11-24: perk in `content/perks.ts`, `buyPerk` guard, `franchiseView` (kitText, reason), `FranchiseModal` row, 2-column perk grid, dev cheats. Browser-checked at 375 px: no horizontal overflow (document width equals the viewport), the card shows "21 buildings, value $607.00" on the `chainwon` cheat. Tests: franchiseView.test.ts, franchiseModal.test.ts.
- Files: `src/content/perks.ts`, `src/ui/{franchiseView.ts,FranchiseModal.tsx,store.ts,styles.css}`

### Step 3: Harness and measurements
- Status: `done`
- Progress: 2026-11-24: spend orders, `--no-starterkit`, `--starterkit-only`, player skips built lines; measurements below.
- Files: `src/harness/{franchise,args,cli,player}.ts` (+ tests)

### Step 4: Docs
- Status: `done`
- Progress: 2026-11-24: GAME_DESIGN 8, 8.2 (perk table, rule, [later] split), 14; this plan.

## Measurements (20 seeds, `npm run sim -- --journey --seeds 20 --meta --runs 2 [flag]`)

| 20 seeds | upgrade day (median) | restaurant end screen (median / min / max) | chain end screen (median / min / max) | FP spent |
|---|---|---|---|---|
| Run 1 (no perks) | 6 | 18 / 17 / 20 | 32 / 29 / 37 | - |
| Run 2, seed money 3 + good name 1 (`--no-starterkit`) | 3 | 14 / 13 / 16 | 27 / 23 / 33 | 32 |
| Run 2, starter kitchen + seed money 2 + good name 1 (default) | 3 | 14 / 14 / 16 | 27 / 21 / 32 | 29 to 34 (median 34) |
| Run 2, starter kitchen only (`--starterkit-only`) | 5 | 16 / 15 / 18 | 29 / 25 / 36 | 14 |

FP earned after run 1: median 35, min 32, max 37. Every run reached both end screens (20/20); the only issue line is "soup sold 0 (on the menu)" in 2 seeds, as without the kit; no rejected command.

Reading: the kit alone buys 2 days at the restaurant end screen (16 vs 18) and 3 at the chain (29 vs 32); the stall phase is not skippable (upgrade day 5 vs 6: the stall goals still need their days of sales). With the other perks the run is as fast as the seed-money policy (14 / 27) but costs 29 to 34 FP instead of 32, so the kit does not make the fast run faster: from the upgrade the restaurant goal 7 ($5,000 profit) takes 11 to 13 days whatever the start, which sets a floor of about day 14. The cost 14 FP is kept (not tuned): kit 14 + seed money 6 + 9 + good name 5 = 34 is about the 35 FP a run earns, so the kit, seed money and good name compete for the same points.
