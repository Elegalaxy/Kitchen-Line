# Pro stations (roadmap R5)

Status: approved roadmap item (2026-11-24). A second kitchen money sink at the restaurant tier: faster variants of the fryer, stove and assembler.

Design (provisional numbers, GAME_DESIGN 5.3):
- Pro variant = optional `pro: true` flag on the fryer, stove and assembler (same pattern as the fast belt's `fast`, and as the pantry's `paused`: the field is absent unless set, so no hash changes without a pro building). The chopper has no pro variant.
- Speed: a pro station needs 2/3 of the base ticks, rounded up (fryer 60 to 40, stove 60 to 40, assembler 30 to 20). `PRO_TICKS_NUM` / `PRO_TICKS_DEN` in `sim/constants.ts`.
- Cost: about 2x the base building, in `content/buildings.ts` (`pro: { cost, requiresTier: 'restaurant' }`): fryer $80, stove $120, assembler $100. Selling refunds 100% of the pro price.
- Unlock: the fast belt has no purchase in the Upgrades tab (it is only tier-gated and placed from Build, the tab just says when it unlocks). The pro stations mirror that exactly: restaurant tier, placed from the Build tab as "Pro fryer" / "Pro stove" / "Pro assembler" entries after their base tile; the Upgrades tab shows a "Pro stations" status section.

Rules for every step: one commit per step after `npm run typecheck`, `npm run lint` and `npx vitest run --exclude src/harness/perf.test.ts` pass. Stall-tier hashes and fixtures stay unchanged. New fields optional, validated in `src/persist/save.ts` when present, no save version bump. Status values: `todo`, `done`, `verified`.

Working folder: `D:\Coding\project\Kitchen-Line-worktrees\pro-stations`.

### Step 1: Design doc

- Status: `done`
- Progress: 2026-11-24: GAME_DESIGN 5.3 row, section 10 note and changelog written.
- Files: `doc/GAME_DESIGN.md`
- What changes: 5.3 (pro stations row), 10 (Upgrades tab note), changelog.

### Step 2: Sim, content, tests

- Status: `done`
- Progress: 2026-11-24: optional `pro` flag (fryer, stove, assembler; absent unless set), `BuildingDef.pro`, `PlaceConfig` type, `stationTicks` (2/3 rounded up, `PRO_TICKS_NUM/DEN`), place cost / tier gate / refund, save validation; tests in `sim/pro.test.ts`, `save.test.ts`, `content.test.ts`. All existing hashes and fixtures unchanged.
- Files: `src/sim/types.ts`, `constants.ts`, `grid.ts`, `commands.ts`, `stations.ts`, `src/content/buildings.ts`, `src/persist/save.ts`, tests
- Acceptance: speed, cost, tier gating, 100% refund, save round-trip, old saves load, hashes unchanged without pro.

### Step 3: UI and canvas

- Status: `done`
- Progress: 2026-11-24: palette entries "Pro fryer / Pro stove / Pro assembler" after their base tile (generalised the fast-belt variant: `hasVariant`, `variantConfig`, `variantName`, `speedText` in `palette.ts`; `ui.fast` now means "variant"), canvas PRO tag plus inner outline, Inspector Speed row and PRO tag, hover card, tile tooltip, Upgrades tab "Pro stations" section, undo keeps `pro`, Sell label and Inspector refund use `refundOf`. Browser-checked at 1024 and 375 px with an injected restaurant save; test in `ui/proStations.test.ts`.
- Files: `src/ui/palette.ts`, `BuildPalette.tsx`, `actions.ts`, `canvas/input.ts`, `canvas/draw.ts`, `Inspector.tsx`, `UpgradesPanel.tsx`, `undo.ts`, tests

### Step 4: Harness and measurement

- Status: `done`
- Progress: 2026-11-24: `runJourney` option `pro` (default on), CLI `--no-pro`, `proFryerDay` in the result, journey line "pro fryer bought on day". Policy: at the restaurant tier, the day after 2+ fries customers gave up, the player sells the fries fryer (100% refund) and places a pro fryer in the same tile; the second fryer line (auto mode) only follows on a later day if fries customers still give up.

Measured with `npm run sim -- --journey --seeds 20` on this branch (main at a9b923c, which already includes the daily trends slice; the baseline end screen is therefore day 19, not the day 18 of the restaurant-growth plan):

| Variant | End screen median (min-max), mean | Reached | Loss days | Pro fryer day (median) | Fries customers gave up a day, restaurant tier, single fryer |
| --- | --- | --- | --- | --- | --- |
| `--no-pro` (identical output to before this slice) | 19 (17-21), 19.15 | 20/20 | 0 of 383 | n/a | 3.09 (42% of days with 2+) |
| pro fryer on (default) | 19 (17-20), 18.7 | 20/20 | 0 of 374 | 8 (6-11) | 1.63 (30% of days with 2+) |

Findings: the pro fryer saves about half a day on average (total days 383 to 374, max 21 to 20) and removes about half of the fries walk-outs; the median end-screen day stays 19. Median cash spent at the restaurant tier $2895 to $2935 (the swap costs $40 net). `--no-pro` journey output (from the second line on) is byte-identical to the run before the harness change, and the 7 layouts `npm run sim -- --layout <name> --seed demo --days 5` are byte-identical before and after (no pro building is placed in them).

- What changes: the scripted player buys a pro fryer when the fryer is the bottleneck; `--no-pro` turns it off.
- Acceptance: 20/20 journey seeds reach the end screen, 0 loss days, 7 layouts `--days 5` byte-identical to before.

### Step 5: Inspector Sell for a pass

- Status: `todo`
- What changes: the Inspector refuses selling a pass only when it is the last one (the sim's rule).
