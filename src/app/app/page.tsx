'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'

import { useExplorationStore } from '@/stores/explorationStore'
import { useClaimStore } from '@/stores/claimStore'
import { useArticleStore } from '@/stores/articleStore'
import { useDataStore } from '@/stores/dataStore'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { eventLogger } from '@/lib/tracking/eventLogger'
import { parseCSV } from '@/lib/data/csvFetcher'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { SplitPane } from '@/components/layout/SplitPane'

import { ArticleViewer } from '@/components/article/ArticleViewer'
import { ClaimInvestigationPanel, ClaimToolbar, ClaimsListPanel } from '@/components/claim'
import { ToolTable } from '@/components/tool-table'
import { ChatLayout } from '@/components/tool-ai-chat/ChatLayout'
import { AutoCheckPanel } from '@/components/tool-ai-chat/AutoCheckPanel'
import { ActionHistoryPanel } from '@/components/action-history'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ArticleStep, type SampleArticle } from '@/components/onboarding/ArticleStep'
import { DataStep } from '@/components/onboarding/DataStep'
import { KeyStep } from '@/components/onboarding/KeyStep'
import { STEPS } from '@/components/onboarding/StepShell'
import { useHasApiKey } from '@/stores/settingsStore'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { History, Download, RotateCcw, MoreHorizontal } from 'lucide-react'
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
  const step = useOnboardingStore((s) => s.step)
  const setStep = useOnboardingStore((s) => s.setStep)
  const [datasetLoading, setDatasetLoading] = useState(false)
  const [datasetError, setDatasetError] = useState<string | null>(null)
  const [claimsSheetOpen, setClaimsSheetOpen] = useState(false)
  const initRef = useRef(false)

  // With a key already saved the Model step has nothing to ask, so skip it and
  // drop it from the stepper. The header dialog remains the way to change it.
  const hasKey = useHasApiKey()
  const setupSteps = useMemo(
    () => (hasKey ? STEPS.filter((s) => s.id !== 'key') : STEPS),
    [hasKey]
  )

  /*
     * Hydration must finish first: zustand rehydrates on the client after this
     * component mounts, so reading the stores immediately restores nothing.
     */
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const restore = () => {
      const saved = useArticleStore.getState().getCurrentArticle()
      if (saved) setArticle(saved)

      const { step: stored, setStep: setStored } = useOnboardingStore.getState()
      const hasSession = Boolean(useExplorationStore.getState().session)
      if (!saved) setStored('article')
      else if (hasSession && stored !== 'workspace') setStored('workspace')
      else if (!hasSession && stored === 'workspace') setStored('data')

      setIsLoading(false)
    }

    const stores = [useArticleStore, useExplorationStore, useOnboardingStore]
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
      setDatasetLoading(false)
      setDatasetError(null)
      setStep('article')
      toast.success('Session reset')
    }
  }, [clearAll, setActiveClaim, setArticles, setSelectedClaim, setHighlightedClaimId, setStep])

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

  /** The session deliberately starts later, when the workspace opens. */
  const activateArticle = useCallback(
    (nextArticle: Article, sampleDataset?: { name: string; path: string }) => {
      // Fresh state for each article: one article per session
      clearAll()
      setSelectedClaim(null)
      setHighlightedClaimId(null)
      setActiveClaim(null)
      setArticle(nextArticle)
      setArticles([nextArticle])
      setDatasetError(null)
      setDatasetLoading(Boolean(sampleDataset))
      setStep('data')

      if (sampleDataset) {
        fetch(sampleDataset.path)
          .then((r) => {
            if (!r.ok) throw new Error(`Could not load ${sampleDataset.name} (${r.status}).`)
            return r.text()
          })
          .then((raw) => {
            const { headers, rows } = parseCSV(raw)
            useDataStore.getState().setPageTableData([{ name: sampleDataset.name, headers, rows }])
            useDataStore.getState().setSelectedVisDataset(sampleDataset.name)
            setDatasetLoading(false)
          })
          .catch((err: Error) => {
            setDatasetError(err.message || `Could not load ${sampleDataset.name}.`)
            setDatasetLoading(false)
          })
      }
    },
    [clearAll, setActiveClaim, setArticles, setHighlightedClaimId, setSelectedClaim, setStep]
  )

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

  const handleStartInvestigation = useCallback(() => {
    if (!article) return
    if (!useExplorationStore.getState().session) {
      startSession(article.$id)
    }
    setStep('workspace')
  }, [article, startSession, setStep])

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

      {step !== 'workspace' || !article ? (
        <div className="flex-1 min-h-0">
          {step === 'article' || !article ? (
            <ArticleStep
              samples={SAMPLES}
              onUseSample={handleUseSample}
              onUseText={handleUseCustomText}
              steps={setupSteps}
            />
          ) : step === 'data' ? (
            <DataStep
              datasetLoading={datasetLoading}
              datasetError={datasetError}
              onBack={() => setStep('article')}
              onContinue={hasKey ? handleStartInvestigation : () => setStep('key')}
              steps={setupSteps}
            />
          ) : (
            <KeyStep onBack={() => setStep('data')} onStart={handleStartInvestigation} />
          )}
        </div>
      ) : (
      <div className="flex-1 min-h-0">
        <SplitPane
          left={
            <div className="h-full flex flex-col">
              <div className="flex-1 min-h-0">
                <ArticleViewer article={article} onClaimClick={handleClaimClick} />
              </div>
            </div>
          }
          right={
            <div className="h-full flex flex-col min-h-0">
              <ClaimToolbar
                articleContent={article.title + '\n\n' + article.content}
                existingClaims={article.claims || []}
                onOpenClaimsList={() => setClaimsSheetOpen(true)}
              />
              <ClaimInvestigationPanel existingClaims={article.claims || []} />
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
      )}
    </div>
  )
}
