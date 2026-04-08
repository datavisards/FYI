'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { useExplorationStore } from '@/stores/explorationStore'
import { useClaimStore } from '@/stores/claimStore'
import { useArticleStore } from '@/stores/articleStore'
import { useDataStore } from '@/stores/dataStore'
import { eventLogger } from '@/lib/tracking/eventLogger'
import { parseCSV } from '@/lib/data/csvFetcher'

import Link from 'next/link'
import { SplitPane } from '@/components/layout/SplitPane'

import { ArticleViewer } from '@/components/article/ArticleViewer'
import { ClaimInvestigationPanel, ClaimToolbar, ClaimsListPanel } from '@/components/claim'
import { ToolTable } from '@/components/tool-table'
import { ChatLayout } from '@/components/tool-ai-chat/ChatLayout'
import { AutoCheckPanel } from '@/components/tool-ai-chat/AutoCheckPanel'
import { ToolVisBuilder } from '@/components/tool-vis-builder/ToolVisBuilder'
import { ActionHistoryPanel } from '@/components/action-history'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { History, Download, RotateCcw, MoreHorizontal } from 'lucide-react'
import { SessionTimer } from '@/components/session/SessionTimer'
import { downloadAsJSON } from '@/lib/export/sessionExporter'

import type { Article, Claim } from '@/types'

// Load sample article
import movieSuccessArticle from '@/data/movie-success-article.json'

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

export default function StudyPage() {
  const session = useExplorationStore((state) => state.session)
  const startSession = useExplorationStore((state) => state.startSession)
  const setActiveClaim = useExplorationStore((state) => state.setActiveClaim)
  const clearAll = useExplorationStore((state) => state.clearAll)
  const { setSelectedClaim, setHighlightedClaimId, setArticles } = useArticleStore()

  const [isLoading, setIsLoading] = useState(true)
  const [article, setArticle] = useState<Article | null>(null)
  const [customText, setCustomText] = useState('')
  const [claimsSheetOpen, setClaimsSheetOpen] = useState(false)
  const initRef = useRef(false)

  // Initialize to an empty state (no active article or session)
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    clearAll()
    setIsLoading(false)
  }, [clearAll])

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

  // Reset session
  const handleResetSession = useCallback(() => {
    if (confirm('Are you sure you want to reset? All progress will be lost.')) {
      clearAll()
      setSelectedClaim(null)
      setHighlightedClaimId(null)
      setActiveClaim(null)
      setArticle(null)
      setCustomText('')
      toast.success('Session reset')
    }
  }, [clearAll, setActiveClaim, setSelectedClaim, setHighlightedClaimId])

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
      // Fresh state for each article: one article per session
      clearAll()
      setSelectedClaim(null)
      setHighlightedClaimId(null)
      setActiveClaim(null)
      setArticle(nextArticle)
      setArticles([nextArticle])

      // Pre-load the associated sample dataset if provided
      if (sampleDataset) {
        fetch(sampleDataset.path)
          .then((r) => r.text())
          .then((raw) => {
            const { headers, rows } = parseCSV(raw)
            useDataStore.getState().setPageTableData([{ name: sampleDataset.name, headers, rows }])
            useDataStore.getState().setSelectedVisDataset(sampleDataset.name)
          })
          .catch(() => { /* dataset load failed silently */ })
      }

      const existingSession = useExplorationStore.getState().session
      if (!existingSession) {
        startSession(nextArticle.$id)
      }
    },
    [clearAll, setActiveClaim, setArticles, setHighlightedClaimId, setSelectedClaim, startSession]
  )

  const handleUseCustomText = useCallback(() => {
    const text = customText.trim()
    if (!text) {
      toast.error('Please paste some text first.')
      return
    }

    const customArticle: Article = {
      $id: `custom-${Date.now()}`,
      title: 'Custom article',
      source: 'User pasted text',
      content: text,
      claims: [],
      metadata: {
        author: 'User',
        tags: ['custom'],
      },
    }

    activateArticle(customArticle)
    toast.success('Custom text loaded as article')
  }, [activateArticle, customText])

  const handleUsePresetArticle = useCallback(
    (data: any, sampleDataset?: { name: string; path: string }) => {
      const presetArticle = buildArticleFromData(data)
      activateArticle(presetArticle, sampleDataset)
      toast.success('Sample article loaded')
    },
    [activateArticle]
  )

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-full mx-auto" />
          <Skeleton className="h-4 w-48" />
          <p className="text-sm text-muted-foreground">Loading study...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Header: session controls only */}
      <header className="h-12 border-b flex items-center justify-between px-4 bg-background shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <SessionTimer key={session?.sessionId} />
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
              <DropdownMenuItem
                variant="destructive"
                onSelect={(e) => {
                  e.preventDefault()
                  handleResetSession()
                }}
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset session</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content: Article (left) + Factchecking tools (right) */}
      <div className="flex-1 min-h-0">
        <SplitPane
          left={
            <div className="h-full flex flex-col">
              {!article && (
                <div className="border-b bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Article source</p>
                      <p className="text-[11px] text-muted-foreground">
                        Start by choosing a sample article or pasting your own text.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Use a sample article</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => handleUsePresetArticle(movieSuccessArticle, { name: 'movies-merged', path: '/data/movies-merged.csv' })}
                      >
                        Movie success factors
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Paste your own text</p>
                    <Textarea
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder="Paste any article or paragraph here, then click “Use pasted text” to fact-check it."
                      className="min-h-20 text-xs"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={handleUseCustomText}
                      >
                        Use pasted text
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex-1 min-h-0">
                {article ? (
                  <ArticleViewer article={article} onClaimClick={handleClaimClick} />
                ) : (
                  <div className="h-full flex items-center justify-center px-6">
                    <div className="text-center space-y-2 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">No article selected yet</p>
                      <p>
                        Choose one of the sample articles above or paste your own text to begin
                        fact-checking.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          }
          right={
            <div className="h-full flex flex-col min-h-0">
              {article ? (
                <>
                  <ClaimToolbar
                    articleContent={article.title + '\n\n' + article.content}
                    existingClaims={article.claims || []}
                    onOpenClaimsList={() => setClaimsSheetOpen(true)}
                  />
                  <ClaimInvestigationPanel
                    existingClaims={article.claims || []}
                  />
                </>
              ) : (
                <div className="border-b bg-background px-3 py-2 text-xs text-muted-foreground">
                  Select or paste an article on the left to detect and investigate claims here.
                </div>
              )}
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
                          <ToolVisBuilder mode="panel" showToolbarText={true} />
                        </div>
                      }
                      defaultLeftPercent={40}
                      minLeftPercent={25}
                      maxLeftPercent={75}
                    />
                  }
                  defaultLeftPercent={25}
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
