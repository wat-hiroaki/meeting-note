import { spawn, execSync } from 'child_process'
import type { ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'

interface RecorderState {
  process: ChildProcess | null
  segments: string[]
  currentSegment: number
  outputDir: string
  isPaused: boolean
  device: string
}

const state: RecorderState = {
  process: null,
  segments: [],
  currentSegment: 0,
  outputDir: '',
  isPaused: false,
  device: ''
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

  // Try PATH first
  try {
    execSync('ffmpeg -version', { timeout: 3000, stdio: 'pipe', windowsHide: true })
    ffmpegPath = 'ffmpeg'
    return ffmpegPath
  } catch { /* not in PATH */ }

  // Windows: check winget install location
  if (process.platform === 'win32') {
    const wingetBase = join(
      process.env['LOCALAPPDATA'] || '',
      'Microsoft/WinGet/Packages'
    )
    if (existsSync(wingetBase)) {
      try {
        const { readdirSync } = require('fs')
        const dirs = readdirSync(wingetBase) as string[]
        const ffmpegDir = dirs.find((d: string) => d.startsWith('Gyan.FFmpeg'))
        if (ffmpegDir) {
          const binDir = join(wingetBase, ffmpegDir)
          // Search for ffmpeg.exe recursively in the package
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
          const found = findBin(binDir)
          if (found) {
            ffmpegPath = found
            return ffmpegPath
          }
        }
      } catch { /* ignore */ }
    }
  }

  // macOS: check homebrew locations
  if (process.platform === 'darwin') {
    const brewPaths = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']
    for (const p of brewPaths) {
      if (existsSync(p)) {
        ffmpegPath = p
        return ffmpegPath
      }
    }
  }

  // Fallback — will likely fail with ENOENT but gives a clear error
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
    const result = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true
    })
    return isMac ? parseMacDeviceList(result) : parseDeviceList(result)
  } catch (err: unknown) {
    // ffmpeg always exits with error when listing devices
    const output = (err as { stdout?: string; stderr?: string }).stderr || (err as { stdout?: string }).stdout || ''
    return isMac ? parseMacDeviceList(output) : parseDeviceList(output)
  }
}

function parseMacDeviceList(output: string): string[] {
  const devices: string[] = []
  const lines = output.split('\n')
  let isAudio = false

  for (const line of lines) {
    if (line.includes('AVFoundation audio devices:')) {
      isAudio = true
      continue
    }
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

  // ffmpeg v8+ format: "DeviceName" (audio) / "DeviceName" (video)
  // ffmpeg v6-7 format: section header "DirectShow audio devices" then device lines
  let isAudio = false

  for (const line of lines) {
    // v8+ format: match lines with "(audio)" suffix
    const v8Match = line.match(/"([^"]+)"\s*\(audio\)/)
    if (v8Match) {
      devices.push(v8Match[1])
      continue
    }

    // v6-7 format: section-based parsing
    if (line.includes('DirectShow audio devices')) {
      isAudio = true
      continue
    }
    if (line.includes('DirectShow video devices')) {
      isAudio = false
      continue
    }
    if (isAudio && line.includes('"')) {
      const match = line.match(/"([^"]+)"/)
      if (match && !match[1].includes('Alternative name')) {
        devices.push(match[1])
      }
    }
  }

  return devices
}

export function startRecording(device?: string): string {
  // Clean up any leftover files from previous recordings
  const tempDir = getTempDir()
  state.outputDir = tempDir
  state.segments = []
  state.currentSegment = 0
  state.isPaused = false
  state.device = device || 'default'

  return startSegment()
}

function startSegment(): string {
  const segmentPath = join(state.outputDir, `segment_${state.currentSegment}.wav`)
  state.segments.push(segmentPath)

  const device = state.device === 'default' ? getDefaultDevice() : state.device
  const bin = getFfmpegPath()

  console.log('[Recorder] FFmpeg binary:', bin)
  console.log('[Recorder] Audio device:', device)
  console.log('[Recorder] Output path:', segmentPath)

  const args = isMac
    ? [
        '-f', 'avfoundation',
        '-i', `:${device}`,
        '-ac', '1',
        '-ar', '16000',
        '-acodec', 'pcm_s16le',
        '-y',
        segmentPath
      ]
    : [
        '-f', 'dshow',
        '-i', `audio=${device}`,
        '-ac', '1',           // mono
        '-ar', '16000',       // 16kHz for Whisper
        '-acodec', 'pcm_s16le',
        '-y',                 // overwrite
        segmentPath
      ]

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

function getDefaultDevice(): string {
  const devices = getAudioDevices()
  console.log('[Recorder] Available audio devices:', devices)

  if (devices.length === 0) {
    throw new Error('No audio devices found. Please check your microphone connection and permissions.')
  }

  if (isMac) {
    // Prefer BlackHole or Soundflower for system audio loopback on macOS
    const preferred = devices.find(d =>
      d.toLowerCase().includes('blackhole') ||
      d.toLowerCase().includes('soundflower') ||
      d.toLowerCase().includes('loopback')
    )
    return preferred || devices[0]
  }
  // Windows: prefer stereo mix or virtual cable for system audio
  const preferred = devices.find(d =>
    d.toLowerCase().includes('stereo mix') ||
    d.toLowerCase().includes('virtual cable') ||
    d.toLowerCase().includes('wasapi')
  )
  return preferred || devices[0]
}

export function pauseRecording(): void {
  if (!state.process || state.isPaused) return
  state.isPaused = true

  // On Windows we can't SIGSTOP, so we kill the current segment and start a new one on resume
  state.process.stdin?.write('q')
  setTimeout(() => {
    if (state.process && !state.process.killed) {
      state.process.kill('SIGTERM')
    }
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
        if (state.process && !state.process.killed) {
          state.process.kill('SIGTERM')
        }
        resolve()
      }, 2000)

      state.process?.on('close', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
    state.process = null
  }

  // If multiple segments, concatenate them
  if (state.segments.length > 1) {
    return await concatSegments()
  }

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

  // Create concat list file
  const listContent = state.segments
    .filter(s => existsSync(s))
    .map(s => `file '${s.replace(/\\/g, '/')}'`)
    .join('\n')
  writeFileSync(listPath, listContent)

  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), [
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c', 'copy',
      '-y',
      outputPath
    ])

    proc.on('close', (code) => {
      // Cleanup segment files
      state.segments.forEach(s => {
        try { unlinkSync(s) } catch { /* ignore */ }
      })
      try { unlinkSync(listPath) } catch { /* ignore */ }

      if (code === 0) {
        resolve(outputPath)
      } else {
        // If concat fails, return the first segment
        resolve(state.segments[0] || '')
      }
    })

    proc.on('error', (err) => {
      reject(err)
    })
  })
}

export function isRecording(): boolean {
  return state.process !== null && !state.isPaused
}

export function isPaused(): boolean {
  return state.isPaused
}
