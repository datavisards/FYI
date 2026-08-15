import { ArrowRight, FileText, Globe, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CSVUploadButton } from '@/components/tool-table/CSVUploadButton'
import { useDataStore } from '@/stores/dataStore'
import type { Article } from '@/types'

/**
 * What was extracted, plus the optional dataset, before the session starts.
 *
 * With a key already saved there is nothing left to set up, so the button
 * starts the investigation directly instead of going on to the model step.
 */
export function ArticleCard({
  article,
  hasKey,
  onContinue,
  onStart,
}: {
  article: Article
  hasKey: boolean
  onContinue: () => void
  onStart: () => void
}) {
  const pageTableData = useDataStore((s) => s.pageTableData)

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="text-base font-semibold leading-tight">{article.title}</h2>
        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {article.metadata?.author && (
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span>{article.metadata.author}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span>{article.source}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Upload data (optional)</h3>
        <p className="text-xs text-muted-foreground">
          Add CSV files to use during your investigation.
        </p>
        <CSVUploadButton />
        {pageTableData && pageTableData.length > 0 && (
          <div className="space-y-1 mt-2">
            {pageTableData.map((d) => (
              <div
                key={d.name}
                className="text-xs bg-muted px-2 py-1 rounded flex items-center gap-1.5"
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="truncate">{d.name}</span>
                <span className="text-muted-foreground ml-auto shrink-0">{d.rows.length} rows</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button onClick={hasKey ? onStart : onContinue} className="w-full gap-2">
        {hasKey ? 'Start investigation' : 'Continue'}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
