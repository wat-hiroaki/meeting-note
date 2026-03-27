import { ipcMain, BrowserWindow, shell, clipboard, app } from 'electron'
import { execSync } from 'child_process'
import { saveAudioBuffer, convertWebmToWav } from './recorder'
import { getConfig, saveConfig } from './config'
import { ConfigSchema } from '../shared/types'
import { runPipeline } from './pipeline'
import type { PipelineOptions } from './pipeline'
import { getMeetingsHistory, getMeetingById, updateMeetingActionItem, searchMeetings } from './meetings-history'
import { fetchUpcomingEvents, getNextMeeting } from './calendar'
import { detectActiveMeeting } from './meeting-detector'
import type { MeetingFormat, ActionItem } from '../shared/types'

let currentAudioPath = ''
let recordingStartedAt: Date = new Date()
let currentPipelineOptions: PipelineOptions = {}

export function registerIpcHandlers(): void {
  // Window controls
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  // Recording — Web Audio API based (renderer captures audio, main saves/converts)
  ipcMain.handle('recording:start', (_event, options?: { meetingFormat?: MeetingFormat; calendarEventTitle?: string; calendarEventId?: string }) => {
    recordingStartedAt = new Date()
    currentPipelineOptions = {
      meetingFormat: options?.meetingFormat,
      calendarEventTitle: options?.calendarEventTitle,
      calendarEventId: options?.calendarEventId
    }
    console.log('[IPC] Recording started (Web Audio mode), format:', options?.meetingFormat || 'auto')
  })

  ipcMain.handle('recording:pause', () => {
    console.log('[IPC] Recording paused')
  })

  ipcMain.handle('recording:resume', () => {
    console.log('[IPC] Recording resumed')
  })

  ipcMain.handle('recording:stop', () => {
    console.log('[IPC] Recording stopped (Web Audio mode)')
  })

  ipcMain.handle('recording:devices', async () => {
    // Return empty — renderer uses navigator.mediaDevices.enumerateDevices()
    return []
  })

  // Save webm audio buffer from renderer
  ipcMain.handle('recording:saveAudio', async (event, buffer: ArrayBuffer, metadata: { duration: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    const sendErr = (msg: string): void => {
      if (win && !win.isDestroyed()) {
        try {
          win.webContents.send('pipeline:error', msg)
          win.webContents.send('recording:status', 'error')
        } catch { /* window destroyed */ }
      }
    }

    // Validate buffer
    if (!buffer || buffer.byteLength === 0) {
      const msg = 'No audio data received. Recording may have failed.'
      console.error('[IPC]', msg)
      sendErr(msg)
      return ''
    }

    let webmPath: string
    try {
      webmPath = saveAudioBuffer(Buffer.from(buffer))
      console.log('[IPC] Audio saved:', webmPath, 'duration:', metadata.duration)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save audio'
      console.error('[IPC] Save audio failed:', msg)
      sendErr(msg)
      return ''
    }

    let wavPath: string
    try {
      wavPath = await convertWebmToWav(webmPath)
      currentAudioPath = wavPath
      console.log('[IPC] Converted to WAV:', wavPath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to convert audio'
      console.error('[IPC] WAV conversion failed:', msg)
      sendErr(msg)
      return ''
    }

    // Run pipeline with meeting format options (async, don't await)
    if (win && !win.isDestroyed()) {
      runPipeline(wavPath, win, recordingStartedAt, currentPipelineOptions).catch((err) => {
        console.error('[IPC] Pipeline error:', err)
        sendErr(err instanceof Error ? err.message : 'Pipeline failed')
      })
    }

    return wavPath
  })

  // Convert webm to wav (standalone)
  ipcMain.handle('recording:convertToWav', async (_event, webmPath: string) => {
    return await convertWebmToWav(webmPath)
  })

  // App lifecycle
  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })

  // File operations
  ipcMain.handle('system:openPath', (_event, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle('system:copyToClipboard', (_event, text: string) => {
    clipboard.writeText(text)
  })

  // Config
  ipcMain.handle('config:get', () => {
    return getConfig()
  })

  ipcMain.handle('config:set', (_event, config: unknown) => {
    const current = getConfig()
    const merged = deepMerge(current, config as Record<string, unknown>)
    const result = ConfigSchema.safeParse(merged)
    if (result.success) {
      saveConfig(result.data)
    } else {
      console.error('[IPC] Config validation failed:', result.error.issues)
      throw new Error(`Invalid config: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    }
  })

  // System checks
  ipcMain.handle('system:checkFfmpeg', () => {
    // Check PATH first
    try {
      execSync('ffmpeg -version', { timeout: 5000, stdio: 'pipe', windowsHide: true })
      return true
    } catch { /* not in PATH */ }

    // Check known install locations (winget, homebrew)
    if (process.platform === 'win32') {
      const wingetBase = require('path').join(
        process.env['LOCALAPPDATA'] || '',
        'Microsoft/WinGet/Packages'
      )
      try {
        const dirs = require('fs').readdirSync(wingetBase) as string[]
        if (dirs.some((d: string) => d.startsWith('Gyan.FFmpeg'))) return true
      } catch { /* ignore */ }
    }
    if (process.platform === 'darwin') {
      const { existsSync } = require('fs')
      if (existsSync('/opt/homebrew/bin/ffmpeg') || existsSync('/usr/local/bin/ffmpeg')) return true
    }
    return false
  })

  ipcMain.handle('system:checkClaudeCli', () => {
    try {
      execSync('claude --version', { timeout: 5000, stdio: 'pipe', windowsHide: true })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('system:checkPython', () => {
    try {
      execSync('python --version', { timeout: 5000, stdio: 'pipe', windowsHide: true })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('system:checkFasterWhisper', () => {
    try {
      execSync('python -c "import faster_whisper"', { timeout: 10000, stdio: 'pipe', windowsHide: true })
      return true
    } catch {
      return false
    }
  })

  // Check if Whisper model is already downloaded
  ipcMain.handle('system:checkWhisperModel', (_event, model: string) => {
    try {
      const { is } = require('@electron-toolkit/utils')
    const scriptPath = is.dev
      ? require('path').join(__dirname, '../../scripts/transcribe.py')
      : require('path').join(process.resourcesPath, 'scripts/transcribe.py')
      const output = execSync(`python "${scriptPath}" --check-model --model ${model}`, {
        encoding: 'utf-8',
        timeout: 15000,
        stdio: 'pipe',
        windowsHide: true
      })
      const result = JSON.parse(output.trim())
      return result as { cached: boolean; model: string; size: string }
    } catch {
      return { cached: false, model, size: 'unknown' }
    }
  })

  // Download Whisper model (async, sends progress)
  ipcMain.handle('system:downloadWhisperModel', (event, model: string) => {
    const { is } = require('@electron-toolkit/utils')
    const scriptPath = is.dev
      ? require('path').join(__dirname, '../../scripts/transcribe.py')
      : require('path').join(process.resourcesPath, 'scripts/transcribe.py')
    const { spawn: spawnProc } = require('child_process')
    console.log('[IPC] Downloading whisper model:', model, 'script:', scriptPath)
    const proc = spawnProc('python', [scriptPath, '--download-only', '--model', model], {
      windowsHide: true
    })

    const win = BrowserWindow.fromWebContents(event.sender)
    let stdout = ''

    proc.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stdout += chunk
      console.log('[Whisper DL stdout]', chunk.trim())
      const lines = stdout.split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const msg = JSON.parse(line)
          if (win) win.webContents.send('whisper:download-status', msg)
        } catch { /* partial line */ }
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString()
      console.log('[Whisper DL stderr]', msg.trim())
      if (win && msg.includes('%')) {
        win.webContents.send('whisper:download-progress', msg.trim())
      }
    })

    return new Promise<boolean>((resolve) => {
      proc.on('close', (code: number) => {
        console.log('[Whisper DL] Process exited with code:', code)
        resolve(code === 0)
      })
      proc.on('error', (err: Error) => {
        console.error('[Whisper DL] Spawn error:', err.message)
        resolve(false)
      })
    })
  })

  // ===== Meetings History =====
  ipcMain.handle('meetings:getHistory', (_event, limit?: number, offset?: number) => {
    return getMeetingsHistory(limit || 50, offset || 0)
  })

  ipcMain.handle('meetings:getById', (_event, id: string) => {
    return getMeetingById(id)
  })

  ipcMain.handle('meetings:search', (_event, query: string) => {
    return searchMeetings(query)
  })

  ipcMain.handle('meetings:updateActionItem', (_event, meetingId: string, actionIndex: number, updates: Partial<ActionItem>) => {
    return updateMeetingActionItem(meetingId, actionIndex, updates)
  })

  // ===== Calendar =====
  ipcMain.handle('calendar:getEvents', async () => {
    return await fetchUpcomingEvents()
  })

  ipcMain.handle('calendar:getNextMeeting', async () => {
    return await getNextMeeting()
  })

  // ===== Meeting Detection =====
  ipcMain.handle('meeting:detect', () => {
    return detectActiveMeeting()
  })

  // Window mode switching
  ipcMain.handle('window:setMode', (event, mode: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    const [currentX, currentY] = win.getPosition()

    switch (mode) {
      case 'onboarding':
        win.setSize(480, 680)
        win.setResizable(false)
        win.center()
        break
      case 'settings':
        win.setSize(380, 580)
        win.setPosition(currentX, currentY)
        break
      case 'history':
        win.setSize(420, 600)
        win.setPosition(currentX, currentY)
        break
      case 'expanded':
        win.setSize(380, 160)
        win.setPosition(currentX, currentY)
        break
      default: {
        win.setSize(380, 72)
        win.setResizable(false)
        const { width } = require('electron').screen.getPrimaryDisplay().workAreaSize
        win.setPosition(Math.round((width - 380) / 2), 24)
        break
      }
    }
  })
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>)
    } else {
      result[key] = source[key]
    }
  }
  return result
}

export function getCurrentAudioPath(): string {
  return currentAudioPath
}
