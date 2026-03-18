import { ipcMain, BrowserWindow } from 'electron'
import { execSync } from 'child_process'
import { startRecording, pauseRecording, resumeRecording, stopRecording, getAudioDevices } from './recorder'
import { getConfig, saveConfig, loadConfig } from './config'
import { ConfigSchema } from '../shared/types'
import { runPipeline } from './pipeline'

let currentAudioPath = ''
let recordingStartedAt: Date = new Date()

export function registerIpcHandlers(): void {
  // Window controls
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  // Recording
  ipcMain.handle('recording:start', () => {
    recordingStartedAt = new Date()
    currentAudioPath = startRecording()
    console.log('[IPC] Recording started:', currentAudioPath)
  })

  ipcMain.handle('recording:pause', () => {
    pauseRecording()
    console.log('[IPC] Recording paused')
  })

  ipcMain.handle('recording:resume', () => {
    resumeRecording()
    console.log('[IPC] Recording resumed')
  })

  ipcMain.handle('recording:stop', async (event) => {
    const audioPath = await stopRecording()
    currentAudioPath = audioPath
    console.log('[IPC] Recording stopped:', audioPath)

    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && audioPath) {
      // Run full pipeline: transcribe → summarize → save → publish
      runPipeline(audioPath, win, recordingStartedAt).catch((err) => {
        console.error('[IPC] Pipeline error:', err)
        win.webContents.send('recording:status', 'done')
      })
    }

    return audioPath
  })

  ipcMain.handle('recording:devices', () => {
    return getAudioDevices()
  })

  // Config
  ipcMain.handle('config:get', () => {
    return getConfig()
  })

  ipcMain.handle('config:set', (_event, config: unknown) => {
    // Merge partial config with existing
    const current = getConfig()
    const merged = deepMerge(current, config as Record<string, unknown>)
    const result = ConfigSchema.safeParse(merged)
    if (result.success) {
      saveConfig(result.data)
    }
  })

  // System checks
  ipcMain.handle('system:checkFfmpeg', () => {
    try {
      execSync('ffmpeg -version', { timeout: 5000, stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  })

  // Window mode switching
  ipcMain.handle('window:setMode', (event, mode: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    if (mode === 'onboarding') {
      win.setSize(420, 520)
      win.setResizable(false)
      win.center()
    } else {
      win.setSize(380, 72)
      win.setResizable(false)
      // Position at top-center of screen
      const { width } = require('electron').screen.getPrimaryDisplay().workAreaSize
      win.setPosition(Math.round((width - 380) / 2), 24)
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
