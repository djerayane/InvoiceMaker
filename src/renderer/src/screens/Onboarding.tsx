import { useState } from 'react'
import type { OdooSettings, ConnectionResult } from '@shared/types'
import { Logo, ArrowRight, ArrowLeft, Check, Spinner, External, Warn } from '../components/icons'

interface Props {
  initial: OdooSettings | null
  onDone: () => void
  onCancel?: () => void
}

const STEPS = ['Bienvenue', 'Adresse Odoo', 'Clé API', 'Connexion'] as const

/** Derive the Odoo Online database name (the subdomain) from a pasted URL. */
function deriveDb(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url)
    const sub = u.hostname.split('.')[0]
    return sub && sub !== 'www' ? sub : ''
  } catch {
    return ''
  }
}

export function Onboarding({ initial, onDone, onCancel }: Props) {
  const [step, setStep] = useState(0)
  const [url, setUrl] = useState(initial?.url ?? '')
  const [db, setDb] = useState(initial?.db ?? '')
  const [dbTouched, setDbTouched] = useState(Boolean(initial?.db))
  const [username, setUsername] = useState(initial?.username ?? '')
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<ConnectionResult | null>(null)

  function updateUrl(v: string) {
    setUrl(v)
    if (!dbTouched) setDb(deriveDb(v))
  }

  async function handleTest() {
    setTesting(true)
    setResult(null)
    const r = await window.api.testConnection({ url, db, username, apiKey })
    setResult(r)
    setTesting(false)
  }

  async function handleSave() {
    setTesting(true)
    const r = await window.api.saveConnection({ url, db, username, apiKey })
    setResult(r)
    setTesting(false)
    if (r.ok) onDone()
  }

  const canProceed =
    (step === 0) ||
    (step === 1 && url.trim() && db.trim()) ||
    (step === 2 && username.trim() && apiKey.trim())

  return (
    <div className="blueprint flex min-h-full flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-xl animate-rise">
        {/* Stepper */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="flex h-7 items-center gap-2 rounded-full px-2.5 text-xs font-semibold transition-colors"
                style={{
                  background: i <= step ? 'var(--color-vermilion)' : 'rgba(255,255,255,0.05)',
                  color: i <= step ? 'white' : '#7c8290'
                }}
              >
                <span
                  className="tnum flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
                  style={{ background: 'rgba(0,0,0,0.18)' }}
                >
                  {i < step ? <Check width={11} height={11} strokeWidth={3} /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s}</span>
              </div>
              {i < STEPS.length - 1 && (
                <span className="h-px w-4" style={{ background: 'var(--color-ink-500)' }} />
              )}
            </div>
          ))}
        </div>

        <div className="paper p-8">
          {step === 0 && (
            <div className="text-center">
              <span
                className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ background: 'var(--color-ink)', color: 'white' }}
              >
                <Logo width={34} height={34} />
              </span>
              <h1 className="text-3xl">Bienvenue 👋</h1>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-neutral-600">
                Cette application transforme vos devis PDF en{' '}
                <strong>brouillons de factures</strong> dans Odoo. Connectons d'abord votre compte
                Odoo — cela prend deux minutes, aucune compétence technique requise.
              </p>
              <div className="mx-auto mt-6 max-w-sm rounded-xl px-4 py-3 text-left text-sm text-neutral-600" style={{ background: 'var(--color-paper-2)' }}>
                <div className="mb-1 font-semibold text-neutral-700">Vous aurez besoin de :</div>
                <ul className="list-disc space-y-0.5 pl-5">
                  <li>l'adresse de votre Odoo (ex. masociete.odoo.com)</li>
                  <li>votre e-mail de connexion Odoo</li>
                  <li>une clé API (on vous montre où la créer)</li>
                </ul>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-2xl">Votre adresse Odoo</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Copiez l'adresse que vous utilisez pour ouvrir Odoo dans votre navigateur.
              </p>
              <div className="mt-5">
                <label className="label">Adresse Odoo</label>
                <input
                  className="field tnum"
                  placeholder="https://masociete.odoo.com"
                  value={url}
                  onChange={(e) => updateUrl(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="mt-4">
                <label className="label">Nom de la base de données</label>
                <input
                  className="field tnum"
                  placeholder="masociete"
                  value={db}
                  onChange={(e) => {
                    setDb(e.target.value)
                    setDbTouched(true)
                  }}
                />
                <p className="mt-1.5 text-xs text-neutral-500">
                  Rempli automatiquement à partir de l'adresse. Pour un Odoo Online, c'est
                  généralement le début de l'adresse.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl">Votre clé API</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Une clé API permet à l'application de créer les brouillons à votre place, en toute
                sécurité. Voici comment l'obtenir :
              </p>
              <ol className="mt-4 space-y-2.5">
                {[
                  "Dans Odoo, cliquez sur votre nom/avatar en haut à droite, puis « Mon profil ».",
                  "Ouvrez l'onglet « Sécurité du compte ».",
                  "Cliquez sur « Nouvelle clé API », donnez-lui un nom (ex. « InvoiceMaker »).",
                  "Copiez la clé affichée et collez-la ci-dessous (elle ne sera plus affichée ensuite)."
                ].map((t, i) => (
                  <li key={i} className="flex gap-3 text-sm text-neutral-700">
                    <span
                      className="tnum flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: 'var(--color-ink)' }}
                    >
                      {i + 1}
                    </span>
                    {t}
                  </li>
                ))}
              </ol>

              <div className="mt-5 grid grid-cols-1 gap-4">
                <div>
                  <label className="label">E-mail de connexion Odoo</label>
                  <input
                    className="field tnum"
                    placeholder="vous@masociete.fr"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Clé API</label>
                  <input
                    className="field tnum"
                    type="password"
                    placeholder="Collez votre clé API ici"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <h2 className="text-2xl">Vérifions la connexion</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
                On teste vos identifiants avec Odoo. Si tout va bien, la configuration est
                enregistrée et vous pouvez commencer.
              </p>

              <div className="mt-6">
                {!result && !testing && (
                  <button className="btn btn-paper mx-auto" onClick={handleTest}>
                    Tester la connexion <ArrowRight width={16} height={16} />
                  </button>
                )}
                {testing && (
                  <div className="flex items-center justify-center gap-2 text-sm text-neutral-600">
                    <Spinner width={18} height={18} /> Connexion à Odoo…
                  </div>
                )}
                {result && result.ok && (
                  <div className="animate-fade">
                    <div
                      className="mx-auto flex max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium"
                      style={{ background: 'var(--color-moss-100)', color: 'var(--color-moss)' }}
                    >
                      <Check width={20} height={20} /> Connexion réussie ! Tout est prêt.
                    </div>
                    <button className="btn btn-primary mx-auto mt-5" onClick={handleSave} disabled={testing}>
                      Enregistrer et commencer <ArrowRight width={16} height={16} />
                    </button>
                  </div>
                )}
                {result && !result.ok && (
                  <div className="animate-fade">
                    <div
                      className="mx-auto flex max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-left text-sm"
                      style={{ background: 'var(--color-vermilion-100)', color: 'var(--color-vermilion-600)' }}
                    >
                      <Warn width={20} height={20} className="mt-0.5 shrink-0" />
                      <span>{result.error}</span>
                    </div>
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <button className="btn btn-ghost !text-neutral-700" style={{ borderColor: 'var(--color-paper-line)' }} onClick={() => setStep(1)}>
                        Revoir mes informations
                      </button>
                      <button className="btn btn-paper" onClick={handleTest}>
                        Réessayer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="mt-5 flex items-center justify-between">
          <div>
            {step > 0 ? (
              <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft width={16} height={16} /> Retour
              </button>
            ) : onCancel ? (
              <button className="btn btn-ghost" onClick={onCancel}>
                Annuler
              </button>
            ) : (
              <a
                className="btn btn-ghost"
                href="https://www.odoo.com/documentation/17.0/developer/reference/external_api.html"
                target="_blank"
                rel="noreferrer"
              >
                Aide <External width={14} height={14} />
              </a>
            )}
          </div>
          {step < 3 && (
            <button className="btn btn-primary" disabled={!canProceed} onClick={() => setStep(step + 1)}>
              Continuer <ArrowRight width={16} height={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
