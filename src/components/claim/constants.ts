import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import type { Verdict } from '@/types'

/**
 * Shared verdict badge configuration for consistent UI across components
 */
export const VERDICT_BADGE: Record<
  Verdict,
  {
    label: string
    icon: typeof CheckCircle2
    className: string
  }
> = {
  verified: {
    label: 'Verified',
    icon: CheckCircle2,
    className: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30',
  },
  misleading: {
    label: 'Misleading',
    icon: XCircle,
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  },
  unverifiable: {
    label: 'Unverifiable',
    icon: HelpCircle,
    className: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
  },
}

/**
 * Shared verdict highlight styles for ClaimHighlight component
 */
export const VERDICT_STYLES: Record<Verdict, string> = {
  verified:
    'bg-green-100 dark:bg-green-900/40 border-green-400 dark:border-green-600 hover:bg-green-200 dark:hover:bg-green-900/60',
  misleading:
    'bg-amber-100 dark:bg-amber-900/40 border-amber-400 dark:border-amber-600 hover:bg-amber-200 dark:hover:bg-amber-900/60',
  unverifiable:
    'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-400 dark:border-indigo-600 hover:bg-indigo-200 dark:hover:bg-indigo-900/60',
}
