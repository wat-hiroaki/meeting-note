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

export function SettingsPanel({ onClose }: SettingsPanelProps): React.JSX.Element {
  const { config, updateConfig, loading } = useConfig()

  if (loading) {
    return (
      <div className="glass-bar rounded-2xl p-4 mt-1">
        <span className="text-white/50 text-xs">Loading...</span>
      </div>
    )
  }

  return (
    <div className="glass-bar rounded-2xl p-4 mt-1 space-y-3 max-h-[400px] overflow-y-auto no-drag">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-white/90 text-sm font-medium">Settings</span>
        <button onClick={onClose} className="text-white/40 hover:text-white/80 text-xs">Close</button>
      </div>

      {/* Transcription */}
      <div className="space-y-2">
        <span className="text-white/50 text-[10px] uppercase tracking-wider">Transcription</span>
        <SettingRow label="Mode">
          <Select
            value={config.transcription.mode}
            onChange={(v) => updateConfig({ transcription: { ...config.transcription, mode: v } })}
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
              value={config.transcription.apiKey || ''}
              onChange={(v) => updateConfig({ transcription: { ...config.transcription, apiKey: v } })}
              type="password"
              placeholder="sk-..."
            />
          </SettingRow>
        )}
        <SettingRow label="Language">
          <Select
            value={config.transcription.language}
            onChange={(v) => updateConfig({ transcription: { ...config.transcription, language: v } })}
            options={[{ value: 'ja', label: 'Japanese' }, { value: 'en', label: 'English' }, { value: 'auto', label: 'Auto' }]}
          />
        </SettingRow>
        <SettingRow label="Model">
          <Select
            value={config.transcription.model}
            onChange={(v) => updateConfig({ transcription: { ...config.transcription, model: v } })}
            options={config.transcription.mode === 'api'
              ? [{ value: 'whisper-1', label: 'whisper-1' }]
              : [
                  { value: 'large-v3', label: 'large-v3' },
                  { value: 'medium', label: 'medium' },
                  { value: 'small', label: 'small' },
                  { value: 'base', label: 'base' }
                ]
            }
          />
        </SettingRow>
      </div>

      {/* Summary */}
      <div className="space-y-2">
        <span className="text-white/50 text-[10px] uppercase tracking-wider">Summary</span>
        <SettingRow label="Mode">
          <Select
            value={config.summary.mode}
            onChange={(v) => updateConfig({ summary: { ...config.summary, mode: v } })}
            options={[{ value: 'cli', label: 'Claude CLI (Free)' }, { value: 'api', label: 'Anthropic API (BYOK)' }]}
          />
        </SettingRow>
        {config.summary.mode === 'api' && (
          <SettingRow label="Anthropic Key">
            <Input
              value={config.summary.apiKey || ''}
              onChange={(v) => updateConfig({ summary: { ...config.summary, apiKey: v } })}
              type="password"
              placeholder="sk-ant-..."
            />
          </SettingRow>
        )}
      </div>

      {/* Output */}
      <div className="space-y-2">
        <span className="text-white/50 text-[10px] uppercase tracking-wider">Output</span>
        <SettingRow label="Directory">
          <Input
            value={config.output.directory}
            onChange={(v) => updateConfig({ output: { ...config.output, directory: v } })}
            placeholder="./meetings"
          />
        </SettingRow>
      </div>

      {/* Integrations */}
      <div className="space-y-2">
        <span className="text-white/50 text-[10px] uppercase tracking-wider">Integrations</span>
        <Toggle
          checked={config.notion.enabled}
          onChange={(v) => updateConfig({ notion: { ...config.notion, enabled: v } })}
          label="Notion"
        />
        {config.notion.enabled && (
          <div className="pl-4 space-y-2">
            <SettingRow label="DB ID">
              <Input
                value={config.notion.databaseId}
                onChange={(v) => updateConfig({ notion: { ...config.notion, databaseId: v } })}
              />
            </SettingRow>
          </div>
        )}

        <Toggle
          checked={config.slack.enabled}
          onChange={(v) => updateConfig({ slack: { ...config.slack, enabled: v } })}
          label="Slack"
        />
        {config.slack.enabled && (
          <div className="pl-4 space-y-2">
            <SettingRow label="Channel">
              <Input
                value={config.slack.channel}
                onChange={(v) => updateConfig({ slack: { ...config.slack, channel: v } })}
              />
            </SettingRow>
          </div>
        )}

        <Toggle
          checked={config.remote.enabled}
          onChange={(v) => updateConfig({ remote: { ...config.remote, enabled: v } })}
          label="Remote (SCP)"
        />
      </div>
    </div>
  )
}
