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

  const cleanup = useCallback(() => {
    // Stop all tracks
    displayStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    mixedStreamRef.current?.getTracks().forEach((t) => t.stop())

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

  const start = useCallback(async (micDeviceId?: string): Promise<void> => {
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
        } catch (micErr) {
          console.warn('[AudioRecorder] Mic capture failed, continuing with system audio only:', micErr)
        }
      }

      // Mix streams using Web Audio API
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
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
        setError('MediaRecorder error')
        setIsRecording(false)
        setIsPaused(false)
        cleanup()
      }

      // Record in 1-second chunks for responsive stop
      recorder.start(1000)
      setIsRecording(true)
      setIsPaused(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start audio capture'
      setError(message)
      cleanup()
      throw err
    }
  }, [cleanup])

  const stop = useCallback(async (): Promise<ArrayBuffer | null> => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      cleanup()
      setIsRecording(false)
      setIsPaused(false)
      return null
    }

    return new Promise<ArrayBuffer | null>((resolve) => {
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' })
        chunksRef.current = []
        cleanup()
        setIsRecording(false)
        setIsPaused(false)

        if (blob.size === 0) {
          resolve(null)
          return
        }

        const buffer = await blob.arrayBuffer()
        resolve(buffer)
      }

      recorder.stop()
    })
  }, [cleanup])

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state === 'recording') {
      recorder.pause()
      setIsPaused(true)
    }
  }, [])

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state === 'paused') {
      recorder.resume()
      setIsPaused(false)
    }
  }, [])

  return { start, stop, pause, resume, isRecording, isPaused, error }
}
