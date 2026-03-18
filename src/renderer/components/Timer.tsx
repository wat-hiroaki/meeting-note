function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function Timer({ seconds }: { seconds: number }): React.JSX.Element {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  return (
    <span className="text-white/90 text-sm font-mono tabular-nums tracking-wider">
      {h > 0 ? `${pad(h)}:` : ''}{pad(m)}:{pad(s)}
    </span>
  )
}
