import { spawn, execSync } from 'child_process'
import type { ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from 'fs'

interface RecorderState {
  process: ChildProcess | null
  segments: string[]
  currentSegment: number
  outputDir: string
  isPaused: boolean
  micDevice: string
  systemDevice: string
}

const state: RecorderState = {
  process: null,
  segments: [],
  currentSegment: 0,
  outputDir: '',
  isPaused: false,
  micDevice: '',
  systemDevice: ''
}

function getTempDir(): string {
  const dir = join(app.getPath('temp'), 'meeting-note')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

// Resolve ffmpeg binary — check PATH first, then known install locations
let ffmpegPath: string | null = null
function getFfmpegPath(): string {
  if (ffmpegPath) return ffmpegPath

  try {
    execSync('ffmpeg -version', { timeout: 3000, stdio: 'pipe', windowsHide: true })
    ffmpegPath = 'ffmpeg'
    return ffmpegPath
  } catch { /* not in PATH */ }

  if (process.platform === 'win32') {
    const wingetBase = join(process.env['LOCALAPPDATA'] || '', 'Microsoft/WinGet/Packages')
    if (existsSync(wingetBase)) {
      try {
        const dirs = readdirSync(wingetBase) as string[]
        const ffmpegDir = dirs.find((d: string) => d.startsWith('Gyan.FFmpeg'))
        if (ffmpegDir) {
          const findBin = (dir: string): string | null => {
            const entries = readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
              const fullPath = join(dir, entry.name)
              if (entry.isFile() && entry.name === 'ffmpeg.exe') return fullPath
              if (entry.isDirectory()) {
                const found = findBin(fullPath)
                if (found) return found
              }
            }
            return null
          }
          const found = findBin(join(wingetBase, ffmpegDir))
          if (found) { ffmpegPath = found; return ffmpegPath }
        }
      } catch { /* ignore */ }
    }
  }

  if (process.platform === 'darwin') {
    for (const p of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
      if (existsSync(p)) { ffmpegPath = p; return ffmpegPath }
    }
  }

  ffmpegPath = 'ffmpeg'
  return ffmpegPath
}

const isMac = process.platform === 'darwin'

export function getAudioDevices(): string[] {
  try {
    const bin = getFfmpegPath()
    const cmd = isMac
      ? `"${bin}" -f avfoundation -list_devices true -i "" 2>&1`
      : `"${bin}" -list_devices true -f dshow -i dummy 2>&1`
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000, windowsHide: true })
    return isMac ? parseMacDeviceList(result) : parseDeviceList(result)
  } catch (err: unknown) {
    const output = (err as { stdout?: string; stderr?: string }).stderr || (err as { stdout?: string }).stdout || ''
    return isMac ? parseMacDeviceList(output) : parseDeviceList(output)
  }
}

function parseMacDeviceList(output: string): string[] {
  const devices: string[] = []
  const lines = output.split('\n')
  let isAudio = false
  for (const line of lines) {
    if (line.includes('AVFoundation audio devices:')) { isAudio = true; continue }
    if (isAudio && line.includes('AVFoundation video devices:')) break
    if (isAudio) {
      const match = line.match(/\[(\d+)] (.+)/)
      if (match) devices.push(match[2].trim())
    }
  }
  return devices
}

function parseDeviceList(output: string): string[] {
  const devices: string[] = []
  const lines = output.split('\n')
  let isAudio = false
  for (const line of lines) {
    const v8Match = line.match(/"([^"]+)"\s*\(audio\)/)
    if (v8Match) { devices.push(v8Match[1]); continue }
    if (line.includes('DirectShow audio devices')) { isAudio = true; continue }
    if (line.includes('DirectShow video devices')) { isAudio = false; continue }
    if (isAudio && line.includes('"')) {
      const match = line.match(/"([^"]+)"/)
      if (match && !match[1].includes('Alternative name')) devices.push(match[1])
    }
  }
  return devices
}

interface RecordingOptions {
  micDevice?: string
  systemDevice?: string
}

export function startRecording(options?: RecordingOptions): string {
  const tempDir = getTempDir()
  state.outputDir = tempDir
  state.segments = []
  state.currentSegment = 0
  state.isPaused = false
  state.micDevice = options?.micDevice || 'default'
  state.systemDevice = options?.systemDevice || 'none'

  return startSegment()
}

function resolveMicDevice(): string {
  if (state.micDevice !== 'default') return state.micDevice
  const devices = getAudioDevices()
  console.log('[Recorder] Available audio devices:', devices)
  if (devices.length === 0) {
    throw new Error('No audio devices found. Please check your microphone connection and permissions.')
  }
  // Pick first mic-like device
  return devices[0]
}

function startSegment(): string {
  const segmentPath = join(state.outputDir, `segment_${state.currentSegment}.wav`)
  state.segments.push(segmentPath)

  const micDevice = resolveMicDevice()
  const systemDevice = state.systemDevice
  const bin = getFfmpegPath()
  const hasMic = micDevice && micDevice !== 'none'
  const hasSystem = systemDevice && systemDevice !== 'none'

  console.log('[Recorder] FFmpeg binary:', bin)
  console.log('[Recorder] Mic device:', micDevice)
  console.log('[Recorder] System device:', systemDevice)
  console.log('[Recorder] Output path:', segmentPath)

  let args: string[]

  if (isMac) {
    if (hasMic && hasSystem) {
      // macOS: two avfoundation inputs + amix
      args = [
        '-f', 'avfoundation', '-i', `:${micDevice}`,
        '-f', 'avfoundation', '-i', `:${systemDevice}`,
        '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest[out]',
        '-map', '[out]',
        '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le', '-y', segmentPath
      ]
    } else {
      const device = hasMic ? micDevice : systemDevice
      args = ['-f', 'avfoundation', '-i', `:${device}`,
        '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le', '-y', segmentPath]
    }
  } else {
    // Windows
    if (hasMic && hasSystem) {
      // Two dshow inputs + amix filter to merge mic + system audio
      args = [
        '-f', 'dshow', '-i', `audio=${micDevice}`,
        '-f', 'dshow', '-i', `audio=${systemDevice}`,
        '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest[out]',
        '-map', '[out]',
        '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le', '-y', segmentPath
      ]
    } else {
      const device = hasMic ? micDevice : systemDevice
      args = ['-f', 'dshow', '-i', `audio=${device}`,
        '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le', '-y', segmentPath]
    }
  }

  state.process = spawn(bin, args)

  state.process.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString()
    if (msg.includes('Error') || msg.includes('error')) {
      console.error('[Recorder] FFmpeg error:', msg)
    }
  })

  state.process.on('close', (code) => {
    console.log(`[Recorder] FFmpeg segment ${state.currentSegment} exited with code ${code}`)
  })

  state.process.on('error', (err) => {
    console.error('[Recorder] FFmpeg spawn error:', err.message)
    state.process = null
  })

  return segmentPath
}

export function pauseRecording(): void {
  if (!state.process || state.isPaused) return
  state.isPaused = true
  state.process.stdin?.write('q')
  setTimeout(() => {
    if (state.process && !state.process.killed) state.process.kill('SIGTERM')
    state.process = null
  }, 500)
}

export function resumeRecording(): void {
  if (!state.isPaused) return
  state.isPaused = false
  state.currentSegment++
  startSegment()
}

export async function stopRecording(): Promise<string> {
  if (state.process) {
    state.process.stdin?.write('q')
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (state.process && !state.process.killed) state.process.kill('SIGTERM')
        resolve()
      }, 2000)
      state.process?.on('close', () => { clearTimeout(timeout); resolve() })
    })
    state.process = null
  }

  if (state.segments.length > 1) return await concatSegments()

  const outputPath = state.segments[0] || ''
  if (outputPath && !existsSync(outputPath)) {
    console.error('[Recorder] Recording file not found:', outputPath)
    throw new Error(`Recording failed: audio file was not created at ${outputPath}`)
  }
  return outputPath
}

async function concatSegments(): Promise<string> {
  const outputPath = join(state.outputDir, 'recording.wav')
  const listPath = join(state.outputDir, 'segments.txt')
  const listContent = state.segments
    .filter(s => existsSync(s))
    .map(s => `file '${s.replace(/\\/g, '/')}'`)
    .join('\n')
  writeFileSync(listPath, listContent)

  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), [
      '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-y', outputPath
    ])
    proc.on('close', (code) => {
      state.segments.forEach(s => { try { unlinkSync(s) } catch { /* ignore */ } })
      try { unlinkSync(listPath) } catch { /* ignore */ }
      if (code === 0) resolve(outputPath)
      else resolve(state.segments[0] || '')
    })
    proc.on('error', (err) => reject(err))
  })
}

export function isRecording(): boolean {
  return state.process !== null && !state.isPaused
}

export function isPaused(): boolean {
  return state.isPaused
}
