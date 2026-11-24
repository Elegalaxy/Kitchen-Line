// Tests for the side panel tab keyboard rule: arrows wrap, Home/End jump, other keys are ignored.

import { describe, expect, it } from 'vitest'
import { effectiveTab, nextTab, SIDE_TABS, visibleTabs } from './sideTabs.ts'

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

describe('Branches tab', () => {
  it('is visible only once the restaurant end screen was seen', () => {
    expect(visibleTabs(false).map((t) => t.id)).toEqual(['build', 'menu', 'upgrades', 'goals'])
    expect(visibleTabs(true).map((t) => t.id)).toEqual(['build', 'menu', 'upgrades', 'goals', 'branches'])
  })

  it('cycles through the visible list', () => {
    const tabs = visibleTabs(true)
    expect(nextTab('goals', 'ArrowRight', tabs)).toBe('branches')
    expect(nextTab('branches', 'ArrowRight', tabs)).toBe('build')
    expect(nextTab('build', 'ArrowLeft', tabs)).toBe('branches')
    expect(nextTab('menu', 'End', tabs)).toBe('branches')
    expect(nextTab('goals', 'ArrowRight')).toBe('build')
  })

  it('falls back to Build when the tab is not visible', () => {
    expect(effectiveTab('branches', false)).toBe('build')
    expect(effectiveTab('branches', true)).toBe('branches')
    expect(effectiveTab('goals', false)).toBe('goals')
  })
})
