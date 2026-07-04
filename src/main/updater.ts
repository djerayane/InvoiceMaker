import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

const { autoUpdater } = electronUpdater

function broadcast(status: UpdateStatus): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('update:status', status)
  }
}

/**
 * Wire up auto-update against GitHub Releases. The app checks on startup and
 * every 4 hours; downloads only when the user confirms (autoDownload = false),
 * then installs on the user's click. No-ops in development (unpackaged).
 */
export function initUpdater(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) =>
    broadcast({ state: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => broadcast({ state: 'not-available' }))
  autoUpdater.on('download-progress', (p) =>
    broadcast({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    broadcast({ state: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (err) =>
    broadcast({ state: 'error', message: err == null ? 'Erreur inconnue' : String(err.message ?? err) })
  )

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => {
      broadcast({ state: 'error', message: String(err?.message ?? err) })
    })
  }
  check()
  setInterval(check, 4 * 60 * 60 * 1000)
}

/** Start downloading the pending update (called after the user confirms). */
export function downloadUpdate(): Promise<unknown> {
  return autoUpdater.downloadUpdate()
}

/** Quit and install the downloaded update. */
export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
