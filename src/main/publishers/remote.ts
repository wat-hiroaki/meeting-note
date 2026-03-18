import { execSync } from 'child_process'
import { getConfig } from '../config'

export function publishToRemote(localMdPath: string): void {
  const config = getConfig()

  if (!config.remote.enabled || !config.remote.host || !config.remote.user) {
    throw new Error('Remote integration not configured')
  }

  const target = `${config.remote.user}@${config.remote.host}:${config.remote.path}/`

  // Ensure remote directory exists
  execSync(
    `ssh "${config.remote.user}@${config.remote.host}" "mkdir -p ${config.remote.path}"`,
    { timeout: 10000 }
  )

  // SCP transfer
  execSync(`scp "${localMdPath}" "${target}"`, { timeout: 30000 })
}
