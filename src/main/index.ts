import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { createTray } from './tray'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 72,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

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
