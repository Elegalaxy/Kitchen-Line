# Close a branch

Status: approved by the user on 2026-11-25. Supersedes the "No close-branch command" decision of the chain plan (doc/plans/2026-11-24-chain.md); GAME_DESIGN 8.1.

Goal: the player can close a branch. The refund is 50% of the branch's blueprint building value, the opening fee is lost, and the slot is free for a new branch.

Rules: one commit after `npm run typecheck`, `npm run lint`, `npm test`, 11 layouts `--layout X --seed demo --days 5` and `--journey --seeds 8` byte-identical to origin/main. Before the commit: `git fetch origin`, rebase onto `origin/main`, push `HEAD:main`. Never force-push. Allowed status values: `todo`, `done`, `verified`, `failed`, `blocked`. Working folder: `D:\Coding\project\Kitchen-Line-worktrees\close-branch`.

## Design

- Command `closeBranch { id }`: build phase, chain stage only (`chain locked`, `wrong phase`, `no such branch`). Refund = floor(blueprint value x `BRANCH_CLOSE_REFUND_PERCENT` (50) / 100), integer cents. The value is the one of the blueprint the branch runs now (a refit changes it).
- The refund only raises the money, like selling a building: no day stat, not part of any day's profit, `totals.profit` and `chainProfit` unchanged. Event `branchClosed { id, areaId, refund }`.
- Closing the last branch removes `branches` (absent, as in a game that never opened one). No new state field, no save version bump; old saves load.
- The opening fee and the next site follow the OPEN branches: after a close the fee of that branch number applies again and the closed area is offered again like any unused one.
- Ids: the next id is 1 + the highest id among the open branches and the branch rows of `today`, `lastDay` and `prevDay`. So a new branch is never shown a closed branch's night. An id can come back once no day record mentions it (a branch closed before its first night, or two finished days after its last one). This is accepted: ids only seed the test day and the night noise (the noise also hashes the day), and the same id giving the same test day means closing and reopening cannot reroll a result.
- Goals: done goals stay done (`goalsDone`), "Open 3 branches" keeps showing 3 / 3, `chainWon` fires once only.
- Not undoable, like `openBranch` and `refitBranch`; the confirm dialog is the safety net.
- UI: each branch card has a quiet danger button "Close · refunds $X" (disabled with the card's reason outside the build phase) and a confirm dialog (Cancel focused, Esc cancels, focus returns to the button).
- Harness: the scripted player never closes a branch.

## Steps

### Step 1: Sim
- Status: `done`
- Progress: 2026-11-25: `BRANCH_CLOSE_REFUND_PERCENT`, command `closeBranch`, event `branchClosed`, `closeRefund` / `closeProblem`, `nextBranchId` skips ids still named in the day records. `save.ts` needed no change. Tests: `chain.test.ts` (rejections, refund, field removal, fee and site, ids, goals and `chainWon`), `save.test.ts` round trip.
- Files: `src/sim/{constants,types,branches,commands}.ts` (+ tests), `src/persist/save.test.ts`

### Step 2: UI
- Status: `done`
- Progress: 2026-11-25: Close button per card, `CloseBranchConfirm`, toast, focus returns to the button on cancel and moves to the "Your branches" heading after closing; empty text now "No branches open. Open one above.". Tests: `branchesView.test.ts`, `closeBranch.test.ts` (markup, no undo entry). Browser check (`?layout=friesSaladLine&cheat=chain`, three branches opened): at 1024 px and 375 px the tab, cards (Close button 44 px high) and dialog fit; Cancel focused, Esc returns focus to the button, confirm adds the refund and shows the toast, disabled with the reason during service, no console errors. At 375 px the chain stage page already scrolls 29 px sideways because of a screen-reader span in the goal tracker (`.goal-chip-label .sr-only`, not part of this change, left as is); with that span contained the page is exactly 375 px wide.
- Files: `src/ui/{BranchesPanel.tsx,CloseBranchConfirm.tsx,branchesView.ts,styles.css}`

### Step 3: Docs and checks
- Status: `done`
- Progress: 2026-11-25: GAME_DESIGN 8.1 and changelog. typecheck, lint, 676 tests (66 files) and build pass; 11 layouts `--layout X --seed demo --days 5` and `--journey --seeds 8` byte-identical to f4ffb7d.
