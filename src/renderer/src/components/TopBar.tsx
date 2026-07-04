import type { OdooSettings } from '@shared/types'
import { Logo, Gear } from './icons'

interface Props {
  settings: OdooSettings | null
  onReconfigure: () => void
  step?: { index: number; total: number; label: string }
}

/** The persistent app header (draggable on macOS), with connection status. */
export function TopBar({ settings, onReconfigure, step }: Props) {
  const host = settings ? settings.url.replace(/^https?:\/\//, '').replace(/\/$/, '') : null
  return (
    <header className="drag flex items-center justify-between border-b px-6 py-3.5" style={{ borderColor: 'var(--color-ink-600)' }}>
      <div className="flex items-center gap-3 pl-16">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: 'var(--color-vermilion)', color: 'white' }}
        >
          <Logo width={20} height={20} />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            InvoiceMaker
          </div>
          <div className="text-[11px] text-neutral-500">Devis → Brouillon Odoo</div>
        </div>
      </div>

      {step && (
        <div className="hidden items-center gap-2 text-xs text-neutral-400 md:flex">
          <span className="tnum">
            Étape {step.index}/{step.total}
          </span>
          <span className="text-neutral-600">·</span>
          <span className="font-medium text-neutral-300">{step.label}</span>
        </div>
      )}

      {host && (
        <button className="btn btn-ghost no-drag !py-1.5 !text-xs" onClick={onReconfigure}>
          <span className="flex h-2 w-2 rounded-full" style={{ background: 'var(--color-moss)' }} />
          <span className="tnum max-w-[180px] truncate">{host}</span>
          <Gear width={14} height={14} />
        </button>
      )}
    </header>
  )
}
