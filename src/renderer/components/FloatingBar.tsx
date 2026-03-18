import { useState, useCallback, useEffect } from 'react'
import { StatusIndicator } from './StatusIndicator'
import { Timer } from './Timer'
import { ControlButton } from './ControlButton'
import { SettingsPanel } from './SettingsPanel'
import { ProcessingStatus } from './ProcessingStatus'
import { useRecording } from '../hooks/useRecording'

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
  const [showSettings, setShowSettings] = useState(false)

  const handlePrimaryAction = useCallback((): void => {
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
  }, [status, start, pause, resume])

  const handleMinimize = useCallback((): void => {
    window.electronAPI.minimizeWindow()
  }, [])

  const handleClose = useCallback((): void => {
    window.electronAPI.closeWindow()
  }, [])

  // Determine window mode
  const showExpandedPanel = status === 'processing' || status === 'done' || status === 'error'

  useEffect(() => {
    if (showSettings) {
      window.electronAPI.setWindowMode('settings')
    } else if (showExpandedPanel) {
      window.electronAPI.setWindowMode('expanded')
    } else {
      window.electronAPI.setWindowMode('bar')
    }
  }, [showSettings, showExpandedPanel])

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

      {/* Processing / Done / Error panel */}
      {showExpandedPanel && !showSettings && (
        <ProcessingStatus outputPath={outputPath} error={error} onDismiss={dismiss} />
      )}

      {/* Settings Panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}
