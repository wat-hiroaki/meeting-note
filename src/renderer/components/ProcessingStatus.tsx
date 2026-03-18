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

interface ProcessingStatusProps {
  outputPath: string | null
  error: string | null
  onDismiss: () => void
}

export function ProcessingStatus({ outputPath, error, onDismiss }: ProcessingStatusProps): React.JSX.Element | null {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const cleanup = window.electronAPI.onProcessingProgress((p) => {
      setProgress(p)
    })
    return cleanup
  }, [])

  const handleOpenFile = (): void => {
    if (outputPath) {
      window.electronAPI.openPath(outputPath)
    }
  }

  const handleCopyPath = (): void => {
    if (outputPath) {
      window.electronAPI.copyToClipboard(outputPath)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const isDone = progress?.step === 'done'

  // Show error state
  if (error) {
    return (
      <div className="solid-panel rounded-2xl px-4 py-3 mt-1 no-drag">
        <div className="flex items-center justify-between mb-1">
          <span className="text-red-400 text-xs font-medium">Error</span>
          <button onClick={onDismiss} className="text-white/40 hover:text-white/80 text-xs">Dismiss</button>
        </div>
        <p className="text-white/60 text-xs leading-relaxed">{error}</p>
      </div>
    )
  }

  if (!progress) return null

  return (
    <div className="solid-panel rounded-2xl px-4 py-3 mt-1 no-drag">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/80 text-xs">
          {stepLabels[progress.step] || progress.step}
        </span>
        {isDone ? (
          <button onClick={onDismiss} className="text-white/40 hover:text-white/80 text-xs">Dismiss</button>
        ) : (
          <span className="text-white/50 text-xs">{progress.percent}%</span>
        )}
      </div>

      {/* Progress bar */}
      {!isDone && (
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-purple-400 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}

      {/* Done state: show output actions */}
      {isDone && outputPath && (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-white/40 text-[10px] truncate flex-1" title={outputPath}>
            {outputPath.replace(/\\/g, '/').split('/').slice(-2).join('/')}
          </span>
          <button
            onClick={handleOpenFile}
            className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 text-white/70 text-[10px] transition-colors shrink-0"
          >
            Open
          </button>
          <button
            onClick={handleCopyPath}
            className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 text-white/70 text-[10px] transition-colors shrink-0"
          >
            {copied ? 'Copied!' : 'Copy path'}
          </button>
        </div>
      )}
    </div>
  )
}
