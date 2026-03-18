import { app, BrowserWindow, shell, session, desktopCapturer } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { createTray } from './tray'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { getConfig } from './config'

// Prevent crash dialogs for non-critical spawn errors (e.g. ffmpeg not installed)
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err.message)
  // Only quit on truly fatal errors, not ENOENT from missing binaries
  if (!err.message.includes('ENOENT')) {
    app.quit()
  }
})

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const config = getConfig()
  const isOnboarded = config.onboarded

  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: isOnboarded ? 380 : 480,
    height: isOnboarded ? 72 : 680,
    frame: false,
    transparent: isOnboarded,
    backgroundColor: isOnboarded ? '#00000000' : '#1e1e28',
    hasShadow: !isOnboarded,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    ...(isMac && isOnboarded ? { vibrancy: 'under-window', visualEffectState: 'active' } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isOnboarded) {
    mainWindow.setBackgroundColor('#00000000')
  }
  mainWindow.setVisibleOnAllWorkspaces(true)

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    const win = mainWindow as BrowserWindow & { forceClose?: boolean }
    if (!win.forceClose) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Auto-approve display media requests with loopback audio
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    callback({ video: sources[0], audio: 'loopback' })
  })

  // Setup tray and hotkeys
  createTray(mainWindow)
  registerHotkeys(mainWindow)
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})

app.on('will-quit', () => {
  unregisterHotkeys()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export { mainWindow }
