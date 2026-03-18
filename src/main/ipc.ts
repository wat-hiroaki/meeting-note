import { ipcMain, BrowserWindow } from 'electron'

export function registerIpcHandlers(): void {
  // Window controls
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  // Recording stubs — will be implemented in Task 6
  ipcMain.handle('recording:start', () => {
    console.log('[IPC] recording:start')
  })

  ipcMain.handle('recording:pause', () => {
    console.log('[IPC] recording:pause')
  })

  ipcMain.handle('recording:resume', () => {
    console.log('[IPC] recording:resume')
  })

  ipcMain.handle('recording:stop', () => {
    console.log('[IPC] recording:stop')
  })

  ipcMain.handle('recording:devices', () => {
    return []
  })

  // Config stubs — will be implemented in Task 8
  ipcMain.handle('config:get', () => {
    return {}
  })

  ipcMain.handle('config:set', (_event, _config: unknown) => {
    console.log('[IPC] config:set')
  })
}
