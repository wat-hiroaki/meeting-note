import { globalShortcut, BrowserWindow } from 'electron'

const mod = process.platform === 'darwin' ? 'Cmd' : 'Ctrl'

export function registerHotkeys(mainWindow: BrowserWindow): void {
  // Toggle window visibility
  globalShortcut.register(`${mod}+Shift+M`, () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Start recording
  globalShortcut.register(`${mod}+Shift+R`, () => {
    mainWindow.webContents.send('hotkey:action', 'record')
  })

  // Pause/Resume
  globalShortcut.register(`${mod}+Shift+P`, () => {
    mainWindow.webContents.send('hotkey:action', 'pause')
  })

  // Stop
  globalShortcut.register(`${mod}+Shift+S`, () => {
    mainWindow.webContents.send('hotkey:action', 'stop')
  })
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
