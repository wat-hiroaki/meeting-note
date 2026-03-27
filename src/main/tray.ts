import { Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'

let tray: Tray | null = null

export function createTray(mainWindow: BrowserWindow): Tray {
  // Create a simple 16x16 icon programmatically (red circle on transparent)
  const iconPath = join(__dirname, '../../resources/icon.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
  } catch {
    // Fallback: create empty icon
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon.isEmpty() ? createDefaultIcon() : icon)
  tray.setToolTip('meeting-note')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide',
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide()
        } else {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Start Recording',
      click: () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
          mainWindow.webContents.send('hotkey:action', 'record')
        }
      }
    },
    {
      label: 'Stop Recording',
      click: () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('hotkey:action', 'stop')
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (mainWindow as BrowserWindow & { forceClose?: boolean }).forceClose = true
        mainWindow.close()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  return tray
}

function createDefaultIcon(): Electron.NativeImage {
  // Create a 16x16 red circle icon as fallback
  const size = 16
  const canvas = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const r = 6

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (dist <= r) {
        canvas[idx] = 239     // R
        canvas[idx + 1] = 68  // G
        canvas[idx + 2] = 68  // B
        canvas[idx + 3] = 255 // A
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size })
}

export { tray }
