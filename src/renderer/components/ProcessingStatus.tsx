import { useState, useEffect } from 'react'

interface Progress {
  step: string
  percent: number
}

const STEPS = [
  { key: 'transcribing', label: 'Transcribing', icon: '🎙', activeLabel: 'Converting speech to text...' },
  { key: 'summarizing', label: 'Summarizing', icon: '🤖', activeLabel: 'AI is analyzing your meeting...' },
  { key: 'saving', label: 'Saving', icon: '💾', activeLabel: 'Saving meeting notes...' },
  { key: 'publishing', label: 'Publishing', icon: '📤', activeLabel: 'Publishing to integrations...' },
  { key: 'done', label: 'Complete', icon: '✅', activeLabel: 'Meeting notes ready!' }
]

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
  const currentStepIndex = STEPS.findIndex(s => s.key === progress?.step)
  const currentStep = STEPS[currentStepIndex] || STEPS[0]

  // Show error state
  if (error) {
    return (
      <div className="solid-panel rounded-2xl px-4 py-3 mt-1 no-drag">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">&#10060;</span>
            <span className="text-red-400 text-xs font-medium">Error</span>
          </div>
          <button onClick={onDismiss} className="text-white/40 hover:text-white/80 text-xs transition-colors">Dismiss</button>
        </div>
        <p className="text-white/60 text-xs leading-relaxed">{error}</p>
      </div>
    )
  }

  // Show skeleton when processing starts but no progress yet
  if (!progress) {
    return (
      <div className="solid-panel rounded-2xl px-4 py-3 mt-1 no-drag">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm animate-pulse">&#9679;</span>
          <span className="text-white/60 text-xs">Preparing...</span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full w-1/4 bg-gradient-to-r from-blue-400/30 to-purple-400/30 rounded-full animate-shimmer" />
        </div>
      </div>
    )
  }

  return (
    <div className="solid-panel rounded-2xl px-4 py-3 mt-1 no-drag">
      {/* Step progress indicators */}
      <div className="flex items-center gap-1 mb-3">
        {STEPS.map((step, i) => {
          const isComplete = i < currentStepIndex
          const isCurrent = i === currentStepIndex

          return (
            <div key={step.key} className="flex items-center flex-1">
              {/* Step dot/icon */}
              <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] transition-all duration-500 ${
                isComplete ? 'bg-green-500/20 scale-90' :
                isCurrent ? 'bg-blue-500/20 scale-110' :
                'bg-white/5 scale-90'
              }`}>
                {isComplete ? (
                  <span className="text-green-400 text-[9px]">&#10003;</span>
                ) : isCurrent ? (
                  <span className={step.key === 'done' ? '' : 'animate-pulse'}>{step.icon}</span>
                ) : (
                  <span className="opacity-30">{step.icon}</span>
                )}
              </div>

              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-0.5 transition-colors duration-500 ${
                  isComplete ? 'bg-green-500/30' :
                  isCurrent ? 'bg-blue-500/20' :
                  'bg-white/5'
                }`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Current step label */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs ${isDone ? 'text-green-400 font-medium' : 'text-white/70'}`}>
          {currentStep.activeLabel}
        </span>
        {isDone ? (
          <button onClick={onDismiss} className="text-white/40 hover:text-white/80 text-xs transition-colors">Dismiss</button>
        ) : (
          <span className="text-white/30 text-[10px] tabular-nums">{progress.percent}%</span>
        )}
      </div>

      {/* Progress bar */}
      {!isDone && (
        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progress.percent}%`,
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s linear infinite'
            }}
          />
        </div>
      )}

      {/* Done state: show output actions */}
      {isDone && outputPath && (
        <div className="flex items-center gap-2 pt-1 border-t border-white/5 mt-2">
          <span className="text-white/30 text-[10px] truncate flex-1" title={outputPath}>
            {outputPath.replace(/\\/g, '/').split('/').pop()}
          </span>
          <button
            onClick={handleOpenFile}
            className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-[10px] font-medium transition-colors border border-blue-500/10"
          >
            Open
          </button>
          <button
            onClick={handleCopyPath}
            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-[10px] transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  )
}
