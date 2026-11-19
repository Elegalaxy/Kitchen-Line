import { useEffect } from 'react'
import { debugLog } from './debug.ts'

export default function App() {
  useEffect(() => {
    debugLog('[ui]', 'app mounted')
  }, [])

  return (
    <main className="app">
      <h1>Kitchen Line – dev build</h1>
    </main>
  )
}
