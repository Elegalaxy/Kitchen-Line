// Small season pieces shared by the menu and upgrades panels: the dish tag and the cost arrow.
// The tag is text ("In season" / "Out of season, from day N"); the arrow is ▲ / ▼, never colour alone.

import { formatMoney } from './format.ts'
import type { SeasonTag } from './seasonView.ts'

export function SeasonTagView({ tag }: { tag: SeasonTag | null }) {
  if (tag === null) return null
  return <span className={`season-tag${tag.inSeason ? '' : ' season-tag-out'}`}>{tag.text}</span>
}

/** ▲ (dearer) or ▼ (cheaper) next to a cost; an empty reserved slot when unchanged, so nothing shifts. */
export function CostArrow({ cost, base }: { cost: number; base: number }) {
  if (cost === base) return <span className="cost-arrow" aria-hidden="true" />
  const up = cost > base
  return (
    <>
      <span className={`cost-arrow ${up ? 'cost-up' : 'cost-down'}`} aria-hidden="true">
        {up ? '▲' : '▼'}
      </span>
      <span className="sr-only">{up ? ' up from ' : ' down from '}{formatMoney(base)}</span>
    </>
  )
}
