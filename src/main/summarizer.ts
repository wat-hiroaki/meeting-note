import { spawn, execSync } from 'child_process'
import { getConfig } from './config'
import type { TranscriptResult } from './transcriber'

const SUMMARY_PROMPT = `以下の会議の文字起こしを要約してください。

## 出力フォーマット（Markdown）:

### 会議要約
- 主要な議題と結論を箇条書き

### 決定事項
- 具体的な決定事項をリスト

### アクションアイテム
- 誰が何をいつまでにやるか

### 次のステップ
- 今後の予定やフォローアップ事項

---
文字起こし:
`

export async function summarize(transcript: TranscriptResult): Promise<string> {
  const config = getConfig()
  const text = transcript.segments.map(s => `[${formatTime(s.start)}] ${s.text}`).join('\n')
  const prompt = SUMMARY_PROMPT + text

  if (config.summary.mode === 'api') {
    return summarizeAPI(prompt)
  }
  return summarizeCLI(prompt)
}

async function summarizeCLI(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--no-config'], {
      shell: true
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    // Send prompt via stdin to avoid argument length limits
    proc.stdin.write(prompt)
    proc.stdin.end()

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude CLI failed (code ${code}): ${stderr}`))
        return
      }
      resolve(stdout.trim())
    })

    proc.on('error', (err) => {
      if (err.message.includes('ENOENT')) {
        reject(new Error(
          'Claude CLI is not installed or not in PATH. ' +
          'Install it (npm install -g @anthropic-ai/claude-code) or switch to "api" mode in Settings.'
        ))
      } else {
        reject(new Error(`Failed to start Claude CLI: ${err.message}`))
      }
    })
  })
}

async function summarizeAPI(prompt: string): Promise<string> {
  const config = getConfig()
  const { apiKey } = config.summary.api

  if (!apiKey) {
    throw new Error('Anthropic API key is required for API summary mode. Set summary.api.apiKey in config.')
  }

  // Dynamic import to avoid requiring the SDK when using CLI mode
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: config.summary.api.model,
    max_tokens: config.summary.api.maxTokens,
    messages: [{ role: 'user', content: prompt }]
  })

  const textBlock = message.content.find(b => b.type === 'text')
  return textBlock?.text || ''
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}
