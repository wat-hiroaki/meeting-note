import { spawn, execSync } from 'child_process'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { createReadStream } from 'fs'
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
      if (code !== 0) {
        reject(new Error(`Transcription failed (code ${code}): ${stderr}`))
        return
      }

      try {
        const result = JSON.parse(stdout) as TranscriptResult | { error: string }
        if ('error' in result) {
          reject(new Error(result.error))
          return
        }
        resolve(result as TranscriptResult)
      } catch {
        reject(new Error(`Failed to parse transcription output: ${stdout}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start Python: ${err.message}`))
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

  // 1. SCP upload
  execSync(`scp "${audioPath}" "${sshTarget}:${remoteAudioPath}"`, {
    timeout: 120000
  })

  // 2. SSH execute
  const cmd = `${pythonPath} ${scriptPath} "${remoteAudioPath}" --model ${config.transcription.model} --language ${config.transcription.language} --output json`

  const output = execSync(`ssh "${sshTarget}" "${cmd}"`, {
    encoding: 'utf-8',
    timeout: 600000 // 10 min for large files
  })

  // 3. Cleanup remote file
  try {
    execSync(`ssh "${sshTarget}" "rm -f ${remoteAudioPath}"`, { timeout: 10000 })
  } catch { /* ignore cleanup errors */ }

  // 4. Parse result
  const result = JSON.parse(output) as TranscriptResult | { error: string }
  if ('error' in result) {
    throw new Error(result.error)
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
    throw new Error(`OpenAI Whisper API error (${response.status}): ${error}`)
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
      start: Math.round(s.start * 100) / 100,
      end: Math.round(s.end * 100) / 100,
      text: s.text.trim()
    })) || [{ start: 0, end: data.duration || 0, text: data.text }]
  }
}
