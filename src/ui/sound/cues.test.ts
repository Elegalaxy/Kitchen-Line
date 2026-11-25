// Tests for the event -> cue mapping and the throttle.

import { describe, expect, it } from 'vitest'
import type { SimEvent } from '../../sim/types.ts'
import { createCueGate, cueLength, CUES, cuesFor, MAX_VOICES } from './cues.ts'

const served: SimEvent = { type: 'served', tick: 1, id: 1, dish: 'fries', price: 500, wait: 3 }
const lost: SimEvent = { type: 'customerLeft', tick: 1, id: 2, reason: 'patience', dish: 'fries' }
const closing: SimEvent = { type: 'customerLeft', tick: 1, id: 3, reason: 'closing', dish: 'fries' }
const spoiled: SimEvent = { type: 'spoiled', tick: 1, x: 0, y: 0, item: 'potato' }
const binned: SimEvent = { type: 'binned', tick: 1, x: 0, y: 0, item: 'potato' }

describe('cuesFor', () => {
  it('maps events to cues once each, most important first', () => {
    const events: SimEvent[] = [spoiled, served, served, lost, binned, { type: 'goalDone', tick: 1, id: 'g' }]
    expect(cuesFor(events, true)).toEqual(['dayEnd', 'goal', 'lost', 'sale', 'waste'])
  })

  it('maps the spends to purchase and the end screens to goal', () => {
    expect(cuesFor([{ type: 'upgradeBought', tick: 1, id: 'u', cost: 1 }], false)).toEqual(['purchase'])
    expect(cuesFor([{ type: 'tierUpgraded', tick: 1, cost: 1 }], false)).toEqual(['purchase'])
    expect(cuesFor([{ type: 'expanded', tick: 1, width: 9, height: 7, cost: 1 }], false)).toEqual(['purchase'])
    expect(cuesFor([{ type: 'won', tick: 1 }], false)).toEqual(['goal'])
  })

  it('stays silent for closing-time leftovers, building and item flow', () => {
    const events: SimEvent[] = [
      closing,
      { type: 'built', tick: 1, kind: 'belt', x: 0, y: 0, cost: 1 },
      { type: 'delivered', tick: 1, x: 0, y: 0, item: 'fries' },
      { type: 'emit', tick: 1, x: 0, y: 0, item: 'potato', cost: 1 },
    ]
    expect(cuesFor(events, false)).toEqual([])
  })
})

describe('createCueGate', () => {
  it('holds a cue back until its gap has passed', () => {
    const gate = createCueGate()
    expect(gate.admit(['waste'], 0)).toEqual(['waste'])
    expect(gate.admit(['waste'], CUES.waste.gapMs - 1)).toEqual([])
    expect(gate.admit(['waste'], CUES.waste.gapMs)).toEqual(['waste'])
  })

  it('never has more than MAX_VOICES cues sounding, and frees a voice when one ends', () => {
    const gate = createCueGate()
    const first = gate.admit(['dayEnd', 'goal', 'purchase', 'lost', 'sale'], 0)
    expect(first).toEqual(['dayEnd', 'goal', 'purchase'])
    expect(first).toHaveLength(MAX_VOICES)
    expect(gate.admit(['sale'], 10)).toEqual([])
    expect(gate.admit(['sale'], cueLength('purchase'))).toEqual(['sale'])
  })

  it('stays calm over a long fast run', () => {
    const gate = createCueGate()
    let plays = 0
    for (let t = 0; t < 10_000; t += 16) plays += gate.admit(['sale', 'waste'], t).length
    expect(plays).toBeLessThanOrEqual(Math.ceil(10_000 / CUES.sale.gapMs) + Math.ceil(10_000 / CUES.waste.gapMs))
  })

  it('reset forgets the history', () => {
    const gate = createCueGate()
    gate.admit(['goal'], 0)
    gate.reset()
    expect(gate.admit(['goal'], 1)).toEqual(['goal'])
  })
})
