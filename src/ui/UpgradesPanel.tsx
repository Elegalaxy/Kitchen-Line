// Upgrades tab: the shop. Restaurant tier, kitchen size and recipe unlocks are bought here.
// The fast belt and the pro stations are not bought here: this tab only says when they unlock. It is still placed
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
import { upgradeRows } from './upgradesView.ts'
import type { UpgradeRow } from './upgradesView.ts'
import type { MenuRow } from './menuView.ts'
import { hasVariant, paletteCost, paletteKinds, paletteReason, speedText, variantName } from './palette.ts'
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

function RestaurantUpgradeRow({ ctx, row }: { ctx: Ctx; row: UpgradeRow }) {
  const buy = (): void => {
    debugLog('[ui]', 'buy upgrade', row.id)
    if (report(ctx, ctx.store.dispatch({ type: 'buyUpgrade', id: row.id }))) {
      ctx.ui.showToast(`${row.name} bought`, 'info')
    }
  }
  return (
    <li className="upgrade-row">
      <span className="dish-name">
        <span aria-hidden="true">{row.emoji}</span> {row.name}
      </span>
      {row.owned && <span className="upgrade-owned">✓ Bought</span>}
      <span className="upgrade-effect">{row.effectText}</span>
      {!row.owned && (
        <button type="button" className="btn unlock-btn" disabled={row.reason !== null} onClick={buy}>
          <span className="btn-main">
            Buy <span className="num">{row.costText}</span>
          </span>
        </button>
      )}
      {row.reason !== null && <span className="pal-reason upgrade-reason">{`⚠ ${row.reason}`}</span>}
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
  const proKinds = paletteKinds(defs).filter((kind) => hasVariant(defs, kind) && kind !== 'belt')
  const proRows = proKinds.map((kind) => ({
    kind,
    emoji: defs.buildings[kind].emoji,
    name: variantName(defs, kind),
    cost: paletteCost(defs, kind, true),
    speed: speedText(defs, kind, true)?.replace(' per item', '') ?? '',
  }))
  const proLocked = proKinds.some((kind) => paletteReason(state, defs, kind, true) === 'Restaurant tier')
  const isRestaurant = state.tier === 'restaurant'
  const shop = isRestaurant ? upgradeRows(state, defs) : []

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

      {shop.length > 0 && (
        <section className="panel" aria-label="Restaurant shop">
          <h2 className="panel-title">Restaurant upgrades</h2>
          <ul className="upgrade-list">
            {shop.map((row) => (
              <RestaurantUpgradeRow key={row.id} ctx={ctx} row={row} />
            ))}
          </ul>
        </section>
      )}

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

      <section className="panel" aria-label="Pro stations">
        <h2 className="panel-title">Pro stations</h2>
        <ul className="pro-list">
          {proRows.map((row) => (
            <li key={row.kind} className="pro-row">
              <span>
                <span aria-hidden="true">{row.emoji}</span> {row.name}
              </span>
              <span className="num">{formatMoney(row.cost)}</span>
              <span className="num muted">{row.speed}</span>
            </li>
          ))}
        </ul>
        <p className={`goal-reason${proLocked ? '' : ' ready'}`}>
          {proLocked ? '🔒 Unlocks with the restaurant tier. Place them from the Build tab.' : 'Place them from the Build tab.'}
        </p>
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
