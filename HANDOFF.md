# Project Handoff State

- **Last Updated By:** Claude (implementer, Step 7, 2026-11-20)
- **Current Goal:** Step 8 of `doc/plans/2026-11-19-first-playable.md`: assembler and all 6 dishes.
- **Recent Changes & Files Touched (Step 7, done):**
  - `src/sim/logistics.ts` (new): `stepRouting` and `acceptRouting` for splitter, merger, filter. One-item `buf`; "left" = dir+3, "right" = dir+1.
    - Splitter: input from back only, alternates left/right via `rr` (0 = left next), falls back to the other side if refused.
    - Merger: inputs left/right/back (never front), output front. `rr` indexes [left, right, back]; a side is refused only while a side ahead of it in that order has a sender waiting (`senderWaiting`), so none starves.
    - Filter: input from back; `filterItem` goes left, all else front; no fallback (blocked exit = blocked filter).
  - `src/sim/transfer.ts` (acceptance case), `tick.ts` (`stepRouting`, runs with the non-belts), `types.ts` (splitter and merger are separate union members so `kind` narrows).
  - `src/ui/canvas/draw.ts`: `drawRouting` adds exit/entrance arrows (splitter out left+right, merger in from three sides, filter out left plus the chosen item emoji or a dash). `Inspector.tsx` already had the filter select (all DEFS items, `configure`); unchanged.
  - `src/content/layouts.ts`: `routingDemo` ($52). Tests: `src/sim/logistics.test.ts` (new).
- **Active Decisions / Constraints:**
  - `tryInsert` for a routing building sets status `ok`; its own update sets `idle`/`blocked`. Held items move at most once per tick (`moved` set), so an item taken this tick leaves next tick.
  - Merger `senderWaiting` looks at the neighbour on that side: a belt with an item in slot 1, a station output, a routing buffer, or a pantry with cooldown <= 1.
  - Bins show no item count; routing results are only checked in tests, the browser shows items moving.
  - Banned word `process` in `src/sim` (also in comments). Python edits of files with emoji need `encoding='utf-8'` on Windows.
- **Exact Next Step:** Step 8: assembler (2x1, `recipe` select, inputs cap 2 each, 30 ticks) plus layouts saladLine, burgerLine, soupLine, sandwichLine, riceBowlLine; input pips on the canvas, `noRecipe` badge. Reuse `acceptRouting`-style acceptance in `transfer.ts` and inline Defs fixtures in tests.
