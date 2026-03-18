import { useState, useEffect } from 'react'
import { FloatingBar } from './components/FloatingBar'
import { Onboarding } from './components/Onboarding'

export function App(): React.JSX.Element {
  const [onboarded, setOnboarded] = useState<boolean | null>(null)

  useEffect(() => {
    window.electronAPI.getConfig().then((config) => {
      const c = config as { onboarded?: boolean }
      setOnboarded(c?.onboarded === true)
    }).catch(() => setOnboarded(false))
  }, [])

  // Resize window based on mode
  useEffect(() => {
    if (onboarded === null) return
    if (onboarded) {
      window.electronAPI.setWindowMode('bar')
    } else {
      window.electronAPI.setWindowMode('onboarding')
    }
  }, [onboarded])

  if (onboarded === null) return <div />

  if (!onboarded) {
    return <Onboarding onComplete={() => setOnboarded(true)} />
  }

  return <FloatingBar />
}
