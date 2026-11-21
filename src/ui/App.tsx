import { useEffect, useState } from 'react'
import type { Defs } from '../sim/types.ts'
import { handleHotkey } from './actions.ts'
import type { Ctx } from './actions.ts'
import GridCanvas from './canvas/GridCanvas.tsx'
import DaySummary from './DaySummary.tsx'
import { debugLog } from './debug.ts'
import EndScreen from './EndScreen.tsx'
import GoalTracker from './GoalTracker.tsx'
import { DIR_NAME } from './format.ts'
import { interpretKey } from './hotkeys.ts'
import { startLoop } from './loop.ts'
import OrdersStrip from './OrdersStrip.tsx'
import SidePanel from './SidePanel.tsx'
import { getBrowserStorage } from './persistence.ts'
import SaveNotice from './SaveNotice.tsx'
import { getGameSession } from './session.ts'
import { clearTutorialDone, readTutorialDone } from './tutorialLatch.ts'
import { useSnapshot } from './store.ts'
import Toast from './Toast.tsx'
import TileInfo from './TileInfo.tsx'
import TopBar from './TopBar.tsx'
import TutorialCard from './TutorialCard.tsx'
import { createUiStore, useUi } from './uiState.ts'
import type { UiState } from './uiState.ts'

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
}

function isGrid(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.classList.contains('grid-canvas')
}

/** One line under the grid saying what the current tool does and which keys apply. */
function hintFor(defs: Defs, ui: UiState): string {
  if (ui.tool === 'remove') return 'Sell mode: click a building to sell it (100% refund). Esc to cancel.'
  if (ui.tool === null) {
    return 'Select mode: click a building to inspect it, or pick a building from the build palette. Keyboard: focus the grid, arrow keys move, Enter acts.'
  }
  const name = ui.tool === 'belt' && ui.fast ? 'Fast belt' : defs.buildings[ui.tool].name
  const how = ui.tool === 'belt' ? 'drag to draw a line' : 'click to place'
  return `${name}, facing ${DIR_NAME[ui.dir]}: ${how}. R rotates, Esc cancels.`
}

export default function App() {
  const session = getGameSession()
  const store = session.store
  const [notice, setNotice] = useState(session.notice)
  const [uiStore] = useState(() => {
    const ui = createUiStore()
    if (readTutorialDone(getBrowserStorage())) ui.set({ guideDone: true })
    return ui
  })
  const newGame = (): void => {
    session.newGame()
    clearTutorialDone(getBrowserStorage())
    uiStore.set({ hintsHidden: false, selectedId: null, tool: null, fast: false, guideDone: false, tab: 'build' })
    setNotice(null)
  }
  const snap = useSnapshot(store)
  const ui = useUi(uiStore)
  const ctx: Ctx = { store, ui: uiStore }

  useEffect(() => {
    debugLog('[ui]', 'app mounted')
    const stop = startLoop(store)
    const actions: Ctx = { store, ui: uiStore }
    // Space toggles pause. Default is prevented on keydown and keyup so a focused
    // button does not also "click". Other hotkeys come from hotkeys.ts.
    const onKeyDown = (e: KeyboardEvent): void => {
      if (isTextField(e.target)) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) store.togglePause()
        return
      }
      const action = interpretKey(e)
      if (action === null) return
      if (e.repeat && action.type !== 'move') return
      if (handleHotkey(actions, action, isGrid(e.target))) e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !isTextField(e.target)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      stop()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [store, uiStore])

  return (
    <main className="app">
      <TopBar store={store} snap={snap} onNewGame={newGame} />
      {snap.state.phase === 'summary' && (
        <DaySummary state={snap.state} defs={store.defs} onDismiss={() => store.dispatch({ type: 'dismissSummary' })} />
      )}
      {snap.state.phase === 'won' && (
        <EndScreen state={snap.state} onKeepPlaying={() => store.dispatch({ type: 'dismissSummary' })} />
      )}
      <div className="workspace">
        <div className="stage">
          <GoalTracker snap={snap} defs={store.defs} />
          <OrdersStrip state={snap.state} defs={store.defs} />
          <div className="play">
            <TutorialCard ctx={ctx} snap={snap} ui={ui} />
            <div className="play-main">
              <GridCanvas store={store} ui={uiStore} />
              <TileInfo state={snap.state} defs={store.defs} ui={ui} />
              <p className="hint">{hintFor(store.defs, ui)}</p>
            </div>
          </div>
        </div>
        <SidePanel ctx={ctx} snap={snap} ui={ui} />
      </div>
      {notice !== null && <SaveNotice reason={notice} onStartNew={newGame} />}
      <Toast toast={ui.toast} />
    </main>
  )
}
