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

function extractLineItems(lines: string[], warnings: string[]): DevisLine[] {
  const items: DevisLine[] = []

  // Strategy A — inline rows (facture style):
  //   "DESIGNATION ... 1,00 877,19 TVA 20% 877,19 €"
  const inlineRe = new RegExp(
    String.raw`^(.+?)\s+(\d+(?:,\d{1,2})?)\s+(${MONEY})\s+TVA\s+(\d+)\s*%\s+(${MONEY})\s*€?$`,
    'i'
  )
  for (const line of lines) {
    const m = line.match(inlineRe)
    if (m) {
      const label = m[1].trim()
      items.push({
        rawDescription: label,
        label,
        qty: parseFrenchNumber(m[2]),
        unitPriceHT: parseFrenchNumber(m[3]),
        vatRate: Number.parseInt(m[4], 10),
        matchConfidence: 'none'
      })
    }
  }
  if (items.length) return items

  // Strategy B2 — designation followed by trailing amounts on one row (wide table):
  //   "Coulissant 2 vantaux 2 rails 1 1 099,20 1 099,20 20"
  const trailingRe = new RegExp(
    String.raw`^(.+?[A-Za-zÀ-ÿ].*?)\s+(\d+(?:,\d{1,2})?)\s+(${MONEY})\s+(${MONEY})(?:\s+(\d{1,2}))?\s*€?$`
  )
  for (const line of lines) {
    if (/total|montant|hors taxes/i.test(line)) continue
    const m = line.match(trailingRe)
    if (m) {
      const label = m[1].trim()
      if (label.length < 3) continue
      items.push({
        rawDescription: label,
        label,
        qty: parseFrenchNumber(m[2]),
        unitPriceHT: parseFrenchNumber(m[3]),
        vatRate: m[5] ? Number.parseInt(m[5], 10) : 20,
        matchConfidence: 'none'
      })
    }
  }
  if (items.length) return items

  // Strategy B — amount rows isolated from the designation (devis style):
  //   designation lines... then "1 1 099,20 1 099,20" and a standalone "20".
  const amountRowRe = new RegExp(
    String.raw`^(\d+(?:,\d{1,2})?)\s+(${MONEY})\s+(${MONEY})$`
  )
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(amountRowRe)
    if (!m) continue
    const qty = parseFrenchNumber(m[1])
    const unit = parseFrenchNumber(m[2])
    // Use the nearest preceding non-numeric, reasonably short line as the label.
    let label = ''
    for (let j = i - 1; j >= 0 && j > i - 8; j--) {
      const cand = lines[j].trim()
      if (!cand) continue
      if (/^[.\-·•]/.test(cand)) continue // sub-spec bullet lines
      if (/€|H\.?T\.?|TVA|Qté|Total|Visuel|Désignation/i.test(cand)) continue
      if (cand.length >= 3 && cand.length <= 80) {
        label = cand
        break
      }
    }
    // A standalone VAT rate often sits just after the amount row.
    let vat = 20
    for (let j = i; j < Math.min(i + 3, lines.length); j++) {
      const vm = lines[j].match(/^(\d{1,2})$/)
      if (vm) {
        vat = Number.parseInt(vm[1], 10)
        break
      }
    }
    if (!label) {
      label = 'Article'
      warnings.push('Une ligne a été détectée sans description claire — vérifiez le libellé.')
    }
    items.push({
      rawDescription: label,
      label,
      qty,
      unitPriceHT: unit,
      vatRate: vat,
      matchConfidence: 'none'
    })
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
