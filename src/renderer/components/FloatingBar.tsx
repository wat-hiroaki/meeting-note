import { useState, useCallback, useEffect } from 'react'
import { StatusIndicator } from './StatusIndicator'
import { Timer } from './Timer'
import { ControlButton } from './ControlButton'
import { SettingsPanel } from './SettingsPanel'
import { ProcessingStatus } from './ProcessingStatus'
import { useRecording } from '../hooks/useRecording'
import { useConfig } from '../hooks/useConfig'

// SVG icons as inline components
function RecordIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <circle cx="7" cy="7" r="5" />
    </svg>
  )
}

function PauseIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="3" y="2" width="3" height="10" rx="1" />
      <rect x="8" y="2" width="3" height="10" rx="1" />
    </svg>
  )
}

function ResumeIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <polygon points="3,1 13,7 3,13" />
    </svg>
  )
}

function StopIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <rect x="2" y="2" width="10" height="10" rx="2" />
    </svg>
  )
}

function SettingsIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="2.5" />
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.8 2.8l1.1 1.1M10.1 10.1l1.1 1.1M2.8 11.2l1.1-1.1M10.1 3.9l1.1-1.1" />
    </svg>
  )
}

function MinimizeIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="2" y1="6" x2="10" y2="6" />
    </svg>
  )
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="2" y1="2" x2="10" y2="10" />
      <line x1="10" y1="2" x2="2" y2="10" />
    </svg>
  )
}

export function FloatingBar(): React.JSX.Element {
  const { status, seconds, error, outputPath, start, pause, resume, stop, dismiss } = useRecording()
  const { config } = useConfig()
  const [showSettings, setShowSettings] = useState(false)
  const [setupWarning, setSetupWarning] = useState<string | null>(null)
  const [depsReady, setDepsReady] = useState<boolean | null>(null)

  // Check if transcription & summary deps are configured
  useEffect(() => {
    const checkDeps = async (): Promise<void> => {
      const issues: string[] = []

      // Transcription check
      if (config.transcription.mode === 'local') {
        const pyOk = await window.electronAPI.checkPython().catch(() => false)
        const whisperOk = await window.electronAPI.checkFasterWhisper().catch(() => false)
        if (!pyOk) issues.push('Python not installed')
        else if (!whisperOk) issues.push('faster-whisper not installed (pip install faster-whisper)')
      } else if (config.transcription.mode === 'api') {
        if (!config.transcription.apiKey) issues.push('OpenAI API key not set')
      } else if (config.transcription.mode === 'remote') {
        if (!config.transcription.remote.host) issues.push('Remote host not configured')
      }

      // Summary check
      if (config.summary.mode === 'api') {
        if (!config.summary.apiKey) issues.push('Anthropic API key not set')
      }

      if (issues.length > 0) {
        setSetupWarning(issues.join('. ') + '. Open Settings to configure.')
        setDepsReady(false)
      } else {
        setSetupWarning(null)
        setDepsReady(true)
      }
    }
    checkDeps()
  }, [config])

  const handlePrimaryAction = useCallback((): void => {
    // Block recording if deps not ready
    if ((status === 'idle' || status === 'done' || status === 'error') && depsReady === false) {
      setShowSettings(true)
      return
    }

    switch (status) {
      case 'idle':
      case 'done':
      case 'error':
        start()
        break
      case 'recording':
        pause()
        break
      case 'paused':
        resume()
        break
    }
  }, [status, start, pause, resume, depsReady])

  const handleMinimize = useCallback((): void => {
    window.electronAPI.minimizeWindow()
  }, [])

  const handleClose = useCallback((): void => {
    window.electronAPI.closeWindow()
  }, [])

  // Determine window mode
  const showExpandedPanel = status === 'processing' || status === 'done' || status === 'error'
  const showWarningBar = setupWarning !== null && !showSettings && !showExpandedPanel && status === 'idle'

  useEffect(() => {
    if (showSettings) {
      window.electronAPI.setWindowMode('settings')
    } else if (showExpandedPanel || showWarningBar) {
      window.electronAPI.setWindowMode('expanded')
    } else {
      window.electronAPI.setWindowMode('bar')
    }
  }, [showSettings, showExpandedPanel, showWarningBar])

  const canStop = status === 'recording' || status === 'paused'
  const isProcessing = status === 'processing'
  const isActive = status === 'recording' || status === 'paused'

  const primaryLabel = status === 'recording' ? 'Pause' : status === 'paused' ? 'Resume' : 'Record'

  return (
    <div className="w-full p-1">
      <div className="drag-region glass-bar rounded-2xl px-3 py-2.5 flex items-center gap-3">
        {/* Status */}
        <StatusIndicator status={status} />

        {/* Timer — only when active */}
        {isActive && <Timer seconds={seconds} />}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Recording controls */}
        <div className="flex items-center gap-1">
          {/* Primary action: Record / Pause / Resume */}
          <ControlButton
            onClick={handlePrimaryAction}
            title={primaryLabel}
            disabled={isProcessing}
            variant={status === 'idle' || status === 'done' || status === 'error' ? 'danger' : 'default'}
          >
            {status === 'recording' ? <PauseIcon /> : status === 'paused' ? <ResumeIcon /> : <RecordIcon />}
          </ControlButton>

          {/* Stop — only shown when recording/paused */}
          {canStop && (
            <ControlButton onClick={stop} title="Stop & Process">
              <StopIcon />
            </ControlButton>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-white/10" />

        {/* Settings */}
        <ControlButton
          onClick={() => setShowSettings(!showSettings)}
          title="Settings"
          disabled={isProcessing}
        >
          <SettingsIcon />
        </ControlButton>

        {/* Divider */}
        <div className="w-px h-4 bg-white/[0.06]" />

        {/* Window controls */}
        <div className="flex items-center gap-0.5">
          <ControlButton onClick={handleMinimize} title="Minimize">
            <MinimizeIcon />
          </ControlButton>
          <ControlButton onClick={handleClose} title="Close">
            <CloseIcon />
          </ControlButton>
        </div>
      </div>

      {/* Setup warning */}
      {showWarningBar && (
        <div
          className="solid-panel rounded-2xl px-4 py-3 mt-1 no-drag cursor-pointer hover:border-yellow-500/30 transition-colors"
          onClick={() => setShowSettings(true)}
        >
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-xs shrink-0">&#9888;</span>
            <span className="text-white/60 text-xs">{setupWarning}</span>
          </div>
        </div>
      )}

      {/* Processing / Done / Error panel */}
      {showExpandedPanel && !showSettings && (
        <ProcessingStatus outputPath={outputPath} error={error} onDismiss={dismiss} />
      )}

      {/* Settings Panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}
