import Odoo from 'odoo-await'
import type {
  OdooSettings,
  ConnectionResult,
  OdooProduct,
  OdooPartner,
  OdooTax,
  DevisCustomer,
  MatchConfidence,
  InvoiceDraftRequest,
  PushResult
} from '@shared/types'
import { getSettings, getApiKey } from './store'

type Creds = OdooSettings & { apiKey: string }

/** Split a user-pasted Odoo address into the pieces odoo-await needs. */
function parseUrl(rawUrl: string): { baseUrl: string; port: number } {
  let value = rawUrl.trim()
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value
  const u = new URL(value)
  const port = u.port ? Number(u.port) : u.protocol === 'http:' ? 80 : 443
  return { baseUrl: `${u.protocol}//${u.hostname}`, port }
}

function buildClient(creds: Creds): Odoo {
  const { baseUrl, port } = parseUrl(creds.url)
  return new Odoo({
    baseUrl,
    port,
    db: creds.db.trim(),
    username: creds.username.trim(),
    password: creds.apiKey.trim()
  })
}

/** Turn a raw connection error into a French message + machine code for the UI. */
function classifyError(err: unknown): ConnectionResult {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return {
      ok: false,
      code: 'url',
      error: "Adresse Odoo introuvable. Vérifiez l'adresse (ex. https://masociete.odoo.com)."
    }
  }
  if (lower.includes('econnrefused') || lower.includes('timeout') || lower.includes('etimedout')) {
    return {
      ok: false,
      code: 'network',
      error: 'Connexion au serveur Odoo impossible. Vérifiez votre connexion internet et réessayez.'
    }
  }
  if (lower.includes('database') || lower.includes('does not exist')) {
    return {
      ok: false,
      code: 'database',
      error: "Base de données introuvable. Vérifiez le nom de la base (souvent le début de l'adresse)."
    }
  }
  if (lower.includes('access denied') || lower.includes('authenticate') || lower.includes('credentials')) {
    return {
      ok: false,
      code: 'auth',
      error: "Identifiant ou clé API refusé. Vérifiez votre e-mail de connexion et votre clé API."
    }
  }
  return { ok: false, code: 'unknown', error: `Connexion échouée : ${msg}` }
}

/** Attempt to connect with the given credentials. Never throws. */
export async function testConnection(creds: Creds): Promise<ConnectionResult> {
  try {
    const client = buildClient(creds)
    const uid = await client.connect()
    if (!uid || typeof uid !== 'number') {
      return {
        ok: false,
        code: 'auth',
        error: "Identifiant ou clé API refusé. Vérifiez votre e-mail de connexion et votre clé API."
      }
    }
    return { ok: true, uid }
  } catch (err) {
    return classifyError(err)
  }
}

/** Build a connected client from the stored (onboarded) credentials. */
async function connectedClient(): Promise<Odoo> {
  const settings = getSettings()
  const apiKey = getApiKey()
  if (!settings || !apiKey) {
    throw new Error("Aucune connexion Odoo configurée. Terminez d'abord la configuration.")
  }
  const client = buildClient({ ...settings, apiKey })
  await client.connect()
  return client
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toProduct(r: Record<string, unknown>): OdooProduct {
  return {
    id: r.id as number,
    name: r.name as string,
    defaultCode: typeof r.default_code === 'string' ? r.default_code : undefined,
    listPrice: typeof r.list_price === 'number' ? r.list_price : undefined,
    taxIds: Array.isArray(r.taxes_id) ? (r.taxes_id as number[]) : []
  }
}

const PRODUCT_FIELDS = ['name', 'default_code', 'list_price', 'taxes_id']

export async function searchProducts(query: string): Promise<OdooProduct[]> {
  const client = await connectedClient()
  const q = query.trim()
  const domain = q ? [['name', 'ilike', q]] : []
  const rows = (await client.searchRead('product.product', domain, PRODUCT_FIELDS, {
    limit: 25,
    order: 'name asc'
  })) as Record<string, unknown>[]
  return rows.map(toProduct)
}

/** Automatic product match: exact name first, then a fuzzy contains match. */
export async function matchProduct(
  label: string
): Promise<{ product: OdooProduct | null; confidence: MatchConfidence }> {
  const client = await connectedClient()
  const trimmed = label.trim()
  if (!trimmed) return { product: null, confidence: 'none' }

  const exact = (await client.searchRead(
    'product.product',
    [['name', '=ilike', trimmed]],
    PRODUCT_FIELDS,
    { limit: 1 }
  )) as Record<string, unknown>[]
  if (exact.length) return { product: toProduct(exact[0]), confidence: 'exact' }

  const fuzzy = (await client.searchRead(
    'product.product',
    [['name', 'ilike', trimmed]],
    PRODUCT_FIELDS,
    { limit: 5 }
  )) as Record<string, unknown>[]
  if (fuzzy.length) {
    const target = normalise(trimmed)
    const best =
      fuzzy.find((r) => normalise(r.name as string) === target) ?? fuzzy[0]
    const confidence: MatchConfidence =
      normalise(best.name as string) === target ? 'exact' : 'fuzzy'
    return { product: toProduct(best), confidence }
  }
  return { product: null, confidence: 'none' }
}

export async function searchPartners(name: string): Promise<OdooPartner[]> {
  const client = await connectedClient()
  const q = name.trim()
  const domain = q ? [['name', 'ilike', q]] : []
  const rows = (await client.searchRead('res.partner', domain, ['name', 'email', 'city', 'zip'], {
    limit: 12,
    order: 'name asc'
  })) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    email: typeof r.email === 'string' ? r.email : undefined,
    city: typeof r.city === 'string' ? r.city : undefined,
    zip: typeof r.zip === 'string' ? r.zip : undefined
  }))
}

export async function createPartner(customer: DevisCustomer): Promise<OdooPartner> {
  const client = await connectedClient()
  // Note: do not set `company_type` — it is not a writable field on res.partner
  // (removed/computed in recent Odoo). Leave the partner as an individual (default).
  const payload: Record<string, unknown> = { name: customer.name }
  if (customer.address) payload.street = customer.address
  if (customer.zip) payload.zip = customer.zip
  if (customer.city) payload.city = customer.city
  if (customer.email) payload.email = customer.email
  if (customer.phone) payload.phone = customer.phone
  const id = (await client.create('res.partner', payload)) as number
  return {
    id,
    name: customer.name,
    email: customer.email,
    city: customer.city,
    zip: customer.zip
  }
}

export async function listSaleTaxes(): Promise<OdooTax[]> {
  const client = await connectedClient()
  const rows = (await client.searchRead(
    'account.tax',
    [['type_tax_use', '=', 'sale']],
    ['name', 'amount'],
    { limit: 50, order: 'amount desc' }
  )) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    amount: r.amount as number
  }))
}

export async function createDraftInvoice(request: InvoiceDraftRequest): Promise<PushResult> {
  try {
    const client = await connectedClient()
    const invoiceLines = request.lines.map((l) => [
      0,
      0,
      {
        product_id: l.productId,
        name: l.name,
        quantity: l.quantity,
        price_unit: l.priceUnit,
        tax_ids: [[6, 0, l.taxIds]]
      }
    ])
    const payload: Record<string, unknown> = {
      move_type: 'out_invoice',
      partner_id: request.partnerId,
      invoice_line_ids: invoiceLines
    }
    if (request.reference) payload.ref = request.reference
    const moveId = (await client.create('account.move', payload)) as number
    const [move] = (await client.read('account.move', [moveId], ['name', 'state'])) as Record<
      string,
      unknown
    >[]
    return { ok: true, moveId, name: (move?.name as string) || '/' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Création du brouillon impossible : ${msg}` }
  }
}
