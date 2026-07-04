import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'
import { ArrowRight, Spinner, Check, Warn } from './icons'

/**
 * Bottom-right toast that surfaces auto-update state: prompts to update in one
 * click, shows download progress, then offers to restart & install.
 */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'not-available' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => window.api.onUpdateStatus(setStatus), [])

  const hidden =
    dismissed || status.state === 'not-available' || (status.state === 'error' && !status.version)
  if (hidden) return null

  return (
    <div
      className="fixed bottom-5 right-5 z-50 w-80 overflow-hidden rounded-2xl animate-rise"
      style={{ background: 'var(--color-ink-700)', border: '1px solid var(--color-ink-500)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}
    >
      <div className="p-4">
        {status.state === 'available' && (
          <>
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
              <span className="flex h-2 w-2 rounded-full" style={{ background: 'var(--color-vermilion)' }} />
              Nouvelle version disponible
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              La version {status.version} est prête à être installée.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button className="btn btn-primary !py-2 !text-xs" onClick={() => window.api.downloadUpdate()}>
                Mettre à jour <ArrowRight width={14} height={14} />
              </button>
              <button className="text-xs font-semibold text-neutral-400 hover:text-neutral-200" onClick={() => setDismissed(true)}>
                Plus tard
              </button>
            </div>
          </>
        )}

        {status.state === 'downloading' && (
          <>
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
              <Spinner width={15} height={15} /> Téléchargement de la mise à jour…
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--color-ink-500)' }}>
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{ width: `${status.percent ?? 0}%`, background: 'var(--color-vermilion)' }}
              />
            </div>
            <p className="tnum mt-1.5 text-xs text-neutral-400">{status.percent ?? 0} %</p>
          </>
        )}

        {status.state === 'downloaded' && (
          <>
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
              <Check width={15} height={15} className="text-[var(--color-moss)]" /> Mise à jour prête
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Redémarrez pour installer la version {status.version}.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button className="btn btn-primary !py-2 !text-xs" onClick={() => window.api.installUpdate()}>
                Redémarrer &amp; installer
              </button>
              <button className="text-xs font-semibold text-neutral-400 hover:text-neutral-200" onClick={() => setDismissed(true)}>
                Plus tard
              </button>
            </div>
          </>
        )}

        {status.state === 'error' && status.version && (
          <>
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
              <Warn width={15} height={15} className="text-[var(--color-vermilion)]" /> Mise à jour impossible
            </div>
            <p className="mt-1 truncate text-xs text-neutral-400" title={status.message}>
              {status.message}
            </p>
            <button className="mt-2 text-xs font-semibold text-neutral-400 hover:text-neutral-200" onClick={() => setDismissed(true)}>
              Fermer
            </button>
          </>
        )}
      </div>
    </div>
  )
}
