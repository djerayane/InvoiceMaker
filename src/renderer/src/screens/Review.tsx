import { useEffect, useMemo, useState } from 'react'
import type { OdooTax, OdooProduct, PushResult, OdooPartner } from '@shared/types'
import {
  computeTotals,
  emptyLine,
  isPushable,
  blockingReasons,
  type InvoiceModel,
  type LineModel
} from '../model'
import { formatEuro, parseInputNumber } from '../format'
import { PartnerPanel } from '../components/PartnerPanel'
import { ProductPicker } from '../components/ProductPicker'
import { ConfidenceBadge, WarningList } from '../components/ui'
import { ArrowLeft, ArrowRight, Plus, Trash, Spinner, Check, Warn, Doc } from '../components/icons'

export interface PushOutcome {
  invoiceId: string
  customer: string
  result: PushResult
}

interface Props {
  invoices: InvoiceModel[]
  onChange: (id: string, updater: (inv: InvoiceModel) => InvoiceModel) => void
  onBack: () => void
  onDone: (outcomes: PushOutcome[]) => void
}

/** Choose the Odoo tax id(s) matching a VAT rate. */
function taxIdsForRate(rate: number, taxes: OdooTax[]): number[] {
  const found = taxes.find((t) => Math.round(t.amount) === Math.round(rate))
  return found ? [found.id] : []
}

export function Review({ invoices, onChange, onBack, onDone }: Props) {
  const [activeId, setActiveId] = useState(invoices[0]?.id ?? '')
  const [taxes, setTaxes] = useState<OdooTax[]>([])
  const [matching, setMatching] = useState(true)
  const [pushing, setPushing] = useState(false)
  const [pickerLine, setPickerLine] = useState<string | null>(null)

  const active = invoices.find((i) => i.id === activeId) ?? invoices[0]

  // On mount: load sale taxes and auto-match every line to an Odoo product.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setMatching(true)
      let taxList: OdooTax[] = []
      try {
        taxList = await window.api.listSaleTaxes()
      } catch {
        /* taxes optional; rate mapping simply yields none */
      }
      if (cancelled) return
      setTaxes(taxList)

      for (const inv of invoices) {
        for (const line of inv.lines) {
          if (line.productId || !line.label.trim()) continue
          try {
            const { product, confidence } = await window.api.matchProduct(line.label)
            if (cancelled) return
            if (product) {
              onChange(inv.id, (cur) => ({
                ...cur,
                lines: cur.lines.map((l) =>
                  l.id === line.id
                    ? {
                        ...l,
                        productId: product.id,
                        productName: product.name,
                        confidence,
                        taxIds: product.taxIds.length
                          ? product.taxIds
                          : taxIdsForRate(l.vatRate, taxList)
                      }
                    : l
                )
              }))
            }
          } catch {
            /* leave unmatched; user picks manually */
          }
        }
      }
      if (!cancelled) setMatching(false)
    })()
    return () => {
      cancelled = true
    }
    // Run once for the initial invoice set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateLine(lineId: string, patch: Partial<LineModel>) {
    onChange(active.id, (cur) => ({
      ...cur,
      lines: cur.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l))
    }))
  }

  function pickProduct(lineId: string, product: OdooProduct) {
    const line = active.lines.find((l) => l.id === lineId)
    updateLine(lineId, {
      productId: product.id,
      productName: product.name,
      confidence: 'exact',
      label: line?.label || product.name,
      taxIds: product.taxIds.length ? product.taxIds : taxIdsForRate(line?.vatRate ?? 20, taxes)
    })
    setPickerLine(null)
  }

  function addLine() {
    onChange(active.id, (cur) => ({ ...cur, lines: [...cur.lines, emptyLine()] }))
  }

  function removeLine(lineId: string) {
    onChange(active.id, (cur) => ({ ...cur, lines: cur.lines.filter((l) => l.id !== lineId) }))
  }

  function setPartner(partner: OdooPartner | null) {
    onChange(active.id, (cur) => ({ ...cur, partner }))
  }

  async function pushAll() {
    setPushing(true)
    const outcomes: PushOutcome[] = []
    for (const inv of invoices) {
      if (!isPushable(inv)) {
        outcomes.push({
          invoiceId: inv.id,
          customer: inv.customer.name,
          result: { ok: false, error: 'Facture incomplète : ' + blockingReasons(inv).join(', ') }
        })
        continue
      }
      const result = await window.api.createDraftInvoice({
        partnerId: inv.partner!.id,
        reference: inv.reference,
        lines: inv.lines.map((l) => ({
          name: l.label,
          productId: l.productId!,
          quantity: l.qty,
          priceUnit: l.unitPriceHT,
          taxIds: l.taxIds
        }))
      })
      outcomes.push({ invoiceId: inv.id, customer: inv.customer.name, result })
    }
    setPushing(false)
    onDone(outcomes)
  }

  const totals = useMemo(() => computeTotals(active?.lines ?? []), [active])
  const allReady = invoices.every(isPushable)
  const readyCount = invoices.filter(isPushable).length

  if (!active) return null

  const htMismatch = active.devisHT > 0 && Math.abs(totals.ht - active.devisHT) > 0.5

  return (
    <div className="flex h-full min-h-0">
      {/* Left rail: invoice list */}
      {invoices.length > 1 && (
        <aside className="w-64 shrink-0 overflow-y-auto border-r p-3" style={{ borderColor: 'var(--color-ink-600)' }}>
          <div className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Factures ({invoices.length})
          </div>
          {invoices.map((inv) => {
            const ok = isPushable(inv)
            const on = inv.id === active.id
            return (
              <button
                key={inv.id}
                onClick={() => setActiveId(inv.id)}
                className="mb-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors"
                style={{ background: on ? 'var(--color-ink-700)' : 'transparent' }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
                  style={{ background: ok ? 'var(--color-moss)' : 'var(--color-ink-500)' }}
                >
                  {ok ? <Check width={13} height={13} strokeWidth={3} /> : <Doc width={13} height={13} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-200">
                    {inv.customer.name || 'Client ?'}
                  </span>
                  <span className="tnum block text-[11px] text-neutral-500">
                    {inv.lines.length} ligne{inv.lines.length > 1 ? 's' : ''}
                  </span>
                </span>
              </button>
            )
          })}
        </aside>
      )}

      {/* Main editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-4xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl">Vérifier &amp; corriger</h1>
                <p className="mt-1 text-sm text-neutral-400">
                  Contrôlez le client, les lignes et les produits Odoo avant de créer le brouillon.
                </p>
              </div>
              {matching && (
                <span className="chip shrink-0" style={{ background: 'var(--color-ink-700)', color: '#c9c5bc' }}>
                  <Spinner width={14} height={14} /> Association des produits…
                </span>
              )}
            </div>

            {active.warnings.length > 0 && (
              <div className="mt-5">
                <WarningList warnings={active.warnings} />
              </div>
            )}

            <div className="mt-5">
              <PartnerPanel customer={active.customer} partner={active.partner} onChange={setPartner} />
            </div>

            {/* Lines */}
            <div className="paper mt-5 overflow-visible">
              <div
                className="grid items-center gap-3 border-b px-5 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500"
                style={{ gridTemplateColumns: '1fr 68px 104px 74px 108px 32px', borderColor: 'var(--color-paper-line)' }}
              >
                <span>Désignation / Produit Odoo</span>
                <span className="text-right">Qté</span>
                <span className="text-right">P.U. HT</span>
                <span className="text-right">TVA</span>
                <span className="text-right">Total HT</span>
                <span />
              </div>

              {active.lines.map((line) => {
                const lineHT = line.qty * line.unitPriceHT
                return (
                  <div
                    key={line.id}
                    className="grid items-start gap-3 border-b px-5 py-3.5 last:border-0"
                    style={{ gridTemplateColumns: '1fr 68px 104px 74px 108px 32px', borderColor: 'var(--color-paper-line)' }}
                  >
                    <div className="relative min-w-0">
                      <input
                        className="field !py-2 text-sm"
                        value={line.label}
                        placeholder="Désignation"
                        onChange={(e) => updateLine(line.id, { label: e.target.value })}
                      />
                      <div className="mt-1.5 flex items-center gap-2">
                        <ConfidenceBadge confidence={line.productId ? line.confidence : 'none'} />
                        <button
                          className="text-xs font-semibold text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline"
                          onClick={() => setPickerLine(pickerLine === line.id ? null : line.id)}
                        >
                          {line.productName ? `Produit : ${line.productName}` : 'Choisir un produit'}
                        </button>
                      </div>
                      {pickerLine === line.id && (
                        <ProductPicker
                          seedQuery={line.label}
                          currentName={line.productName}
                          onPick={(p) => pickProduct(line.id, p)}
                          onClose={() => setPickerLine(null)}
                        />
                      )}
                    </div>

                    <input
                      className="field tnum !py-2 text-right text-sm"
                      defaultValue={String(line.qty).replace('.', ',')}
                      onBlur={(e) => updateLine(line.id, { qty: parseInputNumber(e.target.value) })}
                    />
                    <input
                      className="field tnum !py-2 text-right text-sm"
                      defaultValue={line.unitPriceHT.toFixed(2).replace('.', ',')}
                      onBlur={(e) => updateLine(line.id, { unitPriceHT: parseInputNumber(e.target.value) })}
                    />
                    <div className="relative">
                      <input
                        className="field tnum !py-2 !pr-5 text-right text-sm"
                        defaultValue={String(line.vatRate)}
                        onBlur={(e) => {
                          const rate = parseInputNumber(e.target.value)
                          updateLine(line.id, {
                            vatRate: rate,
                            taxIds: line.taxIds.length && line.productId ? line.taxIds : taxIdsForRate(rate, taxes)
                          })
                        }}
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                        %
                      </span>
                    </div>
                    <div className="tnum py-2 text-right text-sm font-semibold text-neutral-800">
                      {formatEuro(lineHT)}
                    </div>
                    <button
                      className="mt-1.5 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-[var(--color-vermilion-100)] hover:text-[var(--color-vermilion-600)]"
                      onClick={() => removeLine(line.id)}
                      title="Supprimer la ligne"
                    >
                      <Trash width={15} height={15} />
                    </button>
                  </div>
                )
              })}

              <div className="px-5 py-3">
                <button
                  className="flex items-center gap-2 text-sm font-semibold text-[var(--color-vermilion-600)] hover:opacity-80"
                  onClick={addLine}
                >
                  <Plus width={15} height={15} /> Ajouter une ligne
                </button>
              </div>
            </div>

            {/* Totals + reconciliation */}
            <div className="mt-5 flex justify-end">
              <div className="paper w-full max-w-xs p-5">
                <TotalRow label="Total HT" value={formatEuro(totals.ht)} />
                <TotalRow label="TVA" value={formatEuro(totals.tva)} />
                <div className="my-2 h-px" style={{ background: 'var(--color-paper-line)' }} />
                <TotalRow label="Total TTC" value={formatEuro(totals.ttc)} strong />
                {active.devisTTC > 0 && (
                  <div
                    className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                    style={
                      htMismatch
                        ? { background: 'var(--color-amber-100)', color: '#7a5210' }
                        : { background: 'var(--color-moss-100)', color: 'var(--color-moss)' }
                    }
                  >
                    {htMismatch ? <Warn width={14} height={14} /> : <Check width={14} height={14} />}
                    <span className="tnum">
                      Devis : {formatEuro(active.devisTTC)} TTC
                      {htMismatch ? ' — écart détecté' : ' — concordant'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky action bar */}
        <div
          className="flex items-center justify-between border-t px-6 py-4"
          style={{ borderColor: 'var(--color-ink-600)', background: 'var(--color-ink)' }}
        >
          <button className="btn btn-ghost" onClick={onBack} disabled={pushing}>
            <ArrowLeft width={16} height={16} /> Retour
          </button>

          <div className="flex items-center gap-4">
            {!allReady && (
              <span className="hidden text-xs text-neutral-400 sm:block">
                {readyCount}/{invoices.length} facture{invoices.length > 1 ? 's' : ''} prête
                {readyCount > 1 ? 's' : ''} · complétez les produits &amp; clients
              </span>
            )}
            <button className="btn btn-primary" onClick={pushAll} disabled={pushing || readyCount === 0}>
              {pushing ? <Spinner width={16} height={16} /> : <ArrowRight width={16} height={16} />}
              {pushing
                ? 'Création en cours…'
                : `Créer ${readyCount > 1 ? `les ${readyCount} brouillons` : 'le brouillon'} dans Odoo`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={strong ? 'font-semibold text-neutral-800' : 'text-sm text-neutral-500'}>
        {label}
      </span>
      <span
        className={'tnum ' + (strong ? 'text-lg font-bold text-neutral-900' : 'text-sm text-neutral-700')}
      >
        {value}
      </span>
    </div>
  )
}
