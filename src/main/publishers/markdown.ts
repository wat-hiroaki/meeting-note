import { join, resolve } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { getConfig } from '../config'
import type { TranscriptResult } from '../transcriber'
import type { MeetingFormat, ActionItem } from '../../shared/types'

export interface MeetingData {
  transcript: TranscriptResult
  summary: string
  startedAt: Date
  meetingFormat: MeetingFormat
  actionItems: ActionItem[]
  calendarEventTitle?: string
}

export function saveMarkdown(data: MeetingData): string {
  const config = getConfig()
  const dir = resolve(config.output.directory)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const now = data.startedAt
  const filename = formatFilename(now, config.output.filenameFormat) + '.md'
  const filepath = join(dir, filename)

  const content = buildMarkdown(data, now)
  writeFileSync(filepath, content, 'utf-8')

  return filepath
}

function formatFilename(date: Date, format: string): string {
  const y = date.getFullYear()
  const mo = (date.getMonth() + 1).toString().padStart(2, '0')
  const d = date.getDate().toString().padStart(2, '0')
  const h = date.getHours().toString().padStart(2, '0')
  const mi = date.getMinutes().toString().padStart(2, '0')

  let filename = format
    .replace('YYYY', y.toString())
    .replace('MM', mo)
    .replace('DD', d)
    .replace('HH', h)
    .replace('mm', mi)

  // Remove characters that are invalid in filenames across platforms
  // eslint-disable-next-line no-control-regex
  filename = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')

  return filename
}

const FORMAT_LABELS: Record<MeetingFormat, string> = {
  auto: 'Auto',
  sales: 'Sales Call',
  standup: 'Stand-up',
  team: 'Team Meeting',
  one_on_one: '1on1',
  brainstorm: 'Brainstorm',
  soap: 'Medical (SOAP)',
  interview: 'Interview / Consultation'
}

function buildMarkdown(data: MeetingData, date: Date): string {
  const dateStr = date.toISOString().split('T')[0]
  const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  const durationMin = Math.ceil(data.transcript.duration / 60)

  let md = ''

  // Frontmatter
  md += '---\n'
  md += `date: ${dateStr}\n`
  md += `time: ${timeStr}\n`
  md += `duration: ${durationMin}min\n`
  md += `language: ${data.transcript.language}\n`
  md += `format: ${data.meetingFormat}\n`
  if (data.calendarEventTitle) {
    // Escape quotes and newlines in YAML string value
    const safeTitle = data.calendarEventTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')
    md += `meeting: "${safeTitle}"\n`
  }
  if (data.actionItems.length > 0) {
    md += `action_items: ${data.actionItems.length}\n`
  }
  md += '---\n\n'

  // Title
  const title = data.calendarEventTitle || `Meeting ${dateStr} ${timeStr}`
  md += `# ${title}\n\n`
  md += `> ${FORMAT_LABELS[data.meetingFormat]} | ${durationMin}min | ${dateStr} ${timeStr}\n\n`

  // Summary
  md += data.summary + '\n\n'

  // Transcript with speaker labels
  md += '---\n\n'
  md += '## Transcript\n\n'
  let lastSpeaker = ''
  for (const seg of data.transcript.segments) {
    const speaker = (seg as typeof seg & { speaker?: string }).speaker
    if (speaker && speaker !== lastSpeaker) {
      md += `\n**${speaker}**\n\n`
      lastSpeaker = speaker
    }
    md += `**[${formatTime(seg.start)}]** ${seg.text}\n\n`
  }

  return md
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}
