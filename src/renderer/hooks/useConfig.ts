import { useState, useEffect, useCallback, useRef } from 'react'

interface ConfigData {
  secureMode: boolean
  recording: { micDevice: string }
  transcription: {
    mode: string
    model: string
    language: string
    remote: { host: string; user: string; pythonPath: string; scriptPath: string }
    api: { apiKey: string; model: string }
  }
  summary: {
    mode: string
    language: string
    meetingFormat: string
    customInstructions: string
    anthropic: { apiKey: string; model: string; maxTokens: number }
    openai: { apiKey: string; model: string }
    gemini: { apiKey: string; model: string }
    ollama: { host: string; model: string }
  }
  output: { directory: string }
  notion: { enabled: boolean; apiKey: string; databaseId: string }
  slack: { enabled: boolean; token: string; channel: string }
  remote: { enabled: boolean; host: string; user: string; path: string }
  calendar: {
    enabled: boolean
    provider: string
    google: { clientId: string; clientSecret: string; refreshToken: string }
    autoDetectMeetings: boolean
  }
  meetingDetection: {
    enabled: boolean
    autoPrompt: boolean
  }
  medical: {
    enabled: boolean
    specialties: string[]
    customTerms: string[]
    autoSecureMode: boolean
    auditLog: boolean
    requireConsent: boolean
  }
  consent: {
    enabled: boolean
    message: string
    requireConfirmation: boolean
  }
}

const defaultConfig: ConfigData = {
  secureMode: false,
  recording: { micDevice: 'default' },
  transcription: {
    mode: 'local',
    model: 'large-v3',
    language: 'en',
    remote: { host: '', user: '', pythonPath: 'python3', scriptPath: '~/transcribe.py' },
    api: { apiKey: '', model: 'whisper-1' }
  },
  summary: {
    mode: 'cli',
    language: 'en',
    meetingFormat: 'auto',
    customInstructions: '',
    anthropic: { apiKey: '', model: 'claude-sonnet-4-20250514', maxTokens: 4096 },
    openai: { apiKey: '', model: 'gpt-4o' },
    gemini: { apiKey: '', model: 'gemini-2.5-flash' },
    ollama: { host: 'http://localhost:11434', model: 'qwen2.5:14b' }
  },
  output: { directory: './meetings' },
  notion: { enabled: false, apiKey: '', databaseId: '' },
  slack: { enabled: false, token: '', channel: '' },
  remote: { enabled: false, host: '', user: '', path: '~/meetings' },
  calendar: {
    enabled: false,
    provider: 'google',
    google: { clientId: '', clientSecret: '', refreshToken: '' },
    autoDetectMeetings: true
  },
  meetingDetection: {
    enabled: true,
    autoPrompt: true
  },
  medical: {
    enabled: false,
    specialties: ['general'],
    customTerms: [],
    autoSecureMode: true,
    auditLog: true,
    requireConsent: true,
  },
  consent: {
    enabled: false,
    message: 'This meeting is being recorded and transcribed by AI.',
    requireConfirmation: false,
  }
}

export function useConfig(): {
  config: ConfigData
  editConfig: (updates: Partial<ConfigData>) => void
  saveConfig: () => Promise<void>
  dirty: boolean
  loading: boolean
} {
  const [config, setConfig] = useState<ConfigData>(defaultConfig)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const savedRef = useRef<ConfigData>(defaultConfig)

  useEffect(() => {
    window.electronAPI.getConfig().then((data) => {
      if (data && typeof data === 'object') {
        const loaded = deepMergeConfig(defaultConfig, data as Partial<ConfigData>)
        setConfig(loaded)
        savedRef.current = loaded
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const editConfig = useCallback((updates: Partial<ConfigData>): void => {
    setConfig(prev => {
      const newConfig = { ...prev, ...updates }
      setDirty(true)
      return newConfig
    })
  }, [])

  const saveConfig = useCallback(async (): Promise<void> => {
    await window.electronAPI.setConfig(config)
    savedRef.current = config
    setDirty(false)
  }, [config])

  return { config, editConfig, saveConfig, dirty, loading }
}

function deepMergeConfig(defaults: ConfigData, source: Partial<ConfigData>): ConfigData {
  const result = { ...defaults }
  for (const key of Object.keys(source) as (keyof ConfigData)[]) {
    const val = source[key]
    if (val && typeof val === 'object' && !Array.isArray(val) && typeof defaults[key] === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result[key] = { ...(defaults[key] as any), ...(val as any) }
    } else if (val !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result[key] = val as any
    }
  }
  return result
}
