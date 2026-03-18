import { useState, useCallback, useEffect } from 'react'
import { useConfig } from '../hooks/useConfig'

interface SettingsPanelProps {
  onClose: () => void
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-white/60 text-xs shrink-0">{label}</label>
      <div className="flex-1 max-w-[180px]">{children}</div>
    </div>
  )
}

function Input({ value, onChange, type = 'text', placeholder }: {
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}): React.JSX.Element {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="no-drag w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-white/90 text-xs outline-none focus:border-white/25 transition-colors"
    />
  )
}

function Select({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}): React.JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="no-drag w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-white/90 text-xs outline-none focus:border-white/25 transition-colors"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Toggle({ checked, onChange, label }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <label className="no-drag flex items-center gap-2 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-white/15'} relative`}
      >
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-white/60 text-xs">{label}</span>
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="space-y-2">
      <span className="text-white/50 text-[10px] uppercase tracking-wider">{title}</span>
      {children}
    </div>
  )
}

const isMac = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin'
const mod = isMac ? 'Cmd' : 'Ctrl'

export function SettingsPanel({ onClose }: SettingsPanelProps): React.JSX.Element {
  const { config, updateConfig, loading } = useConfig()
  const [saved, setSaved] = useState(false)
  const [audioDevices, setAudioDevices] = useState<string[]>([])

  useEffect(() => {
    window.electronAPI.getAudioDevices().then(setAudioDevices).catch(() => setAudioDevices([]))
  }, [])

  const handleUpdate = useCallback((updates: Parameters<typeof updateConfig>[0]): void => {
    updateConfig(updates)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [updateConfig])

  if (loading) {
    return (
      <div className="rounded-2xl p-4 mt-1 solid-panel">
        <span className="text-white/50 text-xs">Loading...</span>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-4 mt-1 space-y-3 max-h-[400px] overflow-y-auto no-drag solid-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white/90 text-sm font-medium">Settings</span>
          {saved && (
            <span className="text-green-400 text-[10px] animate-pulse">Saved</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
          title="Close settings"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>

      {/* Recording */}
      <Section title="Recording">
        <SettingRow label="Microphone">
          <Select
            value={config.recording.micDevice}
            onChange={(v) => handleUpdate({ recording: { ...config.recording, micDevice: v } })}
            options={[
              { value: 'default', label: 'Auto-detect' },
              ...audioDevices.map(d => ({ value: d, label: d })),
              { value: 'none', label: 'None (disabled)' }
            ]}
          />
        </SettingRow>
        <SettingRow label="System Audio">
          <Select
            value={config.recording.systemDevice}
            onChange={(v) => handleUpdate({ recording: { ...config.recording, systemDevice: v } })}
            options={[
              { value: 'none', label: 'None (mic only)' },
              ...audioDevices.map(d => ({ value: d, label: d })),
            ]}
          />
        </SettingRow>
        {config.recording.systemDevice === 'none' && (
          <div className="rounded-lg px-3 py-2 bg-yellow-500/5 text-yellow-400/70 text-[10px] leading-relaxed">
            {isMac
              ? 'To capture system audio on macOS, install BlackHole (brew install blackhole-2ch) and select it as System Audio.'
              : 'To capture system audio, enable "Stereo Mix" in Windows Sound settings, or install VB-Cable and select it as System Audio.'}
          </div>
        )}
      </Section>

      {/* Transcription */}
      <Section title="Transcription">
        <SettingRow label="Mode">
          <Select
            value={config.transcription.mode}
            onChange={(v) => handleUpdate({ transcription: { ...config.transcription, mode: v } })}
            options={[
              { value: 'local', label: 'Local (faster-whisper)' },
              { value: 'api', label: 'OpenAI Whisper API' },
              { value: 'remote', label: 'Remote (SSH)' }
            ]}
          />
        </SettingRow>
        {config.transcription.mode === 'api' && (
          <SettingRow label="OpenAI Key">
            <Input
              value={config.transcription.api?.apiKey || ''}
              onChange={(v) => handleUpdate({ transcription: { ...config.transcription, api: { ...config.transcription.api, apiKey: v } } })}
              type="password"
              placeholder="sk-..."
            />
          </SettingRow>
        )}
        {config.transcription.mode === 'remote' && (
          <div className="pl-4 space-y-2">
            <SettingRow label="Host">
              <Input
                value={config.transcription.remote?.host || ''}
                onChange={(v) => handleUpdate({ transcription: { ...config.transcription, remote: { ...config.transcription.remote, host: v } } })}
              />
            </SettingRow>
            <SettingRow label="User">
              <Input
                value={config.transcription.remote?.user || ''}
                onChange={(v) => handleUpdate({ transcription: { ...config.transcription, remote: { ...config.transcription.remote, user: v } } })}
              />
            </SettingRow>
            <SettingRow label="Python Path">
              <Input
                value={config.transcription.remote?.pythonPath || 'python3'}
                onChange={(v) => handleUpdate({ transcription: { ...config.transcription, remote: { ...config.transcription.remote, pythonPath: v } } })}
                placeholder="python3"
              />
            </SettingRow>
            <SettingRow label="Script Path">
              <Input
                value={config.transcription.remote?.scriptPath || '~/transcribe.py'}
                onChange={(v) => handleUpdate({ transcription: { ...config.transcription, remote: { ...config.transcription.remote, scriptPath: v } } })}
                placeholder="~/transcribe.py"
              />
            </SettingRow>
          </div>
        )}
        <SettingRow label="Language">
          <Select
            value={config.transcription.language}
            onChange={(v) => handleUpdate({ transcription: { ...config.transcription, language: v } })}
            options={[{ value: 'ja', label: 'Japanese' }, { value: 'en', label: 'English' }, { value: 'auto', label: 'Auto' }]}
          />
        </SettingRow>
        <SettingRow label="Model">
          <Select
            value={config.transcription.model}
            onChange={(v) => handleUpdate({ transcription: { ...config.transcription, model: v } })}
            options={config.transcription.mode === 'api'
              ? [{ value: 'whisper-1', label: 'whisper-1' }]
              : [
                  { value: 'large-v3', label: 'large-v3 (~3 GB)' },
                  { value: 'medium', label: 'medium (~1.5 GB)' },
                  { value: 'small', label: 'small (~500 MB)' },
                  { value: 'base', label: 'base (~150 MB)' }
                ]
            }
          />
        </SettingRow>
      </Section>

      {/* Summary */}
      <Section title="Summary">
        <SettingRow label="Mode">
          <Select
            value={config.summary.mode}
            onChange={(v) => handleUpdate({ summary: { ...config.summary, mode: v } })}
            options={[{ value: 'cli', label: 'Claude CLI (Free)' }, { value: 'api', label: 'Anthropic API (BYOK)' }]}
          />
        </SettingRow>
        {config.summary.mode === 'api' && (
          <SettingRow label="Anthropic Key">
            <Input
              value={config.summary.api?.apiKey || ''}
              onChange={(v) => handleUpdate({ summary: { ...config.summary, api: { ...config.summary.api, apiKey: v } } })}
              type="password"
              placeholder="sk-ant-..."
            />
          </SettingRow>
        )}
      </Section>

      {/* Output */}
      <Section title="Output">
        <SettingRow label="Directory">
          <Input
            value={config.output.directory}
            onChange={(v) => handleUpdate({ output: { ...config.output, directory: v } })}
            placeholder="./meetings"
          />
        </SettingRow>
      </Section>

      {/* Integrations */}
      <Section title="Integrations">
        <Toggle
          checked={config.notion.enabled}
          onChange={(v) => handleUpdate({ notion: { ...config.notion, enabled: v } })}
          label="Notion"
        />
        {config.notion.enabled && (
          <div className="pl-4 space-y-2">
            <SettingRow label="API Key">
              <Input
                value={config.notion.apiKey}
                onChange={(v) => handleUpdate({ notion: { ...config.notion, apiKey: v } })}
                type="password"
                placeholder="ntn_..."
              />
            </SettingRow>
            <SettingRow label="DB ID">
              <Input
                value={config.notion.databaseId}
                onChange={(v) => handleUpdate({ notion: { ...config.notion, databaseId: v } })}
              />
            </SettingRow>
          </div>
        )}

        <Toggle
          checked={config.slack.enabled}
          onChange={(v) => handleUpdate({ slack: { ...config.slack, enabled: v } })}
          label="Slack"
        />
        {config.slack.enabled && (
          <div className="pl-4 space-y-2">
            <SettingRow label="Token">
              <Input
                value={config.slack.token}
                onChange={(v) => handleUpdate({ slack: { ...config.slack, token: v } })}
                type="password"
                placeholder="xoxb-..."
              />
            </SettingRow>
            <SettingRow label="Channel">
              <Input
                value={config.slack.channel}
                onChange={(v) => handleUpdate({ slack: { ...config.slack, channel: v } })}
                placeholder="#meeting-notes"
              />
            </SettingRow>
          </div>
        )}

        <Toggle
          checked={config.remote.enabled}
          onChange={(v) => handleUpdate({ remote: { ...config.remote, enabled: v } })}
          label="Remote (SCP)"
        />
        {config.remote.enabled && (
          <div className="pl-4 space-y-2">
            <SettingRow label="Host">
              <Input
                value={config.remote.host}
                onChange={(v) => handleUpdate({ remote: { ...config.remote, host: v } })}
              />
            </SettingRow>
            <SettingRow label="User">
              <Input
                value={config.remote.user}
                onChange={(v) => handleUpdate({ remote: { ...config.remote, user: v } })}
              />
            </SettingRow>
            <SettingRow label="Path">
              <Input
                value={config.remote.path}
                onChange={(v) => handleUpdate({ remote: { ...config.remote, path: v } })}
                placeholder="~/meetings"
              />
            </SettingRow>
          </div>
        )}
      </Section>

      {/* Hotkeys */}
      <Section title="Hotkeys">
        <div className="space-y-1">
          {[
            [`${mod}+Shift+R`, 'Record'],
            [`${mod}+Shift+P`, 'Pause / Resume'],
            [`${mod}+Shift+S`, 'Stop'],
            [`${mod}+Shift+M`, 'Show / Hide']
          ].map(([key, action]) => (
            <div key={key} className="flex items-center justify-between py-0.5">
              <span className="text-white/40 text-[10px]">{action}</span>
              <div className="flex gap-0.5">
                {key.split('+').map(k => (
                  <kbd key={k} className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50 text-[10px] font-mono border border-white/[0.06]">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
