import { spawnSync } from 'child_process'
import { getConfig } from '../config'

export function publishToRemote(localMdPath: string): void {
  const config = getConfig()

  if (!config.remote.enabled || !config.remote.host || !config.remote.user) {
    throw new Error('Remote integration not configured')
  }

  const sshTarget = `${config.remote.user}@${config.remote.host}`
  const remotePath = config.remote.path

  // Use spawnSync with explicit args to avoid shell injection (no shell: true)
  // Step 1: Ensure remote directory exists
  const mkdirResult = spawnSync('ssh', [sshTarget, `mkdir -p '${remotePath.replace(/'/g, "'\\''")}'`], {
    timeout: 10000,
    windowsHide: true
  })

  if (mkdirResult.status !== 0) {
    const stderr = mkdirResult.stderr?.toString() || ''
    throw new Error(`Failed to create remote directory: ${stderr.slice(0, 200)}`)
  }

  // Step 2: SCP transfer
  const scpResult = spawnSync('scp', [localMdPath, `${sshTarget}:${remotePath}/`], {
    timeout: 30000,
    windowsHide: true
  })

  if (scpResult.status !== 0) {
    const stderr = scpResult.stderr?.toString() || ''
    throw new Error(`SCP transfer failed: ${stderr.slice(0, 200)}`)
  }
}
