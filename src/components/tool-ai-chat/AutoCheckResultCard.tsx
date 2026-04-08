'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, MessageSquarePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VERDICT_BADGE } from '@/components/claim/constants'
import { VegaChart } from './VegaChart'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AutoCheckResult, AutoCheckStepEvent } from '@/stores/chatStore'
import type { ConfidenceLevel } from '@/lib/factChecking'

const CONFIDENCE_DISPLAY: Record<ConfidenceLevel, { label: string; className: string }> = {
  strong: { label: 'Strong confidence', className: 'text-green-600 dark:text-green-400' },
  moderate: { label: 'Moderate confidence', className: 'text-amber-600 dark:text-amber-400' },
  weak: { label: 'Weak confidence', className: 'text-red-600 dark:text-red-400' },
}

const STEP_LABELS: Record<number, string> = {
  1: 'Resolve claim',
  2: 'Generate & execute code',
  3: 'Visualize',
  4: 'Determine verdict',
}

function StepRow({ event }: { event: AutoCheckStepEvent }) {
  const [open, setOpen] = useState(false)
  const hasData = event.data && Object.keys(event.data).length > 0

  const renderStepSummary = (ev: AutoCheckStepEvent): string | null => {
    const d = ev.data ?? {}
    switch (ev.step) {
      case 1:
        return d.enriched_claim ? String(d.enriched_claim).slice(0, 80) + (String(d.enriched_claim).length > 80 ? '…' : '') : null
      case 2: {
        if (d.error) return `Error: ${String(d.error).slice(0, 60)}`
        const er = d.execution_result as Record<string, unknown> | undefined
        if (!er) return null
        const parts: string[] = []
        if (er.fact_type) parts.push(String(er.fact_type))
        if (er.matched_rows != null) parts.push(`${er.matched_rows} rows`)
        if (er.comparison_detail) parts.push(String(er.comparison_detail).slice(0, 60))
        return parts.join(' · ') || null
      }
      case 3:
        return d.has_chart ? 'Chart generated' : 'No chart'
      case 4:
        return null // shown in the main card area
      default:
        return null
    }
  }

  const summary = renderStepSummary(event)

  return (
    <div className="text-[11px]">
      <button
        type="button"
        onClick={() => hasData && setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2 py-1 text-left',
          hasData ? 'cursor-pointer' : 'cursor-default'
        )}
      >
        {event.status === 'running' && (
          <Loader2 className="w-3 h-3 shrink-0 animate-spin text-amber-500" />
        )}
        {event.status === 'done' && (
          <span className="w-3 h-3 shrink-0 rounded-full bg-green-500 inline-block" />
        )}
        {event.status === 'error' && (
          <span className="w-3 h-3 shrink-0 rounded-full bg-red-500 inline-block" />
        )}
        <span className="font-medium text-foreground">
          {STEP_LABELS[event.step] ?? event.name}
        </span>
        {summary && (
          <span className="text-muted-foreground truncate flex-1">{summary}</span>
        )}
        {hasData && event.status === 'done' && (
          open
            ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground ml-auto" />
            : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground ml-auto" />
        )}
      </button>
      {open && hasData && (
        <pre className="mt-1 ml-5 rounded bg-muted/40 p-2 text-[10px] overflow-x-auto text-muted-foreground whitespace-pre-wrap">
          {JSON.stringify(event.data, null, 2)}
        </pre>
      )}
    </div>
  )
}

interface AutoCheckResultCardProps {
  result: AutoCheckResult
  onFollowUp: (summary: string) => void
}

export function AutoCheckResultCard({ result, onFollowUp }: AutoCheckResultCardProps) {
  const [stepsOpen, setStepsOpen] = useState(false)
  const [chartDialogOpen, setChartDialogOpen] = useState(false)

  const verdictConfig = result.verdict ? VERDICT_BADGE[result.verdict] : null
  const VerdictIcon = verdictConfig?.icon

  const handleFollowUp = () => {
    const step2 = result.steps.find((s) => s.step === 2)
    const er = step2?.data?.execution_result as Record<string, unknown> | undefined
    const compDetail = (er?.comparison_detail as string) ?? 'N/A'

    const summary = `I ran an automated fact-check on: "${result.claimText}"

Fact type: ${result.factType ?? 'unknown'}
Comparison: ${compDetail}
Claimed value: ${result.claimedValue ?? 'N/A'}  |  Actual value: ${result.actualValue ?? 'N/A'}
Verdict: ${(result.verdict ?? 'unknown').toUpperCase()} (${result.confidence ?? 'moderate'} confidence)
Reasoning: ${result.reasoning ?? ''}

Can you help me understand this further?`

    onFollowUp(summary)
  }

  return (
    <div className="text-sm space-y-3">
        {/* Steps collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setStepsOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {stepsOpen
              ? <ChevronDown className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />
            }
            <span>{result.steps.length} pipeline steps</span>
          </button>
          {stepsOpen && (
            <div className="mt-2 ml-1 space-y-0.5 border-l-2 border-muted pl-3">
              {result.steps
                .slice()
                .sort((a, b) => a.step - b.step)
                .map((ev) => (
                  <StepRow key={ev.step} event={ev} />
                ))}
            </div>
          )}
        </div>

        {/* Verdict + confidence */}
        {result.verdict && verdictConfig && (
          <div className={cn(
            'flex items-center gap-2 rounded border px-3 py-2',
            verdictConfig.className
          )}>
            {VerdictIcon && <VerdictIcon className="w-4 h-4 shrink-0" />}
            <span className="font-semibold uppercase text-xs tracking-wide">
              {verdictConfig.label}
            </span>
            {result.confidence && (
              <span className={cn('ml-auto text-xs font-medium', CONFIDENCE_DISPLAY[result.confidence].className)}>
                {CONFIDENCE_DISPLAY[result.confidence].label}
              </span>
            )}
          </div>
        )}

        {/* Claimed vs Actual */}
        {(result.actualValue || result.claimedValue) && (
          <div className="rounded border bg-background p-2.5 grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase mb-0.5">Claimed</p>
              <p className="text-base font-semibold">{result.claimedValue ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase mb-0.5">Actual</p>
              <p className="text-base font-semibold">{result.actualValue ?? '—'}</p>
            </div>
          </div>
        )}

        {/* Chart */}
        {result.vegaLiteSpec && Object.keys(result.vegaLiteSpec).length > 0 && (
          <>
            <VegaChart
              spec={result.vegaLiteSpec as Record<string, unknown>}
              expandable
              onExpand={() => setChartDialogOpen(true)}
            />
            <Dialog open={chartDialogOpen} onOpenChange={setChartDialogOpen}>
              <DialogContent className="max-w-4xl w-[90vw]">
                <DialogHeader>
                  <DialogTitle className="text-sm font-semibold">
                    {result.factType ? `${result.factType} — ` : ''}
                    {result.claimText.length > 80
                      ? result.claimText.slice(0, 80) + '…'
                      : result.claimText}
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-2">
                  <VegaChart
                    spec={result.vegaLiteSpec as Record<string, unknown>}
                    className="min-h-[400px]"
                  />
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        {/* Reasoning */}
        {result.reasoning && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {result.reasoning}
          </p>
        )}

        {/* Follow-up button */}
        {result.verdict && (
          <button
            type="button"
            onClick={handleFollowUp}
            className="flex items-center gap-1.5 rounded border border-dashed px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors w-full justify-center"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Follow up in AI Chat
          </button>
        )}
    </div>
  )
}

/** Live progress card shown while the pipeline is running */
export function AutoCheckProgressCard({ steps }: { steps: AutoCheckStepEvent[] }) {
  return (
    <div className="space-y-1">
      {steps.slice().sort((a, b) => a.step - b.step).map((ev) => (
        <StepRow key={ev.step} event={ev} />
      ))}
    </div>
  )
}
