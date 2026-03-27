import { useRef, useEffect, useCallback } from 'react'

interface AudioWaveformProps {
  isActive: boolean
  isPaused: boolean
  barCount?: number
  height?: number
}

export function AudioWaveform({ isActive, isPaused, barCount = 24, height = 28 }: AudioWaveformProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataArrayRef = useRef<any>(null)
  const smoothedRef = useRef<number[]>(new Array(barCount).fill(0))

  // Connect to the active audio context for visualization
  useEffect(() => {
    if (!isActive) {
      // Reset smoothed values when not active
      smoothedRef.current = new Array(barCount).fill(0)
      return
    }

    // Try to get audio from active MediaRecorder via the mixed stream
    let audioCtx: AudioContext | null = null
    let micStream: MediaStream | null = null

    const setupAnalyser = async (): Promise<void> => {
      try {
        // Get mic stream for visualization (simpler than tapping into mixed stream)
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        audioCtx = new AudioContext()
        const source = audioCtx.createMediaStreamSource(micStream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 64
        analyser.smoothingTimeConstant = 0.7
        source.connect(analyser)

        analyserRef.current = analyser
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount)
      } catch {
        // If we can't get audio, show simulated waveform
        analyserRef.current = null
      }
    }

    setupAnalyser()
    return () => {
      audioCtx?.close().catch(() => {})
      micStream?.getTracks().forEach(t => t.stop())
      analyserRef.current = null
    }
  }, [isActive, barCount])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth * dpr
    const h = canvas.clientHeight * dpr
    canvas.width = w
    canvas.height = h

    ctx.clearRect(0, 0, w, h)

    const barWidth = (w / barCount) * 0.6
    const gap = (w / barCount) * 0.4

    // Get real audio data or simulate
    let values: number[]
    if (analyserRef.current && dataArrayRef.current && isActive && !isPaused) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current)
      const data = dataArrayRef.current
      // Map frequency bins to bar count
      const binSize = Math.floor(data.length / barCount)
      values = []
      for (let i = 0; i < barCount; i++) {
        let sum = 0
        for (let j = 0; j < binSize; j++) {
          sum += data[i * binSize + j]
        }
        values.push((sum / binSize) / 255)
      }
    } else if (isActive && !isPaused) {
      // Simulated waveform when no analyser
      const time = Date.now() / 1000
      values = []
      for (let i = 0; i < barCount; i++) {
        const base = Math.sin(time * 2 + i * 0.5) * 0.3 + 0.4
        const noise = Math.random() * 0.2
        values.push(Math.min(1, Math.max(0.05, base + noise)))
      }
    } else {
      // Paused or idle — show flat minimal bars
      values = new Array(barCount).fill(0.05)
    }

    // Smooth transitions
    const smoothing = 0.15
    for (let i = 0; i < barCount; i++) {
      smoothedRef.current[i] += (values[i] - smoothedRef.current[i]) * smoothing
    }

    // Draw bars with gradient
    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + gap) + gap / 2
      const barH = Math.max(2 * dpr, smoothedRef.current[i] * h * 0.9)
      const y = (h - barH) / 2

      // Create gradient for each bar
      const gradient = ctx.createLinearGradient(x, y, x, y + barH)
      if (isActive && !isPaused) {
        gradient.addColorStop(0, 'rgba(96, 165, 250, 0.9)')   // blue-400
        gradient.addColorStop(0.5, 'rgba(167, 139, 250, 0.9)') // purple-400
        gradient.addColorStop(1, 'rgba(96, 165, 250, 0.7)')
      } else {
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)')
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.08)')
      }

      ctx.fillStyle = gradient
      ctx.beginPath()
      const radius = Math.min(barWidth / 2, 2 * dpr)
      ctx.roundRect(x, y, barWidth, barH, radius)
      ctx.fill()
    }

    animFrameRef.current = requestAnimationFrame(draw)
  }, [isActive, isPaused, barCount])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height: `${height}px` }}
    />
  )
}
