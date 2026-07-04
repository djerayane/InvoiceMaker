import { useCallback, useEffect, useState } from 'react'
import type { OdooSettings } from '@shared/types'
import type { InvoiceModel } from './model'
import { TopBar } from './components/TopBar'
import { Onboarding } from './screens/Onboarding'
import { Import } from './screens/Import'
import { Review, type PushOutcome } from './screens/Review'
import { Result } from './screens/Result'
import { UpdateBanner } from './components/UpdateBanner'
import { Spinner } from './components/icons'

type Phase = 'loading' | 'onboarding' | 'import' | 'review' | 'result'

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [settings, setSettings] = useState<OdooSettings | null>(null)
  const [reconfigure, setReconfigure] = useState(false)
  const [invoices, setInvoices] = useState<InvoiceModel[]>([])
  const [outcomes, setOutcomes] = useState<PushOutcome[]>([])

  const refreshSettings = useCallback(async () => {
    setSettings(await window.api.getSettings())
  }, [])

  useEffect(() => {
    ;(async () => {
      const onboarded = await window.api.isOnboarded()
      await refreshSettings()
      setPhase(onboarded ? 'import' : 'onboarding')
    })()
  }, [refreshSettings])

  const stepFor = (p: Phase) => {
    const map: Record<string, { index: number; label: string }> = {
      import: { index: 1, label: 'Importer' },
      review: { index: 2, label: 'Vérifier' },
      result: { index: 3, label: 'Terminé' }
    }
    const s = map[p]
    return s ? { ...s, total: 3 } : undefined
  }

  const updateInvoice = useCallback(
    (id: string, updater: (inv: InvoiceModel) => InvoiceModel) => {
      setInvoices((list) => list.map((inv) => (inv.id === id ? updater(inv) : inv)))
    },
    []
  )

  if (phase === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        <Spinner width={26} height={26} />
      </div>
    )
  }

  // Onboarding takes over the whole window (first run or reconfigure).
  if (phase === 'onboarding' || reconfigure) {
    return (
      <div className="h-full overflow-y-auto">
        <Onboarding
          initial={settings}
          onDone={async () => {
            await refreshSettings()
            setReconfigure(false)
            setPhase('import')
          }}
          onCancel={reconfigure ? () => setReconfigure(false) : undefined}
        />
        <UpdateBanner />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar settings={settings} onReconfigure={() => setReconfigure(true)} step={stepFor(phase)} />
      <main className="min-h-0 flex-1 overflow-hidden">
        {phase === 'import' && (
          <div className="h-full overflow-y-auto">
            <Import
              onContinue={(inv) => {
                setInvoices(inv)
                setPhase('review')
              }}
            />
          </div>
        )}

        {phase === 'review' && (
          <Review
            invoices={invoices}
            onChange={updateInvoice}
            onBack={() => setPhase('import')}
            onDone={(o) => {
              setOutcomes(o)
              setPhase('result')
            }}
          />
        )}

        {phase === 'result' && (
          <div className="h-full overflow-y-auto">
            <Result
              outcomes={outcomes}
              odooUrl={settings?.url ?? null}
              onRetry={() => setPhase('review')}
              onRestart={() => {
                setInvoices([])
                setOutcomes([])
                setPhase('import')
              }}
            />
          </div>
        )}
      </main>
      <UpdateBanner />
    </div>
  )
}
