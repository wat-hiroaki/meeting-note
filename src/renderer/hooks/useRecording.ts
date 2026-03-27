import { useState, useRef, useCallback, useEffect } from 'react'
import type { RecordingStatus } from '../components/StatusIndicator'
import { useAudioRecorder } from './useAudioRecorder'

interface StartOptions {
  micDevice?: string
  meetingFormat?: string
  calendarEventTitle?: string
  calendarEventId?: string
}

interface UseRecordingReturn {
  status: RecordingStatus
  seconds: number
  error: string | null
  outputPath: string | null
  start: (options?: StartOptions) => void
  pause: () => void
  resume: () => void
  stop: () => void
  dismiss: () => void
}

export function useRecording(): UseRecordingReturn {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const audioRecorder = useAudioRecorder()

  const startTimer = useCallback((): void => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setSeconds((s) => s + 1)
    }, 1000)
  }, [])

  const stopTimer = useCallback((): void => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const start = useCallback((options?: StartOptions): void => {
    setSeconds(0)
    setError(null)
    setOutputPath(null)
    setStatus('recording')
    startTimer()

    // Notify main process (for timestamp tracking and meeting format)
    window.electronAPI.startRecording({
      micDevice: options?.micDevice,
      meetingFormat: options?.meetingFormat as 'auto' | 'sales' | 'standup' | 'team' | 'one_on_one' | 'brainstorm' | undefined,
      calendarEventTitle: options?.calendarEventTitle,
      calendarEventId: options?.calendarEventId
    }).catch(() => { /* ignore */ })

    // Start Web Audio recording
    audioRecorder.start(options?.micDevice).catch((err: unknown) => {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to start recording')
      stopTimer()
    })
  }, [startTimer, stopTimer, audioRecorder])

  const pause = useCallback((): void => {
    setStatus('paused')
    stopTimer()
    audioRecorder.pause()
  }, [stopTimer, audioRecorder])

  const resume = useCallback((): void => {
    setStatus('recording')
    startTimer()
    audioRecorder.resume()
  }, [startTimer, audioRecorder])

  const stop = useCallback((): void => {
    setStatus('processing')
    stopTimer()

    // Stop Web Audio recorder and get the buffer
    audioRecorder.stop().then(async (buffer) => {
      if (!buffer) {
        setStatus('error')
        setError('No audio data recorded')
        return
      }

      // Send buffer to main process for saving + conversion + pipeline
      try {
        const result = await window.electronAPI.saveAudio(buffer, { duration: seconds })
        if (!result) {
          // saveAudio returned empty — error was already sent via IPC events
          // Status will be updated by the onPipelineError listener
        }
      } catch (err: unknown) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Failed to save recording')
      }
    }).catch((err: unknown) => {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to stop recording')
    })
  }, [stopTimer, audioRecorder, seconds])

  const dismiss = useCallback((): void => {
    setStatus('idle')
    setError(null)
    setOutputPath(null)
    setSeconds(0)
  }, [])

  // Listen for status updates from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onRecordingStatus((newStatus: string) => {
      if (newStatus === 'error') {
        setStatus('error')
      } else {
        setStatus(newStatus as RecordingStatus)
      }
      if (newStatus === 'done') {
        stopTimer()
      }
    })
    return cleanup
  }, [stopTimer])

  // Listen for error messages from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onPipelineError((message: string) => {
      setStatus('error')
      setError(message)
    })
    return cleanup
  }, [])

  // Listen for output path from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onOutputReady((path: string) => {
      setOutputPath(path)
    })
    return cleanup
  }, [])

  // Listen for hotkey actions from main process
  useEffect(() => {
    const statusRef = { current: status }
    statusRef.current = status

    const cleanup = window.electronAPI.onHotkeyAction((action: string) => {
      switch (action) {
        case 'record':
          if (statusRef.current === 'idle' || statusRef.current === 'done') start()
          break
        case 'pause':
          if (statusRef.current === 'recording') pause()
          else if (statusRef.current === 'paused') resume()
          break
        case 'stop':
          if (statusRef.current === 'recording' || statusRef.current === 'paused') stop()
          break
      }
    })
    return cleanup
  }, [status, start, pause, resume, stop])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopTimer()
  }, [stopTimer])

  return { status, seconds, error, outputPath, start, pause, resume, stop, dismiss }
}
