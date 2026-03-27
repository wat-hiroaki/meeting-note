import { Client } from '@notionhq/client'
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints'
import { getConfig } from '../config'
import type { MeetingData } from './markdown'

// Notion API allows max 100 blocks per request
const NOTION_MAX_BLOCKS = 100

const FORMAT_LABELS: Record<string, string> = {
  auto: 'Auto',
  sales: 'Sales Call',
  standup: 'Stand-up',
  team: 'Team Meeting',
  one_on_one: '1on1',
  brainstorm: 'Brainstorm'
}

export async function publishToNotion(data: MeetingData): Promise<string> {
  const config = getConfig()

  if (!config.notion.enabled || !config.notion.apiKey || !config.notion.databaseId) {
    throw new Error('Notion integration not configured')
  }

  const notion = new Client({ auth: config.notion.apiKey })

  const dateStr = data.startedAt.toISOString().split('T')[0]
  const timeStr = `${data.startedAt.getHours().toString().padStart(2, '0')}:${data.startedAt.getMinutes().toString().padStart(2, '0')}`
  const durationMin = Math.ceil(data.transcript.duration / 60)
  const title = data.calendarEventTitle || `Meeting ${dateStr} ${timeStr}`

  // Build all content blocks
  const allBlocks: BlockObjectRequest[] = [
    // Meeting info callout
    {
      object: 'block',
      type: 'callout' as const,
      callout: {
        rich_text: [{
          type: 'text' as const,
          text: { content: `${FORMAT_LABELS[data.meetingFormat] || 'Meeting'} | ${durationMin}min | ${dateStr} ${timeStr}` }
        }],
        icon: { type: 'emoji' as const, emoji: '📋' as const }
      }
    },
    // Summary heading
    {
      object: 'block',
      type: 'heading_2' as const,
      heading_2: {
        rich_text: [{ type: 'text' as const, text: { content: 'Summary' } }]
      }
    },
    // Summary paragraphs
    ...data.summary.split('\n').filter(line => line.trim()).map(line => parseSummaryLine(line)),
    // Divider before action items
    {
      object: 'block',
      type: 'divider' as const,
      divider: {}
    },
    // Action items section
    ...(data.actionItems.length > 0
      ? [
          {
            object: 'block' as const,
            type: 'heading_2' as const,
            heading_2: {
              rich_text: [{ type: 'text' as const, text: { content: 'Action Items' } }]
            }
          } as BlockObjectRequest,
          ...data.actionItems.map(item => ({
            object: 'block' as const,
            type: 'to_do' as const,
            to_do: {
              rich_text: [
                { type: 'text' as const, text: { content: item.text } },
                ...(item.owner ? [{
                  type: 'text' as const,
                  text: { content: ` @${item.owner}` },
                  annotations: { bold: true as const, italic: false as const, strikethrough: false as const, underline: false as const, code: false as const, color: 'default' as const }
                }] : []),
                ...(item.priority ? [{
                  type: 'text' as const,
                  text: { content: ` [${item.priority}]` },
                  annotations: {
                    bold: false as const,
                    italic: true as const,
                    strikethrough: false as const,
                    underline: false as const,
                    code: false as const,
                    color: (item.priority === 'high' ? 'red' as const : item.priority === 'medium' ? 'yellow' as const : 'default' as const)
                  }
                }] : []),
                ...(item.dueDate ? [{
                  type: 'text' as const,
                  text: { content: ` due: ${item.dueDate}` },
                  annotations: { bold: false as const, italic: false as const, strikethrough: false as const, underline: false as const, code: true as const, color: 'default' as const }
                }] : [])
              ],
              checked: item.completed
            }
          } as BlockObjectRequest))
        ]
      : []
    ),
    // Divider before transcript
    {
      object: 'block',
      type: 'divider' as const,
      divider: {}
    },
    // Transcript
    {
      object: 'block',
      type: 'heading_2' as const,
      heading_2: {
        rich_text: [{ type: 'text' as const, text: { content: `Transcript (${durationMin}min)` } }]
      }
    },
    ...(data.transcript.segments.length > 0
      ? data.transcript.segments.map(seg => ({
          object: 'block' as const,
          type: 'paragraph' as const,
          paragraph: {
            rich_text: [
              {
                type: 'text' as const,
                text: { content: `[${formatTime(seg.start)}] ` },
                annotations: { bold: true as const, italic: false as const, strikethrough: false as const, underline: false as const, code: false as const, color: 'default' as const }
              },
              { type: 'text' as const, text: { content: seg.text } }
            ]
          }
        } as BlockObjectRequest))
      : [{
          object: 'block' as const,
          type: 'paragraph' as const,
          paragraph: {
            rich_text: [{ type: 'text' as const, text: { content: 'No transcript segments recorded.' } }]
          }
        } as BlockObjectRequest]
    )
  ]

  // First batch: create page with up to NOTION_MAX_BLOCKS children
  const firstBatch = allBlocks.slice(0, NOTION_MAX_BLOCKS)
  const response = await notion.pages.create({
    parent: { database_id: config.notion.databaseId },
    properties: {
      Name: {
        title: [{ text: { content: title } }]
      },
      Date: {
        date: { start: data.startedAt.toISOString() }
      },
      Status: {
        select: { name: 'Done' }
      }
    },
    children: firstBatch
  })

  // Append remaining blocks in batches of NOTION_MAX_BLOCKS
  for (let i = NOTION_MAX_BLOCKS; i < allBlocks.length; i += NOTION_MAX_BLOCKS) {
    const batch = allBlocks.slice(i, i + NOTION_MAX_BLOCKS)
    await notion.blocks.children.append({
      block_id: response.id,
      children: batch
    })
  }

  return response.id
}

function parseSummaryLine(line: string): BlockObjectRequest {
  const trimmed = line.trim()

  // Heading lines (### or ##)
  if (trimmed.startsWith('### ')) {
    return {
      object: 'block',
      type: 'heading_3' as const,
      heading_3: {
        rich_text: [{ type: 'text' as const, text: { content: trimmed.slice(4) } }]
      }
    }
  }
  if (trimmed.startsWith('## ')) {
    return {
      object: 'block',
      type: 'heading_2' as const,
      heading_2: {
        rich_text: [{ type: 'text' as const, text: { content: trimmed.slice(3) } }]
      }
    }
  }

  // Bullet list items
  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
    const content = trimmed.slice(2)
    // Check for checkbox items in summary
    if (content.startsWith('[ ] ') || content.startsWith('[x] ')) {
      return {
        object: 'block',
        type: 'to_do' as const,
        to_do: {
          rich_text: [{ type: 'text' as const, text: { content: content.slice(4) } }],
          checked: content.startsWith('[x]')
        }
      }
    }
    return {
      object: 'block',
      type: 'bulleted_list_item' as const,
      bulleted_list_item: {
        rich_text: buildRichText(content)
      }
    }
  }

  // Default: paragraph
  return {
    object: 'block',
    type: 'paragraph' as const,
    paragraph: {
      rich_text: buildRichText(trimmed)
    }
  }
}

function buildRichText(text: string): Array<{
  type: 'text'
  text: { content: string }
  annotations?: { bold: boolean; italic: boolean; strikethrough: boolean; underline: boolean; code: boolean; color: 'default' }
}> {
  // Parse bold (**text**) and timestamp references (→ [MM:SS])
  const parts: Array<{
    type: 'text'
    text: { content: string }
    annotations?: { bold: boolean; italic: boolean; strikethrough: boolean; underline: boolean; code: boolean; color: 'default' }
  }> = []

  const regex = /(\*\*(.+?)\*\*)|(→\s*\[[\d:]+\])/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        text: { content: text.slice(lastIndex, match.index) }
      })
    }

    if (match[1]) {
      // Bold text
      parts.push({
        type: 'text',
        text: { content: match[2] },
        annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false, color: 'default' }
      })
    } else if (match[3]) {
      // Timestamp reference
      parts.push({
        type: 'text',
        text: { content: match[3] },
        annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: true, color: 'default' }
      })
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      text: { content: text.slice(lastIndex) }
    })
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', text: { content: text } })
  }

  return parts
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
