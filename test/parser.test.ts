import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseLines, parseFrenchNumber, parseDevis, parseAmountRow } from '../src/main/parser'

describe('parseFrenchNumber', () => {
  it('parses French-formatted amounts', () => {
    expect(parseFrenchNumber('1 099,20')).toBeCloseTo(1099.2)
    expect(parseFrenchNumber('1 099,20 €')).toBeCloseTo(1099.2)
    expect(parseFrenchNumber('-1 375,00')).toBeCloseTo(-1375)
    expect(parseFrenchNumber('219,83')).toBeCloseTo(219.83)
  })
})

// Fabricated devis in the vendor's "devis" template (amounts isolated from the
// designation). All names/addresses/numbers here are made up for testing only.
const devisLines = [
  'DEVIS N° 00001',
  'Date : 01/01/2026',
  'Référence : client demo',
  'ADRESSE',
  'CONTACT',
  'Mme. EXEMPLE Claire',
  '10 Rue de la Démonstration',
  '75001 Paris',
  'France',
  'Visuel Désignation Qté P.U.H.T. Total H.T. TVA',
  'Menuiserie aluminium - Gamme exemple à rupture de pont thermique - Label',
  '. Couleur intérieure de la menuiserie : Blanc',
  '. Pose en rénovation',
  'Coulissant 2 vantaux 2 rails',
  '1 1 099,20 1 099,20',
  '20',
  'Total HT : 1 099,20 €',
  'Total TVA : 219,83 €',
  'Total TTC : 1 319,03 €'
]

describe('parseLines — devis style (isolated amounts)', () => {
  const d = parseLines(devisLines, 'exemple-devis.pdf', '/tmp/exemple-devis.pdf')

  it('reads the devis number and date', () => {
    expect(d.devisNumber).toBe('00001')
    expect(d.date).toBe('01/01/2026')
  })

  it('reads the customer', () => {
    expect(d.customer.name).toBe('Mme. EXEMPLE Claire')
    expect(d.customer.zip).toBe('75001')
    expect(d.customer.city).toBe('Paris')
  })

  it('reads one line item', () => {
    expect(d.lines).toHaveLength(1)
    expect(d.lines[0].qty).toBeCloseTo(1)
    expect(d.lines[0].unitPriceHT).toBeCloseTo(1099.2)
    expect(d.lines[0].vatRate).toBe(20)
    expect(d.lines[0].label).toBe('Coulissant 2 vantaux 2 rails')
  })

  it('reads the totals', () => {
    expect(d.totalHT).toBeCloseTo(1099.2)
    expect(d.totalTVA).toBeCloseTo(219.83)
    expect(d.totalTTC).toBeCloseTo(1319.03)
  })
})

// Wide-table extraction: designation and all amounts land on one row.
describe('parseLines — wide table (designation + trailing amounts)', () => {
  const d = parseLines(
    [
      'Désignation Qté P.U.H.T. Total H.T. TVA',
      'Coulissant 2 vantaux 2 rails 1 1 099,20 1 099,20 20',
      'Total HT : 1 099,20 €'
    ],
    'w.pdf',
    '/tmp/w.pdf'
  )
  it('extracts the line with label, qty, price and vat', () => {
    expect(d.lines).toHaveLength(1)
    expect(d.lines[0].label).toBe('Coulissant 2 vantaux 2 rails')
    expect(d.lines[0].qty).toBeCloseTo(1)
    expect(d.lines[0].unitPriceHT).toBeCloseTo(1099.2)
    expect(d.lines[0].vatRate).toBe(20)
  })
})

// Fabricated document in the "facture" template (inline amounts + VAT).
const factureLines = [
  'Facture FACTURE 2026-01/00001',
  'Date de la facture : 01/01/2026',
  'FENETRE 2 VTX HT 1850 X 1180 1,00 877,19 TVA 20% 877,19 €',
  'FENETRE 2 VTX HT 1850 X 1180 2,00 847,74 TVA 20% 1 695,48 €',
  'ACOMPTE DEJA VERSE 1,00 -1 375,00 TVA 20% -1 375,00 €',
  'Montant hors taxes 3 579,46 €',
  'TVA 20% 715,90 €',
  'Total 4 295,36 €'
]

describe('parseLines — facture style (inline amounts)', () => {
  const d = parseLines(factureLines, 'exemple-facture.pdf', '/tmp/exemple-facture.pdf')

  it('reads inline line items including negatives', () => {
    expect(d.lines).toHaveLength(3)
    expect(d.lines[0].qty).toBeCloseTo(1)
    expect(d.lines[0].unitPriceHT).toBeCloseTo(877.19)
    expect(d.lines[1].qty).toBeCloseTo(2)
    expect(d.lines[2].unitPriceHT).toBeCloseTo(-1375)
  })

  it('reads the totals', () => {
    expect(d.totalHT).toBeCloseTo(3579.46)
    expect(d.totalTTC).toBeCloseTo(4295.36)
  })
})

// Real end-to-end extraction — runs only if a local sample PDF is present.
// The sample folder is git-ignored; no real document is ever committed.
const samplePdf = join(__dirname, '..', 'samples', 'exemple-devis.pdf')
describe.skipIf(!existsSync(samplePdf))('parseDevis — local sample PDF', () => {
  it('extracts a devis from an actual PDF', async () => {
    const d = await parseDevis(samplePdf)
    expect(d.customer.name.length).toBeGreaterThan(0)
    expect(d.totalTTC).toBeGreaterThan(0)
  })
})

describe('parseAmountRow — quantity / price disambiguation', () => {
  it('does not take a number ending the designation for the quantity', () => {
    const r = parseAmountRow('DT RENO AILE DE 27 1 997,00 997,00 20')!
    expect(r.label).toBe('DT RENO AILE DE 27')
    expect(r.qty).toBe(1)
    expect(r.unitPriceHT).toBeCloseTo(997)
    expect(r.vatRate).toBe(20)
    expect(r.consistent).toBe(true)
  })

  it('reads thousands-separated prices with quantities above 1', () => {
    const r = parseAmountRow('Fenêtre 2 vantaux 3 1 250,00 3 750,00')!
    expect(r.label).toBe('Fenêtre 2 vantaux')
    expect(r.qty).toBe(3)
    expect(r.unitPriceHT).toBeCloseTo(1250)
  })

  it('handles a discount column', () => {
    const r = parseAmountRow('Volet roulant 2 500,00 10 % 900,00 20')!
    expect(r.qty).toBe(2)
    expect(r.unitPriceHT).toBeCloseTo(500)
    expect(r.consistent).toBe(true)
  })

  it('reads amount-only rows', () => {
    const r = parseAmountRow('4 1 099,20 4 396,80')!
    expect(r.label).toBe('')
    expect(r.qty).toBe(4)
    expect(r.unitPriceHT).toBeCloseTo(1099.2)
  })
})

describe('parseLines — large devis with many lines', () => {
  const lines = ['DEVIS N° 00002', 'Mme. EXEMPLE Claire', '75001 Paris', 'Désignation Qté P.U.H.T. Total H.T. TVA']
  let sum = 0
  for (let n = 1; n <= 40; n++) {
    const qty = (n % 3) + 1
    const unit = 1000 + n * 7.5
    const fmt = (v: number): string =>
      v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    lines.push(`Fenêtre aile de 27 n°${n}`, '. Couleur : Blanc', `${qty} ${fmt(unit)} ${fmt(qty * unit)}`, '20')
    sum += qty * unit
  }
  lines.push(`Total HT : ${sum.toFixed(2).replace('.', ',')} €`)
  const d = parseLines(lines, 'big.pdf', '/tmp/big.pdf')

  it('extracts every line with the right quantity and price', () => {
    expect(d.lines).toHaveLength(40)
    expect(d.lines[0].label).toBe('Fenêtre aile de 27 n°1')
    expect(d.lines[0].qty).toBe(2)
    expect(d.lines[0].unitPriceHT).toBeCloseTo(1007.5)
    expect(d.lines.reduce((s, l) => s + l.qty * l.unitPriceHT, 0)).toBeCloseTo(sum)
    expect(d.warnings.filter((w) => /vérifiez/.test(w))).toHaveLength(0)
  })
})
