// Side panel: tabs Build, Menu, Upgrades and Goals (plus Branches in the chain stage). A proper tablist: roving tabindex,
// Left/Right/Home/End move between tabs (and select them), the active tab owns the
// tabpanel. Build is the palette plus the inspector. Upgrades is the shop. Goals is the
// checklist.

import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Ctx } from './actions.ts'
import BranchesPanel from './BranchesPanel.tsx'
import BuildPalette from './BuildPalette.tsx'
import type { PaletteHover } from './BuildPalette.tsx'
import GoalsPanel from './GoalsPanel.tsx'
import Inspector from './Inspector.tsx'
import MenuPanel from './MenuPanel.tsx'
import UpgradesPanel from './UpgradesPanel.tsx'
import { effectiveTab, nextTab, visibleTabs } from './sideTabs.ts'
import type { SideTab } from './sideTabs.ts'
import type { Snapshot } from './store.ts'
import type { UiState } from './uiState.ts'

export default function SidePanel({ ctx, snap, ui }: { ctx: Ctx; snap: Snapshot; ui: UiState }) {
  const won = snap.state.won === true
  const tabs = visibleTabs(won)
  const tab = effectiveTab(ui.tab, won)
  const [hover, setHover] = useState<PaletteHover | null>(null)
  const tabRefs = useRef<Partial<Record<SideTab, HTMLButtonElement | null>>>({})
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const next = nextTab(tab, e.key, tabs)
    if (next === null) return
    e.preventDefault()
    e.stopPropagation()
    ctx.ui.set({ tab: next })
    tabRefs.current[next]?.focus()
  }
  return (
    <aside className="side">
      <div className={`tabs${tabs.length > 4 ? ' tabs-many' : ''}`} role="tablist" aria-label="Side panel">
        {tabs.map((t) => (
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
            <Inspector ctx={ctx} snap={snap} selectedId={ui.selectedId} hover={ui.selectedId === null ? hover : null} />
          </>
        )}
        {tab === 'menu' && <MenuPanel ctx={ctx} snap={snap} />}
        {tab === 'upgrades' && <UpgradesPanel ctx={ctx} snap={snap} />}
        {tab === 'goals' && <GoalsPanel ctx={ctx} snap={snap} />}
        {tab === 'branches' && <BranchesPanel ctx={ctx} snap={snap} />}
      </div>
    </aside>
  )
}
