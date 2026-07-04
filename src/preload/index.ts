import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Api,
  OdooSettings,
  DevisCustomer,
  InvoiceDraftRequest,
  UpdateStatus
} from '@shared/types'

const api: Api = {
  isOnboarded: () => ipcRenderer.invoke('app:isOnboarded'),
  getSettings: () => ipcRenderer.invoke('app:getSettings'),
  saveConnection: (settings: OdooSettings & { apiKey: string }) =>
    ipcRenderer.invoke('odoo:save', settings),
  testConnection: (settings: OdooSettings & { apiKey: string }) =>
    ipcRenderer.invoke('odoo:test', settings),
  clearConnection: () => ipcRenderer.invoke('odoo:clear'),

  pickDevisFiles: () => ipcRenderer.invoke('devis:pick'),
  parseDevis: (filePaths: string[]) => ipcRenderer.invoke('devis:parse', filePaths),

  searchProducts: (query: string) => ipcRenderer.invoke('odoo:searchProducts', query),
  matchProduct: (label: string) => ipcRenderer.invoke('odoo:matchProduct', label),
  searchPartners: (name: string) => ipcRenderer.invoke('odoo:searchPartners', name),
  createPartner: (customer: DevisCustomer) => ipcRenderer.invoke('odoo:createPartner', customer),
  listSaleTaxes: () => ipcRenderer.invoke('odoo:listSaleTaxes'),

  createDraftInvoice: (request: InvoiceDraftRequest) =>
    ipcRenderer.invoke('odoo:createDraftInvoice', request),

  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),

  onUpdateStatus: (cb: (status: UpdateStatus) => void) => {
    const listener = (_e: unknown, status: UpdateStatus): void => cb(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install')
}

contextBridge.exposeInMainWorld('api', api)

// Helper to resolve the absolute path of a drag-and-dropped File (Electron >= 32).
contextBridge.exposeInMainWorld('files', {
  pathFor: (file: File): string => webUtils.getPathForFile(file)
})
