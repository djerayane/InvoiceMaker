import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { OdooSettings } from '@shared/types'

/**
 * Tiny persistent store kept in the app's userData folder. Non-secret settings
 * live in settings.json; the Odoo API key is encrypted with the OS keychain via
 * Electron's safeStorage and kept in a separate file.
 */

interface StoredSettings extends OdooSettings {}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function apiKeyPath(): string {
  return join(app.getPath('userData'), 'apikey.bin')
}

export function getSettings(): OdooSettings | null {
  try {
    const p = settingsPath()
    if (!existsSync(p)) return null
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as StoredSettings
    if (!raw.url || !raw.db || !raw.username) return null
    return { url: raw.url, db: raw.db, username: raw.username }
  } catch {
    return null
  }
}

export function saveSettings(settings: OdooSettings, apiKey: string): void {
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  const encrypted = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(apiKey)
    : Buffer.from(apiKey, 'utf-8')
  writeFileSync(apiKeyPath(), encrypted)
}

export function getApiKey(): string | null {
  try {
    const p = apiKeyPath()
    if (!existsSync(p)) return null
    const buf = readFileSync(p)
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf-8')
  } catch {
    return null
  }
}

export function clearSettings(): void {
  for (const p of [settingsPath(), apiKeyPath()]) {
    if (existsSync(p)) rmSync(p)
  }
}

export function isOnboarded(): boolean {
  return getSettings() !== null && getApiKey() !== null
}
