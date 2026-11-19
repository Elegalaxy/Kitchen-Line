import { useEffect } from 'react'
import GridCanvas from './canvas/GridCanvas.tsx'
import { debugLog } from './debug.ts'
import { startLoop } from './loop.ts'
import { getGameStore, useSnapshot } from './store.ts'
import TopBar from './TopBar.tsx'

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
}

export default function App() {
  const store = getGameStore()
  const snap = useSnapshot(store)

  useEffect(() => {
    debugLog('[ui]', 'app mounted')
    const stop = startLoop(store)
    // Space toggles pause. Default is prevented on keydown and keyup so a focused
    // button does not also "click".
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || isTextField(e.target)) return
      e.preventDefault()
      if (!e.repeat) store.togglePause()
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
  }, [store])

  return (
    <main className="app">
      <TopBar store={store} snap={snap} />
      <GridCanvas store={store} />
    </main>
  )
}
