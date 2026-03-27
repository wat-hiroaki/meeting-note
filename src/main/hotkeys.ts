import { globalShortcut, BrowserWindow } from 'electron'

const mod = process.platform === 'darwin' ? 'Cmd' : 'Ctrl'

function safeRegister(accelerator: string, callback: () => void): void {
  try {
    const success = globalShortcut.register(accelerator, callback)
    if (!success) {
      console.warn(`[Hotkeys] Failed to register ${accelerator} — may be in use by another app`)
    }
  } catch (err) {
    console.error(`[Hotkeys] Error registering ${accelerator}:`, err)
  }
}

export function registerHotkeys(mainWindow: BrowserWindow): void {
  // Toggle window visibility
  safeRegister(`${mod}+Shift+M`, () => {
    if (mainWindow.isDestroyed()) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Start recording
  safeRegister(`${mod}+Shift+R`, () => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send('hotkey:action', 'record')
  })

  // Pause/Resume
  safeRegister(`${mod}+Shift+P`, () => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send('hotkey:action', 'pause')
  })

  // Stop
  safeRegister(`${mod}+Shift+S`, () => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send('hotkey:action', 'stop')
  })
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
