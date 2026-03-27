import { getConfig } from './config'
import type { CalendarEvent } from '../shared/types'

const CALENDAR_TIMEOUT_MS = 15_000 // 15 seconds for API calls

/** Fetch with timeout using AbortController */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = CALENDAR_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Calendar API request timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchUpcomingEvents(maxResults = 10): Promise<CalendarEvent[]> {
  const config = getConfig()

  if (!config.calendar.enabled) return []

  if (config.calendar.provider === 'google') {
    return fetchGoogleCalendarEvents(maxResults)
  }

  return []
}

async function fetchGoogleCalendarEvents(maxResults: number): Promise<CalendarEvent[]> {
  const config = getConfig()
  const { clientId, clientSecret, refreshToken } = config.calendar.google

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[Calendar] Google Calendar not configured')
    return []
  }

  try {
    // Refresh access token
    const tokenResponse = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    })

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text().catch(() => '')
      if (tokenResponse.status === 400 && errorBody.includes('invalid_grant')) {
        throw new Error('Google Calendar refresh token is expired or revoked. Please re-authorize in Settings.')
      }
      throw new Error(`Token refresh failed (${tokenResponse.status}): ${errorBody.slice(0, 200)}`)
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string }
    const accessToken = tokenData.access_token

    // Fetch upcoming events
    const now = new Date().toISOString()
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    const params = new URLSearchParams({
      timeMin: now,
      timeMax: endOfDay.toISOString(),
      maxResults: maxResults.toString(),
      singleEvents: 'true',
      orderBy: 'startTime'
    })

    const calResponse = await fetchWithTimeout(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )

    if (!calResponse.ok) {
      throw new Error(`Calendar API error: ${calResponse.status}`)
    }

    const calData = (await calResponse.json()) as {
      items?: Array<{
        id: string
        summary?: string
        start?: { dateTime?: string; date?: string }
        end?: { dateTime?: string; date?: string }
        hangoutLink?: string
        conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }> }
        attendees?: Array<{ email?: string; displayName?: string }>
        description?: string
        location?: string
      }>
    }

    return (calData.items || []).map(event => {
      const meetingLink = extractMeetingLink(event)
      return {
        id: event.id,
        title: event.summary || 'Untitled',
        start: event.start?.dateTime || event.start?.date || '',
        end: event.end?.dateTime || event.end?.date || '',
        meetingLink: meetingLink?.url,
        attendees: (event.attendees || []).map(a => a.displayName || a.email || ''),
        platform: meetingLink?.platform
      }
    })
  } catch (err) {
    console.error('[Calendar] Failed to fetch events:', err)
    return []
  }
}

function extractMeetingLink(event: {
  hangoutLink?: string
  conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }> }
  description?: string
  location?: string
}): { url: string; platform: CalendarEvent['platform'] } | null {
  // Google Meet
  if (event.hangoutLink) {
    return { url: event.hangoutLink, platform: 'google_meet' }
  }

  // Conference data (Zoom, Teams, etc.)
  if (event.conferenceData?.entryPoints) {
    for (const ep of event.conferenceData.entryPoints) {
      if (ep.uri && ep.entryPointType === 'video') {
        if (ep.uri.includes('zoom.us')) return { url: ep.uri, platform: 'zoom' }
        if (ep.uri.includes('teams.microsoft.com')) return { url: ep.uri, platform: 'teams' }
        if (ep.uri.includes('meet.google.com')) return { url: ep.uri, platform: 'google_meet' }
        return { url: ep.uri, platform: 'other' }
      }
    }
  }

  // Check description/location for meeting URLs
  const text = `${event.description || ''} ${event.location || ''}`
  const zoomMatch = text.match(/https?:\/\/[\w.-]*zoom\.us\/j\/\S+/)
  if (zoomMatch) return { url: zoomMatch[0], platform: 'zoom' }

  const teamsMatch = text.match(/https?:\/\/teams\.microsoft\.com\/\S+/)
  if (teamsMatch) return { url: teamsMatch[0], platform: 'teams' }

  const meetMatch = text.match(/https?:\/\/meet\.google\.com\/\S+/)
  if (meetMatch) return { url: meetMatch[0], platform: 'google_meet' }

  return null
}

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  return fetchUpcomingEvents(20)
}

export async function getNextMeeting(): Promise<CalendarEvent | null> {
  const events = await fetchUpcomingEvents(1)
  return events[0] || null
}
