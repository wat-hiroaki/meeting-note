interface ControlButtonProps {
  onClick: () => void
  title: string
  disabled?: boolean
  variant?: 'default' | 'danger' | 'success'
  children: React.ReactNode
}

const variantStyles = {
  default: 'hover:bg-white/15 text-white/80 hover:text-white',
  danger: 'hover:bg-red-500/20 text-red-400 hover:text-red-300',
  success: 'hover:bg-green-500/20 text-green-400 hover:text-green-300'
}

export function ControlButton({
  onClick,
  title,
  disabled = false,
  variant = 'default',
  children
}: ControlButtonProps): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`no-drag w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 ${variantStyles[variant]} disabled:opacity-30 disabled:cursor-not-allowed outline-none focus-visible:ring-1 focus-visible:ring-white/30`}
    >
      {children}
    </button>
  )
}
