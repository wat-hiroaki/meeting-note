import { ipcMain, BrowserWindow } from 'electron'
import { startRecording, pauseRecording, resumeRecording, stopRecording, getAudioDevices } from './recorder'
import { getConfig, saveConfig } from './config'
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
    const result = ConfigSchema.safeParse(config)
    if (result.success) {
      saveConfig(result.data)
    }
  })
}

export function getCurrentAudioPath(): string {
  return currentAudioPath
}
