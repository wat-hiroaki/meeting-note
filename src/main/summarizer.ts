import { spawn } from 'child_process'
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
  if (!transcript.segments || transcript.segments.length === 0) {
    return 'No speech detected in recording.'
  }

  const config = getConfig()
  const text = transcript.segments.map(s => `[${formatTime(s.start)}] ${s.text}`).join('\n')
  const prompt = SUMMARY_PROMPT + text

  switch (config.summary.mode) {
    case 'anthropic': return summarizeAnthropic(prompt)
    case 'openai': return summarizeOpenAI(prompt)
    case 'gemini': return summarizeGemini(prompt)
    default: return summarizeCLI(prompt)
  }
}

async function summarizeCLI(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p'], {
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
        reject(new Error(`Claude Code CLI failed (code ${code}): ${stderr}`))
        return
      }
      const result = stdout.trim()
      resolve(result || 'Summary could not be generated.')
    })

    proc.on('error', (err) => {
      if (err.message.includes('ENOENT')) {
        reject(new Error(
          'Claude Code CLI is not installed or not in PATH. ' +
          'Install it (npm install -g @anthropic-ai/claude-code) or switch to "api" mode in Settings.'
        ))
      } else {
        reject(new Error(`Failed to start Claude Code CLI: ${err.message}`))
      }
    })
  })
}

async function summarizeAnthropic(prompt: string): Promise<string> {
  const config = getConfig()
  const { apiKey } = config.summary.anthropic

  if (!apiKey) {
    throw new Error('Anthropic API key is required. Set summary.anthropic.apiKey in config.')
  }

  // Dynamic import to avoid requiring the SDK when using CLI mode
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: config.summary.anthropic.model,
    max_tokens: config.summary.anthropic.maxTokens,
    messages: [{ role: 'user', content: prompt }]
  })

  const textBlock = message.content.find(b => b.type === 'text')
  if (!textBlock) {
    return 'Summary could not be generated.'
  }
  return textBlock.text || 'Summary could not be generated.'
}

async function summarizeOpenAI(prompt: string): Promise<string> {
  const config = getConfig()
  const { apiKey, model } = config.summary.openai
  if (!apiKey) throw new Error('OpenAI API key is required.')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${error}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || 'Summary could not be generated.'
}

async function summarizeGemini(prompt: string): Promise<string> {
  const config = getConfig()
  const { apiKey, model } = config.summary.gemini
  if (!apiKey) throw new Error('Google Gemini API key is required.')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${error}`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Summary could not be generated.'
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}
