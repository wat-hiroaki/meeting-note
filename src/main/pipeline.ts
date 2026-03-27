import { BrowserWindow } from 'electron'
import { transcribe } from './transcriber'
import { summarize } from './summarizer'
import { saveMarkdown } from './publishers/markdown'
import { publishToNotion } from './publishers/notion'
import { publishToSlack } from './publishers/slack'
import { publishToRemote } from './publishers/remote'
import { getConfig } from './config'
import { addMeetingToHistory, generateMeetingId } from './meetings-history'
import type { MeetingData } from './publishers/markdown'
import type { MeetingFormat } from '../shared/types'

type ProgressStep = 'transcribing' | 'summarizing' | 'saving' | 'publishing' | 'done'

function isWindowAlive(win: BrowserWindow): boolean {
  try {
    return !win.isDestroyed() && win.webContents !== null && !win.webContents.isDestroyed()
  } catch {
    return false
  }
}

function sendProgress(win: BrowserWindow, step: ProgressStep, percent: number): void {
  if (!isWindowAlive(win)) return
  win.webContents.send('processing:progress', { step, percent })
}

function sendError(win: BrowserWindow, message: string): void {
  if (!isWindowAlive(win)) return
  win.webContents.send('pipeline:error', message)
  win.webContents.send('recording:status', 'error')
}

export interface PipelineOptions {
  meetingFormat?: MeetingFormat
  customInstructions?: string
  calendarEventTitle?: string
  calendarEventId?: string
}

export async function runPipeline(
  audioPath: string,
  win: BrowserWindow,
  startedAt: Date,
  options?: PipelineOptions
): Promise<void> {
  const config = getConfig()

  try {
    // Step 1: Transcribe
    sendProgress(win, 'transcribing', 10)
    const transcript = await transcribe(audioPath)
    sendProgress(win, 'transcribing', 40)

    // Step 2: Summarize with meeting format
    sendProgress(win, 'summarizing', 50)
    const summaryResult = await summarize(
      transcript,
      options?.meetingFormat,
      options?.customInstructions
    )
    sendProgress(win, 'summarizing', 70)

    const meetingData: MeetingData = {
      transcript,
      summary: summaryResult.summary,
      startedAt,
      meetingFormat: summaryResult.meetingFormat,
      actionItems: summaryResult.actionItems,
      calendarEventTitle: options?.calendarEventTitle
    }

    // Step 3: Save markdown
    sendProgress(win, 'saving', 75)
    const mdPath = saveMarkdown(meetingData)
    sendProgress(win, 'saving', 80)

    // Step 3.5: Save to meetings history
    const meetingId = generateMeetingId()
    addMeetingToHistory({
      id: meetingId,
      date: startedAt.toISOString(),
      title: options?.calendarEventTitle || `Meeting ${startedAt.toISOString().split('T')[0]}`,
      duration: transcript.duration,
      format: summaryResult.meetingFormat,
      summaryPath: mdPath,
      calendarEventId: options?.calendarEventId,
      calendarEventTitle: options?.calendarEventTitle,
      actionItems: summaryResult.actionItems,
      tags: []
    })

    // Step 4: Publish to integrations
    sendProgress(win, 'publishing', 85)
    const errors: string[] = []
    let notionPageId: string | undefined

    if (config.notion.enabled) {
      try {
        notionPageId = await publishToNotion(meetingData)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[Pipeline] Notion publish failed:', msg)
        errors.push(`Notion publish failed: ${msg}. Check your API key and database ID in Settings.`)
      }
    }

    if (config.slack.enabled) {
      try {
        await publishToSlack(meetingData, notionPageId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[Pipeline] Slack publish failed:', msg)
        errors.push(`Slack publish failed: ${msg}. Check your token and channel in Settings.`)
      }
    }

    if (config.remote.enabled) {
      try {
        publishToRemote(mdPath)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[Pipeline] Remote publish failed:', msg)
        errors.push(`Remote SCP failed: ${msg}. Check SSH connection settings.`)
      }
    }

    sendProgress(win, 'done', 100)
    if (isWindowAlive(win)) {
      win.webContents.send('pipeline:output', mdPath)
      win.webContents.send('recording:status', 'done')
    }

    // Send partial errors as warnings (pipeline still succeeded)
    if (errors.length > 0 && isWindowAlive(win)) {
      win.webContents.send('pipeline:error', `Publishing warnings: ${errors.join('; ')}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pipeline failed'
    console.error('[Pipeline] Failed:', message)
    sendError(win, message)
    throw err
  }
}
