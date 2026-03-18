import { globalShortcut, BrowserWindow } from 'electron'

export function registerHotkeys(mainWindow: BrowserWindow): void {
  // Toggle window visibility
  globalShortcut.register('Ctrl+Shift+M', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Start recording
  globalShortcut.register('Ctrl+Shift+R', () => {
    mainWindow.webContents.send('hotkey:action', 'record')
  })

  // Pause/Resume
  globalShortcut.register('Ctrl+Shift+P', () => {
    mainWindow.webContents.send('hotkey:action', 'pause')
  })

  // Stop
  globalShortcut.register('Ctrl+Shift+S', () => {
    mainWindow.webContents.send('hotkey:action', 'stop')
  })
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
