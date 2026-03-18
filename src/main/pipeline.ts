import { BrowserWindow } from 'electron'
import { transcribe } from './transcriber'
import { summarize } from './summarizer'
import { saveMarkdown } from './publishers/markdown'
import { publishToNotion } from './publishers/notion'
import { publishToSlack } from './publishers/slack'
import { publishToRemote } from './publishers/remote'
import { getConfig } from './config'
import type { MeetingData } from './publishers/markdown'

type ProgressStep = 'transcribing' | 'summarizing' | 'saving' | 'publishing' | 'done'

function sendProgress(win: BrowserWindow, step: ProgressStep, percent: number): void {
  win.webContents.send('processing:progress', { step, percent })
}

export async function runPipeline(audioPath: string, win: BrowserWindow, startedAt: Date): Promise<void> {
  const config = getConfig()

  try {
    // Step 1: Transcribe
    sendProgress(win, 'transcribing', 10)
    const transcript = await transcribe(audioPath)
    sendProgress(win, 'transcribing', 40)

    // Step 2: Summarize
    sendProgress(win, 'summarizing', 50)
    const summary = await summarize(transcript)
    sendProgress(win, 'summarizing', 70)

    const meetingData: MeetingData = {
      transcript,
      summary,
      startedAt
    }

    // Step 3: Save markdown
    sendProgress(win, 'saving', 75)
    const mdPath = saveMarkdown(meetingData)
    sendProgress(win, 'saving', 80)

    // Step 4: Publish to integrations
    sendProgress(win, 'publishing', 85)
    let notionPageId: string | undefined

    if (config.notion.enabled) {
      try {
        notionPageId = await publishToNotion(meetingData)
      } catch (err) {
        console.error('[Pipeline] Notion publish failed:', err)
      }
    }

    if (config.slack.enabled) {
      try {
        await publishToSlack(meetingData, notionPageId)
      } catch (err) {
        console.error('[Pipeline] Slack publish failed:', err)
      }
    }

    if (config.remote.enabled) {
      try {
        publishToRemote(mdPath)
      } catch (err) {
        console.error('[Pipeline] Remote publish failed:', err)
      }
    }

    sendProgress(win, 'done', 100)
    win.webContents.send('recording:status', 'done')
  } catch (err) {
    console.error('[Pipeline] Failed:', err)
    win.webContents.send('recording:status', 'done')
    throw err
  }
}
