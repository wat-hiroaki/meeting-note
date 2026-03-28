import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import type { MeetingHistoryEntry, ActionItem } from '../shared/types'

function getHistoryPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'meetings-history.json')
}

function loadHistory(): MeetingHistoryEntry[] {
  const path = getHistoryPath()
  if (!existsSync(path)) return []
  try {
    const data = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(data)
    // Validate it's actually an array
    if (!Array.isArray(parsed)) {
      console.error('[History] History file is not an array, resetting')
      return []
    }
    return parsed as MeetingHistoryEntry[]
  } catch (err) {
    console.error('[History] Failed to load history:', err)
    // Back up the corrupt file
    try {
      const backupPath = path + '.corrupt.' + Date.now()
      const { copyFileSync } = require('fs')
      copyFileSync(path, backupPath)
      console.error('[History] Corrupt history backed up to:', backupPath)
    } catch { /* ignore */ }
    return []
  }
}

function saveHistory(entries: MeetingHistoryEntry[]): void {
  const path = getHistoryPath()
  const data = JSON.stringify(entries, null, 2)

  // Atomic write: write to temp file then rename
  const tmpPath = path + '.tmp'
  try {
    writeFileSync(tmpPath, data, 'utf-8')
    renameSync(tmpPath, path)
  } catch {
    // Fall back to direct write if rename fails
    writeFileSync(path, data, 'utf-8')
  }
}

export function addMeetingToHistory(entry: MeetingHistoryEntry): void {
  const history = loadHistory()
  history.unshift(entry) // newest first
  // Keep last 500 entries
  if (history.length > 500) history.length = 500
  saveHistory(history)
}

export function getMeetingsHistory(limit = 50, offset = 0): MeetingHistoryEntry[] {
  const history = loadHistory()
  return history.slice(offset, offset + limit)
}

export function getMeetingById(id: string): MeetingHistoryEntry | null {
  const history = loadHistory()
  return history.find(e => e.id === id) || null
}

export function updateMeetingActionItem(
  meetingId: string,
  actionIndex: number,
  updates: Partial<ActionItem>
): boolean {
  const history = loadHistory()
  const meeting = history.find(e => e.id === meetingId)
  if (!meeting || !meeting.actionItems[actionIndex]) return false

  meeting.actionItems[actionIndex] = { ...meeting.actionItems[actionIndex], ...updates }
  saveHistory(history)
  return true
}

export function searchMeetings(query: string): MeetingHistoryEntry[] {
  const history = loadHistory()
  const lower = query.toLowerCase()
  return history.filter(e =>
    e.title.toLowerCase().includes(lower) ||
    e.tags.some(t => t.toLowerCase().includes(lower)) ||
    e.actionItems.some(a => a.text.toLowerCase().includes(lower)) ||
    (e.calendarEventTitle && e.calendarEventTitle.toLowerCase().includes(lower))
  )
}

export function generateMeetingId(): string {
  return `mtg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
