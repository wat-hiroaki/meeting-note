import { execSync } from 'child_process'

export interface DetectedMeeting {
  platform: 'zoom' | 'google_meet' | 'teams' | 'other'
  processName: string
}

const MEETING_PROCESSES: Record<string, DetectedMeeting['platform']> = {
  // Windows process names
  'Zoom.exe': 'zoom',
  'zoom.exe': 'zoom',
  'ms-teams.exe': 'teams',
  'Teams.exe': 'teams',
  // macOS process names
  'zoom.us': 'zoom',
  'Microsoft Teams': 'teams',
  'Microsoft Teams (work or school)': 'teams',
  // Google Meet runs in the browser — detect Chrome/Edge/Firefox with audio
}

const BROWSER_PROCESSES = ['chrome', 'msedge', 'firefox', 'Google Chrome', 'Microsoft Edge', 'Firefox']

export function detectActiveMeeting(): DetectedMeeting | null {
  try {
    const processes = getRunningProcesses()

    // Check dedicated meeting apps first
    for (const [procName, platform] of Object.entries(MEETING_PROCESSES)) {
      if (processes.some(p => p.includes(procName))) {
        return { platform, processName: procName }
      }
    }

    // Check for browser-based meetings (Google Meet)
    // We detect this by checking if a browser is using the microphone
    // This is a heuristic — on Windows we check for audiodg connections
    if (processes.some(p => BROWSER_PROCESSES.some(b => p.includes(b)))) {
      if (isBrowserUsingAudio()) {
        return { platform: 'google_meet', processName: 'browser' }
      }
    }

    return null
  } catch (err) {
    console.error('[MeetingDetector] Detection failed:', err)
    return null
  }
}

function getRunningProcesses(): string[] {
  try {
    if (process.platform === 'win32') {
      const output = execSync('tasklist /FO CSV /NH', {
        timeout: 5000,
        encoding: 'utf-8',
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      return output.split('\n').map(line => {
        const match = line.match(/"([^"]+)"/)
        return match ? match[1] : ''
      }).filter(Boolean)
    } else {
      const output = execSync('ps -eo comm', {
        timeout: 5000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      })
      return output.split('\n').filter(Boolean)
    }
  } catch {
    return []
  }
}

function isBrowserUsingAudio(): boolean {
  try {
    if (process.platform === 'win32') {
      // Check if audiodg.exe is running (Windows audio engine active)
      const output = execSync('tasklist /FI "IMAGENAME eq audiodg.exe" /FO CSV /NH', {
        timeout: 5000,
        encoding: 'utf-8',
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      return output.includes('audiodg.exe')
    } else if (process.platform === 'darwin') {
      // On macOS, check if coreaudiod has active clients
      const output = execSync('lsof -i -n -P 2>/dev/null | grep -i "meet\\|zoom\\|teams" || true', {
        timeout: 5000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      })
      return output.trim().length > 0
    }
    return false
  } catch {
    return false
  }
}

let pollingInterval: ReturnType<typeof setInterval> | null = null
let lastDetected: DetectedMeeting | null = null

export function startMeetingDetection(
  onMeetingDetected: (meeting: DetectedMeeting) => void,
  onMeetingEnded: () => void,
  intervalMs = 10000
): void {
  stopMeetingDetection()

  pollingInterval = setInterval(() => {
    const meeting = detectActiveMeeting()
    if (meeting && !lastDetected) {
      lastDetected = meeting
      onMeetingDetected(meeting)
    } else if (!meeting && lastDetected) {
      lastDetected = null
      onMeetingEnded()
    }
  }, intervalMs)

  console.log('[MeetingDetector] Started polling every', intervalMs, 'ms')
}

export function stopMeetingDetection(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
    lastDetected = null
    console.log('[MeetingDetector] Stopped polling')
  }
}
