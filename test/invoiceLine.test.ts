import { describe, it, expect } from 'vitest'
import { composeLineName } from '../src/main/invoiceLine'

const product = { name: 'Porte-fenêtre coulissant 2 vantaux', displayName: 'Porte-fenêtre coulissant 2 vantaux' }

describe('composeLineName', () => {
  it('puts the product name before the devis detail', () => {
    expect(composeLineName(product, 'DT RENO AILE DE 27 - Haut. 997 x Larg. 690 mm')).toBe(
      'Porte-fenêtre coulissant 2 vantaux\nDT RENO AILE DE 27 - Haut. 997 x Larg. 690 mm'
    )
  })

  it('keeps the internal reference and sales description like Odoo does', () => {
    expect(
      composeLineName(
        { name: 'Fenêtre 1 vantail', displayName: '[F1] Fenêtre 1 vantail', descriptionSale: 'Aluminium RPT' },
        'Blanc - volet roulant'
      )
    ).toBe('[F1] Fenêtre 1 vantail\nAluminium RPT\nBlanc - volet roulant')
  })

  it('does not repeat the product when the detail already starts with it', () => {
    expect(composeLineName(product, 'Porte-fenêtre coulissant 2 vantaux')).toBe(
      'Porte-fenêtre coulissant 2 vantaux'
    )
    expect(composeLineName(product, 'porte-fenetre coulissant 2 vantaux - 2150 x 2400')).toBe(
      'porte-fenetre coulissant 2 vantaux - 2150 x 2400'
    )
  })

  it('falls back to the product alone when there is no detail', () => {
    expect(composeLineName(product, '  ')).toBe('Porte-fenêtre coulissant 2 vantaux')
  })
})
