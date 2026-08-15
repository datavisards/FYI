import { ArrowRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Shown in place of the panel body when the reader moves to a page the panel
 * knows nothing about. Both pages are named, since the choice is between them.
 */
export function DifferentPageTakeover({
  boundTitle,
  activeTitle,
  onAnalyze,
  onKeep,
}: {
  boundTitle: string
  activeTitle: string
  onAnalyze: () => void
  onKeep: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6 text-center">
      <div className="space-y-1.5">
        <FileText className="text-muted-foreground mx-auto size-8" />
        <h2 className="text-base font-semibold">You have moved to a different page</h2>
        <p className="text-muted-foreground text-sm">
          FYI is still working on the article you started.
        </p>
      </div>

      <dl className="w-full max-w-xs space-y-2 text-left text-xs">
        <div className="bg-muted/50 space-y-0.5 rounded-md p-2.5">
          <dt className="text-muted-foreground">Reading</dt>
          <dd className="line-clamp-2 font-medium">{boundTitle}</dd>
        </div>
        <div className="bg-muted/50 space-y-0.5 rounded-md p-2.5">
          <dt className="text-muted-foreground">This tab</dt>
          <dd className="line-clamp-2 font-medium">{activeTitle || 'Untitled page'}</dd>
        </div>
      </dl>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button onClick={onAnalyze} className="gap-1.5">
          Analyze this page
          <ArrowRight className="size-4" />
        </Button>
        <Button variant="ghost" onClick={onKeep}>
          Keep my current session
        </Button>
      </div>
    </div>
  )
}
