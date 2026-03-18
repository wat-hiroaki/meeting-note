import { spawn, execSync } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { getConfig } from './config'

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export interface TranscriptResult {
  language: string
  duration: number
  segments: TranscriptSegment[]
}

export async function transcribe(audioPath: string): Promise<TranscriptResult> {
  const config = getConfig()

  switch (config.transcription.mode) {
    case 'api':
      return transcribeAPI(audioPath)
    case 'remote':
      return transcribeRemote(audioPath)
    default:
      return transcribeLocal(audioPath)
  }
}

async function transcribeLocal(audioPath: string): Promise<TranscriptResult> {
  const config = getConfig()
  const scriptPath = join(__dirname, '../../scripts/transcribe.py')

  // Check if script exists
  if (!existsSync(scriptPath)) {
    throw new Error(
      `Transcription script not found at ${scriptPath}. ` +
      'Local mode requires Python + faster-whisper. ' +
      'Consider switching to "api" mode in Settings.'
    )
  }

  // Check if Python is available
  try {
    execSync('python --version', { timeout: 5000, stdio: 'pipe', windowsHide: true })
  } catch {
    throw new Error(
      'Python is not installed or not in PATH. ' +
      'Local transcription requires Python + faster-whisper. ' +
      'Install Python or switch to "api" mode in Settings.'
    )
  }

  return new Promise((resolve, reject) => {
    const args = [
      scriptPath,
      audioPath,
      '--model', config.transcription.model,
      '--language', config.transcription.language,
      '--output', 'json'
    ]

    const proc = spawn('python', args)
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      // The Python script outputs JSON errors to stdout, so check stdout first
      if (stdout.trim()) {
        try {
          const result = JSON.parse(stdout) as TranscriptResult | { error: string }
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

  try {
    // 1. SCP upload
    execSync(`scp "${audioPath}" "${sshTarget}:${remoteAudioPath}"`, {
      timeout: 120000
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    throw new Error(`Remote transcription: failed to upload audio file via SCP. Check SSH connection to ${host}. ${msg}`)
  }

  let output: string
  try {
    // 2. SSH execute
    const cmd = `${pythonPath} ${scriptPath} "${remoteAudioPath}" --model ${config.transcription.model} --language ${config.transcription.language} --output json`

    output = execSync(`ssh "${sshTarget}" "${cmd}"`, {
      encoding: 'utf-8',
      timeout: 600000 // 10 min for large files
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    throw new Error(`Remote transcription: script execution failed on ${host}. Check that Python and the transcription script are available. ${msg}`)
  }

  // 3. Cleanup remote file
  try {
    execSync(`ssh "${sshTarget}" "rm -f ${remoteAudioPath}"`, { timeout: 10000 })
  } catch { /* ignore cleanup errors */ }

  // 4. Parse result
  const result = JSON.parse(output) as TranscriptResult | { error: string }
  if ('error' in result) {
    throw new Error(`Remote transcription: ${result.error}`)
  }

  return result as TranscriptResult
}

async function transcribeAPI(audioPath: string): Promise<TranscriptResult> {
  const config = getConfig()
  const { apiKey, model } = config.transcription.api

  if (!apiKey) {
    throw new Error('OpenAI API key is required for API transcription mode. Set transcription.api.apiKey in config.')
  }

  const fs = await import('fs')
  const formData = new FormData()

  const fileBuffer = fs.readFileSync(audioPath)
  const blob = new Blob([fileBuffer], { type: 'audio/wav' })
  formData.append('file', blob, 'recording.wav')
  formData.append('model', model)
  formData.append('response_format', 'verbose_json')
  formData.append('timestamp_granularities[]', 'segment')

  if (config.transcription.language !== 'auto') {
    formData.append('language', config.transcription.language)
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI Whisper API: request failed (${response.status}): ${error}`)
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
