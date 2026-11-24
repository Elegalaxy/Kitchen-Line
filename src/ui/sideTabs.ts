// Tabs of the side panel and the keyboard rule for moving between them (pure, unit-tested).
// The Branches tab belongs to the chain stage (GAME_DESIGN 8.1): it is listed only once the restaurant end
// screen has been seen (`state.won`), and keyboard cycling uses the visible list.

export type SideTab = 'build' | 'menu' | 'upgrades' | 'goals' | 'branches'

type TabDef = { id: SideTab; label: string; icon: string }

/** The tabs every game has. */
export const SIDE_TABS: readonly TabDef[] = [
  { id: 'build', label: 'Build', icon: '🔧' },
  { id: 'menu', label: 'Menu', icon: '🍽️' },
  { id: 'upgrades', label: 'Upgrades', icon: '⬆️' },
  { id: 'goals', label: 'Goals', icon: '🎯' },
]

export const BRANCHES_TAB: TabDef = { id: 'branches', label: 'Branches', icon: '🏬' }

/** The tabs to show: the Branches tab only in the chain stage (`won`). */
export function visibleTabs(won: boolean): readonly TabDef[] {
  return won ? [...SIDE_TABS, BRANCHES_TAB] : SIDE_TABS
}

/** The tab to show: `tab` itself when it is visible, else Build (a stale Branches tab after a new game or load). */
export function effectiveTab(tab: SideTab, won: boolean): SideTab {
  return visibleTabs(won).some((t) => t.id === tab) ? tab : 'build'
}

/** Tab to move to for an arrow/Home/End key, or null for other keys. Wraps around. */
export function nextTab(current: SideTab, key: string, tabs: readonly TabDef[] = SIDE_TABS): SideTab | null {
  const i = tabs.findIndex((t) => t.id === current)
  const n = tabs.length
  switch (key) {
    case 'ArrowRight':
      return tabs[(i + 1) % n].id
    case 'ArrowLeft':
      return tabs[(i + n - 1) % n].id
    case 'Home':
      return tabs[0].id
    case 'End':
      return tabs[n - 1].id
    default:
      return null
  }
}
