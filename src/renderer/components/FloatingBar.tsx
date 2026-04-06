import { useState, useCallback, useEffect } from 'react'
import { StatusIndicator } from './StatusIndicator'
import { Timer } from './Timer'
import { ControlButton } from './ControlButton'
import { SettingsPanel } from './SettingsPanel'
import { ProcessingStatus } from './ProcessingStatus'
import { MeetingsHistory } from './MeetingsHistory'
import { AudioWaveform } from './AudioWaveform'
import { useRecording } from '../hooks/useRecording'
import { useConfig } from '../hooks/useConfig'

type MeetingFormat = 'auto' | 'sales' | 'standup' | 'team' | 'one_on_one' | 'brainstorm' | 'soap' | 'interview'

const FORMAT_OPTIONS: { value: MeetingFormat; label: string; short: string }[] = [
  { value: 'auto', label: 'Auto', short: 'Auto' },
  { value: 'sales', label: 'Sales Call', short: 'Sales' },
  { value: 'standup', label: 'Stand-up', short: 'Standup' },
  { value: 'team', label: 'Team Meeting', short: 'Team' },
  { value: 'one_on_one', label: '1on1', short: '1on1' },
  { value: 'brainstorm', label: 'Brainstorm', short: 'Brain' },
  { value: 'soap', label: 'Medical (SOAP)', short: 'SOAP' },
  { value: 'interview', label: 'Interview', short: 'Intv' }
]

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

function HistoryIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 4v3.5l2.5 1.5" />
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
  const [showHistory, setShowHistory] = useState(false)
  const [showFormatPicker, setShowFormatPicker] = useState(false)
  const [meetingFormat, setMeetingFormat] = useState<MeetingFormat>('auto')
  const [setupWarning, setSetupWarning] = useState<string | null>(null)
  const [depsReady, setDepsReady] = useState<boolean | null>(null)
  const [meetingDetected, setMeetingDetected] = useState<{ platform: string } | null>(null)
  const [consentShown, setConsentShown] = useState(false)

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
        if (!config.transcription.api?.apiKey) issues.push('OpenAI API key not set')
      } else if (config.transcription.mode === 'remote') {
        if (!config.transcription.remote?.host) issues.push('Remote host not configured')
      }

      // Summary check
      if (config.summary.mode === 'cli') {
        const cliOk = await window.electronAPI.checkClaudeCli().catch(() => false)
        if (!cliOk) issues.push('Claude Code CLI not installed')
      } else if (config.summary.mode === 'anthropic') {
        if (!config.summary.anthropic?.apiKey) issues.push('Anthropic API key not set')
      } else if (config.summary.mode === 'openai') {
        if (!config.summary.openai?.apiKey) issues.push('OpenAI API key not set')
      } else if (config.summary.mode === 'gemini') {
        if (!config.summary.gemini?.apiKey) issues.push('Gemini API key not set')
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

  // Listen for meeting detection events
  useEffect(() => {
    const cleanupDetected = window.electronAPI.onMeetingDetected((meeting) => {
      setMeetingDetected(meeting)
    })
    const cleanupEnded = window.electronAPI.onMeetingEnded(() => {
      setMeetingDetected(null)
    })
    return () => {
      cleanupDetected()
      cleanupEnded()
    }
  }, [])

  // Close panels on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (showSettings) setShowSettings(false)
        else if (showHistory) setShowHistory(false)
        else if (showFormatPicker) setShowFormatPicker(false)
        else if (consentShown) setConsentShown(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSettings, showHistory, showFormatPicker, consentShown])

  // Sync meeting format from config
  useEffect(() => {
    if (config.summary?.meetingFormat) {
      setMeetingFormat(config.summary.meetingFormat as MeetingFormat)
    }
  }, [config.summary?.meetingFormat])

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
        // Show consent notification if enabled and not yet shown
        if (config.consent?.enabled && !consentShown) {
          setConsentShown(true)
          // Consent will be shown in expanded panel, recording starts after acknowledgment
          return
        }
        start({
          micDevice: config.recording.micDevice,
          meetingFormat,
        })
        setConsentShown(false)
        setMeetingDetected(null)
        break
      case 'recording':
        pause()
        break
      case 'paused':
        resume()
        break
    }
  }, [status, start, pause, resume, depsReady, meetingFormat, config.consent?.enabled, config.recording.micDevice, consentShown])

  const handleConsentAccept = useCallback((): void => {
    start({
      micDevice: config.recording.micDevice,
      meetingFormat,
    })
    setConsentShown(false)
    setMeetingDetected(null)
  }, [start, config.recording.micDevice, meetingFormat])

  const handleConsentDismiss = useCallback((): void => {
    setConsentShown(false)
  }, [])

  const handleMinimize = useCallback((): void => {
    window.electronAPI.minimizeWindow()
  }, [])

  const handleClose = useCallback((): void => {
    window.electronAPI.closeWindow()
  }, [])

  // Determine window mode
  const showExpandedPanel = status === 'processing' || status === 'done' || status === 'error'
  const showConsentPanel = consentShown && !showSettings && !showHistory
  const showMeetingAlert = meetingDetected && status === 'idle' && !showSettings && !showHistory && !showExpandedPanel && !consentShown
  const showWarningBar = setupWarning !== null && !showSettings && !showHistory && !showExpandedPanel && !showConsentPanel && !showMeetingAlert && status === 'idle'
  const showFormatBar = showFormatPicker && !showSettings && !showHistory && !showExpandedPanel && !showConsentPanel && status === 'idle'

  useEffect(() => {
    if (showSettings) {
      window.electronAPI.setWindowMode('settings')
    } else if (showHistory) {
      window.electronAPI.setWindowMode('history')
    } else if (showExpandedPanel || showWarningBar || showConsentPanel || showMeetingAlert || showFormatBar) {
      window.electronAPI.setWindowMode('expanded')
    } else {
      window.electronAPI.setWindowMode('bar')
    }
  }, [showSettings, showHistory, showExpandedPanel, showWarningBar, showConsentPanel, showMeetingAlert, showFormatBar])

  const canStop = status === 'recording' || status === 'paused'
  const isProcessing = status === 'processing'
  const isActive = status === 'recording' || status === 'paused'

  const primaryLabel = status === 'recording' ? 'Pause' : status === 'paused' ? 'Resume' : 'Record'
  const selectedFormat = FORMAT_OPTIONS.find(f => f.value === meetingFormat)

  return (
    <div className="w-full p-1">
      <div className="drag-region glass-bar rounded-2xl px-3 py-2.5 flex items-center gap-3">
        {/* Secure Mode indicator */}
        {config.secureMode && (
          <span className="text-green-400 text-[10px]" title="Secure Mode: all processing is local">🔒</span>
        )}
        {/* Status */}
        <StatusIndicator status={status} />

        {/* Timer — only when active */}
        {isActive && <Timer seconds={seconds} />}

        {/* Waveform — only when recording */}
        {isActive && (
          <div className="w-16 no-drag">
            <AudioWaveform isActive={isActive} isPaused={status === 'paused'} barCount={12} height={20} />
          </div>
        )}

        {/* Meeting format badge — when idle or active */}
        {!isProcessing && (
          <button
            onClick={() => !isActive && setShowFormatPicker(!showFormatPicker)}
            className={`no-drag px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              isActive ? 'bg-white/5 text-white/30 cursor-default' : 'bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/70 cursor-pointer'
            }`}
            disabled={isActive}
            title="Meeting format"
          >
            {selectedFormat?.short || 'Auto'}
          </button>
        )}

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

        {/* History */}
        <ControlButton
          onClick={() => { setShowHistory(!showHistory); setShowSettings(false); setShowFormatPicker(false) }}
          title="Meetings"
          disabled={isProcessing}
        >
          <HistoryIcon />
        </ControlButton>

        {/* Settings */}
        <ControlButton
          onClick={() => { setShowSettings(!showSettings); setShowHistory(false); setShowFormatPicker(false) }}
          title="Settings"
          disabled={isProcessing}
        >
          <SettingsIcon />
        </ControlButton>

        {/* Divider */}
        <div className="w-px h-4 bg-white/10" />

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

      {/* Meeting format picker */}
      {showFormatBar && (
        <div className="solid-panel rounded-2xl px-3 py-2.5 mt-1 no-drag">
          <div className="text-white/30 text-[9px] uppercase tracking-wider mb-2">Meeting Format</div>
          <div className="grid grid-cols-3 gap-1">
            {FORMAT_OPTIONS.map(f => (
              <button
                key={f.value}
                onClick={() => { setMeetingFormat(f.value); setShowFormatPicker(false) }}
                className={`px-2 py-1.5 rounded-lg text-[11px] transition-all ${
                  meetingFormat === f.value
                    ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
                    : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.06] text-white/60'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Meeting detected alert */}
      {showMeetingAlert && (
        <div className="solid-panel rounded-2xl px-4 py-3 mt-1 no-drag">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-blue-400 text-xs shrink-0">&#9679;</span>
            <span className="text-white/70 text-xs">
              {meetingDetected.platform === 'zoom' ? 'Zoom' :
               meetingDetected.platform === 'google_meet' ? 'Google Meet' :
               meetingDetected.platform === 'teams' ? 'Teams' : 'Meeting'} detected
            </span>
          </div>
          <button
            onClick={handlePrimaryAction}
            className="w-full py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 text-xs font-medium transition-colors border border-blue-500/20"
          >
            Start Recording
          </button>
        </div>
      )}

      {/* Consent notification */}
      {showConsentPanel && (
        <div className="solid-panel rounded-2xl px-4 py-3 mt-1 no-drag space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-xs shrink-0">&#9888;</span>
            <span className="text-white/70 text-xs font-medium">Recording Consent</span>
          </div>
          <p className="text-white/50 text-[11px] leading-relaxed">
            {config.consent?.message || 'This meeting is being recorded and transcribed by AI.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConsentDismiss}
              className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConsentAccept}
              className="flex-1 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 text-xs font-medium transition-colors border border-blue-500/20"
            >
              Start Recording
            </button>
          </div>
        </div>
      )}

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
      {showExpandedPanel && !showSettings && !showHistory && (
        <ProcessingStatus outputPath={outputPath} error={error} onDismiss={dismiss} />
      )}

      {/* Settings Panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Meetings History */}
      {showHistory && <MeetingsHistory onClose={() => setShowHistory(false)} />}
    </div>
  )
}
