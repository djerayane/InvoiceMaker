import type { ReactNode } from 'react'
import type { MatchConfidence } from '@shared/types'
import { Check, Warn } from './icons'

/** Small badge conveying how confident the automatic product match is. */
export function ConfidenceBadge({ confidence }: { confidence: MatchConfidence }): ReactNode {
  if (confidence === 'exact') {
    return (
      <span
        className="chip"
        style={{ background: 'var(--color-moss-100)', color: 'var(--color-moss)' }}
      >
        <Check width={13} height={13} strokeWidth={2.4} /> Correspondance exacte
      </span>
    )
  }
  if (confidence === 'fuzzy') {
    return (
      <span
        className="chip"
        style={{ background: 'var(--color-amber-100)', color: 'var(--color-amber)' }}
      >
        <Warn width={13} height={13} strokeWidth={2.2} /> À vérifier
      </span>
    )
  }
  return (
    <span
      className="chip"
      style={{ background: 'var(--color-vermilion-100)', color: 'var(--color-vermilion-600)' }}
    >
      <Warn width={13} height={13} strokeWidth={2.2} /> À associer
    </span>
  )
}

/** A list of parse warnings, styled as a soft amber notice. */
export function WarningList({ warnings }: { warnings: string[] }): ReactNode {
  if (!warnings.length) return null
  return (
    <div
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        background: 'var(--color-amber-100)',
        color: '#7a5210',
        border: '1px solid #e6cf9c'
      }}
    >
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <Warn width={16} height={16} /> À vérifier
      </div>
      <ul className="list-disc space-y-0.5 pl-5">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  )
}
