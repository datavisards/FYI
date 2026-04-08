'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useArticleStore } from '@/stores/articleStore'
import { useExplorationStore } from '@/stores/explorationStore'
import { useClaimStore } from '@/stores/claimStore'
import { useDataStore } from '@/stores/dataStore'
import { ClaimInvestigationPanel, ClaimToolbar, ClaimsListPanel } from '@/components/claim'
import { getOrderedClaims } from '@/components/claim/utils'
import { SplitPane } from '@/components/layout/SplitPane'
import { ToolTable } from '@/components/tool-table'
import { ChatLayout } from '@/components/tool-ai-chat/ChatLayout'
import { AutoCheckPanel } from '@/components/tool-ai-chat/AutoCheckPanel'
import { ActionHistoryPanel } from '@/components/action-history'
import { CSVUploadButton } from '@/components/tool-table/CSVUploadButton'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Loader2,
  Sparkles,
  FileText,
  History,
  Globe,
  User,
  ArrowRight,
  Download,
  AlertCircle,
  Wifi,
  WifiOff,
  MoreVertical,
  RotateCcw,
} from 'lucide-react'
import type { Article, Claim } from '@/types'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/apiClient'
import { SessionTimer } from '@/components/session/SessionTimer'
import { downloadAsJSON } from '@/lib/export/sessionExporter'

type Phase = 'empty' | 'article-info' | 'investigation'

export function ExtensionPanel() {
  const [article, setArticle] = useState<Article | null>(null)
  const [phase, setPhase] = useState<Phase>('empty')
  const [extractLoading, setExtractLoading] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [claimsSheetOpen, setClaimsSheetOpen] = useState(false)
  const [serviceStatus, setServiceStatus] = useState<'checking' | 'warming' | 'online' | 'offline'>('checking')

  const setArticles = useArticleStore((s) => s.setArticles)
  const getCurrentArticle = useArticleStore((s) => s.getCurrentArticle)
  const setSelectedClaim = useArticleStore((s) => s.setSelectedClaim)
  const setHighlightedClaimId = useArticleStore((s) => s.setHighlightedClaimId)
  const startSession = useExplorationStore((s) => s.startSession)
  const setActiveClaim = useExplorationStore((s) => s.setActiveClaim)
  const session = useExplorationStore((s) => s.session)
  const clearAll = useExplorationStore((s) => s.clearAll)
  const addManualClaim = useClaimStore((s) => s.addManualClaim)
  const dismissClaim = useClaimStore((s) => s.dismissClaim)
  const detectedClaims = useClaimStore((s) => s.detectedClaims)
  const manualClaims = useClaimStore((s) => s.manualClaims)
  const claimVerdicts = useClaimStore((s) => s.claimVerdicts)
  const dismissedClaimIds = useClaimStore((s) => s.dismissedClaimIds)
  const pageTableData = useDataStore((s) => s.pageTableData)

  const currentArticle = getCurrentArticle() ?? article

  const handleResetSession = useCallback(() => {
    if (!currentArticle) return
    if (!confirm('Are you sure you want to reset? All progress will be lost.')) return
    clearAll()
    setSelectedClaim(null)
    setHighlightedClaimId(null)
    setPhase('article-info')
    chrome.runtime.sendMessage({ type: 'CLEAR_HIGHLIGHTS' }).catch(() => {})
  }, [currentArticle, clearAll, setSelectedClaim, setHighlightedClaimId])

  const handleExport = useCallback(() => {
    const expState = useExplorationStore.getState()
    const sessionId = expState.session?.sessionId ?? 'no-session'
    const data = expState.getExportData()
    downloadAsJSON(data, `lokivis-session-${sessionId}-${Date.now()}.json`)
    toast.success('Session exported')
  }, [])

  const allClaimsOrdered = useMemo(
    () => getOrderedClaims([], detectedClaims, manualClaims, dismissedClaimIds),
    [detectedClaims, manualClaims, dismissedClaimIds]
  )

  const handleGetArticle = useCallback(async () => {
    setExtractError(null)
    setExtractLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ARTICLE' })
      if (response?.error) {
        setExtractError(response.error)
        return
      }
      const { title, content, url, author } = response as {
        title: string; content: string; url: string; author?: string
      }
      const hostname = new URL(url).hostname
      const art: Article = {
        $id: `ext-${nanoid(8)}`,
        title,
        source: hostname,
        content,
        claims: [],
        metadata: { url, author: author || undefined },
      }
      setArticle(art)
      setArticles([art])
      setSelectedClaim(null)
      setHighlightedClaimId(null)
      setPhase('article-info')
      try {
        await chrome.runtime.sendMessage({ type: 'CLEAR_HIGHLIGHTS' })
      } catch (_) {}
    } finally {
      setExtractLoading(false)
    }
  }, [setArticles, setSelectedClaim, setHighlightedClaimId])

  const handleStartInvestigation = useCallback(async () => {
    if (!currentArticle) return
    startSession(currentArticle.$id)
    setSelectedClaim(null)
    setHighlightedClaimId(null)
    setPhase('investigation')
  }, [currentArticle, startSession, setSelectedClaim, setHighlightedClaimId])

  const onClaimClick = useCallback(
    (claim: Claim) => {
      setSelectedClaim(claim)
      setHighlightedClaimId(claim.id)
      setActiveClaim({ id: claim.id, text: claim.text, category: claim.category })
    },
    [setSelectedClaim, setHighlightedClaimId, setActiveClaim]
  )

  // Service health polling — shown in investigation phase
  useEffect(() => {
    if (phase !== 'investigation') return
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const check = async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      try {
        const resp = await apiFetch('/api/health', { signal: controller.signal } as RequestInit)
        clearTimeout(timeoutId)
        if (!cancelled) setServiceStatus(resp.ok ? 'online' : 'offline')
      } catch (e) {
        clearTimeout(timeoutId)
        if (!cancelled) {
          setServiceStatus((e as Error).name === 'AbortError' ? 'warming' : 'offline')
          retryTimer = setTimeout(check, 15000)
        }
      }
    }

    setServiceStatus('checking')
    check()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [phase])

  // Sync article from store on mount + determine initial phase
  useEffect(() => {
    const cur = getCurrentArticle()
    if (cur) {
      setArticle(cur)
      // If we have a session, go to investigation; otherwise article-info
      const sess = useExplorationStore.getState().session
      if (sess) {
        setPhase('investigation')
      } else {
        setPhase('article-info')
      }
    }
  }, [getCurrentArticle])

  // When user clicks a claim highlight on the page, select that claim in the panel
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'session') return
      if (!changes.lastClickedClaimId?.newValue && !changes.lastClickedClaimTs?.newValue) return
      chrome.storage.session.get(['lastClickedClaimId']).then((data) => {
        const claimId = data.lastClickedClaimId as string | undefined
        if (!claimId) return
        const claim = allClaimsOrdered.find((c) => c.id === claimId)
        if (claim) onClaimClick(claim)
      })
    }
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [allClaimsOrdered, onClaimClick])

  // When user marks a selection as claim on the page, add as manual claim and re-highlight
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'session' || !changes.pendingManualClaim?.newValue) return
      const payload = changes.pendingManualClaim.newValue as {
        text: string
        startOffset: number
        endOffset: number
      }
      chrome.storage.session.remove('pendingManualClaim')
      if (!currentArticle) return
      const manual: Claim & { addedByUser: true; addedAt: string } = {
        id: `manual-${nanoid(8)}`,
        text: payload.text,
        startOffset: payload.startOffset,
        endOffset: payload.endOffset,
        addedByUser: true,
        addedAt: new Date().toISOString(),
      }
      addManualClaim(manual)
      const fullContent = currentArticle.title + '\n\n' + currentArticle.content
      const merged = getOrderedClaims([], detectedClaims, [...manualClaims, manual], dismissedClaimIds)
      const verdicts = claimVerdicts.map((v) => ({
        claimId: v.claimId, verdict: v.verdict,
        correctionTarget: v.correctionTarget, correctionText: v.correctionText, explanationText: v.explanationText,
      }))
      chrome.runtime
        .sendMessage({
          type: 'HIGHLIGHT_CLAIMS',
          payload: { content: fullContent, claims: merged, claimVerdicts: verdicts },
        })
        .catch(() => {})
    }
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [currentArticle, detectedClaims, manualClaims, claimVerdicts, addManualClaim])

  // When user dismisses a claim via the page popover, dismiss it and re-highlight
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'session' || !changes.pendingDismissClaim?.newValue) return
      const { claimId } = changes.pendingDismissClaim.newValue as { claimId: string }
      chrome.storage.session.remove('pendingDismissClaim')
      dismissClaim(claimId)
    }
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [dismissClaim])

  // Sync highlights to the real page when claims (detected or manual) change
  useEffect(() => {
    if (!currentArticle || allClaimsOrdered.length === 0) return
    const fullContent = currentArticle.title + '\n\n' + currentArticle.content
    const verdicts = claimVerdicts.map((v) => ({
      claimId: v.claimId, verdict: v.verdict,
      correctionTarget: v.correctionTarget, correctionText: v.correctionText, explanationText: v.explanationText,
    }))
    chrome.runtime
      .sendMessage({
        type: 'HIGHLIGHT_CLAIMS',
        payload: { content: fullContent, claims: allClaimsOrdered, claimVerdicts: verdicts },
      })
      .catch(() => {})
  }, [currentArticle, allClaimsOrdered, claimVerdicts])

  // --- Phase: empty ---
  if (phase === 'empty' || !currentArticle) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Get article from page</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-xs">
          Extract the article from the current tab to start analyzing claims and exploring data.
        </p>
        <Button onClick={handleGetArticle} disabled={extractLoading} className="gap-2">
          {extractLoading ? (
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
        {extractError && (
          <p className="mt-3 text-sm text-destructive">{extractError}</p>
        )}
      </div>
    )
  }

  // --- Phase: article-info ---
  if (phase === 'article-info') {
    return (
      <div className="h-screen flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Article info card */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h2 className="text-base font-semibold leading-tight">{currentArticle.title}</h2>
            <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              {currentArticle.metadata?.author && (
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span>{currentArticle.metadata.author}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                <span>{currentArticle.source}</span>
              </div>
            </div>
          </div>

          {/* CSV Upload */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Upload data (optional)</h3>
            <p className="text-xs text-muted-foreground">
              Add CSV files to use during your investigation.
            </p>
            <CSVUploadButton />
            {pageTableData && pageTableData.length > 0 && (
              <div className="space-y-1 mt-2">
                {pageTableData.map((d) => (
                  <div key={d.name} className="text-xs bg-muted px-2 py-1 rounded flex items-center gap-1.5">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{d.name}</span>
                    <span className="text-muted-foreground ml-auto shrink-0">
                      {d.rows.length} rows
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Start Investigation */}
          <Button onClick={handleStartInvestigation} className="w-full gap-2">
            Start Investigation
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // --- Phase: investigation ---
  return (
    <div className="h-screen flex flex-col min-h-0">
      {/* Header: controls only */}
      <header className="h-12 border-b flex items-center justify-between px-4 bg-background shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <SessionTimer key={session?.sessionId} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Claims sheet without a visible trigger; opened via menu item */}
          <Sheet open={claimsSheetOpen} onOpenChange={setClaimsSheetOpen}>
            <SheetContent side="left" className="w-[400px] sm:w-[450px] p-0">
              <SheetTitle className="sr-only">Claims List</SheetTitle>
              <ClaimsListPanel
                onClaimClick={(claim) => {
                  onClaimClick(claim)
                  setClaimsSheetOpen(false)
                }}
              />
            </SheetContent>
          </Sheet>

          {/* History sheet trigger hidden; opened via menu item */}
          <Sheet>
            <SheetTrigger asChild>
              <button
                id="lokivis-history-trigger"
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
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[11rem]">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  const trigger = document.getElementById('lokivis-history-trigger')
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

      {/* Service status banner */}
      {serviceStatus !== 'online' && (
        <div className={`px-4 py-2 text-xs flex items-center gap-2 border-b ${
          serviceStatus === 'checking' ? 'bg-muted text-muted-foreground' :
          serviceStatus === 'warming'  ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' :
                                         'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'
        }`}>
          {serviceStatus === 'checking' && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
          {serviceStatus === 'warming'  && <Wifi className="h-3 w-3 shrink-0" />}
          {serviceStatus === 'offline'  && <WifiOff className="h-3 w-3 shrink-0" />}
          <span>
            {serviceStatus === 'checking' && 'Checking service…'}
            {serviceStatus === 'warming'  && 'Service warming up — first request may take up to 60 s'}
            {serviceStatus === 'offline'  && 'Service unavailable — retrying…'}
          </span>
          {serviceStatus === 'offline' && <AlertCircle className="h-3 w-3 shrink-0 ml-auto" />}
        </div>
      )}

      {/* Main: ClaimInvestigationPanel + tools grid */}
      <div className="flex-1 min-h-0 flex flex-col">
        {currentArticle && (
          <ClaimToolbar
            articleContent={currentArticle.title + '\n\n' + currentArticle.content}
            existingClaims={currentArticle.claims || []}
            onOpenClaimsList={() => setClaimsSheetOpen(true)}
          />
        )}
        <ClaimInvestigationPanel
          existingClaims={currentArticle?.claims || []}
        />
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
                right={<VisBuilderFrame />}
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
    </div>
  )
}

function VisBuilderFrame() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const pageTableData = useDataStore((s) => s.pageTableData)
  const selectedVisDataset = useDataStore((s) => s.selectedVisDataset)
  const activeClaim = useExplorationStore((s) => s.activeClaim)
  const addEvent = useExplorationStore((s) => s.addEvent)

  const sendData = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage(
      { type: 'BUILDER_LOAD_CONTEXT', payload: { csvDatasets: pageTableData ?? [], selectedVisDataset } },
      '*'
    )
  }, [pageTableData, selectedVisDataset])

  // Send activeClaim to iframe so vis events get the correct claimId
  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage(
      { type: 'BUILDER_SET_ACTIVE_CLAIM', payload: { activeClaim } },
      '*'
    )
  }, [activeClaim])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const handleLoad = () => setTimeout(() => {
      sendData()
      // Also send initial activeClaim after iframe loads
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: 'BUILDER_SET_ACTIVE_CLAIM', payload: { activeClaim } },
          '*'
        )
      }
    }, 100)
    iframe.addEventListener('load', handleLoad)
    return () => iframe.removeEventListener('load', handleLoad)
  }, [sendData, activeClaim])

  useEffect(() => {
    sendData()
  }, [sendData])

  // Listen for vis events relayed from the iframe and add to parent store
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || data.type !== 'BUILDER_VIS_EVENT' || !data.payload) return
      addEvent(data.payload)
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [addEvent])

  const iframeSrc = chrome.runtime.getURL('extension/builder-sandbox.html')

  return (
    <div className="h-full w-full bg-muted/30">
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="FYI Chart Builder"
        className="h-full w-full border-0"
      />
    </div>
  )
}

