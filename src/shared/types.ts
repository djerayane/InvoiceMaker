/**
 * Shared type contract between the Electron main process, the preload bridge,
 * and the React renderer. Keep this file dependency-free so it can be imported
 * from any process.
 */

export type MatchConfidence = 'exact' | 'fuzzy' | 'none'

/** A single line as read from a devis, plus the Odoo product it maps to. */
export interface DevisLine {
  /** Full designation text as it appears on the devis. */
  rawDescription: string
  /** Short label used for matching / display (first meaningful line of the designation). */
  label: string
  qty: number
  unitPriceHT: number
  /** VAT rate in percent, e.g. 20. */
  vatRate: number
  /** Odoo product.product id once matched. */
  productId?: number
  productName?: string
  /** How confident the automatic product match is. */
  matchConfidence: MatchConfidence
}

export interface DevisCustomer {
  name: string
  address?: string
  zip?: string
  city?: string
  email?: string
  phone?: string
}

/** Structured data extracted from one devis PDF. */
export interface DevisData {
  /** Absolute path of the source PDF. */
  sourceFile: string
  /** File name only, for display. */
  fileName: string
  devisNumber?: string
  date?: string
  reference?: string
  customer: DevisCustomer
  lines: DevisLine[]
  totalHT: number
  totalTVA: number
  totalTTC: number
  /** Human-readable warnings raised while parsing (missing fields, low confidence…). */
  warnings: string[]
}

/** Odoo connection settings entered during onboarding. The API key is stored separately, encrypted. */
export interface OdooSettings {
  url: string
  db: string
  username: string
}

export interface OdooProduct {
  id: number
  name: string
  defaultCode?: string
  listPrice?: number
  /** account.tax ids attached to the product (customer taxes). */
  taxIds: number[]
}

export interface OdooPartner {
  id: number
  name: string
  email?: string
  city?: string
  zip?: string
}

export interface OdooTax {
  id: number
  name: string
  amount: number
}

/** Result of testing / establishing an Odoo connection. */
export interface ConnectionResult {
  ok: boolean
  /** Odoo user id when ok. */
  uid?: number
  /** Localised (French) error message when not ok. */
  error?: string
  /** Machine code so the UI can tailor guidance. */
  code?: 'network' | 'auth' | 'database' | 'url' | 'unknown'
}

/** A push request: one draft invoice built from one or more devis. */
export interface InvoiceDraftRequest {
  partnerId: number
  /** Free reference shown on the invoice (e.g. devis number). */
  reference?: string
  lines: Array<{
    name: string
    productId: number
    quantity: number
    priceUnit: number
    taxIds: number[]
  }>
}

export interface PushResult {
  ok: boolean
  moveId?: number
  /** Odoo invoice display name once created (may be "/" while still draft). */
  name?: string
  error?: string
}

/** Auto-update state pushed from the main process to the renderer. */
export interface UpdateStatus {
  state: 'available' | 'downloading' | 'downloaded' | 'error' | 'not-available'
  version?: string
  /** Download progress 0–100 while state is 'downloading'. */
  percent?: number
  message?: string
}

/** The typed IPC surface exposed on window.api by the preload bridge. */
export interface Api {
  isOnboarded: () => Promise<boolean>
  getSettings: () => Promise<OdooSettings | null>
  saveConnection: (
    settings: OdooSettings & { apiKey: string }
  ) => Promise<ConnectionResult>
  testConnection: (
    settings: OdooSettings & { apiKey: string }
  ) => Promise<ConnectionResult>
  clearConnection: () => Promise<void>

  pickDevisFiles: () => Promise<string[]>
  parseDevis: (filePaths: string[]) => Promise<DevisData[]>

  searchProducts: (query: string) => Promise<OdooProduct[]>
  matchProduct: (label: string) => Promise<{ product: OdooProduct | null; confidence: MatchConfidence }>
  searchPartners: (name: string) => Promise<OdooPartner[]>
  createPartner: (customer: DevisCustomer) => Promise<OdooPartner>
  listSaleTaxes: () => Promise<OdooTax[]>

  createDraftInvoice: (request: InvoiceDraftRequest) => Promise<PushResult>

  /** Open a URL in the user's default browser. */
  openExternal: (url: string) => Promise<void>

  /** Subscribe to auto-update status; returns an unsubscribe function. */
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void
  /** Download the pending update. */
  downloadUpdate: () => Promise<void>
  /** Quit and install the downloaded update. */
  installUpdate: () => Promise<void>
}
