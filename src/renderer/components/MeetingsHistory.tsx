import { useState, useEffect, useCallback, useRef } from 'react'

interface ActionItem {
  text: string
  owner?: string
  priority?: 'high' | 'medium' | 'low'
  dueDate?: string
  completed: boolean
}

interface MeetingEntry {
  id: string
  date: string
  title: string
  duration: number
  format: string
  summaryPath: string
  calendarEventTitle?: string
  actionItems: ActionItem[]
  tags: string[]
}

interface MeetingsHistoryProps {
  onClose: () => void
}

const FORMAT_LABELS: Record<string, string> = {
  auto: 'Auto',
  sales: 'Sales',
  standup: 'Stand-up',
  team: 'Team',
  one_on_one: '1on1',
  brainstorm: 'Brainstorm'
}

const FORMAT_COLORS: Record<string, string> = {
  auto: 'bg-white/10 text-white/60',
  sales: 'bg-green-500/15 text-green-400',
  standup: 'bg-blue-500/15 text-blue-400',
  team: 'bg-purple-500/15 text-purple-400',
  one_on_one: 'bg-yellow-500/15 text-yellow-400',
  brainstorm: 'bg-orange-500/15 text-orange-400'
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-white/40'
}

export function MeetingsHistory({ onClose }: MeetingsHistoryProps): React.JSX.Element {
  const [meetings, setMeetings] = useState<MeetingEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search query (300ms)
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [searchQuery])

  const loadMeetings = useCallback(async () => {
    setLoading(true)
    try {
      const data = debouncedQuery
        ? await window.electronAPI.searchMeetings(debouncedQuery)
        : await window.electronAPI.getMeetingsHistory()
      setMeetings(data as MeetingEntry[])
    } catch {
      setMeetings([])
    }
    setLoading(false)
  }, [debouncedQuery])

  useEffect(() => {
    loadMeetings()
  }, [loadMeetings])

  const handleToggleActionItem = useCallback(async (meetingId: string, index: number, completed: boolean) => {
    await window.electronAPI.updateMeetingActionItem(meetingId, index, { completed })
    loadMeetings()
  }, [loadMeetings])

  const handleOpenFile = useCallback((path: string) => {
    window.electronAPI.openPath(path)
  }, [])

  const formatDuration = (seconds: number): string => {
    const mins = Math.ceil(seconds / 60)
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    const remaining = mins % 60
    return `${hours}h ${remaining}m`
  }

  const formatDate = (isoDate: string): string => {
    const d = new Date(isoDate)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const formatTime = (isoDate: string): string => {
    const d = new Date(isoDate)
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  // Group meetings by date
  const groupedMeetings = meetings.reduce<Record<string, MeetingEntry[]>>((acc, m) => {
    const dateKey = new Date(m.date).toDateString()
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(m)
    return acc
  }, {})

  return (
    <div className="rounded-2xl p-4 mt-1 space-y-3 max-h-[540px] overflow-y-auto no-drag solid-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-white/90 text-sm font-medium">Meetings</span>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
          title="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="2" y1="2" x2="10" y2="10" />
            <line x1="10" y1="2" x2="2" y2="10" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search meetings..."
        className="no-drag w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/90 text-xs outline-none focus:border-white/25 placeholder:text-white/25 transition-colors"
      />

      {/* Loading */}
      {loading && (
        <div className="text-white/30 text-xs text-center py-4">Loading...</div>
      )}

      {/* Empty state */}
      {!loading && meetings.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <div className="text-white/20 text-2xl">&#128196;</div>
          <div className="text-white/30 text-xs">
            {searchQuery ? 'No meetings found' : 'No meetings yet. Start recording!'}
          </div>
        </div>
      )}

      {/* Meeting list */}
      {!loading && Object.entries(groupedMeetings).map(([dateKey, dateMeetings]) => (
        <div key={dateKey} className="space-y-1.5">
          <div className="text-white/30 text-[10px] uppercase tracking-wider">
            {formatDate(dateMeetings[0].date)}
          </div>

          {dateMeetings.map(meeting => (
            <div key={meeting.id} className="space-y-1">
              {/* Meeting card */}
              <button
                onClick={() => setExpandedId(expandedId === meeting.id ? null : meeting.id)}
                className="w-full text-left rounded-xl px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] border border-transparent hover:border-white/10 transition-all"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-white/80 text-xs font-medium truncate">{meeting.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-white/30 text-[10px]">{formatTime(meeting.date)}</span>
                      <span className="text-white/30 text-[10px]">{formatDuration(meeting.duration)}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${FORMAT_COLORS[meeting.format] || FORMAT_COLORS.auto}`}>
                        {FORMAT_LABELS[meeting.format] || meeting.format}
                      </span>
                    </div>
                  </div>
                  {meeting.actionItems.length > 0 && (
                    <div className="text-white/25 text-[10px] shrink-0">
                      {meeting.actionItems.filter(a => !a.completed).length}/{meeting.actionItems.length}
                    </div>
                  )}
                  <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
                    className={`text-white/20 shrink-0 transition-transform ${expandedId === meeting.id ? 'rotate-180' : ''}`}
                  >
                    <path d="M2 3.5 L5 6.5 L8 3.5" />
                  </svg>
                </div>
              </button>

              {/* Expanded details */}
              {expandedId === meeting.id && (
                <div className="ml-3 pl-3 border-l border-white/5 space-y-2 py-1">
                  {/* Action items */}
                  {meeting.actionItems.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-white/30 text-[9px] uppercase tracking-wider">Action Items</span>
                      {meeting.actionItems.map((item, idx) => (
                        <label key={idx} className="flex items-start gap-2 py-0.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() => handleToggleActionItem(meeting.id, idx, !item.completed)}
                            className="mt-0.5 accent-blue-400"
                          />
                          <div className="flex-1 min-w-0">
                            <span className={`text-[11px] ${item.completed ? 'text-white/25 line-through' : 'text-white/70'}`}>
                              {item.text}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {item.owner && (
                                <span className="text-[9px] text-white/30">@{item.owner}</span>
                              )}
                              {item.priority && (
                                <span className={`text-[9px] ${PRIORITY_COLORS[item.priority]}`}>
                                  {item.priority}
                                </span>
                              )}
                              {item.dueDate && (
                                <span className="text-[9px] text-white/30">{item.dueDate}</span>
                              )}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Open file button */}
                  <button
                    onClick={() => handleOpenFile(meeting.summaryPath)}
                    className="text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors"
                  >
                    Open meeting notes
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
