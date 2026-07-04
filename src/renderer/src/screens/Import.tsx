import { useCallback, useMemo, useState } from 'react'
import type { DevisData } from '@shared/types'
import { invoiceFromDevis, mergeDevis, type InvoiceModel } from '../model'
import { formatEuro } from '../format'
import { Upload, Doc, Spinner, Merge, ArrowRight, Trash, Warn, Plus } from '../components/icons'

interface Group {
  id: string
  devis: DevisData[]
}

interface Props {
  onContinue: (invoices: InvoiceModel[]) => void
}

let gseq = 0
const newGroup = (devis: DevisData[]): Group => ({ id: `g-${++gseq}`, devis })

export function Import({ onContinue }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [parsing, setParsing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState(false)

  const addFiles = useCallback(async (paths: string[]) => {
    if (!paths.length) return
    setParsing(true)
    try {
      const parsed = await window.api.parseDevis(paths)
      setGroups((g) => [...g, ...parsed.map((d) => newGroup([d]))])
    } finally {
      setParsing(false)
    }
  }, [])

  async function handlePick() {
    const paths = await window.api.pickDevisFiles()
    await addFiles(paths)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const paths: string[] = []
    for (const f of Array.from(e.dataTransfer.files)) {
      if (f.name.toLowerCase().endsWith('.pdf')) {
        try {
          paths.push(window.files.pathFor(f))
        } catch {
          /* ignore files whose path can't be resolved */
        }
      }
    }
    addFiles(paths.filter(Boolean))
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function mergeSelected() {
    const chosen = groups.filter((g) => selected.has(g.id))
    if (chosen.length < 2) return
    const mergedDevis = chosen.flatMap((g) => g.devis)
    const remaining = groups.filter((g) => !selected.has(g.id))
    setGroups([...remaining, newGroup(mergedDevis)])
    setSelected(new Set())
  }

  function splitGroup(id: string) {
    setGroups((gs) => {
      const target = gs.find((g) => g.id === id)
      if (!target || target.devis.length < 2) return gs
      const others = gs.filter((g) => g.id !== id)
      return [...others, ...target.devis.map((d) => newGroup([d]))]
    })
  }

  function removeGroup(id: string) {
    setGroups((gs) => gs.filter((g) => g.id !== id))
    setSelected((s) => {
      const next = new Set(s)
      next.delete(id)
      return next
    })
  }

  const invoices = useMemo(
    () => groups.map((g) => (g.devis.length > 1 ? mergeDevis(g.devis) : invoiceFromDevis(g.devis[0]))),
    [groups]
  )

  const hasData = groups.length > 0

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <h1 className="text-3xl">Importer vos devis</h1>
      <p className="mt-1.5 text-sm text-neutral-400">
        Ajoutez un ou plusieurs devis PDF. Chaque devis devient une facture — vous pourrez en
        fusionner plusieurs pour un même client.
      </p>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className="mt-6 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors"
        style={{
          borderColor: dragOver ? 'var(--color-vermilion)' : 'var(--color-ink-500)',
          background: dragOver ? 'rgba(222,58,38,0.06)' : 'rgba(255,255,255,0.015)'
        }}
      >
        <span
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: 'var(--color-ink-700)', color: 'var(--color-vermilion)' }}
        >
          <Upload width={26} height={26} />
        </span>
        <div className="text-base font-semibold text-neutral-200">
          Glissez vos devis PDF ici
        </div>
        <div className="mt-1 text-sm text-neutral-500">ou</div>
        <button className="btn btn-primary mx-auto mt-3" onClick={handlePick} disabled={parsing}>
          {parsing ? <Spinner width={16} height={16} /> : <Plus width={16} height={16} />}
          {parsing ? 'Lecture en cours…' : 'Choisir des fichiers'}
        </button>
      </div>

      {/* Merge toolbar */}
      {selected.size >= 2 && (
        <div className="mt-5 flex items-center justify-between rounded-xl px-4 py-3 animate-fade" style={{ background: 'var(--color-ink-700)' }}>
          <span className="text-sm text-neutral-300">
            {selected.size} devis sélectionnés
          </span>
          <button className="btn btn-primary !py-2" onClick={mergeSelected}>
            <Merge width={16} height={16} /> Fusionner en une facture
          </button>
        </div>
      )}

      {/* Parsed list */}
      {hasData && (
        <div className="mt-6 space-y-3">
          {groups.map((g) => {
            const inv = g.devis.length > 1 ? mergeDevis(g.devis) : invoiceFromDevis(g.devis[0])
            const merged = g.devis.length > 1
            const isSelected = selected.has(g.id)
            return (
              <div
                key={g.id}
                className="paper flex items-center gap-4 p-4 animate-rise"
                style={{ outline: isSelected ? '2px solid var(--color-vermilion)' : 'none' }}
              >
                <label className="no-drag flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(g.id)}
                    className="h-4 w-4 accent-[var(--color-vermilion)]"
                  />
                </label>

                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'var(--color-paper-2)', color: 'var(--color-ink)' }}
                >
                  {merged ? <Merge width={20} height={20} /> : <Doc width={20} height={20} />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-neutral-800">
                      {inv.customer.name || 'Client non détecté'}
                    </span>
                    {inv.warnings.length > 0 && (
                      <span className="chip shrink-0" style={{ background: 'var(--color-amber-100)', color: 'var(--color-amber)' }}>
                        <Warn width={12} height={12} /> {inv.warnings.length}
                      </span>
                    )}
                  </div>
                  <div className="tnum mt-0.5 truncate text-xs text-neutral-500">
                    {merged ? `${g.devis.length} devis fusionnés · ` : ''}
                    {inv.sources.join(', ')} · {inv.lines.length} ligne
                    {inv.lines.length > 1 ? 's' : ''}
                  </div>
                </div>

                <div className="tnum shrink-0 text-right">
                  <div className="font-semibold text-neutral-800">{formatEuro(inv.devisTTC)}</div>
                  <div className="text-xs text-neutral-400">TTC</div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {merged && (
                    <button
                      className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-[var(--color-paper-2)] hover:text-neutral-700"
                      title="Séparer"
                      onClick={() => splitGroup(g.id)}
                    >
                      <Merge width={16} height={16} style={{ transform: 'scaleY(-1)' }} />
                    </button>
                  )}
                  <button
                    className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-[var(--color-vermilion-100)] hover:text-[var(--color-vermilion-600)]"
                    title="Retirer"
                    onClick={() => removeGroup(g.id)}
                  >
                    <Trash width={16} height={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {hasData && (
        <div className="mt-8 flex items-center justify-between">
          <span className="text-sm text-neutral-500">
            {invoices.length} facture{invoices.length > 1 ? 's' : ''} à préparer
          </span>
          <button className="btn btn-primary" onClick={() => onContinue(invoices)}>
            Vérifier &amp; corriger <ArrowRight width={16} height={16} />
          </button>
        </div>
      )}
    </div>
  )
}
