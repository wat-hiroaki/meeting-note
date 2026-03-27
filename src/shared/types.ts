import { z } from 'zod'

export const MeetingFormatSchema = z.enum(['auto', 'sales', 'standup', 'team', 'one_on_one', 'brainstorm']).default('auto')
export type MeetingFormat = z.infer<typeof MeetingFormatSchema>

export const ConfigSchema = z.object({
  recording: z.object({
    micDevice: z.string().default('default'),
    format: z.enum(['wav', 'mp3']).default('wav'),
    sampleRate: z.number().default(16000)
  }).default({}),

  transcription: z.object({
    mode: z.enum(['local', 'remote', 'api']).default('local'),
    model: z.string().default('large-v3'),
    language: z.string().default('en'),
    remote: z.object({
      host: z.string().default(''),
      user: z.string().default(''),
      pythonPath: z.string().default('python3'),
      scriptPath: z.string().default('~/transcribe.py')
    }).default({}),
    api: z.object({
      apiKey: z.string().default(''),
      model: z.string().default('whisper-1')
    }).default({})
  }).default({}),

  summary: z.object({
    mode: z.enum(['cli', 'anthropic', 'openai', 'gemini']).default('cli'),
    language: z.string().default('en'),
    meetingFormat: MeetingFormatSchema,
    customInstructions: z.string().default(''),
    anthropic: z.object({
      apiKey: z.string().default(''),
      model: z.string().default('claude-sonnet-4-20250514'),
      maxTokens: z.number().default(4096)
    }).default({}),
    openai: z.object({
      apiKey: z.string().default(''),
      model: z.string().default('gpt-4o')
    }).default({}),
    gemini: z.object({
      apiKey: z.string().default(''),
      model: z.string().default('gemini-2.5-flash')
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

  calendar: z.object({
    enabled: z.boolean().default(false),
    provider: z.enum(['google', 'outlook']).default('google'),
    google: z.object({
      clientId: z.string().default(''),
      clientSecret: z.string().default(''),
      refreshToken: z.string().default('')
    }).default({}),
    autoDetectMeetings: z.boolean().default(true)
  }).default({}),

  meetingDetection: z.object({
    enabled: z.boolean().default(true),
    autoPrompt: z.boolean().default(true)
  }).default({}),

  consent: z.object({
    enabled: z.boolean().default(false),
    message: z.string().default('This meeting is being recorded and transcribed by AI.')
  }).default({}),

  hotkeys: z.object({
    toggle: z.string().default('Ctrl+Shift+M'),
    record: z.string().default('Ctrl+Shift+R'),
    pause: z.string().default('Ctrl+Shift+P'),
    stop: z.string().default('Ctrl+Shift+S')
  }).default({}),

  onboarded: z.boolean().default(false)
})

export type Config = z.infer<typeof ConfigSchema>

// Meeting history entry stored in JSON
export interface MeetingHistoryEntry {
  id: string
  date: string // ISO date string
  title: string
  duration: number // seconds
  format: MeetingFormat
  summaryPath: string // path to markdown file
  calendarEventId?: string
  calendarEventTitle?: string
  actionItems: ActionItem[]
  tags: string[]
}

export interface ActionItem {
  text: string
  owner?: string
  priority?: 'high' | 'medium' | 'low'
  dueDate?: string
  completed: boolean
}

export interface CalendarEvent {
  id: string
  title: string
  start: string // ISO date string
  end: string
  meetingLink?: string // Zoom/Meet/Teams URL
  attendees: string[]
  platform?: 'zoom' | 'google_meet' | 'teams' | 'other'
}
