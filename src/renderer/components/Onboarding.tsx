import { useState, useEffect } from 'react'

interface OnboardingProps {
  onComplete: () => void
}

type Step = 'welcome' | 'transcription' | 'summary' | 'done'

interface SetupState {
  transcriptionMode: string
  whisperApiKey: string
  summaryMode: string
  anthropicApiKey: string
}

export function Onboarding({ onComplete }: OnboardingProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('welcome')
  const [ffmpegOk, setFfmpegOk] = useState<boolean | null>(null)
  const [setup, setSetup] = useState<SetupState>({
    transcriptionMode: 'local',
    whisperApiKey: '',
    summaryMode: 'cli',
    anthropicApiKey: ''
  })

  // Check FFmpeg on mount
  useEffect(() => {
    window.electronAPI.checkFfmpeg().then(setFfmpegOk).catch(() => setFfmpegOk(false))
  }, [])

  const canProceedTranscription = setup.transcriptionMode !== 'api' || setup.whisperApiKey.length > 0
  const canProceedSummary = setup.summaryMode !== 'api' || setup.anthropicApiKey.length > 0

  const handleFinish = (): void => {
    window.electronAPI.setConfig({
      transcription: {
        mode: setup.transcriptionMode,
        api: { apiKey: setup.whisperApiKey, model: 'whisper-1' }
      },
      summary: {
        mode: setup.summaryMode,
        api: { apiKey: setup.anthropicApiKey }
      },
      onboarded: true
    }).then(onComplete).catch(console.error)
  }

  return (
    <div className="w-full h-full flex items-center justify-center p-6">
      <div className="glass-bar rounded-3xl p-8 w-full max-w-md space-y-6">

        {/* Step: Welcome */}
        {step === 'welcome' && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="text-2xl font-bold text-white/95 tracking-tight">meeting-note</div>
              <p className="text-white/50 text-sm leading-relaxed">
                System audio capture, AI transcription & summary — all in one click.
              </p>
            </div>

            {/* FFmpeg status */}
            <div className={`rounded-xl px-4 py-3 text-sm ${
              ffmpegOk === null ? 'bg-white/5 text-white/40' :
              ffmpegOk ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
            }`}>
              {ffmpegOk === null && 'Checking FFmpeg...'}
              {ffmpegOk === true && (
                <div className="flex items-center gap-2">
                  <span className="text-green-400">&#10003;</span> FFmpeg detected
                </div>
              )}
              {ffmpegOk === false && (
                <div className="space-y-1">
                  <div className="font-medium">FFmpeg not found</div>
                  <div className="text-xs text-yellow-400/70">
                    Run: winget install Gyan.FFmpeg
                  </div>
                </div>
              )}
            </div>

            {/* How it works */}
            <div className="space-y-2">
              <div className="text-white/30 text-[10px] uppercase tracking-wider">How it works</div>
              <div className="space-y-1.5">
                {[
                  ['1', 'Record', 'Capture system audio via FFmpeg'],
                  ['2', 'Transcribe', 'Whisper converts speech to text'],
                  ['3', 'Summarize', 'Claude generates meeting notes'],
                  ['4', 'Share', 'Save as MD, push to Notion/Slack']
                ].map(([num, title, desc]) => (
                  <div key={num} className="flex items-start gap-3 py-1">
                    <span className="text-white/20 text-xs font-mono w-4 shrink-0">{num}</span>
                    <div>
                      <span className="text-white/80 text-sm">{title}</span>
                      <span className="text-white/35 text-xs ml-2">{desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setStep('transcription')}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 text-sm font-medium transition-colors"
            >
              Set up
            </button>
          </div>
        )}

        {/* Step: Transcription */}
        {step === 'transcription' && (
          <div className="space-y-5">
            <div className="space-y-1">
              <div className="text-white/30 text-[10px] uppercase tracking-wider">Step 1 of 2</div>
              <div className="text-xl font-bold text-white/95">Transcription</div>
              <p className="text-white/40 text-sm">How should speech be converted to text?</p>
            </div>

            <div className="space-y-2">
              {([
                ['local', 'Local (faster-whisper)', 'Free, runs on your machine. Requires Python + faster-whisper.', false],
                ['api', 'OpenAI Whisper API', 'Cloud-based, fast. Requires OpenAI API key.', true],
                ['remote', 'Remote (SSH)', 'Run on a GPU server via SSH.', false]
              ] as const).map(([value, label, desc, showKey]) => (
                <label
                  key={value}
                  className={`block rounded-xl px-4 py-3 cursor-pointer transition-all ${
                    setup.transcriptionMode === value
                      ? 'bg-white/10 border border-white/20'
                      : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="transcription"
                      value={value}
                      checked={setup.transcriptionMode === value}
                      onChange={() => setSetup(s => ({ ...s, transcriptionMode: value }))}
                      className="accent-blue-400"
                    />
                    <div>
                      <div className="text-white/85 text-sm">{label}</div>
                      <div className="text-white/35 text-xs">{desc}</div>
                    </div>
                  </div>
                  {showKey && setup.transcriptionMode === 'api' && (
                    <input
                      type="password"
                      value={setup.whisperApiKey}
                      onChange={(e) => setSetup(s => ({ ...s, whisperApiKey: e.target.value }))}
                      placeholder="sk-..."
                      className="mt-3 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/90 text-xs outline-none focus:border-white/25 placeholder:text-white/20"
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('welcome')}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep('summary')}
                disabled={!canProceedTranscription}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 text-sm font-medium transition-colors disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step: Summary */}
        {step === 'summary' && (
          <div className="space-y-5">
            <div className="space-y-1">
              <div className="text-white/30 text-[10px] uppercase tracking-wider">Step 2 of 2</div>
              <div className="text-xl font-bold text-white/95">Summary</div>
              <p className="text-white/40 text-sm">How should meeting notes be generated?</p>
            </div>

            <div className="space-y-2">
              {([
                ['cli', 'Claude CLI', 'Uses your Claude Code subscription. No extra cost.', false],
                ['api', 'Anthropic API', 'Pay-per-use. Requires Anthropic API key.', true]
              ] as const).map(([value, label, desc, showKey]) => (
                <label
                  key={value}
                  className={`block rounded-xl px-4 py-3 cursor-pointer transition-all ${
                    setup.summaryMode === value
                      ? 'bg-white/10 border border-white/20'
                      : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="summary"
                      value={value}
                      checked={setup.summaryMode === value}
                      onChange={() => setSetup(s => ({ ...s, summaryMode: value }))}
                      className="accent-blue-400"
                    />
                    <div>
                      <div className="text-white/85 text-sm">{label}</div>
                      <div className="text-white/35 text-xs">{desc}</div>
                    </div>
                  </div>
                  {showKey && setup.summaryMode === 'api' && (
                    <input
                      type="password"
                      value={setup.anthropicApiKey}
                      onChange={(e) => setSetup(s => ({ ...s, anthropicApiKey: e.target.value }))}
                      placeholder="sk-ant-..."
                      className="mt-3 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/90 text-xs outline-none focus:border-white/25 placeholder:text-white/20"
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('transcription')}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep('done')}
                disabled={!canProceedSummary}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 text-sm font-medium transition-colors disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="text-xl font-bold text-white/95">Ready to go</div>
              <p className="text-white/40 text-sm">Hotkeys to remember:</p>
            </div>

            <div className="space-y-2">
              {[
                ['Ctrl+Shift+R', 'Start recording'],
                ['Ctrl+Shift+P', 'Pause / Resume'],
                ['Ctrl+Shift+S', 'Stop & process'],
                ['Ctrl+Shift+M', 'Show / Hide']
              ].map(([key, action]) => (
                <div key={key} className="flex items-center justify-between py-1.5">
                  <span className="text-white/50 text-sm">{action}</span>
                  <div className="flex gap-1">
                    {key.split('+').map(k => (
                      <kbd key={k} className="px-2 py-0.5 rounded-md bg-white/10 text-white/70 text-xs font-mono border border-white/10">
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-white/25 text-xs">
              Notion / Slack / Remote can be configured later via the gear icon.
            </p>

            <button
              onClick={handleFinish}
              className="w-full py-2.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-sm font-medium transition-colors border border-blue-500/20"
            >
              Start using meeting-note
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
