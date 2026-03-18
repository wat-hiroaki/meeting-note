import { spawn, execSync } from 'child_process'
import { join } from 'path'
import { existsSync, copyFileSync, unlinkSync, readFileSync, writeFileSync } from 'fs'
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

  if (config.transcription.mode === 'remote') {
    return transcribeRemote(audioPath)
  }
  return transcribeLocal(audioPath)
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
