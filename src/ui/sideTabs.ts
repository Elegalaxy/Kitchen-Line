// Tabs of the side panel and the keyboard rule for moving between them (pure, unit-tested).

export type SideTab = 'build' | 'menu' | 'goals'

export const SIDE_TABS: readonly { id: SideTab; label: string; icon: string }[] = [
  { id: 'build', label: 'Build', icon: '🔧' },
  { id: 'menu', label: 'Menu', icon: '🍽️' },
  { id: 'goals', label: 'Goals', icon: '🎯' },
]

/** Tab to move to for an arrow/Home/End key, or null for other keys. Wraps around. */
export function nextTab(current: SideTab, key: string): SideTab | null {
  const i = SIDE_TABS.findIndex((t) => t.id === current)
  const n = SIDE_TABS.length
  switch (key) {
    case 'ArrowRight':
      return SIDE_TABS[(i + 1) % n].id
    case 'ArrowLeft':
      return SIDE_TABS[(i + n - 1) % n].id
    case 'Home':
      return SIDE_TABS[0].id
    case 'End':
      return SIDE_TABS[n - 1].id
    default:
      return null
  }
}
