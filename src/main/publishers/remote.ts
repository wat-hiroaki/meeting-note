import { execSync } from 'child_process'
import { getConfig } from '../config'

function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}

export function publishToRemote(localMdPath: string): void {
  const config = getConfig()

  if (!config.remote.enabled || !config.remote.host || !config.remote.user) {
    throw new Error('Remote integration not configured')
  }

  const escapedUser = shellEscape(config.remote.user)
  const escapedHost = shellEscape(config.remote.host)
  const escapedPath = shellEscape(config.remote.path)
  const escapedLocalPath = shellEscape(localMdPath)
  const sshTarget = `${escapedUser}@${escapedHost}`

  // Ensure remote directory exists
  execSync(
    `ssh ${sshTarget} mkdir -p ${escapedPath}`,
    { timeout: 10000 }
  )

  // SCP transfer
  execSync(`scp ${escapedLocalPath} ${sshTarget}:${escapedPath}/`, { timeout: 30000 })
}
