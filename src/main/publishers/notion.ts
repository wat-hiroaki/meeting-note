import { Client } from '@notionhq/client'
import { getConfig } from '../config'
import type { MeetingData } from './markdown'

export async function publishToNotion(data: MeetingData): Promise<string> {
  const config = getConfig()

  if (!config.notion.enabled || !config.notion.apiKey || !config.notion.databaseId) {
    throw new Error('Notion integration not configured')
  }

  const notion = new Client({ auth: config.notion.apiKey })

  const dateStr = data.startedAt.toISOString().split('T')[0]
  const timeStr = `${data.startedAt.getHours().toString().padStart(2, '0')}:${data.startedAt.getMinutes().toString().padStart(2, '0')}`
  const durationMin = Math.ceil(data.transcript.duration / 60)

  const response = await notion.pages.create({
    parent: { database_id: config.notion.databaseId },
    properties: {
      Name: {
        title: [{ text: { content: `Meeting ${dateStr} ${timeStr}` } }]
      },
      Date: {
        date: { start: data.startedAt.toISOString() }
      },
      Status: {
        select: { name: 'Done' }
      }
    },
    children: [
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: 'Summary' } }]
        }
      },
      ...data.summary.split('\n').filter(line => line.trim()).map(line => ({
        object: 'block' as const,
        type: 'paragraph' as const,
        paragraph: {
          rich_text: [{ type: 'text' as const, text: { content: line } }]
        }
      })),
      {
        object: 'block',
        type: 'divider',
        divider: {}
      },
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: `Transcript (${durationMin}min)` } }]
        }
      },
      ...data.transcript.segments.map(seg => ({
        object: 'block' as const,
        type: 'paragraph' as const,
        paragraph: {
          rich_text: [
            {
              type: 'text' as const,
              text: { content: `[${formatTime(seg.start)}] ` },
              annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false, color: 'default' as const }
            },
            { type: 'text' as const, text: { content: seg.text } }
          ]
        }
      }))
    ]
  })

  return response.id
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
