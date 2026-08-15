'use client'

import { ArrowRight, AlertTriangle, FileSpreadsheet, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CSVUploadButton } from '@/components/tool-table/CSVUploadButton'
import { StepShell, type StepList } from '@/components/onboarding/StepShell'
import { useDataStore } from '@/stores/dataStore'

export function DataStep({
  datasetLoading,
  datasetError,
  onBack,
  onContinue,
  steps,
}: {
  datasetLoading: boolean
  datasetError: string | null
  onBack: () => void
  onContinue: () => void
  /** Omit for the full flow. */
  steps?: StepList
}) {
  const pageTableData = useDataStore((s) => s.pageTableData)
  const removeCSVDataset = useDataStore((s) => s.removeCSVDataset)
  const datasets = pageTableData ?? []

  return (
    <StepShell
      current="data"
      steps={steps}
      title="Add data (optional)"
      description="Upload a dataset to fact-check the article against."
      onBack={onBack}
      footer={
        <Button size="sm" onClick={onContinue} className="gap-1.5">
          Continue
          <ArrowRight className="size-4" />
        </Button>
      }
    >
      <div className="space-y-4">
        {datasetError && (
          <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-muted-foreground text-xs leading-relaxed">
              {datasetError} Upload a CSV yourself, or continue without one.
            </p>
          </div>
        )}

        {datasetLoading ? (
          <div className="border-border text-muted-foreground flex items-center gap-2 rounded-lg border p-4 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading the sample dataset...
          </div>
        ) : datasets.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">
                {datasets.length === 1 ? 'Dataset' : `${datasets.length} datasets`}
              </p>
              <CSVUploadButton compact />
            </div>
            <ul className="space-y-2">
              {datasets.map((d) => (
                <li
                  key={d.name}
                  className="border-border bg-card flex items-center gap-3 rounded-lg border p-3"
                >
                  <FileSpreadsheet className="text-muted-foreground size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {d.rows.length.toLocaleString()} rows
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCSVDataset(d.name)}
                    aria-label={`Remove ${d.name}`}
                    title={`Remove ${d.name}`}
                    className="text-muted-foreground hover:text-destructive hover:bg-accent -mr-1 shrink-0 rounded p-1 transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <CSVUploadButton />
        )}
      </div>
    </StepShell>
  )
}
