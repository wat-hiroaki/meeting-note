import { useState, useCallback } from 'react'
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

function TextArea({ value, onChange, placeholder, rows = 3 }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}): React.JSX.Element {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="no-drag w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/90 text-xs outline-none focus:border-white/25 transition-colors resize-none"
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
        className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-white/15'} relative cursor-pointer`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
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
  const { config, editConfig, saveConfig, dirty, loading } = useConfig()
  const [saved, setSaved] = useState(false)

  const handleUpdate = useCallback((updates: Parameters<typeof editConfig>[0]): void => {
    editConfig(updates)
    setSaved(false)
  }, [editConfig])

  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async (): Promise<void> => {
    setSaving(true)
    try {
      await saveConfig()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('[Settings] Save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [saveConfig])

  const handleClose = useCallback((): void => {
    if (dirty) {
      // Auto-save on close to prevent lost changes
      saveConfig().catch(() => { /* ignore */ })
    }
    onClose()
  }, [dirty, saveConfig, onClose])

  if (loading) {
    return (
      <div className="rounded-2xl p-4 mt-1 solid-panel">
        <span className="text-white/50 text-xs">Loading...</span>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-4 mt-1 space-y-3 max-h-[500px] overflow-y-auto no-drag solid-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-white/90 text-sm font-medium">Settings</span>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-green-400 text-[10px]">Saved!</span>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              dirty && !saving
                ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/20'
                : 'bg-white/5 text-white/30 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
            title="Close settings"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        </div>
      </div>

      {/* Secure Mode */}
      <Section title="🔒 Secure Mode">
        <Toggle
          checked={config.secureMode || false}
          onChange={(v) => {
            const updates: Record<string, unknown> = { secureMode: v }
            if (v) {
              // Auto-switch to local-only settings
              const safeTranscription = { ...config.transcription }
              if (safeTranscription.mode === 'api') safeTranscription.mode = 'local'
              const safeSummary = { ...config.summary }
              if (['anthropic', 'openai', 'gemini'].includes(safeSummary.mode)) {
                safeSummary.mode = 'ollama'
              }
              updates.transcription = safeTranscription
              updates.summary = safeSummary
            }
            handleUpdate(updates)
          }}
          label="Local-only processing"
        />
        {config.secureMode && (
          <div className="rounded-lg px-3 py-2 bg-green-500/5 text-green-400/70 text-[10px] leading-relaxed">
            All data stays on this device. Cloud APIs (transcription, summary, Notion, Slack) are blocked. Transcription uses local Whisper, summary uses Ollama.
            {config.summary.mode === 'cli' && (
              <div className="mt-1 text-yellow-400/70">
                ⚠ Claude CLI sends data to Anthropic servers. For fully local processing, switch summary mode to Ollama.
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Recording */}
      <Section title="Recording">
        <div className="rounded-lg px-3 py-2 bg-green-500/5 text-green-400/70 text-[10px] leading-relaxed">
          System audio is captured automatically via WASAPI loopback.
        </div>
        <SettingRow label="Microphone">
          <Select
            value={config.recording.micDevice}
            onChange={(v) => handleUpdate({ recording: { ...config.recording, micDevice: v } })}
            options={[
              { value: 'default', label: 'Auto-detect' },
              { value: 'none', label: 'None (system audio only)' }
            ]}
          />
        </SettingRow>
      </Section>

      {/* Meeting Format */}
      <Section title="Meeting Format">
        <SettingRow label="Default">
          <Select
            value={config.summary.meetingFormat}
            onChange={(v) => handleUpdate({ summary: { ...config.summary, meetingFormat: v } })}
            options={[
              { value: 'auto', label: 'Auto-detect' },
              { value: 'sales', label: 'Sales Call' },
              { value: 'standup', label: 'Stand-up' },
              { value: 'team', label: 'Team Meeting' },
              { value: 'one_on_one', label: '1on1' },
              { value: 'brainstorm', label: 'Brainstorm' },
              { value: 'soap', label: 'Medical (SOAP)' },
              { value: 'interview', label: 'Interview / Consultation' }
            ]}
          />
        </SettingRow>
        {config.summary.meetingFormat === 'soap' && (
          <div className="rounded-lg px-3 py-2 bg-blue-500/5 text-white/40 text-[10px] leading-relaxed">
            SOAP format structures notes into Subjective (patient complaints), Objective (findings), Assessment (diagnosis), and Plan (treatment). Designed for medical consultations.
          </div>
        )}
        <div className="space-y-1">
          <label className="text-white/40 text-[10px]">Custom Instructions</label>
          <TextArea
            value={config.summary.customInstructions}
            onChange={(v) => handleUpdate({ summary: { ...config.summary, customInstructions: v } })}
            placeholder="Add custom instructions for how summaries should be formatted (e.g., team context, specific sections, tone)..."
          />
        </div>
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
            options={[
              { value: 'cli', label: 'Claude Code CLI (Free)' },
              { value: 'ollama', label: 'Ollama (Local)' },
              { value: 'anthropic', label: 'Anthropic API' },
              { value: 'openai', label: 'OpenAI API (Beta)' },
              { value: 'gemini', label: 'Gemini API (Beta)' }
            ]}
          />
        </SettingRow>
        {config.summary.mode === 'cli' && (
          <div className="rounded-lg px-3 py-2 bg-blue-500/5 text-white/50 text-[10px] leading-relaxed">
            Uses your Claude Code subscription (Max $20/mo or Pro $100/mo) — no API key needed. Run <code className="text-white/70">claude</code> in terminal to sign in.
          </div>
        )}
        {config.summary.mode === 'ollama' && (
          <div className="pl-4 space-y-2">
            <div className="rounded-lg px-3 py-2 bg-green-500/5 text-green-400/70 text-[10px] leading-relaxed">
              Fully local — no data leaves your machine. Install Ollama from ollama.com and pull a model (e.g. <code className="text-white/70">ollama pull qwen2.5:14b</code>).
            </div>
            <SettingRow label="Host">
              <Input
                value={config.summary.ollama?.host || 'http://localhost:11434'}
                onChange={(v) => handleUpdate({ summary: { ...config.summary, ollama: { ...config.summary.ollama, host: v } } })}
                placeholder="http://localhost:11434"
              />
            </SettingRow>
            <SettingRow label="Model">
              <Input
                value={config.summary.ollama?.model || 'qwen2.5:14b'}
                onChange={(v) => handleUpdate({ summary: { ...config.summary, ollama: { ...config.summary.ollama, model: v } } })}
                placeholder="qwen2.5:14b"
              />
            </SettingRow>
          </div>
        )}
        {config.summary.mode === 'anthropic' && (
          <SettingRow label="Anthropic Key">
            <Input
              value={config.summary.anthropic?.apiKey || ''}
              onChange={(v) => handleUpdate({ summary: { ...config.summary, anthropic: { ...config.summary.anthropic, apiKey: v } } })}
              type="password"
              placeholder="sk-ant-..."
            />
          </SettingRow>
        )}
        {config.summary.mode === 'openai' && (
          <SettingRow label="OpenAI Key">
            <Input
              value={config.summary.openai?.apiKey || ''}
              onChange={(v) => handleUpdate({ summary: { ...config.summary, openai: { ...config.summary.openai, apiKey: v } } })}
              type="password"
              placeholder="sk-..."
            />
          </SettingRow>
        )}
        {config.summary.mode === 'gemini' && (
          <SettingRow label="Gemini Key">
            <Input
              value={config.summary.gemini?.apiKey || ''}
              onChange={(v) => handleUpdate({ summary: { ...config.summary, gemini: { ...config.summary.gemini, apiKey: v } } })}
              type="password"
              placeholder="AIza..."
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

      {/* Meeting Detection */}
      <Section title="Meeting Detection">
        <Toggle
          checked={config.meetingDetection.enabled}
          onChange={(v) => handleUpdate({ meetingDetection: { ...config.meetingDetection, enabled: v } })}
          label="Auto-detect meetings"
        />
        {config.meetingDetection.enabled && (
          <div className="rounded-lg px-3 py-2 bg-blue-500/5 text-white/40 text-[10px] leading-relaxed">
            Automatically detects when Zoom, Google Meet, or Teams is running and prompts to start recording.
          </div>
        )}
      </Section>

      {/* Consent */}
      <Section title="Audio Consent">
        <Toggle
          checked={config.consent.enabled}
          onChange={(v) => handleUpdate({ consent: { ...config.consent, enabled: v } })}
          label="Show consent notification"
        />
        {config.consent.enabled && (
          <div className="space-y-1">
            <label className="text-white/40 text-[10px]">Consent message</label>
            <TextArea
              value={config.consent.message}
              onChange={(v) => handleUpdate({ consent: { ...config.consent, message: v } })}
              placeholder="This meeting is being recorded..."
              rows={2}
            />
          </div>
        )}
      </Section>

      {/* Calendar */}
      <Section title="Calendar">
        <Toggle
          checked={config.calendar.enabled}
          onChange={(v) => handleUpdate({ calendar: { ...config.calendar, enabled: v } })}
          label="Google Calendar"
        />
        {config.calendar.enabled && (
          <div className="pl-4 space-y-2">
            <p className="text-white/30 text-[10px] leading-relaxed">
              Create OAuth credentials at console.cloud.google.com, enable Calendar API, and add your credentials below.
            </p>
            <SettingRow label="Client ID">
              <Input
                value={config.calendar.google?.clientId || ''}
                onChange={(v) => handleUpdate({ calendar: { ...config.calendar, google: { ...config.calendar.google, clientId: v } } })}
                placeholder="...apps.googleusercontent.com"
              />
            </SettingRow>
            <SettingRow label="Client Secret">
              <Input
                value={config.calendar.google?.clientSecret || ''}
                onChange={(v) => handleUpdate({ calendar: { ...config.calendar, google: { ...config.calendar.google, clientSecret: v } } })}
                type="password"
              />
            </SettingRow>
            <SettingRow label="Refresh Token">
              <Input
                value={config.calendar.google?.refreshToken || ''}
                onChange={(v) => handleUpdate({ calendar: { ...config.calendar, google: { ...config.calendar.google, refreshToken: v } } })}
                type="password"
              />
            </SettingRow>
          </div>
        )}
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
            <p className="text-white/30 text-[10px] leading-relaxed">
              Create an integration at notion.so/my-integrations, copy the Internal Token, and share your database with the integration.
            </p>
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
                placeholder="Open DB → copy ID from URL"
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
            <p className="text-white/30 text-[10px] leading-relaxed">
              Create a Slack App at api.slack.com/apps, add chat:write scope, install to workspace, then copy the Bot Token.
            </p>
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
