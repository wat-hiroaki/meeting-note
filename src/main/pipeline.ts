import { BrowserWindow } from 'electron'
import { existsSync, statSync, unlinkSync } from 'fs'
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
  try {
    win.webContents.send('processing:progress', { step, percent })
  } catch {
    // Window destroyed between check and send — safe to ignore
  }
}

function sendError(win: BrowserWindow, message: string): void {
  if (!isWindowAlive(win)) return
  try {
    win.webContents.send('pipeline:error', message)
    win.webContents.send('recording:status', 'error')
  } catch {
    // Window destroyed — log to console as fallback
    console.error('[Pipeline] Could not send error to window:', message)
  }
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

  // Pre-flight: validate audio file
  if (!existsSync(audioPath)) {
    sendError(win, 'Audio file not found. Recording may have failed to save.')
    return
  }

  const audioStats = statSync(audioPath)
  if (audioStats.size < 100) {
    sendError(win, `Audio file too small (${audioStats.size} bytes). Recording may have failed or captured only silence.`)
    return
  }

  try {
    // Step 1: Transcribe
    sendProgress(win, 'transcribing', 10)
    const transcript = await transcribe(audioPath)
    sendProgress(win, 'transcribing', 40)

    // Sanitize segments: filter out null/undefined text
    transcript.segments = transcript.segments.filter(s => s.text != null).map(s => ({
      ...s,
      text: (s.text || '').trim()
    }))

    // Validate transcript has meaningful content
    const totalText = transcript.segments.map(s => s.text).join('').trim()
    if (totalText.length < 10) {
      console.warn('[Pipeline] Transcript very short:', totalText.length, 'chars')
      // Still proceed — user may want to see what was captured
    }

    // Step 2: Summarize with meeting format
    sendProgress(win, 'summarizing', 50)
    let summaryResult
    try {
      summaryResult = await summarize(
        transcript,
        options?.meetingFormat,
        options?.customInstructions
      )
    } catch (summaryErr) {
      // Summarization failure should not lose the transcript
      console.error('[Pipeline] Summarization failed, saving transcript only:', summaryErr)
      summaryResult = {
        summary: `**Summarization failed:** ${summaryErr instanceof Error ? summaryErr.message : 'Unknown error'}\n\nThe transcript has been saved below.`,
        actionItems: [],
        meetingFormat: options?.meetingFormat || config.summary.meetingFormat
      }
    }
    sendProgress(win, 'summarizing', 70)

    const meetingData: MeetingData = {
      transcript,
      summary: summaryResult.summary,
      startedAt,
      meetingFormat: summaryResult.meetingFormat,
      actionItems: summaryResult.actionItems,
      calendarEventTitle: options?.calendarEventTitle
    }

    // Step 3: Save markdown (critical — must succeed)
    sendProgress(win, 'saving', 75)
    let mdPath: string
    try {
      mdPath = saveMarkdown(meetingData)
    } catch (saveErr) {
      const msg = saveErr instanceof Error ? saveErr.message : 'Unknown error'
      sendError(win, `Failed to save meeting notes: ${msg}. Check disk space and output directory.`)
      return
    }
    sendProgress(win, 'saving', 80)

    // Step 3.5: Save to meetings history (non-critical)
    try {
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
    } catch (historyErr) {
      console.error('[Pipeline] Failed to save to history:', historyErr)
      // Non-critical — continue
    }

    // Step 4: Publish to integrations (all non-critical)
    sendProgress(win, 'publishing', 85)
    const errors: string[] = []
    let notionPageId: string | undefined

    if (config.notion.enabled) {
      try {
        notionPageId = await publishToNotion(meetingData)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[Pipeline] Notion publish failed:', msg)
        errors.push(`Notion: ${msg}`)
      }
    }

    if (config.slack.enabled) {
      try {
        await publishToSlack(meetingData, notionPageId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[Pipeline] Slack publish failed:', msg)
        errors.push(`Slack: ${msg}`)
      }
    }

    if (config.remote.enabled) {
      try {
        publishToRemote(mdPath)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[Pipeline] Remote publish failed:', msg)
        errors.push(`Remote SCP: ${msg}`)
      }
    }

    sendProgress(win, 'done', 100)
    if (isWindowAlive(win)) {
      try {
        win.webContents.send('pipeline:output', mdPath)
        win.webContents.send('recording:status', 'done')
      } catch { /* window destroyed */ }
    }

    // Clean up the intermediate WAV file (markdown has the summary, WAV is no longer needed)
    try { unlinkSync(audioPath) } catch { /* ignore cleanup errors */ }

    // Send partial errors as warnings (pipeline still succeeded)
    if (errors.length > 0 && isWindowAlive(win)) {
      try {
        win.webContents.send('pipeline:error', `Publishing warnings: ${errors.join('; ')}`)
      } catch { /* window destroyed */ }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pipeline failed'
    console.error('[Pipeline] Failed:', message)
    sendError(win, message)
    throw err
  }
}
