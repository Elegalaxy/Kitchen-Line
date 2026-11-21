// Tests for the side panel tab keyboard rule: arrows wrap, Home/End jump, other keys are ignored.

import { describe, expect, it } from 'vitest'
import { nextTab, SIDE_TABS } from './sideTabs.ts'

describe('nextTab', () => {
  it('lists Build, Menu, Upgrades, Goals in that order', () => {
    expect(SIDE_TABS.map((t) => t.id)).toEqual(['build', 'menu', 'upgrades', 'goals'])
  })

  it('moves right and left with wrap-around', () => {
    expect(nextTab('build', 'ArrowRight')).toBe('menu')
    expect(nextTab('menu', 'ArrowRight')).toBe('upgrades')
    expect(nextTab('upgrades', 'ArrowRight')).toBe('goals')
    expect(nextTab('goals', 'ArrowRight')).toBe('build')
    expect(nextTab('build', 'ArrowLeft')).toBe('goals')
    expect(nextTab('goals', 'ArrowLeft')).toBe('upgrades')
    expect(nextTab('upgrades', 'ArrowLeft')).toBe('menu')
  })

  it('Home and End jump to the ends; other keys do nothing', () => {
    expect(nextTab('menu', 'Home')).toBe('build')
    expect(nextTab('menu', 'End')).toBe('goals')
    for (const key of ['Enter', ' ', 'a', 'ArrowUp', 'Tab']) expect(nextTab('menu', key)).toBeNull()
  })
})
