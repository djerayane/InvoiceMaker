import type {
  DevisData,
  DevisCustomer,
  OdooPartner,
  MatchConfidence
} from '@shared/types'

/** One editable invoice line in the review UI. */
export interface LineModel {
  id: string
  label: string
  qty: number
  unitPriceHT: number
  vatRate: number
  productId?: number
  productName?: string
  taxIds: number[]
  confidence: MatchConfidence
}

/** One draft invoice being prepared (may combine several devis). */
export interface InvoiceModel {
  id: string
  /** File names of the devis this invoice was built from. */
  sources: string[]
  customer: DevisCustomer
  partner: OdooPartner | null
  lines: LineModel[]
  /** Reference values read from the devis, for reconciliation display. */
  devisHT: number
  devisTVA: number
  devisTTC: number
  reference?: string
  warnings: string[]
}

let seq = 0
function uid(prefix: string): string {
  seq += 1
  return `${prefix}-${seq}`
}

/** Build one invoice model per devis (the default, non-merged case). */
export function invoiceFromDevis(d: DevisData): InvoiceModel {
  return {
    id: uid('inv'),
    sources: [d.fileName],
    customer: { ...d.customer },
    partner: null,
    lines: d.lines.map((l) => ({
      id: uid('line'),
      label: l.label || l.rawDescription,
      qty: l.qty,
      unitPriceHT: l.unitPriceHT,
      vatRate: l.vatRate,
      taxIds: [],
      confidence: 'none' as MatchConfidence
    })),
    devisHT: d.totalHT,
    devisTVA: d.totalTVA,
    devisTTC: d.totalTTC,
    reference: d.devisNumber,
    warnings: [...d.warnings]
  }
}

/** Merge several devis into a single invoice. Customer is taken from the first. */
export function mergeDevis(list: DevisData[]): InvoiceModel {
  const [first, ...rest] = list
  const base = invoiceFromDevis(first)
  for (const d of rest) {
    const extra = invoiceFromDevis(d)
    base.lines.push(...extra.lines)
    base.sources.push(...extra.sources)
    base.devisHT += d.totalHT
    base.devisTVA += d.totalTVA
    base.devisTTC += d.totalTTC
    base.warnings.push(...d.warnings)
  }
  base.reference = list.map((d) => d.devisNumber).filter(Boolean).join(' + ') || undefined
  return base
}

export function emptyLine(): LineModel {
  return {
    id: uid('line'),
    label: '',
    qty: 1,
    unitPriceHT: 0,
    vatRate: 20,
    taxIds: [],
    confidence: 'none'
  }
}

export interface InvoiceTotals {
  ht: number
  tva: number
  ttc: number
}

/** Recompute HT / TVA / TTC from the current lines. */
export function computeTotals(lines: LineModel[]): InvoiceTotals {
  let ht = 0
  let tva = 0
  for (const l of lines) {
    const lineHT = l.qty * l.unitPriceHT
    ht += lineHT
    tva += lineHT * (l.vatRate / 100)
  }
  const round = (n: number): number => Math.round(n * 100) / 100
  return { ht: round(ht), tva: round(tva), ttc: round(ht + tva) }
}

/** Whether an invoice is ready to be pushed (partner + every line has a product). */
export function isPushable(inv: InvoiceModel): boolean {
  if (!inv.partner) return false
  if (inv.lines.length === 0) return false
  return inv.lines.every((l) => typeof l.productId === 'number' && l.label.trim().length > 0)
}

/** Human-readable list of what still blocks a push. */
export function blockingReasons(inv: InvoiceModel): string[] {
  const reasons: string[] = []
  if (!inv.partner) reasons.push('Client Odoo non sélectionné')
  if (inv.lines.length === 0) reasons.push('Aucune ligne')
  const unmatched = inv.lines.filter((l) => typeof l.productId !== 'number').length
  if (unmatched > 0)
    reasons.push(`${unmatched} ligne${unmatched > 1 ? 's' : ''} sans produit Odoo`)
  return reasons
}
