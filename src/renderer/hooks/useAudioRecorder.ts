import { useState, useRef, useCallback } from 'react'

interface UseAudioRecorderReturn {
  start: (micDeviceId?: string) => Promise<void>
  stop: () => Promise<ArrayBuffer | null>
  pause: () => void
  resume: () => void
  isRecording: boolean
  isPaused: boolean
  error: string | null
}

// Safety: max recording duration 4 hours to prevent runaway recordings
const MAX_RECORDING_MS = 4 * 60 * 60 * 1000
// Safety: stop() must resolve within 10 seconds
const STOP_TIMEOUT_MS = 10_000

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const displayStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const mixedStreamRef = useRef<MediaStream | null>(null)
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onStopCallbackRef = useRef<((buffer: ArrayBuffer | null) => void) | null>(null)

  const cleanup = useCallback(() => {
    // Clear max duration timer
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current)
      maxDurationTimerRef.current = null
    }

    // Stop all tracks safely
    try {
      displayStreamRef.current?.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
    } catch { /* ignore */ }
    try {
      micStreamRef.current?.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
    } catch { /* ignore */ }
    try {
      mixedStreamRef.current?.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
    } catch { /* ignore */ }

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => { /* ignore */ })
    }

    displayStreamRef.current = null
    micStreamRef.current = null
    mixedStreamRef.current = null
    audioContextRef.current = null
    mediaRecorderRef.current = null
  }, [])

  // Force-collect current chunks into a buffer (used for emergency recovery)
  const collectBuffer = useCallback(async (): Promise<ArrayBuffer | null> => {
    const chunks = chunksRef.current
    chunksRef.current = []
    if (chunks.length === 0) return null

    const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' })
    if (blob.size === 0) return null

    try {
      return await blob.arrayBuffer()
    } catch {
      return null
    }
  }, [])

  const startingRef = useRef(false)

  const start = useCallback(async (micDeviceId?: string): Promise<void> => {
    // Prevent concurrent start calls
    if (mediaRecorderRef.current || startingRef.current) {
      console.warn('[AudioRecorder] Recording already in progress, ignoring start()')
      return
    }
    startingRef.current = true

    setError(null)
    chunksRef.current = []

    try {
      // Get system audio via getDisplayMedia (Electron auto-approves via setDisplayMediaRequestHandler)
      // video: true is required by the API, but we only need audio
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      })
      displayStreamRef.current = displayStream

      // Stop the video track immediately — we only need audio
      const videoTracks = displayStream.getVideoTracks()
      videoTracks.forEach((t) => t.stop())

      // Check if we got audio from display media
      const displayAudioTracks = displayStream.getAudioTracks()
      if (displayAudioTracks.length === 0) {
        throw new Error('Failed to capture system audio. Loopback audio not available.')
      }

      // Monitor display audio track for unexpected end (e.g. system audio device disconnected)
      displayAudioTracks.forEach((track) => {
        track.onended = () => {
          console.warn('[AudioRecorder] System audio track ended unexpectedly')
          // If we're still recording, trigger an error-aware stop
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            setError('System audio track ended unexpectedly. Recording stopped.')
            // Force stop the recorder — this will trigger onstop and save what we have
            try { mediaRecorderRef.current.stop() } catch { /* ignore */ }
          }
        }
      })

      // Get microphone audio
      const micConstraints: MediaStreamConstraints = {
        audio: micDeviceId && micDeviceId !== 'default' && micDeviceId !== 'none'
          ? { deviceId: { exact: micDeviceId } }
          : micDeviceId === 'none'
            ? false
            : true
      }

      let micStream: MediaStream | null = null
      if (micConstraints.audio !== false) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia(micConstraints)
          micStreamRef.current = micStream

          // Monitor mic track for unexpected end
          micStream.getAudioTracks().forEach((track) => {
            track.onended = () => {
              console.warn('[AudioRecorder] Mic track ended — continuing with system audio only')
              // Don't stop recording, just log. System audio continues.
            }
          })
        } catch (micErr) {
          console.warn('[AudioRecorder] Mic capture failed, continuing with system audio only:', micErr)
        }
      }

      // Mix streams using Web Audio API
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      // Handle AudioContext suspension (can happen on some systems)
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const destination = audioContext.createMediaStreamDestination()

      // Add system audio source
      const systemSource = audioContext.createMediaStreamSource(
        new MediaStream(displayAudioTracks)
      )
      systemSource.connect(destination)

      // Add mic source if available
      if (micStream) {
        const micSource = audioContext.createMediaStreamSource(micStream)
        micSource.connect(destination)
      }

      const mixedStream = destination.stream
      mixedStreamRef.current = mixedStream

      // Create MediaRecorder
      const mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        throw new Error('audio/webm;codecs=opus is not supported in this browser')
      }

      const recorder = new MediaRecorder(mixedStream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        console.error('[AudioRecorder] MediaRecorder error event')
        setError('Recording error — audio data may be incomplete')
        setIsRecording(false)
        setIsPaused(false)

        // Try to resolve any pending stop() promise with what we have
        if (onStopCallbackRef.current) {
          collectBuffer().then(buf => {
            onStopCallbackRef.current?.(buf)
            onStopCallbackRef.current = null
          })
        }

        cleanup()
      }

      // When onstop fires (from .stop() or track ended), collect data
      recorder.onstop = async () => {
        const buffer = await collectBuffer()
        setIsRecording(false)
        setIsPaused(false)
        cleanup()

        // Resolve the pending stop() promise if there is one
        if (onStopCallbackRef.current) {
          onStopCallbackRef.current(buffer)
          onStopCallbackRef.current = null
        }
      }

      // Safety: max recording duration
      maxDurationTimerRef.current = setTimeout(() => {
        console.warn('[AudioRecorder] Max recording duration reached, auto-stopping')
        setError('Recording reached maximum duration (4 hours) and was stopped automatically.')
        if (recorder.state !== 'inactive') {
          try { recorder.stop() } catch { /* ignore */ }
        }
      }, MAX_RECORDING_MS)

      // Record in 1-second chunks for responsive stop
      recorder.start(1000)
      setIsRecording(true)
      setIsPaused(false)
      startingRef.current = false
    } catch (err) {
      startingRef.current = false
      const message = err instanceof Error ? err.message : 'Failed to start audio capture'
      setError(message)
      cleanup()
      throw err
    }
  }, [cleanup, collectBuffer])

  const stop = useCallback(async (): Promise<ArrayBuffer | null> => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      // No active recorder — try to collect any existing chunks
      const buffer = await collectBuffer()
      cleanup()
      setIsRecording(false)
      setIsPaused(false)
      return buffer
    }

    return new Promise<ArrayBuffer | null>((resolve) => {
      // Set up the callback that onstop will use
      onStopCallbackRef.current = resolve

      // Safety timeout: if onstop doesn't fire within STOP_TIMEOUT_MS, force-resolve
      const safetyTimeout = setTimeout(async () => {
        console.warn('[AudioRecorder] stop() timed out — force-collecting chunks')
        onStopCallbackRef.current = null
        const buffer = await collectBuffer()
        cleanup()
        setIsRecording(false)
        setIsPaused(false)
        resolve(buffer)
      }, STOP_TIMEOUT_MS)

      // Override the callback to also clear the safety timeout
      const originalResolve = resolve
      onStopCallbackRef.current = (buffer) => {
        clearTimeout(safetyTimeout)
        originalResolve(buffer)
      }

      try {
        recorder.stop()
      } catch {
        // recorder.stop() threw — force-collect
        clearTimeout(safetyTimeout)
        onStopCallbackRef.current = null
        collectBuffer().then(buf => {
          cleanup()
          setIsRecording(false)
          setIsPaused(false)
          resolve(buf)
        })
      }
    })
  }, [cleanup, collectBuffer])

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.pause()
        setIsPaused(true)
      } catch (err) {
        console.error('[AudioRecorder] pause() failed:', err)
      }
    }
  }, [])

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state === 'paused') {
      try {
        recorder.resume()
        setIsPaused(false)
      } catch (err) {
        console.error('[AudioRecorder] resume() failed:', err)
      }
    }

    // Also resume AudioContext if suspended
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => { /* ignore */ })
    }
  }, [])

  return { start, stop, pause, resume, isRecording, isPaused, error }
}
