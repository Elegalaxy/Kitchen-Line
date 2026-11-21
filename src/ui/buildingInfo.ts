// Short player-facing descriptions of each building, shown in the Inspector while the
// pointer or keyboard focus is on a build palette entry. They restate the rules in
// sim/transfer.ts and sim/logistics.ts: what the building does and where items go in and out.

import type { BuildingKind } from '../sim/types.ts'

export type BuildingInfo = { what: string; inOut: string }

export const BUILDING_INFO: Record<BuildingKind, BuildingInfo> = {
  belt: {
    what: 'Carries items one tile in the direction it faces. Drag to draw a line; a turn is a belt that is fed from its side.',
    inOut: 'In: back and both sides. Out: front.',
  },
  pantry: {
    what: 'Makes a raw ingredient on a timer (pick which one in the Inspector). Each item costs money.',
    inOut: 'Out: front. Needs a belt or station there to take it.',
  },
  splitter: {
    what: 'Shares items between two lines, alternating left and right. If one side is blocked it uses the other.',
    inOut: 'In: back only. Out: left and right (never the front).',
  },
  merger: {
    what: 'Joins up to three lines into one, taking turns so no input starves.',
    inOut: 'In: back, left and right. Out: front.',
  },
  filter: {
    what: 'Sends the chosen item out its left side and everything else straight on. Waits if its exit is blocked.',
    inOut: 'In: back only. Out: left (chosen item) and front (the rest).',
  },
  chopper: {
    what: 'Chops ingredients that have a chopping recipe, such as potatoes or lettuce.',
    inOut: 'In: back and sides. Out: front.',
  },
  fryer: {
    what: 'Fries ingredients that have a frying recipe. One item at a time, so a busy fryer can become a bottleneck.',
    inOut: 'In: back and sides. Out: front.',
  },
  stove: {
    what: 'Cooks ingredients that have a stove recipe, such as soup or rice.',
    inOut: 'In: back and sides. Out: front.',
  },
  assembler: {
    what: 'Combines ingredients into a dish once it has every input of the chosen dish (pick it in the Inspector). Two tiles long.',
    inOut: 'In: back and sides. Out: front of the second tile.',
  },
  pass: {
    what: 'The serving counter. Finished dishes wait here for customers; it holds up to 4 of each dish and throws away the oldest unsold one when a new one arrives.',
    inOut: 'In: any side, dishes only.',
  },
  bin: {
    what: 'Throws away anything you send it. Use it to clear a jam; binned items count as waste.',
    inOut: 'In: any side.',
  },
}
