'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { useExplorationStore } from '@/stores/explorationStore'
import { loadHostedAccess } from '@/stores/settingsStore'
import { useClaimStore } from '@/stores/claimStore'
import { useArticleStore } from '@/stores/articleStore'
import { useDataStore } from '@/stores/dataStore'
import { eventLogger } from '@/lib/tracking/eventLogger'
import { parseCSV } from '@/lib/data/csvFetcher'
import { importArticle } from '@/lib/article/importArticle'
import { parseTargetUrl } from '@/lib/article/targetUrl'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { SplitPane } from '@/components/layout/SplitPane'

import { ArticleViewer } from '@/components/article/ArticleViewer'
import {
  ArticleClaimDetection,
  ClaimInvestigationPanel,
  ClaimToolbar,
  ClaimsListPanel,
} from '@/components/claim'
import { ToolTable } from '@/components/tool-table'
import { ChatLayout } from '@/components/tool-ai-chat/ChatLayout'
import { AutoCheckPanel } from '@/components/tool-ai-chat/AutoCheckPanel'
import { ActionHistoryPanel } from '@/components/action-history'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ArticleStep, type SampleArticle } from '@/components/onboarding/ArticleStep'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowLeftRight, History, Download, RotateCcw, MoreHorizontal } from 'lucide-react'
import { ApiSettingsDialog } from '@/components/settings/ApiSettingsDialog'
import { downloadAsJSON } from '@/lib/export/sessionExporter'
import { FyiMark } from '@/components/brand/FyiMark'

import type { Article, Claim } from '@/types'

// Load sample article
import movieSuccessArticle from '@/data/movie-success-article.json'

/*
 * Client-only: compassql pulls in vega-lite, which builds a field accessor with
 * `new Function` at module scope. Cloudflare Workers forbid that, and because it
 * happens at module evaluation it takes down every route in the bundle.
 */
const ToolVisBuilder = dynamic(
  () => import('@/components/tool-vis-builder/ToolVisBuilder').then((m) => m.ToolVisBuilder),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
)


const SAMPLES: SampleArticle[] = [
  {
    id: 'movie-success',
    title: movieSuccessArticle.title,
    datasetLabel: 'movies-merged, 1,724 rows',
    lengthLabel: 'about 500 words',
    data: movieSuccessArticle,
    dataset: { name: 'movies-merged', path: '/data/movies-merged.csv' },
  },
]

function buildArticleFromData(data: any): Article {
  return {
    $id: data.id,
    title: data.title,
    source: data.source,
    content: data.content,
    claims:
      // Map any embedded claims into the internal Claim shape; ignore extra fields like dataSource
      (Array.isArray((data as any).claims)
        ? (data as any).claims.map((c: any) => ({
            id: c.id,
            text: c.text,
            startOffset: c.startOffset ?? 0,
            endOffset: c.endOffset ?? 0,
            category: c.category,
          }))
        : []),
    metadata: data.metadata,
  }
}

export default function AppPage() {
  const startSession = useExplorationStore((state) => state.startSession)
  const setActiveClaim = useExplorationStore((state) => state.setActiveClaim)
  const clearAll = useExplorationStore((state) => state.clearAll)
  const { setSelectedClaim, setHighlightedClaimId, setArticles } = useArticleStore()

  const [isLoading, setIsLoading] = useState(true)
  const [article, setArticle] = useState<Article | null>(null)
  const [claimsSheetOpen, setClaimsSheetOpen] = useState(false)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const [changingArticle, setChangingArticle] = useState(false)
  const [importError, setImportError] = useState<{ message: string; url: string | null } | null>(
    null
  )
  const initRef = useRef(false)

  /*
     * Hydration must finish first: zustand rehydrates on the client after this
     * component mounts, so reading the stores immediately restores nothing.
     */
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    void loadHostedAccess()

    const restore = () => {
      const saved = useArticleStore.getState().getCurrentArticle()
      if (saved) setArticle(saved)

      // An article saved before there was a session, as the old setup steps allowed.
      if (saved && !useExplorationStore.getState().session) {
        useExplorationStore.getState().startSession(saved.$id)
      }

      // Arrived through the address prefix. Reopening the same article keeps its progress.
      const requested = new URLSearchParams(window.location.search).get('url')
      if (requested !== null) {
        const target = parseTargetUrl(requested)
        if (!target) {
          setImportError({ message: 'That is not a public web page address.', url: null })
          window.history.replaceState(null, '', '/app')
        } else if (saved?.metadata?.url === target) {
          window.history.replaceState(null, '', '/app')
        } else {
          setPendingUrl(target)
        }
      }

      setIsLoading(false)
    }

    const stores = [useArticleStore, useExplorationStore]
    if (stores.every((s) => s.persist.hasHydrated())) {
      restore()
      return
    }
    const unsubs = stores.map((s) =>
      s.persist.onFinishHydration(() => {
        if (stores.every((x) => x.persist.hasHydrated())) restore()
      })
    )
    return () => unsubs.forEach((u) => u())
  }, [])

  // Handle claim click from article — setActiveClaim handles chat conversation creation
  const handleClaimClick = useCallback(
    (claim: Claim) => {
      setSelectedClaim(claim)
      setHighlightedClaimId(claim.id)
      setActiveClaim({
        id: claim.id,
        text: claim.text,
        category: claim.category,
      })
    },
    [setSelectedClaim, setHighlightedClaimId, setActiveClaim]
  )

  // Reset session, back to the first setup screen.
  const handleResetSession = useCallback(() => {
    if (confirm('Are you sure you want to reset? All progress will be lost.')) {
      clearAll()
      // Not covered by clearAll, and it persists.
      setArticles([])
      setSelectedClaim(null)
      setHighlightedClaimId(null)
      setActiveClaim(null)
      setArticle(null)
      setChangingArticle(false)
      setImportError(null)
      toast.success('Session reset')
    }
  }, [clearAll, setActiveClaim, setArticles, setSelectedClaim, setHighlightedClaimId])

  const handleExport = useCallback(() => {
    const expState = useExplorationStore.getState()
    const sessionId = expState.session?.sessionId ?? 'no-session'
    const data = expState.getExportData()
    const claimVerdicts = useClaimStore.getState().claimVerdicts
    eventLogger.log({
      type: 'session_exported',
      totalClaims: data.claims.length,
      verdictCount: claimVerdicts.length,
      totalDurationMs: data.session?.totalDurationMs ?? 0,
    })
    downloadAsJSON(data, `fyi-session-${sessionId}-${Date.now()}.json`)
    toast.success('Session exported')
  }, [])

  const activateArticle = useCallback(
    (nextArticle: Article, sampleDataset?: { name: string; path: string }) => {
      // One article per session, so replacing an article starts over. The workspace
      // is usable before the first article, and what was added then is kept.
      if (useArticleStore.getState().getCurrentArticle()) clearAll()
      setSelectedClaim(null)
      setHighlightedClaimId(null)
      setActiveClaim(null)
      setArticle(nextArticle)
      setArticles([nextArticle])
      setChangingArticle(false)
      setImportError(null)
      startSession(nextArticle.$id)

      if (sampleDataset) {
        fetch(sampleDataset.path)
          .then((r) => {
            if (!r.ok) throw new Error(`Could not load ${sampleDataset.name} (${r.status}).`)
            return r.text()
          })
          .then((raw) => {
            const { headers, rows } = parseCSV(raw)
            const { pageTableData, setPageTableData, setSelectedVisDataset } = useDataStore.getState()
            const uploaded = (pageTableData ?? []).filter((d) => d.name !== sampleDataset.name)
            setPageTableData([...uploaded, { name: sampleDataset.name, headers, rows }])
            setSelectedVisDataset(sampleDataset.name)
          })
          .catch((err: Error) => {
            toast.error(err.message || `Could not load ${sampleDataset.name}.`)
          })
      }
    },
    [clearAll, setActiveClaim, setArticles, setHighlightedClaimId, setSelectedClaim, startSession]
  )

  useEffect(() => {
    if (!pendingUrl) return
    const controller = new AbortController()
    const finish = () => {
      window.history.replaceState(null, '', '/app')
      setPendingUrl(null)
    }
    importArticle(pendingUrl, controller.signal)
      .then((imported) => {
        if (controller.signal.aborted) return
        activateArticle(imported)
        finish()
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return
        setImportError({ message: err.message, url: pendingUrl })
        finish()
      })
    return () => controller.abort()
  }, [pendingUrl, activateArticle])

  const handleUseCustomText = useCallback(
    (text: string) => {
      activateArticle({
        $id: `custom-${Date.now()}`,
        title: 'Custom article',
        source: 'User pasted text',
        content: text,
        claims: [],
        metadata: { author: 'User', tags: ['custom'] },
      })
    },
    [activateArticle]
  )

  const handleUseSample = useCallback(
    (sample: SampleArticle) => {
      activateArticle(buildArticleFromData(sample.data), sample.dataset)
    },
    [activateArticle]
  )

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-full mx-auto" />
          <Skeleton className="h-4 w-48" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <header className="h-12 border-b flex items-center justify-between px-4 bg-background shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/"
            aria-label="FYI home"
            className="focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <FyiMark />
          </Link>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Claims sheet without a visible trigger; opened via menu item */}
          <Sheet
            open={claimsSheetOpen}
            onOpenChange={(open) => {
              setClaimsSheetOpen(open)
              // panel open event — no tracking needed for non-claim events
            }}
          >
            <SheetContent side="right" className="w-[400px] sm:w-[450px] p-0">
              <SheetTitle className="sr-only">Claims List</SheetTitle>
              <ClaimsListPanel
                onClaimClick={(claim) => {
                  handleClaimClick(claim)
                  setClaimsSheetOpen(false)
                }}
              />
            </SheetContent>
          </Sheet>

          {/* History sheet trigger hidden; opened via menu item */}
          <Sheet>
            <SheetTrigger asChild>
              <button
                id="fyi-history-trigger"
                type="button"
                className="hidden"
                aria-hidden="true"
              />
            </SheetTrigger>
            <SheetContent side="right" className="w-[400px] sm:w-[450px] p-0">
              <SheetTitle className="sr-only">Action History</SheetTitle>
              <ActionHistoryPanel />
            </SheetContent>
          </Sheet>

          <ApiSettingsDialog />

          {/* Single hamburger/session menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                aria-label="Session menu"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[11rem]">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  const trigger = document.getElementById('fyi-history-trigger')
                  trigger?.click()
                }}
              >
                <History className="h-3 w-3" />
                <span>View history</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  handleExport()
                }}
              >
                <Download className="h-3 w-3" />
                <span>Export session</span>
              </DropdownMenuItem>
              {/*
                              No preventDefault: it keeps the menu open, and Radix holds
                              pointer-events: none on the body while one is, so confirm()
                              would return onto an unclickable page.
                            */}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setTimeout(handleResetSession, 0)}
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset session</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <SplitPane
          left={
            <div className="h-full flex flex-col">
              {article && !pendingUrl && !importError && !changingArticle && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5 shrink-0">
                  <ArticleClaimDetection
                    articleContent={article.title + '\n\n' + article.content}
                    existingClaims={article.claims || []}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setChangingArticle(true)}
                    className="gap-1.5 text-muted-foreground"
                  >
                    <ArrowLeftRight className="size-3.5" />
                    Change article
                  </Button>
                </div>
              )}
              <div className="flex-1 min-h-0">
                {pendingUrl ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">Loading the article...</p>
                  </div>
                ) : !article || importError || changingArticle ? (
                  <ArticleStep
                    samples={SAMPLES}
                    onUseSample={handleUseSample}
                    onUseText={handleUseCustomText}
                    importError={importError}
                    onBack={
                      article
                        ? () => {
                            setImportError(null)
                            setChangingArticle(false)
                          }
                        : undefined
                    }
                  />
                ) : (
                  <ArticleViewer article={article} onClaimClick={handleClaimClick} />
                )}
              </div>
            </div>
          }
          right={
            <div className="h-full flex flex-col min-h-0">
              <ClaimToolbar
                existingClaims={article?.claims || []}
                onOpenClaimsList={() => setClaimsSheetOpen(true)}
              />
              <ClaimInvestigationPanel existingClaims={article?.claims || []} />
              <div className="flex-1 min-h-0">
                <SplitPane
                  direction="horizontal"
                  left={
                    <div className="h-full flex flex-col min-h-0">
                      <AutoCheckPanel />
                      <div className="flex-1 min-h-0">
                        <ChatLayout />
                      </div>
                    </div>
                  }
                  right={
                    <SplitPane
                      direction="vertical"
                      left={<ToolTable />}
                      right={
                        <div className="h-full w-full bg-muted/30">
                          <ToolVisBuilder mode="panel" />
                        </div>
                      }
                      defaultLeftPercent={40}
                      minLeftPercent={25}
                      maxLeftPercent={75}
                    />
                  }
                  defaultLeftPercent={35}
                  minLeftPercent={25}
                  maxLeftPercent={60}
                />
              </div>
            </div>
          }
          defaultLeftPercent={35}
          minLeftPercent={30}
          maxLeftPercent={50}
        />
      </div>
    </div>
  )
}
