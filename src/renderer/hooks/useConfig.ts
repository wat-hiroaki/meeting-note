import { useState, useEffect, useCallback } from 'react'

interface ConfigData {
  recording: { device: string }
  transcription: { mode: string; model: string; language: string; apiKey?: string; remote: { host: string; user: string } }
  summary: { mode: string; language: string; apiKey?: string }
  output: { directory: string }
  notion: { enabled: boolean; apiKey: string; databaseId: string }
  slack: { enabled: boolean; token: string; channel: string }
  remote: { enabled: boolean; host: string; user: string; path: string }
}

const defaultConfig: ConfigData = {
  recording: { device: 'default' },
  transcription: { mode: 'local', model: 'large-v3', language: 'ja', apiKey: '', remote: { host: '', user: '' } },
  summary: { mode: 'cli', language: 'ja', apiKey: '' },
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
