import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { DevisData, DevisLine, DevisCustomer } from '@shared/types'

/**
 * Offline heuristic parser for devis PDFs. It extracts the text of the PDF
 * (preserving visual line order), then applies template heuristics to pull out
 * the customer, the line items and the totals. It never throws: anything it is
 * unsure about is added to `warnings` so the user can fix it in the preview step.
 */

/** Parse a French-formatted number: "1 099,20" / "-1 375,00" -> number. */
export function parseFrenchNumber(raw: string): number {
  const cleaned = raw
    .replace(/[\s  ]/g, '')
    .replace(/€/g, '')
    .replace(/\./g, '') // thousands separators written as dots, if any
    .replace(',', '.')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

const MONEY = String.raw`-?\d[\d\s  .]*,\d{2}`

/** Extract the PDF text as an array of visual lines (top-to-bottom, left-to-right). */
async function extractLines(filePath: string): Promise<string[]> {
  const data = new Uint8Array(await readFile(filePath))
  // Dynamic import keeps the ESM-only pdfjs build loadable from our CJS main bundle.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise

  const lines: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    // Group text items into rows by their y coordinate.
    const rows = new Map<number, { x: number; str: string }[]>()
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!('str' in item)) continue
      const y = Math.round(item.transform[5])
      // Merge onto an existing row within a small vertical tolerance.
      let key = y
      for (const existing of rows.keys()) {
        if (Math.abs(existing - y) <= 2) {
          key = existing
          break
        }
      }
      const bucket = rows.get(key) ?? []
      bucket.push({ x: item.transform[4], str: item.str })
      rows.set(key, bucket)
    }
    const ordered = [...rows.entries()].sort((a, b) => b[0] - a[0])
    for (const [, items] of ordered) {
      const text = items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text) lines.push(text)
    }
  }
  await doc.cleanup()
  return lines
}

function firstMatch(lines: string[], re: RegExp): RegExpMatchArray | null {
  for (const line of lines) {
    const m = line.match(re)
    if (m) return m
  }
  return null
}

function extractCustomer(lines: string[], warnings: string[]): DevisCustomer {
  const customer: DevisCustomer = { name: '' }

  // The recipient usually starts with a civility (Mme./M./Mlle) or is an all-caps company.
  const civ = /^(M\.|Mme\.?|Mlle\.?|Monsieur|Madame|Melle)\s+(.+)/i
  let startIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (civ.test(lines[i])) {
      startIdx = i
      customer.name = lines[i].replace(/\s+/g, ' ').trim()
      break
    }
  }

  if (startIdx >= 0) {
    // Following lines up to "France"/country or a blank are the customer's own
    // block. We only read the e-mail / phone from HERE so we never pick up the
    // vendor's contact details printed elsewhere on the page.
    const addressParts: string[] = []
    for (let i = startIdx + 1; i < Math.min(startIdx + 7, lines.length); i++) {
      const l = lines[i].trim()
      if (!l) break
      const emailMatch = l.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/)
      if (emailMatch) {
        customer.email = emailMatch[1]
        continue
      }
      const phoneMatch = l.match(/(?:t[ée]l\.?\s*:?\s*)?(0[\d\s.]{8,}\d)/i)
      if (phoneMatch) {
        customer.phone = phoneMatch[1].replace(/\s+/g, ' ').trim()
        continue
      }
      const zipMatch = l.match(/^(\d{5})\s+(.+)$/)
      if (zipMatch) {
        customer.zip = zipMatch[1]
        customer.city = zipMatch[2].trim()
        continue
      }
      if (/^(france|belgique|suisse|luxembourg)$/i.test(l)) break
      if (/^(adresse|contact)\b/i.test(l)) break
      addressParts.push(l)
    }
    if (addressParts.length) customer.address = addressParts.join(', ')
  } else {
    warnings.push("Nom du client non détecté automatiquement — à saisir dans l'aperçu.")
  }

  return customer
}

export interface ParsedRow {
  label: string
  qty: number
  unitPriceHT: number
  /** VAT rate when printed on the row itself. */
  vatRate?: number
  /** True when qty × unit price (minus any discount) matches the printed line total. */
  consistent: boolean
}

const CENTS_TOKEN = /^-?\d+(?:\.\d{3})*,\d{2}$/
const QTY_TOKEN = /^\d+(?:,\d{1,3})?$/
const PERCENT_TOKEN = /^\d{1,2}(?:,\d{1,2})?%$/

/**
 * All the ways the tokens ending just before `end` can be read as one French
 * amount ("1 099,20" is two tokens, "099,20" alone is also a valid reading).
 */
function moneyEndingAt(tokens: string[], end: number): Array<{ start: number; value: number }> {
  const out: Array<{ start: number; value: number }> = []
  const last = tokens[end - 1]
  if (end < 1 || !CENTS_TOKEN.test(last)) return out
  out.push({ start: end - 1, value: parseFrenchNumber(last) })
  // Extend leftwards with thousands groups: "1" "099,20", "12" "500" "000,00".
  let groupOk = /^\d{3},\d{2}$/.test(last)
  for (let s = end - 2; s >= 0 && groupOk; s--) {
    const t = tokens[s]
    if (!/^-?\d{1,3}$/.test(t)) break
    out.push({ start: s, value: parseFrenchNumber(tokens.slice(s, end).join(' ')) })
    groupOk = /^\d{3}$/.test(t)
  }
  return out
}

/**
 * Read a table row ending with amounts. Handles:
 *   "Désignation  qté  P.U.  total  [TVA]"            (wide table)
 *   "Désignation  qté  P.U.  TVA 20 %  total  €"     (facture)
 *   "Désignation  qté  P.U.  remise %  total  [TVA]" (with a discount column)
 *   "qté  P.U.  total"                                (amounts alone, label above)
 * Every possible split is tried and the one where qty × P.U. equals the printed
 * total wins, so a designation ending in a number ("AILE DE 27") or a price with
 * a thousands space ("1 099,20") is no longer mistaken for the quantity.
 */
export function parseAmountRow(line: string): ParsedRow | null {
  const tokens = line
    .replace(/(\d)\s*%/g, '$1%')
    .replace(/€/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length < 3) return null

  const candidates: ParsedRow[] = []
  // Optional trailing VAT column ("20", "20%", "5,5%").
  const vatOptions: Array<{ end: number; vat?: number }> = [{ end: tokens.length }]
  const lastTok = tokens[tokens.length - 1]
  if (/^\d{1,2}(?:,\d)?%?$/.test(lastTok) && !CENTS_TOKEN.test(lastTok)) {
    vatOptions.unshift({ end: tokens.length - 1, vat: parseFrenchNumber(lastTok.replace('%', '')) })
  }

  for (const v of vatOptions) {
    for (const total of moneyEndingAt(tokens, v.end)) {
      let e = total.start
      let vat = v.vat
      // Facture style: "... TVA 20% <total>".
      if (e >= 2 && /^tva$/i.test(tokens[e - 2]) && PERCENT_TOKEN.test(tokens[e - 1])) {
        vat = parseFrenchNumber(tokens[e - 1].replace('%', ''))
        e -= 2
      }
      // Optional discount column ("10%").
      let discount = 0
      if (e >= 1 && PERCENT_TOKEN.test(tokens[e - 1])) {
        discount = parseFrenchNumber(tokens[e - 1].replace('%', ''))
        e -= 1
      }
      for (const unit of moneyEndingAt(tokens, e)) {
        const qi = unit.start - 1
        if (qi < 0 || !QTY_TOKEN.test(tokens[qi])) continue
        const qty = parseFrenchNumber(tokens[qi])
        const label = tokens.slice(0, qi).join(' ').trim()
        if (label && (!/[A-Za-zÀ-ÿ]/.test(label) || label.length < 3)) continue
        const expected = qty * unit.value * (1 - discount / 100)
        const consistent =
          Math.abs(expected - total.value) <= Math.max(0.05, Math.abs(total.value) * 0.002)
        candidates.push({ label, qty, unitPriceHT: unit.value, vatRate: vat, consistent })
      }
    }
  }
  if (!candidates.length) return null
  // Prefer a reading whose total checks out; otherwise keep the shortest-label
  // reading (the historical behaviour) and let the user verify it.
  const consistent = candidates.filter((c) => c.consistent)
  const pool = consistent.length ? consistent : candidates
  return pool.reduce((best, c) => (c.label.length < best.label.length ? c : best))
}

function extractLineItems(lines: string[], warnings: string[]): DevisLine[] {
  const items: DevisLine[] = []
  let unsure = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/\btotal\b|montant|hors taxes|net [àa] payer/i.test(line)) continue
    const row = parseAmountRow(line)
    if (!row) continue

    let label = row.label
    if (!label) {
      // Amounts alone on their row (devis style): the designation sits above.
      for (let j = i - 1; j >= 0 && j > i - 8; j--) {
        const cand = lines[j].trim()
        if (!cand) continue
        if (/^[.\-·•]/.test(cand)) continue // sub-spec bullet lines
        if (/€|H\.?T\.?|TVA|Qté|Total|Visuel|Désignation/i.test(cand)) continue
        if (parseAmountRow(cand)) break // previous item's amounts: no label of our own
        if (cand.length >= 3 && cand.length <= 80) {
          label = cand
          break
        }
      }
    }
    let vat = row.vatRate
    if (vat === undefined) {
      // A standalone VAT rate often sits just after the amount row.
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const vm = lines[j].match(/^(\d{1,2}(?:,\d)?)\s*%?$/)
        if (vm) {
          vat = parseFrenchNumber(vm[1])
          break
        }
      }
    }
    if (!label) {
      label = 'Article'
      warnings.push('Une ligne a été détectée sans description claire — vérifiez le libellé.')
    }
    if (!row.consistent) unsure++
    items.push({
      rawDescription: label,
      label,
      qty: row.qty,
      unitPriceHT: row.unitPriceHT,
      vatRate: vat ?? 20,
      matchConfidence: 'none'
    })
  }

  if (unsure) {
    warnings.push(
      `${unsure} ligne${unsure > 1 ? 's' : ''} dont quantité × prix ne correspond pas au total ` +
        'imprimé — vérifiez quantité et prix.'
    )
  }
  if (!items.length) {
    warnings.push(
      "Aucune ligne d'article n'a pu être détectée automatiquement — ajoutez-les dans l'aperçu."
    )
  }
  return items
}

function extractTotals(
  lines: string[]
): { totalHT: number; totalTVA: number; totalTTC: number } {
  const m = (re: RegExp): number => {
    const found = firstMatch(lines, re)
    return found ? parseFrenchNumber(found[1]) : 0
  }
  const totalHT =
    m(new RegExp(String.raw`Total\s*HT\s*:?\s*(${MONEY})`, 'i')) ||
    m(new RegExp(String.raw`Montant\s+hors\s+taxes\s*(${MONEY})`, 'i'))
  const totalTVA =
    m(new RegExp(String.raw`Total\s*TVA\s*:?\s*(${MONEY})`, 'i')) ||
    m(new RegExp(String.raw`TVA\s*\d+\s*%\s*(${MONEY})`, 'i'))
  const totalTTC =
    m(new RegExp(String.raw`Total\s*TTC\s*:?\s*(${MONEY})`, 'i')) ||
    m(new RegExp(String.raw`\bTotal\b\s*(${MONEY})\s*€`, 'i'))
  return { totalHT, totalTVA, totalTTC }
}

/** Parse the given text lines into structured devis data (exported for testing). */
export function parseLines(lines: string[], fileName: string, sourceFile: string): DevisData {
  const warnings: string[] = []

  const devisMatch =
    firstMatch(lines, /DEVIS\s*N°\s*([A-Z0-9\-\/]+)/i) ||
    firstMatch(lines, /Facture\s+([A-Z0-9\-\/ ]+)/i)
  const dateMatch = firstMatch(lines, /Date(?:\s*de\s*la\s*facture)?\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)
  const refMatch = firstMatch(lines, /R[ée]f[ée]rence\s*:?\s*(.+)/i)

  const customer = extractCustomer(lines, warnings)
  const items = extractLineItems(lines, warnings)
  const totals = extractTotals(lines)

  // Reconciliation warning: does the sum of lines match the parsed HT total?
  if (items.length && totals.totalHT) {
    const sumHT = items.reduce((s, l) => s + l.qty * l.unitPriceHT, 0)
    if (Math.abs(sumHT - totals.totalHT) > 0.5) {
      warnings.push(
        `Le total des lignes (${sumHT.toFixed(2)} €) diffère du total HT du devis ` +
          `(${totals.totalHT.toFixed(2)} €) — vérifiez les lignes.`
      )
    }
  }

  return {
    sourceFile,
    fileName,
    devisNumber: devisMatch?.[1]?.trim(),
    date: dateMatch?.[1]?.trim(),
    reference: refMatch?.[1]?.trim(),
    customer,
    lines: items,
    totalHT: totals.totalHT,
    totalTVA: totals.totalTVA,
    totalTTC: totals.totalTTC,
    warnings
  }
}

/** Parse a single devis PDF file into structured data. */
export async function parseDevis(filePath: string): Promise<DevisData> {
  try {
    const lines = await extractLines(filePath)
    return parseLines(lines, basename(filePath), filePath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      sourceFile: filePath,
      fileName: basename(filePath),
      customer: { name: '' },
      lines: [],
      totalHT: 0,
      totalTVA: 0,
      totalTTC: 0,
      warnings: [`Lecture du PDF impossible : ${msg}`]
    }
  }
}
