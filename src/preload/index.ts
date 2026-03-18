import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

const api = {
  // Window controls
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),

  // Recording
  startRecording: (options?: { micDevice?: string; systemDevice?: string }): Promise<void> => ipcRenderer.invoke('recording:start', options),
  pauseRecording: (): Promise<void> => ipcRenderer.invoke('recording:pause'),
  resumeRecording: (): Promise<void> => ipcRenderer.invoke('recording:resume'),
  stopRecording: (): Promise<void> => ipcRenderer.invoke('recording:stop'),
  getAudioDevices: (): Promise<string[]> => ipcRenderer.invoke('recording:devices'),

  // File operations
  openPath: (path: string): Promise<void> => ipcRenderer.invoke('system:openPath', path),
  copyToClipboard: (text: string): Promise<void> => ipcRenderer.invoke('system:copyToClipboard', text),

  // Config
  getConfig: (): Promise<unknown> => ipcRenderer.invoke('config:get'),
  setConfig: (config: unknown): Promise<void> => ipcRenderer.invoke('config:set', config),

  // App lifecycle
  relaunchApp: (): Promise<void> => ipcRenderer.invoke('app:relaunch'),

  // System checks
  checkFfmpeg: (): Promise<boolean> => ipcRenderer.invoke('system:checkFfmpeg'),
  checkClaudeCli: (): Promise<boolean> => ipcRenderer.invoke('system:checkClaudeCli'),
  checkPython: (): Promise<boolean> => ipcRenderer.invoke('system:checkPython'),
  checkFasterWhisper: (): Promise<boolean> => ipcRenderer.invoke('system:checkFasterWhisper'),
  checkWhisperModel: (model: string): Promise<{ cached: boolean; model: string; size: string }> => ipcRenderer.invoke('system:checkWhisperModel', model),
  downloadWhisperModel: (model: string): Promise<boolean> => ipcRenderer.invoke('system:downloadWhisperModel', model),
  onWhisperDownloadStatus: (callback: (msg: { status: string; model?: string; size?: string; error?: string }) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, msg: { status: string; model?: string; size?: string; error?: string }): void => callback(msg)
    ipcRenderer.on('whisper:download-status', handler)
    return () => ipcRenderer.removeListener('whisper:download-status', handler)
  },
  setWindowMode: (mode: 'bar' | 'onboarding' | 'settings' | 'expanded'): Promise<void> => ipcRenderer.invoke('window:setMode', mode),
  platform: process.platform,

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
  },
  onHotkeyAction: (callback: (action: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, action: string): void => callback(action)
    ipcRenderer.on('hotkey:action', handler)
    return () => ipcRenderer.removeListener('hotkey:action', handler)
  },
  onPipelineError: (callback: (message: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on('pipeline:error', handler)
    return () => ipcRenderer.removeListener('pipeline:error', handler)
  },
  onOutputReady: (callback: (path: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, path: string): void => callback(path)
    ipcRenderer.on('pipeline:output', handler)
    return () => ipcRenderer.removeListener('pipeline:output', handler)
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('electronAPI', api)
