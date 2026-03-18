import { z } from 'zod'

export const ConfigSchema = z.object({
  recording: z.object({
    device: z.string().default('default'),
    format: z.enum(['wav', 'mp3']).default('wav'),
    sampleRate: z.number().default(16000)
  }).default({}),

  transcription: z.object({
    mode: z.enum(['local', 'remote']).default('local'),
    model: z.string().default('large-v3'),
    language: z.string().default('ja'),
    remote: z.object({
      host: z.string().default(''),
      user: z.string().default(''),
      pythonPath: z.string().default('python3'),
      scriptPath: z.string().default('~/transcribe.py')
    }).default({})
  }).default({}),

  summary: z.object({
    mode: z.enum(['cli', 'api']).default('cli'),
    language: z.string().default('ja'),
    api: z.object({
      model: z.string().default('claude-sonnet-4-20250514'),
      maxTokens: z.number().default(4096)
    }).default({})
  }).default({}),

  output: z.object({
    directory: z.string().default('./meetings'),
    filenameFormat: z.string().default('YYYY-MM-DD_HHmm')
  }).default({}),

  notion: z.object({
    enabled: z.boolean().default(false),
    apiKey: z.string().default(''),
    databaseId: z.string().default('')
  }).default({}),

  slack: z.object({
    enabled: z.boolean().default(false),
    token: z.string().default(''),
    channel: z.string().default('')
  }).default({}),

  remote: z.object({
    enabled: z.boolean().default(false),
    host: z.string().default(''),
    user: z.string().default(''),
    path: z.string().default('~/meetings')
  }).default({}),

  hotkeys: z.object({
    toggle: z.string().default('Ctrl+Shift+M'),
    record: z.string().default('Ctrl+Shift+R'),
    pause: z.string().default('Ctrl+Shift+P'),
    stop: z.string().default('Ctrl+Shift+S')
  }).default({})
})

export type Config = z.infer<typeof ConfigSchema>
