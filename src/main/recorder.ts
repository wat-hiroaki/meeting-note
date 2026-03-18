import { spawn, execSync } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs'

function getTempDir(): string {
  const dir = join(app.getPath('temp'), 'meeting-note')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

// Resolve ffmpeg binary — check PATH first, then known install locations
let ffmpegPathCache: string | null = null
export function getFfmpegPath(): string {
  if (ffmpegPathCache) return ffmpegPathCache

  try {
    execSync('ffmpeg -version', { timeout: 3000, stdio: 'pipe', windowsHide: true })
    ffmpegPathCache = 'ffmpeg'
    return ffmpegPathCache
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
          if (found) { ffmpegPathCache = found; return ffmpegPathCache }
        }
      } catch { /* ignore */ }
    }
  }

  if (process.platform === 'darwin') {
    for (const p of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
      if (existsSync(p)) { ffmpegPathCache = p; return ffmpegPathCache }
    }
  }

  ffmpegPathCache = 'ffmpeg'
  return ffmpegPathCache
}

/**
 * Save a webm audio buffer from the renderer to a temp file.
 */
export function saveAudioBuffer(buffer: Buffer): string {
  const tempDir = getTempDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = join(tempDir, `recording_${timestamp}.webm`)
  writeFileSync(filePath, buffer)
  console.log('[Recorder] Saved webm:', filePath, 'size:', buffer.length)
  return filePath
}

/**
 * Convert a webm file to 16kHz mono WAV (for Whisper compatibility).
 */
export async function convertWebmToWav(webmPath: string): Promise<string> {
  const wavPath = webmPath.replace(/\.webm$/, '.wav')
  const bin = getFfmpegPath()

  return new Promise((resolve, reject) => {
    const proc = spawn(bin, [
      '-i', webmPath,
      '-ac', '1',
      '-ar', '16000',
      '-acodec', 'pcm_s16le',
      '-y', wavPath
    ], { windowsHide: true })

    let stderr = ''
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0 && existsSync(wavPath)) {
        console.log('[Recorder] Converted to WAV:', wavPath)
        resolve(wavPath)
      } else {
        console.error('[Recorder] FFmpeg conversion failed (code', code, '):', stderr.slice(-500))
        reject(new Error(`FFmpeg conversion failed with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      console.error('[Recorder] FFmpeg spawn error:', err.message)
      reject(err)
    })
  })
}
