import { useState, useEffect } from 'react'

interface Progress {
  step: string
  percent: number
}

const stepLabels: Record<string, string> = {
  transcribing: 'Transcribing...',
  summarizing: 'Summarizing...',
  saving: 'Saving...',
  publishing: 'Publishing...',
  done: 'Complete!'
}

export function ProcessingStatus(): React.JSX.Element | null {
  const [progress, setProgress] = useState<Progress | null>(null)

  useEffect(() => {
    const cleanup = window.electronAPI.onProcessingProgress((p) => {
      setProgress(p)
      if (p.step === 'done') {
        setTimeout(() => setProgress(null), 3000)
      }
    })
    return cleanup
  }, [])

  if (!progress) return null

  return (
    <div className="glass-bar rounded-2xl px-4 py-3 mt-1 no-drag">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/80 text-xs">
          {stepLabels[progress.step] || progress.step}
        </span>
        <span className="text-white/50 text-xs">{progress.percent}%</span>
      </div>
      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-400 to-purple-400 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  )
}
