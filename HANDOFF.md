# Project Handoff State

- **Last Updated By:** Claude (lead session, chain tier milestone, 2026-11-24)
- **Current Goal:** First playable plus the content expansion are built. The chain stage (branches) is in and measured. Remaining work: playtesting by the user and the open items below.
- **Recent Changes & Files Touched (all on `origin/main`, plans in `doc/plans/2026-11-23-restaurant-growth.md`, `2026-11-24-{trends,pro-stations,dish-pack,critics,chain}.md`):**
  - Pantry pause, overnight cleanup, closing-soon cue (60 s, `CLOSING_SOON_TICKS` 600), summary pause button, scripted player pauses before close.
  - Restaurant growth: second pass ($400, max 2), 4 upgrades (tables, sign, music, plates), arrival factor 2.0, goal 7 ($5,000 restaurant profit, `tierProfitStart`).
  - Daily trends (`src/sim/trend.ts`), pro stations (`pro: true` on fryer, stove, assembler), dish pack (fish and chips, cheeseburger, `requiresTier`), food critics (`src/sim/critic.ts`, `tierDay`).
  - Chain tier: blueprints and branches (`src/sim/{blueprint,branches,nights}.ts`, `src/content/branchAreas.ts`), 3 chain goals, Branches tab, Chain built end screen, harness plays the chain stage (`--no-chain` to stop at the restaurant end screen).
  - CI perf test: CI limit 8 s and a 60 s test timeout (`src/harness/perf.test.ts`).
- **Active Decisions / Constraints:**
  - Journey (20 seeds): restaurant end screen median day 19, chain end screen median day 31 (about 2.1 h at 1x), 0 flagship loss days. `--no-throttle` reaches the chain at day 29.
  - Branches run a stored test-day result with +-10% hash noise minus area rent; no close-branch command; restaurant upgrades do not apply to branches (user decisions 2026-11-24).
  - Chain goal 3 target was lowered to $1,000 by the harness tuning.
  - The perf test fails locally under load (1.5 to 2.3 s against 1 s); run it alone.
  - Work in a worktree; commit and push each finished piece (CLAUDE.md Workflow). The main checkout has another chat's uncommitted edits in `Inspector.tsx` and `draw.ts` and lags `origin/main`.
- **Exact Next Step:** User decides the next slice. Candidates: R6 seasons, R8 franchise prestige, teaching the scripted player to menu trend dishes and build the new dishes, a close-branch command, a pass-value question (blueprint value counts the pre-placed pass), unverified UI checks (chain end screen with real branches at 1024 px, refit flow, day summary lines for trend and critic).
