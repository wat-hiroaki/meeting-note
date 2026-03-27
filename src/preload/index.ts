import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { MeetingHistoryEntry, ActionItem, CalendarEvent, MeetingFormat } from '../shared/types'

interface DetectedMeeting {
  platform: 'zoom' | 'google_meet' | 'teams' | 'other'
  processName: string
}

const api = {
  // Window controls
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),

  // Recording
  startRecording: (options?: { micDevice?: string; meetingFormat?: MeetingFormat; calendarEventTitle?: string; calendarEventId?: string }): Promise<void> =>
    ipcRenderer.invoke('recording:start', options),
  pauseRecording: (): Promise<void> => ipcRenderer.invoke('recording:pause'),
  resumeRecording: (): Promise<void> => ipcRenderer.invoke('recording:resume'),
  stopRecording: (): Promise<void> => ipcRenderer.invoke('recording:stop'),
  getAudioDevices: (): Promise<string[]> => ipcRenderer.invoke('recording:devices'),

  // Web Audio recording — saves webm buffer and converts to wav
  saveAudio: (buffer: ArrayBuffer, metadata: { duration: number }): Promise<string> =>
    ipcRenderer.invoke('recording:saveAudio', buffer, metadata),
  convertToWav: (webmPath: string): Promise<string> =>
    ipcRenderer.invoke('recording:convertToWav', webmPath),

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

  // Meetings History
  getMeetingsHistory: (limit?: number, offset?: number): Promise<MeetingHistoryEntry[]> =>
    ipcRenderer.invoke('meetings:getHistory', limit, offset),
  getMeetingById: (id: string): Promise<MeetingHistoryEntry | null> =>
    ipcRenderer.invoke('meetings:getById', id),
  searchMeetings: (query: string): Promise<MeetingHistoryEntry[]> =>
    ipcRenderer.invoke('meetings:search', query),
  updateMeetingActionItem: (meetingId: string, actionIndex: number, updates: Partial<ActionItem>): Promise<boolean> =>
    ipcRenderer.invoke('meetings:updateActionItem', meetingId, actionIndex, updates),

  // Calendar
  getCalendarEvents: (): Promise<CalendarEvent[]> =>
    ipcRenderer.invoke('calendar:getEvents'),
  getNextMeeting: (): Promise<CalendarEvent | null> =>
    ipcRenderer.invoke('calendar:getNextMeeting'),

  // Meeting Detection
  detectMeeting: (): Promise<DetectedMeeting | null> =>
    ipcRenderer.invoke('meeting:detect'),

  // Window mode
  setWindowMode: (mode: 'bar' | 'onboarding' | 'settings' | 'expanded' | 'history'): Promise<void> => ipcRenderer.invoke('window:setMode', mode),
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
  },
  onMeetingDetected: (callback: (meeting: DetectedMeeting) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, meeting: DetectedMeeting): void => callback(meeting)
    ipcRenderer.on('meeting:detected', handler)
    return () => ipcRenderer.removeListener('meeting:detected', handler)
  },
  onMeetingEnded: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('meeting:ended', handler)
    return () => ipcRenderer.removeListener('meeting:ended', handler)
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('electronAPI', api)
