import { spawn } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { getConfig } from './config'
import { buildInitialPrompt } from './medical-dictionary'

function getScriptPath(): string {
  if (is.dev) {
    return join(__dirname, '../../scripts/transcribe.py')
  }
  return join(process.resourcesPath, 'scripts/transcribe.py')
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
  speaker?: string
  words?: Array<{ word: string; start: number; end: number; probability: number }>
}

export interface TranscriptResult {
  language: string
  duration: number
  segments: TranscriptSegment[]
  diarized?: boolean
}

// Fetch with timeout — AbortController-based
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

// Retry with exponential backoff for transient errors
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelayMs = 2000,
  retryableCheck?: (err: unknown) => boolean
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < retries) {
        const isRetryable = retryableCheck ? retryableCheck(err) : isTransientError(err)
        if (!isRetryable) throw err

        const delay = baseDelayMs * Math.pow(2, attempt)
        console.warn(`[Transcriber] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, err instanceof Error ? err.message : err)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}

function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return msg.includes('timeout') ||
      msg.includes('429') ||
      msg.includes('500') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('network') ||
      msg.includes('fetch failed')
  }
  return false
}

export async function transcribe(audioPath: string): Promise<TranscriptResult> {
  const config = getConfig()

  // Secure Mode: block cloud transcription
  if (config.secureMode && config.transcription.mode === 'api') {
    throw new Error(
      'Secure Mode is enabled — cloud transcription API is blocked. ' +
      'Switch to "Local (faster-whisper)" in Settings, or disable Secure Mode.'
    )
  }

  switch (config.transcription.mode) {
    case 'api':
      return withRetry(() => transcribeAPI(audioPath))
    case 'remote':
      return transcribeRemote(audioPath)
    default:
      return transcribeLocal(audioPath)
  }
}

async function transcribeLocal(audioPath: string): Promise<TranscriptResult> {
  const config = getConfig()
  const scriptPath = getScriptPath()

  // Check if script exists
  if (!existsSync(scriptPath)) {
    throw new Error(
      `Transcription script not found at ${scriptPath}. ` +
      'Local mode requires Python + faster-whisper. ' +
      'Consider switching to "api" mode in Settings.'
    )
  }

  // Check if Python is available (non-blocking)
  const pythonOk = await new Promise<boolean>((resolve) => {
    const proc = spawn('python', ['--version'], { timeout: 5000, stdio: 'pipe', windowsHide: true })
    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })

  if (!pythonOk) {
    throw new Error(
      'Python is not installed or not in PATH. ' +
      'Local transcription requires Python + faster-whisper. ' +
      'Install Python or switch to "api" mode in Settings.'
    )
  }

  const TRANSCRIBE_TIMEOUT_MS = 600_000 // 10 minutes max for transcription

  return new Promise((resolve, reject) => {
    const args = [
      scriptPath,
      audioPath,
      '--model', config.transcription.model,
      '--language', config.transcription.language,
      '--output', 'json',
      '--diarize'  // Always enable speaker diarization (falls back to simple detection)
    ]

    // Inject medical dictionary as initial_prompt for improved term recognition
    if (config.medical?.enabled) {
      const prompt = buildInitialPrompt(
        config.medical.specialties || ['general'],
        config.medical.customTerms
      )
      if (prompt) {
        args.push('--initial-prompt', prompt)
      }
    }

    const proc = spawn('python', args, {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    })

    let settled = false
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        proc.kill('SIGKILL')
        reject(new Error('Transcription timed out after 10 minutes. The audio file may be too large or the model may be stuck.'))
      }
    }, TRANSCRIBE_TIMEOUT_MS)

    // Collect raw Buffer chunks to avoid splitting multi-byte UTF-8 characters
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    proc.stdout.on('data', (data: Buffer) => {
      stdoutChunks.push(data)
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderrChunks.push(data)
    })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)

      const stdout = Buffer.concat(stdoutChunks).toString('utf-8')
      const stderr = Buffer.concat(stderrChunks).toString('utf-8')

      console.log('[Transcriber] Process exited with code:', code)
      console.log('[Transcriber] stdout length:', stdout.length, 'stderr length:', stderr.length)

      // The Python script outputs JSON to stdout. Sometimes warnings appear
      // before the JSON on separate lines, so try parsing the last line first.
      const stdoutTrimmed = stdout.trim()
      let jsonStr = stdoutTrimmed

      // Try to find the JSON line (starts with '{')
      if (stdoutTrimmed && !stdoutTrimmed.startsWith('{')) {
        const lines = stdoutTrimmed.split('\n')
        const jsonLine = lines.findLast(l => l.trim().startsWith('{'))
        if (jsonLine) jsonStr = jsonLine.trim()
      }

      if (jsonStr) {
        try {
          const result = JSON.parse(jsonStr) as TranscriptResult | { error: string }
          if ('error' in result) {
            // Script returned a structured error (e.g. faster-whisper not installed)
            const msg = result.error
            if (msg.includes('faster-whisper') || msg.includes('faster_whisper')) {
              reject(new Error(
                'faster-whisper is not installed.\nRun: pip install faster-whisper\nOr switch to "api" mode in Settings.'
              ))
            } else {
              reject(new Error(msg))
            }
            return
          }
          if (code === 0) {
            resolve(result as TranscriptResult)
            return
          }
        } catch {
          // stdout wasn't valid JSON, fall through to stderr check
        }
      }

      if (code !== 0) {
        const errMsg = stderr.trim()
        if (errMsg.includes('No module named')) {
          reject(new Error(
            'faster-whisper is not installed.\nRun: pip install faster-whisper\nOr switch to "api" mode in Settings.'
          ))
        } else {
          reject(new Error(`Transcription failed: ${errMsg || stdout.trim() || `exit code ${code}`}`))
        }
        return
      }

      reject(new Error('Transcription produced no output'))
    })

    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)

      if (err.message.includes('ENOENT')) {
        reject(new Error(
          'Python is not installed or not in PATH. ' +
          'Install Python or switch to "api" mode in Settings.'
        ))
      } else {
        reject(new Error(`Failed to start transcription: ${err.message}`))
      }
    })
  })
}

async function transcribeRemote(audioPath: string): Promise<TranscriptResult> {
  const config = getConfig()
  const { host, user, pythonPath, scriptPath } = config.transcription.remote

  if (!host || !user) {
    throw new Error('Remote transcription requires host and user in config')
  }

  const remoteAudioPath = `/tmp/meeting-note-${Date.now()}.wav`
  const sshTarget = `${user}@${host}`

  // 1. SCP upload (async, non-blocking)
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('scp', [audioPath, `${sshTarget}:${remoteAudioPath}`], {
      windowsHide: true
    })

    let settled = false
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        proc.kill('SIGKILL')
        reject(new Error(`SCP upload to ${host} timed out. Check SSH connection.`))
      }
    }, 120_000)

    const stderrChunks: Buffer[] = []
    proc.stderr?.on('data', (data: Buffer) => stderrChunks.push(data))

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (code === 0) {
        resolve()
      } else {
        const stderr = Buffer.concat(stderrChunks).toString('utf-8')
        reject(new Error(`SCP upload failed (code ${code}): ${stderr.slice(-300)}`))
      }
    })

    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(new Error(`SCP upload failed: ${err.message}`))
    })
  })

  // 2. SSH execute (async, non-blocking)
  const output = await new Promise<string>((resolve, reject) => {
    // Shell-escape all user-provided values to prevent injection
    const shellEscape = (s: string): string => "'" + s.replace(/'/g, "'\\''") + "'"
    const cmd = `${shellEscape(pythonPath)} ${shellEscape(scriptPath)} ${shellEscape(remoteAudioPath)} --model ${shellEscape(config.transcription.model)} --language ${shellEscape(config.transcription.language)} --output json`

    const proc = spawn('ssh', [sshTarget, cmd], {
      windowsHide: true
    })

    let settled = false
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        proc.kill('SIGKILL')
        reject(new Error('Remote transcription timed out after 10 minutes.'))
      }
    }, 600_000)

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    proc.stdout?.on('data', (data: Buffer) => stdoutChunks.push(data))
    proc.stderr?.on('data', (data: Buffer) => stderrChunks.push(data))

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString('utf-8'))
      } else {
        const stderr = Buffer.concat(stderrChunks).toString('utf-8')
        reject(new Error(`Remote transcription failed (code ${code}): ${stderr.slice(-300)}`))
      }
    })

    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(new Error(`SSH execution failed: ${err.message}`))
    })
  })

  // 3. Cleanup remote file (fire-and-forget)
  const cleanupProc = spawn('ssh', [sshTarget, `rm -f ${remoteAudioPath}`], { windowsHide: true })
  cleanupProc.on('error', () => { /* ignore cleanup errors */ })

  // 4. Parse result
  const trimmed = output.trim()
  let jsonStr = trimmed
  if (trimmed && !trimmed.startsWith('{')) {
    const lines = trimmed.split('\n')
    const jsonLine = lines.findLast(l => l.trim().startsWith('{'))
    if (jsonLine) jsonStr = jsonLine.trim()
  }

  try {
    const result = JSON.parse(jsonStr) as TranscriptResult | { error: string }
    if ('error' in result) {
      throw new Error(`Remote transcription: ${result.error}`)
    }
    return result as TranscriptResult
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Remote transcription returned invalid JSON: ${trimmed.slice(0, 200)}`)
    }
    throw err
  }
}

async function transcribeAPI(audioPath: string): Promise<TranscriptResult> {
  const config = getConfig()
  const { apiKey, model } = config.transcription.api

  if (!apiKey) {
    throw new Error('OpenAI API key is required for API transcription mode. Set transcription.api.apiKey in config.')
  }

  const fs = await import('fs')

  // Validate file before uploading
  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`)
  }

  const fileBuffer = fs.readFileSync(audioPath)
  if (fileBuffer.length === 0) {
    throw new Error('Audio file is empty. Recording may have failed.')
  }

  // Whisper API has a 25MB limit
  const fileSizeMB = fileBuffer.length / (1024 * 1024)
  if (fileSizeMB > 25) {
    throw new Error(`Audio file is ${fileSizeMB.toFixed(1)}MB — exceeds Whisper API's 25MB limit. Use local transcription for large files.`)
  }

  const formData = new FormData()
  const blob = new Blob([fileBuffer], { type: 'audio/wav' })
  formData.append('file', blob, 'recording.wav')
  formData.append('model', model)
  formData.append('response_format', 'verbose_json')
  formData.append('timestamp_granularities[]', 'segment')

  if (config.transcription.language !== 'auto') {
    formData.append('language', config.transcription.language)
  }

  // Inject medical dictionary as prompt hint for improved term recognition
  if (config.medical?.enabled) {
    const prompt = buildInitialPrompt(
      config.medical.specialties || ['general'],
      config.medical.customTerms
    )
    if (prompt) {
      formData.append('prompt', prompt)
    }
  }

  const API_TIMEOUT_MS = 300_000 // 5 minutes for API transcription

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    },
    API_TIMEOUT_MS
  )

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    if (response.status === 429) {
      throw new Error(`OpenAI API rate limited (429). Please wait and try again. ${errorText}`)
    }
    if (response.status >= 500) {
      throw new Error(`OpenAI API server error (${response.status}). ${errorText}`)
    }
    throw new Error(`OpenAI Whisper API failed (${response.status}): ${errorText}`)
  }

  const data = await response.json() as {
    language: string
    duration: number
    segments?: Array<{ start: number; end: number; text: string }>
    text: string
  }

  return {
    language: data.language || config.transcription.language,
    duration: data.duration || 0,
    segments: data.segments?.map(s => ({
      start: Math.round((s.start ?? 0) * 100) / 100,
      end: Math.round((s.end ?? 0) * 100) / 100,
      text: (s.text ?? '').trim()
    })) || [{ start: 0, end: data.duration || 0, text: data.text }]
  }
}
