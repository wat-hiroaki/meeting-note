import { spawn } from 'child_process'
import { getConfig } from './config'
import type { TranscriptResult } from './transcriber'
import type { MeetingFormat, ActionItem } from '../shared/types'

const SUMMARY_API_TIMEOUT_MS = 300_000 // 5 minutes for API summarization

// Fetch with timeout — AbortController-based
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`API request timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

// Retry with exponential backoff for transient errors
async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 2000): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < retries && isTransientError(err)) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        console.warn(`[Summarizer] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, err instanceof Error ? err.message : err)
        await new Promise(r => setTimeout(r, delay))
      } else if (!isTransientError(err)) {
        throw err
      }
    }
  }
  throw lastError
}

function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return msg.includes('timeout') || msg.includes('429') || msg.includes('500') ||
      msg.includes('502') || msg.includes('503') || msg.includes('econnreset') ||
      msg.includes('fetch failed') || msg.includes('overloaded')
  }
  return false
}

// ===== SYSTEM PROMPT — shared expertise and reasoning framework =====
const SYSTEM_PROMPT = `あなたは会議の議事録を作成する世界最高のAIアシスタントです。

## あなたの能力
- 会話の文脈を深く理解し、表面的な発言だけでなく、背景にある意図や懸念を読み取る
- 曖昧な議論から明確な決定事項とアクションアイテムを抽出する
- 話者の発言パターンから、誰が何を主張しているかを追跡する
- タイムスタンプ参照により、要約の各ポイントがどの発言に基づいているかを明示する

## 要約の品質基準
1. **正確性**: 発言されていないことを捏造しない。不明確な点は「（要確認）」と明示する
2. **網羅性**: 重要な議論ポイントを漏らさない。ただし冗長な繰り返しは省く
3. **構造性**: 論理的にグループ化し、読み手が3分で会議の全体像を把握できるようにする
4. **実用性**: アクションアイテムは「誰が」「何を」「いつまでに」を可能な限り特定する
5. **タイムスタンプ**: 各ポイントに → [MM:SS] 形式で該当箇所への参照を付ける

## アクションアイテムの出力形式
必ず以下の形式で出力すること（パーサーが読み取ります）:
- [ ] 具体的なアクション内容 | 担当: @名前 | 優先度: 高/中/低 | 期日: YYYY-MM-DD → [MM:SS]
  - 担当者名が不明な場合は「担当: @TBD」
  - 期日が不明な場合は省略可
  - 優先度は文脈から判断（ブロッカー=高、改善=低 など）

## 思考プロセス
まず文字起こし全体を通読し、以下を特定してから要約を書くこと:
1. 参加者は誰か（名前が出ていれば記録、出ていなければ Speaker A/B/C）
2. 主要な議題は何か
3. 各議題でどんな議論があり、何が決まったか
4. 誰が何をすることになったか
5. 未解決の問題や次回の宿題は何か`

// ===== FORMAT-SPECIFIC PROMPTS =====
const FORMAT_PROMPTS: Record<MeetingFormat, string> = {
  auto: `会議の内容を分析し、最適な形式で要約してください。

## 出力フォーマット:

### 会議概要
> **種類**: [自動判定: チームMTG/1on1/商談/朝会/ブレスト/その他]
> **参加者**: [特定できた名前をリスト]
> **主要トピック**: [1行で要約]

### 要約
議題ごとにグループ化し、各ポイントにタイムスタンプ参照を付けること:

**[議題1のタイトル]**
- ポイント → [MM:SS]
- 結論や合意 → [MM:SS]

**[議題2のタイトル]**
- ...

### 決定事項
決定された内容を箇条書きで。各項目に根拠となった議論のタイムスタンプを付記:
- 決定内容（理由/背景）→ [MM:SS]

### アクションアイテム
- [ ] アクション内容 | 担当: @名前 | 優先度: 高/中/低 | 期日: YYYY-MM-DD → [MM:SS]

### 未解決の課題
- まだ結論が出ていない議題や懸念事項 → [MM:SS]

### 次のステップ
- 次回の予定やフォローアップ事項`,

  sales: `商談/セールスミーティングの文字起こしを、営業活動に直結する形式で要約してください。

## 出力フォーマット:

### 商談サマリー
> **顧客/案件**: [特定できた情報]
> **フェーズ**: [初回/提案/交渉/クロージング/フォローアップ]
> **参加者**: [自社側] / [顧客側]
> **温度感**: [🔥高/😐中/🧊低 — 会話のトーンから判断]

### 顧客のニーズ・ペイン
顧客が明示的・暗示的に示した課題やニーズ:
- ニーズ（発言の引用があれば簡潔に）→ [MM:SS]

### 提案・ソリューション
自社側が提案した内容:
- 提案内容 → [MM:SS]

### 顧客の反応・オブジェクション
- 反応/懸念点（ポジティブ/ネガティブを明示）→ [MM:SS]

### 合意事項 / コミットメント
- 両者が合意した内容 → [MM:SS]

### 競合情報
- 会話中に出た競合他社や代替案の情報 → [MM:SS]
（なければ「言及なし」と記載）

### アクションアイテム
- [ ] アクション内容 | 担当: @名前 | 優先度: 高/中/低 | 期日: YYYY-MM-DD → [MM:SS]

### ネクストステップ
- 次回MTG予定
- 見積もり/資料送付の期限
- フォローアップ内容`,

  standup: `スタンドアップ/デイリーミーティングを、チームのステータスが一目で分かる形式で要約してください。

## 出力フォーマット:

### デイリースタンドアップ

| メンバー | 昨日の成果 | 今日の予定 | ブロッカー |
|---------|-----------|-----------|-----------|
| @名前 | 内容 | 内容 | あり/なし |

### 詳細報告
メンバーごとに詳細を展開（→ [MM:SS]）:

**@名前**
- ✅ 完了: 昨日やったこと
- 📋 予定: 今日やること
- 🚧 ブロッカー: 困っていること（あれば）

### ブロッカー & リスク
チーム全体で対処が必要な項目:
- 🔴 ブロッカー内容（影響範囲と緊急度）→ [MM:SS]

### アクションアイテム
- [ ] アクション内容 | 担当: @名前 | 優先度: 高/中/低 | 期日: YYYY-MM-DD → [MM:SS]`,

  team: `チームミーティングを、意思決定とアクションが明確に分かる形式で要約してください。

## 出力フォーマット:

### 会議サマリー
> **参加者**: [特定できた名前]
> **主要議題**: [1行で]

### アジェンダ & 議論

**[議題1]**
- 論点と主な意見 → [MM:SS]
- 結論/合意事項 → [MM:SS]

**[議題2]**
- 論点と主な意見 → [MM:SS]
- 結論/合意事項 → [MM:SS]

（議題ごとにセクションを作成）

### 決定事項
明確に決定された内容:
- ✅ 決定内容（背景/理由）→ [MM:SS]

### アクションアイテム
- [ ] アクション内容 | 担当: @名前 | 優先度: 高/中/低 | 期日: YYYY-MM-DD → [MM:SS]

### 未解決 / 持ち越し
- 結論が出なかった議題 → [MM:SS]

### 次のステップ
- 次回MTGの予定・議題案`,

  one_on_one: `1on1ミーティングを、個人の成長とフォローアップに焦点を当てた形式で要約してください。
プライベートな内容も含まれる可能性があるため、事実ベースで簡潔にまとめること。

## 出力フォーマット:

### 1on1 サマリー
> **参加者**: [2名の名前/役割]
> **主なテーマ**: [1行で]

### 話題 & ディスカッション
話題ごとにグループ化:

**[トピック1]**
- 議論内容の要約 → [MM:SS]
- フィードバックや気づき

**[トピック2]**
- ...

### フィードバック
- 与えられたフィードバック（ポジティブ/改善点）→ [MM:SS]

### キャリア & 成長
- キャリアに関する話題や目標 → [MM:SS]
（なければ「今回は言及なし」）

### 課題 & サポート
- 挙がった課題やサポートが必要な点 → [MM:SS]

### アクションアイテム
- [ ] アクション内容 | 担当: @名前 | 優先度: 高/中/低 | 期日: YYYY-MM-DD → [MM:SS]

### 次回のフォローアップ
- 次回確認すべき項目`,

  brainstorm: `ブレインストーミングセッションを、アイデアの整理と次のアクションに繋がる形式で要約してください。
アイデアの質を判断するのではなく、出たアイデアを正確に記録・分類すること。

## 出力フォーマット:

### ブレスト サマリー
> **テーマ/問い**: [ブレストの目的・問い]
> **参加者**: [名前]

### アイデア一覧
カテゴリ別にグループ化。各アイデアに提案者（分かれば）とタイムスタンプを付記:

**[カテゴリ1]**
- 💡 アイデア内容（@提案者）→ [MM:SS]
- 💡 アイデア内容 → [MM:SS]

**[カテゴリ2]**
- 💡 ...

### 注目アイデア / 深掘りされたもの
特に議論が活発だったアイデアや全員が反応したもの:
- ⭐ アイデアと反応の内容 → [MM:SS]

### 決定事項
- セッションで決まったこと → [MM:SS]

### アクションアイテム
- [ ] アクション内容 | 担当: @名前 | 優先度: 高/中/低 | 期日: YYYY-MM-DD → [MM:SS]

### 次のステップ
- どのアイデアを深掘りするか
- プロトタイプ/調査のフォローアップ`
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

  // Build transcript text with speaker labels (if available from diarization)
  const text = transcript.segments.map(s => {
    const speaker = s.speaker
    const prefix = speaker ? `[${formatTime(s.start)}] (${speaker})` : `[${formatTime(s.start)}]`
    return `${prefix} ${s.text}`
  }).join('\n')

  // Calculate meeting duration for context
  const durationMin = Math.ceil(transcript.duration / 60)

  // Build the full prompt with system instructions + format + transcript
  let prompt = SYSTEM_PROMPT + '\n\n'
  prompt += `## 会議情報\n- 録音時間: ${durationMin}分\n- セグメント数: ${transcript.segments.length}\n- 言語: ${transcript.language}\n\n`
  prompt += `## 要約タスク\n${FORMAT_PROMPTS[meetingFormat] || FORMAT_PROMPTS.auto}\n\n`

  // Append custom instructions if provided
  if (instructions && instructions.trim()) {
    prompt += `## カスタム指示（ユーザーからの追加要求）:\n${instructions}\n\n`
  }

  // Language instruction
  const lang = config.summary.language
  if (lang === 'en') {
    prompt += 'IMPORTANT: Output the entire summary in English.\n\n'
  } else if (lang !== 'ja') {
    prompt += `IMPORTANT: Output the entire summary in: ${lang}.\n\n`
  }

  prompt += '---\n## 文字起こし（タイムスタンプ付き）:\n' + text

  let summary: string
  switch (config.summary.mode) {
    case 'anthropic': summary = await withRetry(() => summarizeAnthropic(prompt)); break
    case 'openai': summary = await withRetry(() => summarizeOpenAI(prompt)); break
    case 'gemini': summary = await withRetry(() => summarizeGemini(prompt)); break
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
    // Handle stdin errors (e.g. pipe broken if process exits early)
    proc.stdin.on('error', (err) => {
      console.warn('[Summarizer] stdin error:', err.message)
      // Don't reject here — let the close event handle it
    })
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
  const client = new Anthropic({ apiKey, timeout: SUMMARY_API_TIMEOUT_MS })

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

  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
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
  }, SUMMARY_API_TIMEOUT_MS)

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error')
    throw new Error(`OpenAI API error (${response.status}): ${error}`)
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content || 'Summary could not be generated.'
}

async function summarizeGemini(prompt: string): Promise<string> {
  const config = getConfig()
  const { apiKey, model } = config.summary.gemini
  if (!apiKey) throw new Error('Google Gemini API key is required.')

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    },
    SUMMARY_API_TIMEOUT_MS
  )

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error')
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
