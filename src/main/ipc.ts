import { ipcMain, BrowserWindow, shell, clipboard, app } from 'electron'
import { execSync } from 'child_process'
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
  ipcMain.handle('recording:start', (_event, options?: { micDevice?: string; systemDevice?: string }) => {
    recordingStartedAt = new Date()
    currentAudioPath = startRecording(options)
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
      runPipeline(audioPath, win, recordingStartedAt).catch((err) => {
        console.error('[IPC] Pipeline error:', err)
        win.webContents.send('pipeline:error', err instanceof Error ? err.message : 'Pipeline failed')
        win.webContents.send('recording:status', 'error')
      })
    }

    return audioPath
  })

  ipcMain.handle('recording:devices', () => {
    return getAudioDevices()
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
    const proc = spawnProc('python', [scriptPath, '--download-only', '--model', model], {
      windowsHide: true
    })

    const win = BrowserWindow.fromWebContents(event.sender)
    let stdout = ''

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
      // Parse line-delimited JSON
      const lines = stdout.split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const msg = JSON.parse(line)
          if (win) win.webContents.send('whisper:download-status', msg)
        } catch { /* partial line */ }
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      // Model download progress goes to stderr via huggingface_hub
      const msg = data.toString()
      if (win && msg.includes('%')) {
        win.webContents.send('whisper:download-progress', msg.trim())
      }
    })

    return new Promise<boolean>((resolve) => {
      proc.on('close', (code: number) => {
        resolve(code === 0)
      })
      proc.on('error', () => resolve(false))
    })
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
