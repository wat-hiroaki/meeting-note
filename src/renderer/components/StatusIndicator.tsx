export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'processing' | 'done' | 'error'

const statusConfig: Record<RecordingStatus, { color: string; label: string; pulse: boolean }> = {
  idle: { color: 'bg-emerald-400', label: 'Ready', pulse: false },
  recording: { color: 'bg-red-500', label: 'REC', pulse: true },
  paused: { color: 'bg-yellow-400', label: 'Paused', pulse: false },
  processing: { color: 'bg-blue-400', label: 'Processing', pulse: true },
  done: { color: 'bg-green-400', label: 'Done', pulse: false },
  error: { color: 'bg-red-500', label: 'Error', pulse: false }
}

export function StatusIndicator({ status }: { status: RecordingStatus }): React.JSX.Element {
  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center justify-center w-3 h-3">
        {config.pulse && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${config.color} opacity-75 animate-ping`} />
        )}
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${config.color}`} />
      </div>
      <span className={`text-xs font-medium tracking-wide uppercase ${
        status === 'error' ? 'text-red-400' : 'text-white/70'
      }`}>
        {config.label}
      </span>
    </div>
  )
}
