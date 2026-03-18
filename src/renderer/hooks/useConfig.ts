import { useState, useEffect, useCallback } from 'react'

interface ConfigData {
  recording: { micDevice: string }
  transcription: {
    mode: string
    model: string
    language: string
    remote: { host: string; user: string; pythonPath: string; scriptPath: string }
    api: { apiKey: string; model: string }
  }
  summary: { mode: string; language: string; api: { apiKey: string; model: string; maxTokens: number } }
  output: { directory: string }
  notion: { enabled: boolean; apiKey: string; databaseId: string }
  slack: { enabled: boolean; token: string; channel: string }
  remote: { enabled: boolean; host: string; user: string; path: string }
}

const defaultConfig: ConfigData = {
  recording: { micDevice: 'default' },
  transcription: {
    mode: 'local',
    model: 'large-v3',
    language: 'en',
    remote: { host: '', user: '', pythonPath: 'python3', scriptPath: '~/transcribe.py' },
    api: { apiKey: '', model: 'whisper-1' }
  },
  summary: { mode: 'cli', language: 'en', api: { apiKey: '', model: 'claude-sonnet-4-20250514', maxTokens: 4096 } },
  output: { directory: './meetings' },
  notion: { enabled: false, apiKey: '', databaseId: '' },
  slack: { enabled: false, token: '', channel: '' },
  remote: { enabled: false, host: '', user: '', path: '~/meetings' }
}

export function useConfig(): {
  config: ConfigData
  updateConfig: (updates: Partial<ConfigData>) => void
  loading: boolean
} {
  const [config, setConfig] = useState<ConfigData>(defaultConfig)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI.getConfig().then((data) => {
      if (data && typeof data === 'object') {
        setConfig({ ...defaultConfig, ...(data as Partial<ConfigData>) })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const updateConfig = useCallback((updates: Partial<ConfigData>): void => {
    const newConfig = { ...config, ...updates }
    setConfig(newConfig)
    window.electronAPI.setConfig(newConfig).catch(console.error)
  }, [config])

  return { config, updateConfig, loading }
}
