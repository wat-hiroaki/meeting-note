/**
 * Simple audit log for medical-grade recording accountability.
 *
 * Logs recording events (start, stop, access) to a JSON Lines file
 * in the user data directory. Each line is a self-contained JSON object
 * for append-only integrity and easy parsing.
 */

import { app } from 'electron'
import { join } from 'path'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { getConfig } from './config'

export type AuditAction =
  | 'recording_started'
  | 'recording_stopped'
  | 'recording_paused'
  | 'recording_resumed'
  | 'transcription_completed'
  | 'summary_generated'
  | 'file_exported'
  | 'consent_obtained'
  | 'consent_declined'
  | 'medical_mode_enabled'
  | 'medical_mode_disabled'
  | 'settings_changed'

export interface AuditEntry {
  timestamp: string
  action: AuditAction
  details?: Record<string, unknown>
  user?: string
  sessionId: string
}

// Session ID is unique per app launch
const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function getAuditLogPath(): string {
  const logDir = join(app.getPath('userData'), 'audit')
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })

  // Rotate by month: audit-2026-04.jsonl
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return join(logDir, `audit-${month}.jsonl`)
}

/**
 * Write an audit log entry. Only logs if medical mode + audit log are enabled.
 * Failures are silently ignored to never block the main workflow.
 */
export function writeAuditLog(action: AuditAction, details?: Record<string, unknown>): void {
  try {
    const config = getConfig()
    if (!config.medical?.enabled || !config.medical?.auditLog) return

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      action,
      sessionId: SESSION_ID,
    }

    if (details) {
      entry.details = details
    }

    // OS username for accountability
    entry.user = process.env.USER || process.env.USERNAME || 'unknown'

    const logPath = getAuditLogPath()
    appendFileSync(logPath, JSON.stringify(entry) + '\n')
  } catch {
    // Never throw from audit logging — it must not block the main flow
    console.warn('[AuditLog] Failed to write audit entry:', action)
  }
}

/**
 * Read recent audit log entries. Returns the last N entries from the current month.
 */
export function readAuditLog(limit = 100): AuditEntry[] {
  try {
    const logPath = getAuditLogPath()
    if (!existsSync(logPath)) return []

    const content = readFileSync(logPath, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    const entries = lines
      .slice(-limit)
      .map(line => {
        try {
          return JSON.parse(line) as AuditEntry
        } catch {
          return null
        }
      })
      .filter((e): e is AuditEntry => e !== null)

    return entries
  } catch {
    return []
  }
}
