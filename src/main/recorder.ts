import { spawn, execSync } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs'

function getTempDir(): string {
  const dir = join(app.getPath('temp'), 'meeting-note')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Clean up stale temp files from previous sessions (older than 24 hours).
 * Called at app startup to prevent unbounded disk usage.
 */
export function cleanupStaleTempFiles(): void {
  try {
    const dir = getTempDir()
    const entries = readdirSync(dir)
    const now = Date.now()
    const MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      try {
        const stats = statSync(fullPath)
        if (now - stats.mtimeMs > MAX_AGE_MS) {
          unlinkSync(fullPath)
          console.log('[Recorder] Cleaned up stale temp file:', entry)
        }
      } catch { /* ignore individual file errors */ }
    }
  } catch { /* ignore if temp dir doesn't exist yet */ }
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
 * Validates the buffer has meaningful data before saving.
 */
export function saveAudioBuffer(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) {
    throw new Error('Empty audio buffer — no audio data was recorded.')
  }

  // Minimum viable WebM file is ~100 bytes (header only)
  if (buffer.length < 100) {
    throw new Error(`Audio buffer too small (${buffer.length} bytes) — recording may have failed.`)
  }

  const tempDir = getTempDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = join(tempDir, `recording_${timestamp}.webm`)

  try {
    writeFileSync(filePath, buffer)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    throw new Error(`Failed to save audio file: ${msg}. Check disk space.`)
  }

  console.log('[Recorder] Saved webm:', filePath, 'size:', buffer.length)
  return filePath
}

/**
 * Convert a webm file to 16kHz mono WAV (for Whisper compatibility).
 * Validates both input and output files.
 */
export async function convertWebmToWav(webmPath: string): Promise<string> {
  // Validate input file
  if (!existsSync(webmPath)) {
    throw new Error(`Input audio file not found: ${webmPath}`)
  }

  const inputStats = statSync(webmPath)
  if (inputStats.size === 0) {
    throw new Error('Input audio file is empty (0 bytes). Recording may have failed.')
  }

  const wavPath = webmPath.replace(/\.webm$/, '.wav')
  const bin = getFfmpegPath()

  const FFMPEG_TIMEOUT_MS = 120_000 // 2 minutes max for conversion

  return new Promise((resolve, reject) => {
    const proc = spawn(bin, [
      '-i', webmPath,
      '-ac', '1',
      '-ar', '16000',
      '-acodec', 'pcm_s16le',
      '-y', wavPath
    ], { windowsHide: true })

    let stderr = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        proc.kill('SIGKILL')
        console.error('[Recorder] FFmpeg timed out after', FFMPEG_TIMEOUT_MS, 'ms')
        reject(new Error('FFmpeg conversion timed out. The recording may be too large or corrupt.'))
      }
    }, FFMPEG_TIMEOUT_MS)

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)

      if (code !== 0) {
        console.error('[Recorder] FFmpeg conversion failed (code', code, '):', stderr.slice(-500))
        reject(new Error(`FFmpeg conversion failed (code ${code}). Audio may be corrupt.`))
        return
      }

      // Validate output file
      if (!existsSync(wavPath)) {
        reject(new Error('FFmpeg produced no output file. Conversion failed.'))
        return
      }

      const outputStats = statSync(wavPath)
      if (outputStats.size < 44) {
        // WAV header alone is 44 bytes — anything less is invalid
        reject(new Error('FFmpeg produced an empty WAV file. The input audio may be corrupt or silent.'))
        return
      }

      console.log('[Recorder] Converted to WAV:', wavPath, 'size:', outputStats.size)

      // Clean up the source webm file after successful conversion
      try { unlinkSync(webmPath) } catch { /* ignore cleanup errors */ }

      resolve(wavPath)
    })

    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)

      if (err.message.includes('ENOENT')) {
        reject(new Error(
          'FFmpeg not found. Install FFmpeg to process recordings.\n' +
          (process.platform === 'darwin' ? 'Run: brew install ffmpeg' : 'Run: winget install Gyan.FFmpeg')
        ))
      } else {
        console.error('[Recorder] FFmpeg spawn error:', err.message)
        reject(new Error(`FFmpeg error: ${err.message}`))
      }
    })
  })
}
