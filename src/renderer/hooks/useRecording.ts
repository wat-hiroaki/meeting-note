import { useState, useRef, useCallback, useEffect } from 'react'
import type { RecordingStatus } from '../components/StatusIndicator'

interface UseRecordingReturn {
  status: RecordingStatus
  seconds: number
  error: string | null
  outputPath: string | null
  start: () => void
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

  const start = useCallback((options?: { micDevice?: string; systemDevice?: string }): void => {
    setSeconds(0)
    setError(null)
    setOutputPath(null)
    setStatus('recording')
    startTimer()
    window.electronAPI.startRecording(options).catch((err: unknown) => {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to start recording')
      stopTimer()
    })
  }, [startTimer, stopTimer])

  const pause = useCallback((): void => {
    setStatus('paused')
    stopTimer()
    window.electronAPI.pauseRecording().catch(console.error)
  }, [stopTimer])

  const resume = useCallback((): void => {
    setStatus('recording')
    startTimer()
    window.electronAPI.resumeRecording().catch(console.error)
  }, [startTimer])

  const stop = useCallback((): void => {
    setStatus('processing')
    stopTimer()
    window.electronAPI.stopRecording().catch((err: unknown) => {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to stop recording')
    })
  }, [stopTimer])

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
