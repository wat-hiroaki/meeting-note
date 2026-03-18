import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import YAML from 'yaml'
import { ConfigSchema } from '../shared/types'
import type { Config } from '../shared/types'

let cachedConfig: Config | null = null

function getConfigPath(): string {
  const configDir = join(app.getPath('userData'))
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
  return join(configDir, 'config.yml')
}

export function loadConfig(): Config {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    // Try loading from project root as template
    const templatePath = join(process.cwd(), 'meeting-note.config.yml')
    if (existsSync(templatePath)) {
      const template = readFileSync(templatePath, 'utf-8')
      writeFileSync(configPath, template)
    }
  }

  let raw: unknown = {}
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8')
      raw = YAML.parse(content) || {}
    } catch (err) {
      console.error('[Config] Failed to parse config:', err)
    }
  }

  const result = ConfigSchema.safeParse(raw)
  if (result.success) {
    cachedConfig = result.data
  } else {
    console.error('[Config] Validation errors:', result.error.issues)
    cachedConfig = ConfigSchema.parse({})
  }

  return cachedConfig
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath()
  const result = ConfigSchema.safeParse(config)

  if (!result.success) {
    console.error('[Config] Invalid config:', result.error.issues)
    return
  }

  cachedConfig = result.data
  const yaml = YAML.stringify(result.data)
  writeFileSync(configPath, yaml)
}

export function getConfig(): Config {
  if (!cachedConfig) return loadConfig()
  return cachedConfig
}
