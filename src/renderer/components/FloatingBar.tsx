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
      case 'error': {
        // Medical mode forces consent + SOAP format
        const needConsent = config.consent?.enabled ||
          (config.medical?.enabled && config.medical?.requireConsent)
        if (needConsent && !consentShown) {
          setConsentShown(true)
          return
        }
        start({
          micDevice: config.recording.micDevice,
          meetingFormat: config.medical?.enabled ? 'soap' : meetingFormat,
        })
        setConsentShown(false)
        setMeetingDetected(null)
        break
      }
      case 'recording':
        pause()
        break
      case 'paused':
        resume()
        break
    }
  }, [status, start, pause, resume, depsReady, meetingFormat, config.consent?.enabled, config.recording.micDevice, consentShown, config.medical?.enabled, config.medical?.requireConsent])

  const handleConsentAccept = useCallback((): void => {
    // Log consent to audit trail
    window.electronAPI.logConsent?.('consent_obtained', {
      meetingFormat: config.medical?.enabled ? 'soap' : meetingFormat,
      consentMessage: config.consent?.message,
    })
    start({
      micDevice: config.recording.micDevice,
      meetingFormat: config.medical?.enabled ? 'soap' : meetingFormat,
    })
    setConsentShown(false)
    setMeetingDetected(null)
  }, [start, config.recording.micDevice, meetingFormat, config.medical?.enabled, config.consent?.message])

  const handleConsentDismiss = useCallback((): void => {
    // Log consent decline to audit trail
    window.electronAPI.logConsent?.('consent_declined', {
      meetingFormat: config.medical?.enabled ? 'soap' : meetingFormat,
    })
    setConsentShown(false)
  }, [meetingFormat, config.medical?.enabled])

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
        {/* Medical Mode indicator */}
        {config.medical?.enabled && (
          <span className="text-blue-400 text-[10px]" title="Medical Mode: SOAP format + medical dictionary active">{'\u2695'}</span>
        )}
        {/* Secure Mode indicator */}
        {config.secureMode && (
          <span className="text-green-400 text-[10px]" title="Secure Mode: all processing is local">{'\uD83D\uDD12'}</span>
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
            <span className={`text-xs shrink-0 ${config.medical?.enabled ? 'text-red-400' : 'text-yellow-400'}`}>
              {config.medical?.enabled ? '\u2695' : '\u26A0'}
            </span>
            <span className="text-white/70 text-xs font-medium">
              {config.medical?.enabled ? '\u8A3A\u7642\u9332\u97F3\u306E\u540C\u610F\u78BA\u8A8D' : 'Recording Consent'}
            </span>
          </div>
          <p className="text-white/50 text-[11px] leading-relaxed">
            {config.consent?.message || (config.medical?.enabled
              ? '\u3053\u306E\u8A3A\u7642\u306F\u3001\u8A3A\u7642\u8A18\u9332\u4F5C\u6210\u306E\u305F\u3081\u306BAI\u306B\u3088\u308B\u9332\u97F3\u30FB\u6587\u5B57\u8D77\u3053\u3057\u3092\u884C\u3044\u307E\u3059\u3002\u97F3\u58F0\u30C7\u30FC\u30BF\u306F\u5916\u90E8\u306B\u9001\u4FE1\u3055\u308C\u305A\u3001\u3053\u306E\u7AEF\u672B\u5185\u3067\u306E\u307F\u51E6\u7406\u3055\u308C\u307E\u3059\u3002'
              : 'This meeting is being recorded and transcribed by AI.'
            )}
          </p>
          {config.medical?.enabled && config.secureMode && (
            <div className="rounded-lg px-2.5 py-1.5 bg-green-500/5 text-green-400/70 text-[10px] leading-relaxed">
              \u30BB\u30AD\u30E5\u30A2\u30E2\u30FC\u30C9ON: \u5168\u3066\u306E\u30C7\u30FC\u30BF\u306F\u30ED\u30FC\u30AB\u30EB\u3067\u51E6\u7406\u3055\u308C\u3001\u5916\u90E8\u9001\u4FE1\u3055\u308C\u307E\u305B\u3093
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleConsentDismiss}
              className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 text-xs transition-colors"
            >
              {config.medical?.enabled ? '\u30AD\u30E3\u30F3\u30BB\u30EB' : 'Cancel'}
            </button>
            <button
              onClick={handleConsentAccept}
              className="flex-1 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 text-xs font-medium transition-colors border border-blue-500/20"
            >
              {config.medical?.enabled ? '\u540C\u610F\u3057\u3066\u9332\u97F3\u958B\u59CB' : 'Start Recording'}
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
