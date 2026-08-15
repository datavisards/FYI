import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Passive reminder that the panel's article is not the page in front of you. */
export function TabBindingBar({ onAnalyze }: { onAnalyze: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
      <ExternalLink className="size-3 shrink-0" />
      <span className="min-w-0 flex-1">You are on a different page.</span>
      <Button
        variant="outline"
        size="sm"
        onClick={onAnalyze}
        className="h-6 shrink-0 px-2 text-xs"
      >
        Analyze this page
      </Button>
    </div>
  )
}
