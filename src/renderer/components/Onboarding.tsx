import { useState, useEffect } from 'react'

interface OnboardingProps {
  onComplete: () => void
}

type Step = 'welcome' | 'transcription' | 'summary' | 'output' | 'done'

const steps: Step[] = ['welcome', 'transcription', 'summary', 'output', 'done']

interface SetupState {
  micDevice: string
  systemDevice: string
  language: string
  transcriptionMode: string
  whisperModel: string
  whisperApiKey: string
  remoteHost: string
  remoteUser: string
  remotePythonPath: string
  remoteScriptPath: string
  summaryMode: string
  anthropicApiKey: string
  outputDirectory: string
}

const isMac = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin'
const mod = isMac ? 'Cmd' : 'Ctrl'

function StepIcon({ icon }: { icon: string }): React.JSX.Element {
  return <span className="text-base w-5 text-center shrink-0">{icon}</span>
}

function DepsCheck({ label, ok, installCmd }: { label: string; ok: boolean | null; installCmd: string }): React.JSX.Element {
  return (
    <div className={`rounded-lg px-3 py-2 text-xs ${
      ok === null ? 'bg-white/5 text-white/40' :
      ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
    }`}>
      {ok === null && `Checking ${label}...`}
      {ok === true && (
        <span className="flex items-center gap-1.5">
          <span>&#10003;</span> {label} detected
        </span>
      )}
      {ok === false && (
        <div className="space-y-1">
          <span className="flex items-center gap-1.5 font-medium">
            <span>&#10007;</span> {label} not found
          </span>
          <code className="block bg-white/5 rounded px-2 py-1 text-white/60 font-mono">
            {installCmd}
          </code>
        </div>
      )}
    </div>
  )
}

function ProgressDots({ current }: { current: Step }): React.JSX.Element {
  const currentIndex = steps.indexOf(current)
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`rounded-full transition-all ${
            i === currentIndex
              ? 'w-5 h-1.5 bg-blue-400'
              : i < currentIndex
                ? 'w-1.5 h-1.5 bg-blue-400/50'
                : 'w-1.5 h-1.5 bg-white/15'
          }`}
        />
      ))}
    </div>
  )
}

const MODEL_OPTIONS = [
  { value: 'large-v3', label: 'large-v3', size: '~3 GB', desc: 'Best quality, slowest' },
  { value: 'medium', label: 'medium', size: '~1.5 GB', desc: 'Good balance' },
  { value: 'small', label: 'small', size: '~500 MB', desc: 'Fast, decent quality' },
  { value: 'base', label: 'base', size: '~150 MB', desc: 'Fastest, lower quality' },
]

const LANG_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ko', label: 'Korean' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'auto', label: 'Auto-detect' },
]

export function Onboarding({ onComplete }: OnboardingProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('welcome')
  const [ffmpegOk, setFfmpegOk] = useState<boolean | null>(null)
  const [pythonOk, setPythonOk] = useState<boolean | null>(null)
  const [whisperOk, setWhisperOk] = useState<boolean | null>(null)
  const [claudeCliOk, setClaudeCliOk] = useState<boolean | null>(null)
  const [modelCached, setModelCached] = useState<boolean | null>(null)
  const [modelSize, setModelSize] = useState<string>('')
  const [downloading, setDownloading] = useState(false)
  const [downloadDone, setDownloadDone] = useState(false)
  const [audioDevices, setAudioDevices] = useState<string[]>([])
  const [setup, setSetup] = useState<SetupState>({
    micDevice: 'default',
    systemDevice: 'none',
    language: 'en',
    transcriptionMode: 'local',
    whisperModel: 'small',
    whisperApiKey: '',
    remoteHost: '',
    remoteUser: '',
    remotePythonPath: 'python3',
    remoteScriptPath: '~/transcribe.py',
    summaryMode: 'cli',
    anthropicApiKey: '',
    outputDirectory: './meetings'
  })

  // Check system deps on mount
  useEffect(() => {
    window.electronAPI.checkFfmpeg().then(setFfmpegOk).catch(() => setFfmpegOk(false))
    window.electronAPI.checkPython().then(setPythonOk).catch(() => setPythonOk(false))
    window.electronAPI.checkFasterWhisper().then(setWhisperOk).catch(() => setWhisperOk(false))
    window.electronAPI.checkClaudeCli().then(setClaudeCliOk).catch(() => setClaudeCliOk(false))
    window.electronAPI.getAudioDevices().then(setAudioDevices).catch(() => setAudioDevices([]))
  }, [])

  // Check model cache when local mode + deps ready
  useEffect(() => {
    if (step === 'transcription' && setup.transcriptionMode === 'local' && whisperOk) {
      setModelCached(null)
      setDownloadDone(false)
      window.electronAPI.checkWhisperModel(setup.whisperModel).then((result) => {
        setModelCached(result.cached)
        setModelSize(result.size)
      }).catch(() => setModelCached(false))
    }
  }, [step, setup.transcriptionMode, setup.whisperModel, whisperOk])

  const handleDownloadModel = (): void => {
    setDownloading(true)
    window.electronAPI.downloadWhisperModel(setup.whisperModel).then((ok) => {
      setDownloading(false)
      setDownloadDone(ok)
      if (ok) setModelCached(true)
    }).catch(() => setDownloading(false))
  }

  const canProceedTranscription = (() => {
    if (setup.transcriptionMode === 'api') return setup.whisperApiKey.length > 0
    if (setup.transcriptionMode === 'remote') return setup.remoteHost.length > 0 && setup.remoteUser.length > 0
    if (setup.transcriptionMode === 'local') {
      return pythonOk === true && whisperOk === true && (modelCached === true || downloadDone)
    }
    return true
  })()

  const canProceedSummary = (() => {
    if (setup.summaryMode === 'api') return setup.anthropicApiKey.length > 0
    if (setup.summaryMode === 'cli') return claudeCliOk === true
    return true
  })()

  const handleFinish = (): void => {
    window.electronAPI.setConfig({
      recording: {
        micDevice: setup.micDevice,
        systemDevice: setup.systemDevice
      },
      transcription: {
        mode: setup.transcriptionMode,
        model: setup.whisperModel,
        language: setup.language,
        api: { apiKey: setup.whisperApiKey, model: 'whisper-1' },
        remote: {
          host: setup.remoteHost,
          user: setup.remoteUser,
          pythonPath: setup.remotePythonPath,
          scriptPath: setup.remoteScriptPath
        }
      },
      summary: {
        mode: setup.summaryMode,
        language: setup.language,
        api: { apiKey: setup.anthropicApiKey }
      },
      output: {
        directory: setup.outputDirectory
      },
      onboarded: true
    }).then(onComplete).catch(console.error)
  }

  const installCmd = isMac ? 'brew install ffmpeg' : 'winget install Gyan.FFmpeg'

  return (
    <div className="w-full h-full flex items-center justify-center p-4 bg-[#13131a] overflow-y-auto">
      <div className="rounded-3xl p-7 w-full max-w-md space-y-5 solid-panel my-auto">

        {/* Progress dots */}
        <div className="flex justify-center">
          <ProgressDots current={step} />
        </div>

        {/* ========== Step: Welcome ========== */}
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
              ffmpegOk ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {ffmpegOk === null && 'Checking FFmpeg...'}
              {ffmpegOk === true && (
                <div className="flex items-center gap-2">
                  <span className="text-green-400">&#10003;</span> FFmpeg detected
                </div>
              )}
              {ffmpegOk === false && (
                <div className="space-y-2">
                  <div className="font-medium flex items-center gap-2">
                    <span>&#10007;</span> FFmpeg is required
                  </div>
                  <div className="text-xs text-red-400/70">
                    Recording depends on FFmpeg. Install it first:
                  </div>
                  <code className="block text-xs bg-white/5 rounded-lg px-3 py-1.5 text-white/70 font-mono">
                    {installCmd}
                  </code>
                </div>
              )}
            </div>

            {/* Audio devices */}
            {ffmpegOk && audioDevices.length > 0 && (
              <div className="space-y-2">
                <div className="text-white/30 text-[10px] uppercase tracking-wider">Audio capture</div>
                <div className="space-y-1.5">
                  <div className="space-y-1">
                    <label className="text-white/50 text-xs">Microphone (your voice)</label>
                    <select
                      value={setup.micDevice}
                      onChange={(e) => setSetup(s => ({ ...s, micDevice: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/90 text-xs outline-none focus:border-white/25"
                    >
                      <option value="default">Auto-detect</option>
                      {audioDevices.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-white/50 text-xs">System audio (others' voices)</label>
                    <select
                      value={setup.systemDevice}
                      onChange={(e) => setSetup(s => ({ ...s, systemDevice: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/90 text-xs outline-none focus:border-white/25"
                    >
                      <option value="none">None (mic only)</option>
                      {audioDevices.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  {setup.systemDevice === 'none' && (
                    <p className="text-yellow-400/60 text-[10px] leading-relaxed">
                      {isMac
                        ? 'To capture meeting audio from others, install BlackHole: brew install blackhole-2ch'
                        : 'To capture meeting audio from others, enable "Stereo Mix" in Windows Sound Settings, or install VB-Cable.'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* How it works */}
            <div className="space-y-2">
              <div className="text-white/30 text-[10px] uppercase tracking-wider">How it works</div>
              <div className="space-y-1.5">
                {[
                  ['🎙', 'Record', 'Capture system audio via FFmpeg'],
                  ['📝', 'Transcribe', 'Whisper converts speech to text'],
                  ['🤖', 'Summarize', 'Claude generates meeting notes'],
                  ['📤', 'Share', 'Save as MD, push to Notion/Slack']
                ].map(([icon, title, desc]) => (
                  <div key={title} className="flex items-start gap-3 py-1">
                    <StepIcon icon={icon} />
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
              disabled={ffmpegOk === false}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {ffmpegOk === false ? 'Install FFmpeg to continue' : 'Set up'}
            </button>
          </div>
        )}

        {/* ========== Step: Transcription ========== */}
        {step === 'transcription' && (
          <div className="space-y-5">
            <div className="space-y-1">
              <div className="text-white/30 text-[10px] uppercase tracking-wider">Step 1 of 3</div>
              <div className="text-xl font-bold text-white/95">Transcription</div>
              <p className="text-white/40 text-sm">How should speech be converted to text?</p>
            </div>

            {/* Language */}
            <div className="space-y-1.5">
              <label className="text-white/50 text-xs">Language</label>
              <select
                value={setup.language}
                onChange={(e) => setSetup(s => ({ ...s, language: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-sm outline-none focus:border-white/25"
              >
                {LANG_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Mode selection */}
            <div className="space-y-2">
              {([
                ['local', 'Local (faster-whisper)', 'Free, runs on your machine.'],
                ['api', 'OpenAI Whisper API', 'Cloud-based, fast. Requires API key.'],
                ['remote', 'Remote (SSH)', 'Run on a GPU server via SSH.']
              ] as const).map(([value, label, desc]) => (
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

                  {/* Local: deps + model */}
                  {value === 'local' && setup.transcriptionMode === 'local' && (
                    <div className="mt-3 space-y-1.5">
                      <DepsCheck label="Python" ok={pythonOk} installCmd={isMac ? 'brew install python3' : 'winget install Python.Python.3.11'} />
                      <DepsCheck label="faster-whisper" ok={whisperOk} installCmd="pip install faster-whisper" />

                      {/* Model size selector */}
                      {pythonOk && whisperOk && (
                        <>
                          <div className="space-y-1">
                            <label className="text-white/40 text-[10px] uppercase">Model</label>
                            <div className="grid grid-cols-2 gap-1.5">
                              {MODEL_OPTIONS.map(m => (
                                <button
                                  key={m.value}
                                  onClick={() => setSetup(s => ({ ...s, whisperModel: m.value }))}
                                  className={`rounded-lg px-2.5 py-1.5 text-left transition-all ${
                                    setup.whisperModel === m.value
                                      ? 'bg-blue-500/15 border border-blue-500/30'
                                      : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.06]'
                                  }`}
                                >
                                  <div className="text-white/80 text-xs font-medium">{m.label}</div>
                                  <div className="text-white/30 text-[10px]">{m.size} · {m.desc}</div>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Model download status */}
                          {modelCached !== null && (
                            <div className={`rounded-lg px-3 py-2 text-xs ${
                              modelCached || downloadDone
                                ? 'bg-green-500/10 text-green-400'
                                : downloading
                                  ? 'bg-blue-500/10 text-blue-400'
                                  : 'bg-yellow-500/10 text-yellow-400'
                            }`}>
                              {(modelCached || downloadDone) && (
                                <span className="flex items-center gap-1.5">
                                  <span>&#10003;</span> Model {setup.whisperModel} ready
                                </span>
                              )}
                              {!modelCached && !downloadDone && downloading && (
                                <div className="space-y-1">
                                  <span className="flex items-center gap-1.5">
                                    <span className="animate-spin">&#9696;</span> Downloading {setup.whisperModel} ({modelSize})...
                                  </span>
                                  <span className="text-blue-400/60">This may take a few minutes.</span>
                                </div>
                              )}
                              {!modelCached && !downloadDone && !downloading && (
                                <div className="space-y-2">
                                  <span>Model {setup.whisperModel} ({modelSize}) not downloaded.</span>
                                  <button
                                    onClick={handleDownloadModel}
                                    className="block w-full py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-xs transition-colors"
                                  >
                                    Download now
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* API: key input */}
                  {value === 'api' && setup.transcriptionMode === 'api' && (
                    <input
                      type="password"
                      value={setup.whisperApiKey}
                      onChange={(e) => setSetup(s => ({ ...s, whisperApiKey: e.target.value }))}
                      placeholder="sk-..."
                      className="mt-3 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/90 text-xs outline-none focus:border-white/25 placeholder:text-white/20"
                    />
                  )}

                  {/* Remote: SSH inputs */}
                  {value === 'remote' && setup.transcriptionMode === 'remote' && (
                    <div className="mt-3 space-y-2">
                      <input type="text" value={setup.remoteHost}
                        onChange={(e) => setSetup(s => ({ ...s, remoteHost: e.target.value }))}
                        placeholder="Host (e.g. gpu-server.local)"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/90 text-xs outline-none focus:border-white/25 placeholder:text-white/20"
                      />
                      <input type="text" value={setup.remoteUser}
                        onChange={(e) => setSetup(s => ({ ...s, remoteUser: e.target.value }))}
                        placeholder="Username"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/90 text-xs outline-none focus:border-white/25 placeholder:text-white/20"
                      />
                    </div>
                  )}
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('welcome')}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 text-sm transition-colors">
                Back
              </button>
              <button onClick={() => setStep('summary')} disabled={!canProceedTranscription}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 text-sm font-medium transition-colors disabled:opacity-30">
                Next
              </button>
            </div>
          </div>
        )}

        {/* ========== Step: Summary ========== */}
        {step === 'summary' && (
          <div className="space-y-5">
            <div className="space-y-1">
              <div className="text-white/30 text-[10px] uppercase tracking-wider">Step 2 of 3</div>
              <div className="text-xl font-bold text-white/95">Summary</div>
              <p className="text-white/40 text-sm">How should meeting notes be generated?</p>
            </div>

            <div className="space-y-2">
              {([
                ['cli', 'Claude CLI', 'Uses your Claude Code subscription. No extra cost.'],
                ['api', 'Anthropic API', 'Pay-per-use. Requires Anthropic API key.']
              ] as const).map(([value, label, desc]) => (
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

                  {/* CLI: check installation */}
                  {value === 'cli' && setup.summaryMode === 'cli' && (
                    <div className="mt-3">
                      <DepsCheck label="Claude CLI" ok={claudeCliOk} installCmd="npm install -g @anthropic-ai/claude-code" />
                    </div>
                  )}

                  {/* API: key input */}
                  {value === 'api' && setup.summaryMode === 'api' && (
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
              <button onClick={() => setStep('transcription')}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 text-sm transition-colors">
                Back
              </button>
              <button onClick={() => setStep('output')} disabled={!canProceedSummary}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 text-sm font-medium transition-colors disabled:opacity-30">
                Next
              </button>
            </div>
          </div>
        )}

        {/* ========== Step: Output ========== */}
        {step === 'output' && (
          <div className="space-y-5">
            <div className="space-y-1">
              <div className="text-white/30 text-[10px] uppercase tracking-wider">Step 3 of 3</div>
              <div className="text-xl font-bold text-white/95">Output</div>
              <p className="text-white/40 text-sm">Where should meeting notes be saved?</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-white/50 text-xs">Save directory</label>
                <input
                  type="text"
                  value={setup.outputDirectory}
                  onChange={(e) => setSetup(s => ({ ...s, outputDirectory: e.target.value }))}
                  placeholder="./meetings"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/90 text-sm outline-none focus:border-white/25 placeholder:text-white/20"
                />
                <p className="text-white/30 text-xs">
                  Relative paths are resolved from your home directory. Files are saved as <code className="text-white/50">YYYY-MM-DD_HHmm.md</code>.
                </p>
              </div>

              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3 space-y-1.5">
                <div className="text-white/50 text-[10px] uppercase tracking-wider">Optional integrations</div>
                <p className="text-white/35 text-xs leading-relaxed">
                  Notion, Slack, and Remote SCP can be configured later from the Settings panel (gear icon).
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('summary')}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 text-sm transition-colors">
                Back
              </button>
              <button onClick={() => setStep('done')}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 text-sm font-medium transition-colors">
                Next
              </button>
            </div>
          </div>
        )}

        {/* ========== Step: Done ========== */}
        {step === 'done' && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="text-xl font-bold text-white/95">Ready to go</div>
              <p className="text-white/40 text-sm">Hotkeys to remember:</p>
            </div>

            <div className="space-y-2">
              {[
                [`${mod}+Shift+R`, 'Start recording'],
                [`${mod}+Shift+P`, 'Pause / Resume'],
                [`${mod}+Shift+S`, 'Stop & process'],
                [`${mod}+Shift+M`, 'Show / Hide']
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

            {/* Summary of config */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3 space-y-1">
              <div className="text-white/50 text-[10px] uppercase tracking-wider">Your setup</div>
              <div className="text-white/60 text-xs space-y-0.5">
                <div>Mic: <span className="text-white/80">{setup.micDevice === 'default' ? 'Auto-detect' : setup.micDevice}</span></div>
                <div>System audio: <span className="text-white/80">{setup.systemDevice === 'none' ? 'Off' : setup.systemDevice}</span></div>
                <div>Transcription: <span className="text-white/80">{setup.transcriptionMode}{setup.transcriptionMode === 'local' ? ` (${setup.whisperModel})` : ''}</span></div>
                <div>Language: <span className="text-white/80">{LANG_OPTIONS.find(l => l.value === setup.language)?.label || setup.language}</span></div>
                <div>Summary: <span className="text-white/80">{setup.summaryMode === 'cli' ? 'Claude CLI' : 'Anthropic API'}</span></div>
                <div>Output: <span className="text-white/80">{setup.outputDirectory}</span></div>
              </div>
            </div>

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
