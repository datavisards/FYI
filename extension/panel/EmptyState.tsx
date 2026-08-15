import { FileText, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmptyState({
  loading,
  error,
  onGetArticle,
}: {
  loading: boolean
  error: string | null
  onGetArticle: () => void
}) {
  return (
    <div className="h-screen flex flex-col items-center justify-center p-6 text-center">
      <FileText className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold mb-2">Get article from page</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-xs">
        Extract the article from the current tab to start analyzing claims and exploring data.
      </p>
      <Button onClick={onGetArticle} disabled={loading} className="gap-2">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Extracting...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Get article from page
          </>
        )}
      </Button>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  )
}
