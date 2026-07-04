import { useEffect, useRef, useState } from 'react'
import type { OdooPartner, DevisCustomer } from '@shared/types'
import { Search, Spinner, Check, User, Plus } from './icons'

interface Props {
  customer: DevisCustomer
  partner: OdooPartner | null
  onChange: (partner: OdooPartner | null) => void
}

type Mode = 'idle' | 'search' | 'create'

/**
 * Customer block for one invoice: shows the parsed customer, lets the user pick a
 * matching Odoo contact, or review + edit the details before creating a new one.
 */
export function PartnerPanel({ customer, partner, onChange }: Props) {
  const [mode, setMode] = useState<Mode>('idle')
  const [query, setQuery] = useState(customer.name)
  const [results, setResults] = useState<OdooPartner[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matchedOnce = useRef(false)

  // Editable draft for the "create contact" form, seeded from the parsed customer.
  const [draft, setDraft] = useState<DevisCustomer>(customer)

  // Auto-match by name once when mounted.
  useEffect(() => {
    if (matchedOnce.current || !customer.name) return
    matchedOnce.current = true
    ;(async () => {
      try {
        const r = await window.api.searchPartners(customer.name)
        const exact = r.find(
          (p) => p.name.trim().toLowerCase() === customer.name.trim().toLowerCase()
        )
        if (exact) onChange(exact)
      } catch {
        /* ignore auto-match errors; the user can search manually */
      }
    })()
  }, [customer.name, onChange])

  useEffect(() => {
    if (mode !== 'search') return
    let cancelled = false
    const handle = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const r = await window.api.searchPartners(query)
        if (!cancelled) setResults(r)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Recherche impossible')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, mode])

  function openCreate() {
    setDraft(customer) // reset to the parsed values each time
    setError(null)
    setMode('create')
  }

  async function handleCreate() {
    if (!draft.name.trim()) {
      setError('Le nom du client est obligatoire.')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const created = await window.api.createPartner(draft)
      onChange(created)
      setMode('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible')
    } finally {
      setCreating(false)
    }
  }

  const setField =
    (key: keyof DevisCustomer) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((d) => ({ ...d, [key]: e.target.value }))

  return (
    <div className="paper p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        <User width={15} height={15} /> Client
      </div>

      <div className="text-lg font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
        {customer.name || <span className="text-neutral-400">Nom manquant</span>}
      </div>
      <div className="tnum mt-0.5 text-sm text-neutral-500">
        {[customer.address, [customer.zip, customer.city].filter(Boolean).join(' '), customer.email]
          .filter(Boolean)
          .join(' · ') || 'Adresse non détectée'}
      </div>

      <div className="mt-4">
        {partner ? (
          <div
            className="flex items-center justify-between rounded-lg px-3 py-2.5"
            style={{ background: 'var(--color-moss-100)' }}
          >
            <span className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-moss)' }}>
              <Check width={16} height={16} /> Lié à « {partner.name} »
            </span>
            <button
              className="text-xs font-semibold text-neutral-500 hover:text-neutral-800"
              onClick={() => {
                setMode('search')
                setQuery(customer.name)
              }}
            >
              Changer
            </button>
          </div>
        ) : mode === 'idle' ? (
          <div className="flex gap-2">
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ borderColor: 'var(--color-paper-line)' }}
              onClick={() => {
                setMode('search')
                setQuery(customer.name)
              }}
            >
              <Search width={15} height={15} /> Rechercher un client
            </button>
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed py-2.5 text-sm font-semibold text-[var(--color-vermilion-600)] transition-colors hover:bg-[var(--color-vermilion-100)]"
              style={{ borderColor: 'var(--color-vermilion)' }}
              onClick={openCreate}
            >
              <Plus width={15} height={15} /> Créer un contact
            </button>
          </div>
        ) : null}
      </div>

      {/* Search panel (also reachable via "Changer" while a client is linked) */}
      {mode === 'search' && (
        <div className="mt-3 rounded-xl border p-3 animate-fade" style={{ borderColor: 'var(--color-paper-line)' }}>
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-white px-3 py-2" style={{ border: '1px solid var(--color-paper-line)' }}>
            <Search width={16} height={16} className="text-neutral-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un contact…"
              className="w-full bg-transparent text-sm outline-none"
            />
            {loading && <Spinner width={15} height={15} className="text-neutral-400" />}
          </div>
          <div className="max-h-48 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onChange(p)
                  setMode('idle')
                }}
                className="flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--color-paper-2)]"
              >
                <span className="text-sm font-medium text-neutral-800">{p.name}</span>
                <span className="tnum text-xs text-neutral-400">
                  {[p.email, [p.zip, p.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))}
            {!loading && results.length === 0 && (
              <div className="px-3 py-2 text-sm text-neutral-500">Aucun contact trouvé.</div>
            )}
          </div>
          {error && <div className="mt-2 text-sm text-[var(--color-vermilion-600)]">{error}</div>}
          <div className="mt-3 flex items-center justify-between">
            <button className="text-xs font-semibold text-neutral-500 hover:text-neutral-800" onClick={() => setMode('idle')}>
              Annuler
            </button>
            <button
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-vermilion-600)] hover:opacity-80"
              onClick={openCreate}
            >
              <Plus width={13} height={13} /> Le client n'existe pas ? Créer un contact
            </button>
          </div>
        </div>
      )}

      {/* Create-contact preview form (editable before sending to Odoo) */}
      {mode === 'create' && (
        <div className="mt-3 rounded-xl border p-4 animate-fade" style={{ borderColor: 'var(--color-paper-line)' }}>
          <div className="mb-3 text-sm font-semibold text-neutral-700">
            Nouveau contact — vérifiez avant de créer
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Nom *</label>
              <input className="field" value={draft.name} onChange={setField('name')} autoFocus />
            </div>
            <div className="col-span-2">
              <label className="label">Rue</label>
              <input className="field" value={draft.address ?? ''} onChange={setField('address')} placeholder="—" />
            </div>
            <div>
              <label className="label">Code postal</label>
              <input className="field tnum" value={draft.zip ?? ''} onChange={setField('zip')} placeholder="—" />
            </div>
            <div>
              <label className="label">Ville</label>
              <input className="field" value={draft.city ?? ''} onChange={setField('city')} placeholder="—" />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input
                className="field tnum"
                value={draft.email ?? ''}
                onChange={setField('email')}
                placeholder="Aucun e-mail"
              />
            </div>
            <div>
              <label className="label">Téléphone</label>
              <input className="field tnum" value={draft.phone ?? ''} onChange={setField('phone')} placeholder="—" />
            </div>
          </div>

          {error && <div className="mt-3 text-sm text-[var(--color-vermilion-600)]">{error}</div>}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              className="btn btn-ghost !text-neutral-700"
              style={{ borderColor: 'var(--color-paper-line)' }}
              onClick={() => setMode('idle')}
              disabled={creating}
            >
              Annuler
            </button>
            <button className="btn btn-paper" onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Spinner width={16} height={16} />
              ) : (
                <>
                  <Plus width={16} height={16} /> Créer le contact dans Odoo
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
