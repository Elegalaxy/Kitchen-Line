// Side panel (plan Step 14): tabs Build, Menu and Goals. A proper tablist: roving tabindex,
// Left/Right/Home/End move between tabs (and select them), the active tab owns the
// tabpanel. Build is the palette plus the inspector, exactly as before. Goals is the
// goals checklist, tier upgrade and expansion (GoalsPanel).

import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Ctx } from './actions.ts'
import BuildPalette from './BuildPalette.tsx'
import type { PaletteHover } from './BuildPalette.tsx'
import GoalsPanel from './GoalsPanel.tsx'
import Inspector from './Inspector.tsx'
import MenuPanel from './MenuPanel.tsx'
import { nextTab, SIDE_TABS } from './sideTabs.ts'
import type { SideTab } from './sideTabs.ts'
import type { Snapshot } from './store.ts'
import type { UiState } from './uiState.ts'

export default function SidePanel({ ctx, snap, ui }: { ctx: Ctx; snap: Snapshot; ui: UiState }) {
  const tab = ui.tab
  const [hover, setHover] = useState<PaletteHover | null>(null)
  const tabRefs = useRef<Partial<Record<SideTab, HTMLButtonElement | null>>>({})
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const next = nextTab(tab, e.key)
    if (next === null) return
    e.preventDefault()
    e.stopPropagation()
    ctx.ui.set({ tab: next })
    tabRefs.current[next]?.focus()
  }
  return (
    <aside className="side">
      <div className="tabs" role="tablist" aria-label="Side panel">
        {SIDE_TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            className="tab"
            aria-selected={tab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => ctx.ui.set({ tab: t.id })}
            onKeyDown={onKeyDown}
          >
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`} className="tabpanel">
        {tab === 'build' && (
          <>
            <BuildPalette ctx={ctx} snap={snap} ui={ui} onHover={setHover} />
            <Inspector ctx={ctx} snap={snap} selectedId={ui.selectedId} hover={hover} />
          </>
        )}
        {tab === 'menu' && <MenuPanel ctx={ctx} snap={snap} />}
        {tab === 'goals' && <GoalsPanel ctx={ctx} snap={snap} />}
      </div>
    </aside>
  )
}
