// Upgrades tab: the shop. Restaurant tier, kitchen size and recipe unlocks are bought here.
// The fast belt is not bought here: this tab only says when it unlocks. It is still placed
// from the Build tab, one tile at a time. Buttons stay visible when they cannot be used,
// with the reason under them. All of these purchases work between days only.

import { MENU_CAP, TIER_ARRIVAL_FACTOR, WAITING_CAP } from '../sim/constants.ts'
import { ingredientCostOf } from '../content/dishes.ts'
import { report } from './actions.ts'
import type { Ctx } from './actions.ts'
import { debugLog } from './debug.ts'
import { formatMoney } from './format.ts'
import { expansionView, upgradeView } from './goalsView.ts'
import { menuView } from './menuView.ts'
import type { MenuRow } from './menuView.ts'
import { paletteCost, paletteReason } from './palette.ts'
import type { Snapshot } from './store.ts'

function RecipeRow({ ctx, row, readOnly, phaseNote }: { ctx: Ctx; row: MenuRow; readOnly: boolean; phaseNote: string | null }) {
  const unlock = (): void => {
    debugLog('[ui]', 'unlock recipe', row.id)
    if (report(ctx, ctx.store.dispatch({ type: 'unlockRecipe', dish: row.id }))) {
      ctx.ui.showToast(`${row.name} unlocked`, 'info')
    }
  }
  const reason = row.unlockReason ?? (readOnly ? phaseNote : null)
  return (
    <li className="upgrade-row">
      <span className="dish-name">
        <span aria-hidden="true">{row.emoji}</span> {row.name}
      </span>
      {row.locked ? (
        <button type="button" className="btn unlock-btn" disabled={reason !== null} onClick={unlock}>
          <span className="btn-main">
            Unlock <span className="num">{formatMoney(row.unlockCost)}</span>
          </span>
        </button>
      ) : (
        <span className="upgrade-owned">✓ Unlocked</span>
      )}
      <span className="pal-reason">{reason === null || !row.locked ? '' : `⚠ ${reason}`}</span>
    </li>
  )
}

export default function UpgradesPanel({ ctx, snap }: { ctx: Ctx; snap: Snapshot }) {
  const { store } = ctx
  const state = snap.state
  const { defs } = store
  const upgrade = upgradeView(state, defs)
  const exp = expansionView(state, defs)
  const menu = menuView(state, defs, ingredientCostOf)
  const recipes = menu.rows.filter((row) => row.unlockCost > 0)
  const fastCost = paletteCost(defs, 'belt', true)
  const fastLocked = paletteReason(state, defs, 'belt', true) === 'Restaurant tier'
  const isRestaurant = state.tier === 'restaurant'

  const doUpgrade = (): void => {
    debugLog('[ui]', 'upgrade tier')
    if (report(ctx, store.dispatch({ type: 'upgradeTier' }))) ctx.ui.showToast('Upgraded to restaurant', 'info')
  }
  const doExpand = (): void => {
    debugLog('[ui]', 'expand kitchen')
    if (report(ctx, store.dispatch({ type: 'buyExpansion' }))) ctx.ui.showToast('Kitchen expanded', 'info')
  }

  return (
    <>
      <section className="panel" aria-label="Restaurant upgrade">
        <h2 className="panel-title">Restaurant</h2>
        {isRestaurant ? (
          <p className="goal-tier">
            <span aria-hidden="true">✓</span> Restaurant tier
          </p>
        ) : (
          <div className="goal-action">
            <button
              type="button"
              className="btn-primary goal-btn"
              disabled={upgrade.reason !== null}
              aria-describedby="upgrade-reason"
              onClick={doUpgrade}
            >
              {upgrade.label} · <span className="num">{upgrade.costText}</span>
            </button>
            <p id="upgrade-reason" className={`goal-reason${upgrade.reason === null ? ' ready' : ''}`}>
              {upgrade.reason === null ? 'Ready: all stall goals are done.' : `⚠ ${upgrade.reason}`}
            </p>
            <dl className="kv goal-perks">
              <div className="kv-row">
                <dt>Menu slots</dt>
                <dd className="num">
                  {MENU_CAP.stall} → {MENU_CAP.restaurant}
                </dd>
              </div>
              <div className="kv-row">
                <dt>Waiting orders</dt>
                <dd className="num">
                  {WAITING_CAP.stall} → {WAITING_CAP.restaurant}
                </dd>
              </div>
              <div className="kv-row">
                <dt>Customers</dt>
                <dd className="num">×{TIER_ARRIVAL_FACTOR.restaurant}</dd>
              </div>
              <div className="kv-row">
                <dt>Fast belts, bigger grids</dt>
                <dd>Unlocked</dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      <section className="panel" aria-label="Kitchen size">
        <h2 className="panel-title">Kitchen size</h2>
        <dl className="kv">
          <div className="kv-row">
            <dt>Grid</dt>
            <dd className="num">{exp.size}</dd>
          </div>
        </dl>
        {exp.next === null ? (
          <p className="goal-reason">The kitchen is fully expanded.</p>
        ) : (
          <div className="goal-action">
            <button
              type="button"
              className="btn goal-btn"
              disabled={exp.reason !== null}
              aria-describedby="expand-reason"
              onClick={doExpand}
            >
              Expand to <span className="num">{exp.nextText}</span> · <span className="num">{exp.costText}</span>
            </button>
            <p id="expand-reason" className={`goal-reason${exp.reason === null ? ' ready' : ''}`}>
              {exp.reason === null ? 'Buildings stay where they are.' : `⚠ ${exp.reason}`}
            </p>
          </div>
        )}
      </section>

      <section className="panel" aria-label="Recipe unlocks">
        <h2 className="panel-title">Recipes</h2>
        <p className="menu-note">Fries and salad are already owned. Unlocked dishes are added from the Menu tab.</p>
        <ul className="upgrade-list">
          {recipes.map((row) => (
            <RecipeRow key={row.id} ctx={ctx} row={row} readOnly={menu.readOnly} phaseNote={menu.note} />
          ))}
        </ul>
      </section>

      <section className="panel" aria-label="Fast belt">
        <h2 className="panel-title">Fast belt</h2>
        <p className="upgrade-belt">
          <span aria-hidden="true">⏩</span> Fast belt · <span className="num">{formatMoney(fastCost)}</span> a tile
        </p>
        <p className={`goal-reason${fastLocked ? '' : ' ready'}`}>
          {fastLocked ? '🔒 Unlocks with the restaurant tier. Place it from the Build tab.' : 'Place it from the Build tab.'}
        </p>
      </section>
    </>
  )
}
