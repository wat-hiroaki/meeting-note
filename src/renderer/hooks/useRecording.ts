import { useState, useRef, useCallback, useEffect } from 'react'
import type { RecordingStatus } from '../components/StatusIndicator'

interface UseRecordingReturn {
  status: RecordingStatus
  seconds: number
  start: () => void
  pause: () => void
  resume: () => void
  stop: () => void
}

export function useRecording(): UseRecordingReturn {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [seconds, setSeconds] = useState(0)
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

  const start = useCallback((): void => {
    setSeconds(0)
    setStatus('recording')
    startTimer()
    window.electronAPI.startRecording().catch(console.error)
  }, [startTimer])

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
    window.electronAPI.stopRecording().catch(console.error)
  }, [stopTimer])

  // Listen for status updates from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onRecordingStatus((newStatus: string) => {
      setStatus(newStatus as RecordingStatus)
      if (newStatus === 'done') {
        stopTimer()
      }
    })
    return cleanup
  }, [stopTimer])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopTimer()
  }, [stopTimer])

  return { status, seconds, start, pause, resume, stop }
}
