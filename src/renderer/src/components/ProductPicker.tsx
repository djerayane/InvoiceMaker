import { useEffect, useRef, useState } from 'react'
import type { OdooProduct } from '@shared/types'
import { Search, Spinner, Check } from './icons'
import { formatEuro } from '../format'

interface Props {
  /** Currently selected product name, if any. */
  currentName?: string
  /** Initial query to prime the search with (the devis line label). */
  seedQuery: string
  onPick: (product: OdooProduct) => void
  onClose: () => void
}

/** A searchable dropdown that queries Odoo products live. */
export function ProductPicker({ currentName, seedQuery, onPick, onClose }: Props) {
  const [query, setQuery] = useState(seedQuery)
  const [results, setResults] = useState<OdooProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    const handle = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const r = await window.api.searchProducts(query)
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
  }, [query])

  return (
    <div
      ref={boxRef}
      className="absolute z-30 mt-1 w-[420px] max-w-[92vw] overflow-hidden rounded-xl bg-white shadow-2xl animate-fade"
      style={{ border: '1px solid var(--color-paper-line)' }}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--color-paper-line)' }}>
        <Search width={16} height={16} className="text-neutral-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un produit Odoo…"
          className="w-full bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
        />
        {loading && <Spinner width={15} height={15} className="text-neutral-400" />}
      </div>
      <div className="max-h-72 overflow-y-auto">
        {error && <div className="px-3 py-3 text-sm text-[var(--color-vermilion-600)]">{error}</div>}
        {!error && !loading && results.length === 0 && (
          <div className="px-3 py-4 text-sm text-neutral-500">
            Aucun produit trouvé. Affinez la recherche.
          </div>
        )}
        {results.map((prod) => {
          const selected = prod.name === currentName
          return (
            <button
              key={prod.id}
              onClick={() => onPick(prod)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-paper-2)]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-neutral-800">
                  {prod.name}
                </span>
                {prod.defaultCode && (
                  <span className="tnum block text-xs text-neutral-400">{prod.defaultCode}</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {typeof prod.listPrice === 'number' && (
                  <span className="tnum text-xs text-neutral-500">{formatEuro(prod.listPrice)}</span>
                )}
                {selected && <Check width={16} height={16} className="text-[var(--color-moss)]" />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
