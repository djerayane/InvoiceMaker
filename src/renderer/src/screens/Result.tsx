import type { PushOutcome } from './Review'
import { Check, Warn, Plus, External } from '../components/icons'

interface Props {
  outcomes: PushOutcome[]
  /** Odoo base URL, used to build deep links to the created invoices. */
  odooUrl: string | null
  onRestart: () => void
  onRetry: () => void
}

/** Build a deep link that opens an account.move record in the Odoo web client. */
function invoiceUrl(base: string, moveId: number): string {
  const host = base.replace(/\/+$/, '')
  return `${host}/web#id=${moveId}&model=account.move&view_type=form`
}

export function Result({ outcomes, odooUrl, onRestart, onRetry }: Props) {
  const ok = outcomes.filter((o) => o.result.ok)
  const failed = outcomes.filter((o) => !o.result.ok)
  const allOk = failed.length === 0

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="text-center animate-rise">
        <span
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={
            allOk
              ? { background: 'var(--color-moss-100)', color: 'var(--color-moss)' }
              : { background: 'var(--color-amber-100)', color: 'var(--color-amber)' }
          }
        >
          {allOk ? <Check width={34} height={34} strokeWidth={2.4} /> : <Warn width={34} height={34} />}
        </span>
        <h1 className="text-3xl">
          {allOk
            ? ok.length > 1
              ? `${ok.length} brouillons créés`
              : 'Brouillon créé'
            : 'Création partielle'}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
          {allOk
            ? 'Retrouvez vos factures en brouillon dans Odoo (Comptabilité → Clients → Factures) pour vérification finale et validation.'
            : `${ok.length} créé(s), ${failed.length} en échec. Corrigez puis réessayez.`}
        </p>
      </div>

      <div className="mt-8 space-y-2.5">
        {outcomes.map((o) => (
          <div key={o.invoiceId} className="paper flex items-center gap-3 p-4 animate-fade">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
              style={{ background: o.result.ok ? 'var(--color-moss)' : 'var(--color-vermilion)' }}
            >
              {o.result.ok ? <Check width={18} height={18} strokeWidth={2.6} /> : <Warn width={18} height={18} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-neutral-800">
                {o.customer || 'Client'}
              </div>
              <div className="tnum truncate text-xs text-neutral-500">
                {o.result.ok
                  ? `Brouillon ${o.result.name && o.result.name !== '/' ? o.result.name : ''} — état : brouillon`
                  : o.result.error}
              </div>
            </div>
            {o.result.ok && o.result.moveId && odooUrl && (
              <button
                className="btn btn-ghost !text-neutral-700 shrink-0 !py-1.5 !text-xs"
                style={{ borderColor: 'var(--color-paper-line)' }}
                onClick={() => window.api.openExternal(invoiceUrl(odooUrl, o.result.moveId!))}
              >
                Ouvrir dans Odoo <External width={14} height={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-9 flex items-center justify-center gap-3">
        {!allOk && (
          <button className="btn btn-ghost" onClick={onRetry}>
            Revenir aux corrections
          </button>
        )}
        <button className="btn btn-primary" onClick={onRestart}>
          <Plus width={16} height={16} /> Traiter d'autres devis
        </button>
      </div>
    </div>
  )
}
