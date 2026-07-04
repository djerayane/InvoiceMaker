/** Formatting helpers for French locale money / numbers. */

const euro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const num2 = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function formatEuro(value: number): string {
  return euro.format(Number.isFinite(value) ? value : 0)
}

export function formatNumber(value: number): string {
  return num2.format(Number.isFinite(value) ? value : 0)
}

/** Parse a value typed in a French-style number input ("1 099,20" or "1099.20"). */
export function parseInputNumber(raw: string): number {
  const cleaned = raw.replace(/[\s  €]/g, '').replace(',', '.')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}
