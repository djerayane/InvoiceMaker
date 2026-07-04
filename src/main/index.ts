import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'node:path'
import type {
  OdooSettings,
  DevisCustomer,
  InvoiceDraftRequest
} from '@shared/types'
import { getSettings, saveSettings, clearSettings, isOnboarded } from './store'
import {
  testConnection,
  searchProducts,
  matchProduct,
  searchPartners,
  createPartner,
  listSaleTaxes,
  createDraftInvoice
} from './odoo'
import { parseDevis } from './parser'
import { initUpdater, downloadUpdate, installUpdate } from './updater'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 680,
    show: false,
    backgroundColor: '#24272b',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('app:isOnboarded', () => isOnboarded())
  ipcMain.handle('app:getSettings', () => getSettings())

  ipcMain.handle('odoo:test', (_e, creds: OdooSettings & { apiKey: string }) =>
    testConnection(creds)
  )

  ipcMain.handle('odoo:save', async (_e, creds: OdooSettings & { apiKey: string }) => {
    const result = await testConnection(creds)
    if (result.ok) {
      saveSettings({ url: creds.url, db: creds.db, username: creds.username }, creds.apiKey)
    }
    return result
  })

  ipcMain.handle('odoo:clear', () => clearSettings())

  ipcMain.handle('devis:pick', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Choisir un ou plusieurs devis',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Devis PDF', extensions: ['pdf'] }]
    })
    return res.canceled ? [] : res.filePaths
  })

  ipcMain.handle('devis:parse', async (_e, filePaths: string[]) => {
    return Promise.all(filePaths.map((f) => parseDevis(f)))
  })

  ipcMain.handle('odoo:searchProducts', (_e, query: string) => searchProducts(query))
  ipcMain.handle('odoo:matchProduct', (_e, label: string) => matchProduct(label))
  ipcMain.handle('odoo:searchPartners', (_e, name: string) => searchPartners(name))
  ipcMain.handle('odoo:createPartner', (_e, customer: DevisCustomer) => createPartner(customer))
  ipcMain.handle('odoo:listSaleTaxes', () => listSaleTaxes())
  ipcMain.handle('odoo:createDraftInvoice', (_e, request: InvoiceDraftRequest) =>
    createDraftInvoice(request)
  )

  ipcMain.handle('app:openExternal', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:install', () => installUpdate())
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  initUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
