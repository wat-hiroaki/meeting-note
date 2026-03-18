import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

const api = {
  // Window controls
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),

  // Recording
  startRecording: (): Promise<void> => ipcRenderer.invoke('recording:start'),
  pauseRecording: (): Promise<void> => ipcRenderer.invoke('recording:pause'),
  resumeRecording: (): Promise<void> => ipcRenderer.invoke('recording:resume'),
  stopRecording: (): Promise<void> => ipcRenderer.invoke('recording:stop'),
  getAudioDevices: (): Promise<string[]> => ipcRenderer.invoke('recording:devices'),

  // Config
  getConfig: (): Promise<unknown> => ipcRenderer.invoke('config:get'),
  setConfig: (config: unknown): Promise<void> => ipcRenderer.invoke('config:set', config),

  // Events from main
  onRecordingStatus: (callback: (status: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, status: string): void => callback(status)
    ipcRenderer.on('recording:status', handler)
    return () => ipcRenderer.removeListener('recording:status', handler)
  },
  onProcessingProgress: (callback: (progress: { step: string; percent: number }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, progress: { step: string; percent: number }): void => callback(progress)
    ipcRenderer.on('processing:progress', handler)
    return () => ipcRenderer.removeListener('processing:progress', handler)
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('electronAPI', api)
