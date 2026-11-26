/**
 * Builds the description ("name") of an Odoo invoice line.
 *
 * Odoo fills a line's description from the product (its display name, plus its
 * sales description when there is one) as soon as a product is chosen. Sending
 * our own `name` replaces that text entirely, so the customer only saw the
 * detail read from the devis (e.g. "DT RENO AILE DE 27 - Haut. 997 x Larg. 690 mm")
 * without knowing whether it is a window or a door. We rebuild what Odoo would
 * have written and append the devis detail underneath, exactly like a user
 * completing the line by hand.
 */

export interface ProductDescriptionSource {
  /** Product name without the internal reference, e.g. "Porte-fenêtre coulissant 2 vantaux". */
  name: string
  /** Odoo display name, e.g. "[PF-02] Porte-fenêtre coulissant 2 vantaux". */
  displayName?: string
  /** Sales description set on the product, if any. */
  descriptionSale?: string
}

function simplify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function composeLineName(product: ProductDescriptionSource, detail: string): string {
  const title = (product.displayName || product.name).trim()
  const descriptionSale = (product.descriptionSale || '').trim()
  const header = descriptionSale ? `${title}\n${descriptionSale}` : title
  const cleanDetail = detail.trim()
  if (!cleanDetail) return header

  // The detail already names the product (e.g. the user typed it, or the line
  // label defaulted to the product name): don't print the product twice.
  const d = simplify(cleanDetail)
  if (d.startsWith(simplify(product.name)) || d.startsWith(simplify(title))) return cleanDetail
  return `${header}\n${cleanDetail}`
}
