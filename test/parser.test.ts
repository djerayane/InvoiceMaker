import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseLines, parseFrenchNumber, parseDevis } from '../src/main/parser'

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
