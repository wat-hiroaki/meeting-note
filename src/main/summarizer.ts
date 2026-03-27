import { spawn } from 'child_process'
import { getConfig } from './config'
import type { TranscriptResult } from './transcriber'
import type { MeetingFormat, ActionItem } from '../shared/types'

// Format-specific prompts
const FORMAT_PROMPTS: Record<MeetingFormat, string> = {
  auto: `以下の会議の文字起こしを分析し、会議の種類を自動判定して最適な形式で要約してください。

## 出力フォーマット（Markdown）:

### 会議概要
- 会議の種類: [自動判定結果]
- 主要なトピック

### 要約
- 主要な議題と結論を箇条書き（各ポイントにタイムスタンプ参照を付記: → [MM:SS]）

### 決定事項
- 具体的な決定事項をリスト（各項目にタイムスタンプ参照を付記: → [MM:SS]）

### アクションアイテム
各アクションアイテムを以下の形式で出力:
- [ ] アクション内容 | 担当: @名前 | 優先度: 高/中/低 | 期日: YYYY-MM-DD（わかる場合）→ [MM:SS]

### 次のステップ
- 今後の予定やフォローアップ事項`,

  sales: `以下のセールス/商談ミーティングの文字起こしを要約してください。

## 出力フォーマット（Markdown）:

### 商談概要
- 顧客名/案件名
- 商談フェーズ
- 主要な関係者

### 顧客のニーズ・課題
- 顧客が挙げた課題やニーズ（各ポイントにタイムスタンプ参照: → [MM:SS]）

### 提案内容
- 提案した内容や解決策（→ [MM:SS]）

### 顧客の反応・懸念点
- 顧客のフィードバックや懸念事項（→ [MM:SS]）

### 合意事項
- 合意に至った内容（→ [MM:SS]）

### アクションアイテム
各アクションアイテムを以下の形式で出力:
- [ ] アクション内容 | 担当: @名前 | 優先度: 高/中/低 | 期日: YYYY-MM-DD（わかる場合）→ [MM:SS]

### ネクストステップ
- 次回ミーティング予定
- フォローアップ事項`,

  standup: `以下のスタンドアップ/朝会ミーティングの文字起こしを要約してください。

## 出力フォーマット（Markdown）:

### スタンドアップ要約

#### 各メンバーの報告
メンバーごとに以下を整理（→ [MM:SS]）:
- **名前**
  - 昨日やったこと:
  - 今日やること:
  - ブロッカー/困っていること:

### ブロッカー・課題
- チーム全体で対処が必要な課題（→ [MM:SS]）

### アクションアイテム
各アクションアイテムを以下の形式で出力:
- [ ] アクション内容 | 担当: @名前 | 優先度: 高/中/低 | 期日: YYYY-MM-DD（わかる場合）→ [MM:SS]`,

  team: `以下のチームミーティングの文字起こしを要約してください。

## 出力フォーマット（Markdown）:

### 会議要約
- 主要な議題と結論を箇条書き（各ポイントにタイムスタンプ参照: → [MM:SS]）

### 議論のポイント
- 主要な議論点とその結果（→ [MM:SS]）

### 決定事項
- 具体的な決定事項をリスト（→ [MM:SS]）

### アクションアイテム
各アクションアイテムを以下の形式で出力:
- [ ] アクション内容 | 担当: @名前 | 優先度: 高/中/低 | 期日: YYYY-MM-DD（わかる場合）→ [MM:SS]

### 次のステップ
- 今後の予定やフォローアップ事項`,

  one_on_one: `以下の1on1ミーティングの文字起こしを要約してください。

## 出力フォーマット（Markdown）:

### 1on1 要約

### 話題とフィードバック
- 主要な話題（各ポイントにタイムスタンプ参照: → [MM:SS]）

### キャリア・成長
- キャリアや成長に関する話題（→ [MM:SS]）

### 課題・サポート
- 挙がった課題やサポートが必要な点（→ [MM:SS]）

### アクションアイテム
各アクションアイテムを以下の形式で出力:
- [ ] アクション内容 | 担当: @名前 | 優先度: 高/中/低 | 期日: YYYY-MM-DD（わかる場合）→ [MM:SS]

### 次回までのフォローアップ
- 次回確認事項`,

  brainstorm: `以下のブレインストーミングセッションの文字起こしを要約してください。

## 出力フォーマット（Markdown）:

### ブレスト要約
- テーマ/目的

### 出たアイデア
アイデアをカテゴリ別にグループ化（各アイデアにタイムスタンプ参照: → [MM:SS]）

### 有望なアイデア
- 特に有望と思われるアイデアとその理由（→ [MM:SS]）

### 決定事項
- セッションで決まったこと（→ [MM:SS]）

### アクションアイテム
各アクションアイテムを以下の形式で出力:
- [ ] アクション内容 | 担当: @名前 | 優先度: 高/中/低 | 期日: YYYY-MM-DD（わかる場合）→ [MM:SS]

### 次のステップ
- フォローアップ事項`
}

export interface SummaryResult {
  summary: string
  actionItems: ActionItem[]
  meetingFormat: MeetingFormat
}

export async function summarize(transcript: TranscriptResult, format?: MeetingFormat, customInstructions?: string): Promise<SummaryResult> {
  if (!transcript.segments || transcript.segments.length === 0) {
    return {
      summary: 'No speech detected in recording.',
      actionItems: [],
      meetingFormat: format || 'auto'
    }
  }

  const config = getConfig()
  const meetingFormat = format || config.summary.meetingFormat
  const instructions = customInstructions || config.summary.customInstructions
  const text = transcript.segments.map(s => `[${formatTime(s.start)}] ${s.text}`).join('\n')

  let prompt = FORMAT_PROMPTS[meetingFormat] || FORMAT_PROMPTS.auto

  // Append custom instructions if provided
  if (instructions && instructions.trim()) {
    prompt += `\n\n## カスタム指示:\n${instructions}`
  }

  // Language instruction
  const lang = config.summary.language
  if (lang === 'en') {
    prompt += '\n\nIMPORTANT: Output the summary in English.'
  } else if (lang !== 'ja') {
    prompt += `\n\nIMPORTANT: Output the summary in the language: ${lang}.`
  }

  prompt += '\n\n---\n文字起こし:\n' + text

  let summary: string
  switch (config.summary.mode) {
    case 'anthropic': summary = await summarizeAnthropic(prompt); break
    case 'openai': summary = await summarizeOpenAI(prompt); break
    case 'gemini': summary = await summarizeGemini(prompt); break
    default: summary = await summarizeCLI(prompt); break
  }

  // Extract action items from the summary
  const actionItems = parseActionItems(summary)

  return { summary, actionItems, meetingFormat }
}

function parseActionItems(summary: string): ActionItem[] {
  const items: ActionItem[] = []
  const lines = summary.split('\n')

  for (const line of lines) {
    // Match lines like: - [ ] Action | 担当: @name | 優先度: 高 | 期日: 2024-01-01 → [MM:SS]
    // Also match simpler: - [ ] Action text
    const checkboxMatch = line.match(/^[-*]\s*\[[ x]\]\s*(.+)/)
    if (!checkboxMatch) continue

    const content = checkboxMatch[1]
    const completed = line.includes('[x]')

    // Parse structured fields
    const ownerMatch = content.match(/担当:\s*@?(\S+)/i) || content.match(/owner:\s*@?(\S+)/i)
    const priorityMatch = content.match(/優先度:\s*(高|中|低|high|medium|low)/i) || content.match(/priority:\s*(高|中|低|high|medium|low)/i)
    const dueDateMatch = content.match(/期日:\s*(\d{4}-\d{2}-\d{2})/i) || content.match(/due:\s*(\d{4}-\d{2}-\d{2})/i)

    // Extract clean text (before the first | or →)
    const textPart = content.split(/\s*[|→]/)[0].trim()

    const priorityMap: Record<string, ActionItem['priority']> = {
      '高': 'high', '中': 'medium', '低': 'low',
      'high': 'high', 'medium': 'medium', 'low': 'low'
    }

    items.push({
      text: textPart,
      owner: ownerMatch?.[1],
      priority: priorityMatch ? priorityMap[priorityMatch[1].toLowerCase()] : undefined,
      dueDate: dueDateMatch?.[1],
      completed
    })
  }

  return items
}

async function summarizeCLI(prompt: string): Promise<string> {
  const SUMMARY_TIMEOUT_MS = 300_000 // 5 minutes max for summarization

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p'], {
      shell: true
    })

    let settled = false
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        proc.kill('SIGKILL')
        reject(new Error('Claude Code CLI timed out after 5 minutes. Try switching to "anthropic" API mode in Settings.'))
      }
    }, SUMMARY_TIMEOUT_MS)

    // Collect raw Buffer chunks to avoid splitting multi-byte UTF-8 characters
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    proc.stdout.on('data', (data: Buffer) => {
      stdoutChunks.push(data)
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderrChunks.push(data)
    })

    // Send prompt via stdin to avoid argument length limits
    proc.stdin.write(prompt)
    proc.stdin.end()

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)

      const stdout = Buffer.concat(stdoutChunks).toString('utf-8')
      const stderr = Buffer.concat(stderrChunks).toString('utf-8')

      if (code !== 0) {
        reject(new Error(`Claude Code CLI failed (code ${code}): ${stderr}`))
        return
      }
      const result = stdout.trim()
      resolve(result || 'Summary could not be generated.')
    })

    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)

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

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
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

  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Summary could not be generated.'
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}
