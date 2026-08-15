import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { useArticleStore } from '@/stores/articleStore'
import { useExplorationStore } from '@/stores/explorationStore'
import { useClaimStore } from '@/stores/claimStore'
import { useSettingsStore, useHasApiKey } from '@/stores/settingsStore'
import { getOrderedClaims } from '@/components/claim/utils'
import { KeyStep } from '@/components/onboarding/KeyStep'
import type { StepList } from '@/components/onboarding/StepShell'
import { downloadAsJSON } from '@/lib/export/sessionExporter'
import type { Article, Claim } from '@/types'

import { ArticleCard } from './ArticleCard'
import { DifferentPageTakeover } from './DifferentPageTakeover'
import { EmptyState } from './EmptyState'
import { PanelHeader } from './PanelHeader'
import { TabBindingBar } from './TabBindingBar'
import { ToolsGrid } from './ToolsGrid'
import { useActiveTab, samePage, pageKey } from './useActiveTab'
import { usePageSync } from './usePageSync'

type Phase = 'empty' | 'article-info' | 'key' | 'investigation'

/** No Data step here: the CSV upload lives in the article card instead. */
const SETUP_STEPS: StepList = [
  { id: 'article', label: 'Article' },
  { id: 'key', label: 'Model' },
]

export function ExtensionPanel() {
  const [article, setArticle] = useState<Article | null>(null)
  const [phase, setPhase] = useState<Phase>('empty')
  const [extractLoading, setExtractLoading] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [claimsSheetOpen, setClaimsSheetOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const initRef = useRef(false)

  const setArticles = useArticleStore((s) => s.setArticles)
  const getCurrentArticle = useArticleStore((s) => s.getCurrentArticle)
  const setSelectedClaim = useArticleStore((s) => s.setSelectedClaim)
  const setHighlightedClaimId = useArticleStore((s) => s.setHighlightedClaimId)
  const startSession = useExplorationStore((s) => s.startSession)
  const setActiveClaim = useExplorationStore((s) => s.setActiveClaim)
  const session = useExplorationStore((s) => s.session)
  const clearAll = useExplorationStore((s) => s.clearAll)
  const detectedClaims = useClaimStore((s) => s.detectedClaims)
  const manualClaims = useClaimStore((s) => s.manualClaims)
  const claimVerdicts = useClaimStore((s) => s.claimVerdicts)
  const dismissedClaimIds = useClaimStore((s) => s.dismissedClaimIds)
  const hasKey = useHasApiKey()

  const currentArticle = getCurrentArticle() ?? article

  const allClaimsOrdered = useMemo(
    () => getOrderedClaims([], detectedClaims, manualClaims, dismissedClaimIds),
    [detectedClaims, manualClaims, dismissedClaimIds]
  )

  /*
   * The article's URL binds the panel to a tab. A tab id would go stale on
   * restart, and would miss the reader navigating that same tab elsewhere.
   */
  const activeTab = useActiveTab()
  const onBoundPage = samePage(activeTab.url, currentArticle?.metadata?.url)
  // Content scripts do not run on chrome:// pages, so there is nothing to offer.
  const offBoundPage = !onBoundPage && /^https?:/i.test(activeTab.url)

  /*
   * Pages the reader has chosen to stay away from. One answer per page rather
   * than one per tab switch, since hopping to a source is part of checking a
   * claim. Not persisted: it is a decision about this sitting.
   */
  const [keptPages, setKeptPages] = useState<Set<string>>(new Set())
  const activeKey = pageKey(activeTab.url)
  const showTakeover = offBoundPage && !keptPages.has(activeKey)
  const showTabBar = offBoundPage && !showTakeover

  const boundKey = pageKey(currentArticle?.metadata?.url)
  useEffect(() => {
    setKeptPages(new Set())
  }, [boundKey])

  const onClaimClick = useCallback(
    (claim: Claim) => {
      setSelectedClaim(claim)
      setHighlightedClaimId(claim.id)
      setActiveClaim({ id: claim.id, text: claim.text, category: claim.category })
    },
    [setSelectedClaim, setHighlightedClaimId, setActiveClaim]
  )

  usePageSync({
    article: currentArticle,
    claims: allClaimsOrdered,
    onBoundPage,
    tabId: activeTab.id,
    onClaimSelect: onClaimClick,
  })

  /*
   * Resume where the last visit left off. The wait for hydration is required:
   * these stores persist to chrome.storage, which is asynchronous, so reading
   * them on mount sees empty defaults and would show setup over a live session.
   */
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const restore = () => {
      const saved = useArticleStore.getState().getCurrentArticle()
      if (saved) {
        setArticle(saved)
        // A session exists only once the workspace has been opened.
        setPhase(useExplorationStore.getState().session ? 'investigation' : 'article-info')
      }
      setIsLoading(false)
    }

    const stores = [useArticleStore, useExplorationStore, useSettingsStore]
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
        title: string
        content: string
        url: string
        author?: string
      }
      const extracted: Article = {
        $id: `ext-${nanoid(8)}`,
        title,
        source: new URL(url).hostname,
        content,
        claims: [],
        metadata: { url, author: author || undefined },
      }
      setArticle(extracted)
      setArticles([extracted])
      setSelectedClaim(null)
      setHighlightedClaimId(null)
      setPhase('article-info')
      await chrome.runtime.sendMessage({ type: 'CLEAR_HIGHLIGHTS' }).catch(() => {})
    } finally {
      setExtractLoading(false)
    }
  }, [setArticles, setSelectedClaim, setHighlightedClaimId])

  /**
   * Move the panel to the page the reader is looking at.
   *
   * The claim and verdict stores hold one article at a time, so this replaces
   * rather than adds, and asks first only when there is something to lose.
   */
  const handleAnalyzeThisPage = useCallback(async () => {
    const claimCount = detectedClaims.length + manualClaims.length
    const hasWork = Boolean(session) || claimCount > 0 || claimVerdicts.length > 0

    if (hasWork) {
      const losses: string[] = []
      if (claimCount > 0) losses.push(`${claimCount} claim${claimCount === 1 ? '' : 's'}`)
      if (claimVerdicts.length > 0) {
        losses.push(`${claimVerdicts.length} verdict${claimVerdicts.length === 1 ? '' : 's'}`)
      }
      const detail = losses.length
        ? `${losses.join(' and ')} will be discarded.`
        : 'The current session will be discarded.'
      if (!confirm(`Replace this session?\n\n${detail}`)) return
    }

    // Clear the outgoing article's highlights while the claims still identify them.
    const leavingUrl = currentArticle?.metadata?.url
    if (leavingUrl) {
      try {
        const open = await chrome.tabs.query({})
        await Promise.all(
          open
            .filter((t) => t.id != null && samePage(t.url, leavingUrl))
            .map((t) =>
              chrome.runtime
                .sendMessage({ type: 'CLEAR_HIGHLIGHTS', payload: { tabId: t.id } })
                .catch(() => {})
            )
        )
      } catch {
        // An unreachable tab is not a reason to block the switch.
      }
    }

    clearAll()
    setArticles([])
    await handleGetArticle()
  }, [
    session,
    currentArticle,
    detectedClaims,
    manualClaims,
    claimVerdicts,
    clearAll,
    setArticles,
    handleGetArticle,
  ])

  const handleKeepCurrentSession = useCallback(() => {
    setKeptPages((prev) => new Set(prev).add(activeKey))
  }, [activeKey])

  const handleStartInvestigation = useCallback(() => {
    if (!currentArticle) return
    startSession(currentArticle.$id)
    setSelectedClaim(null)
    setHighlightedClaimId(null)
    setPhase('investigation')
  }, [currentArticle, startSession, setSelectedClaim, setHighlightedClaimId])

  const handleResetSession = useCallback(() => {
    if (!currentArticle) return
    if (!confirm('Are you sure you want to reset? All progress will be lost.')) return
    clearAll()
    // The article store is not part of clearAll, and it persists.
    setArticles([])
    setArticle(null)
    setSelectedClaim(null)
    setHighlightedClaimId(null)
    setPhase('empty')
    chrome.runtime.sendMessage({ type: 'CLEAR_HIGHLIGHTS' }).catch(() => {})
  }, [currentArticle, clearAll, setArticles, setSelectedClaim, setHighlightedClaimId])

  const handleExport = useCallback(() => {
    const state = useExplorationStore.getState()
    const sessionId = state.session?.sessionId ?? 'no-session'
    downloadAsJSON(state.getExportData(), `fyi-session-${sessionId}-${Date.now()}.json`)
    toast.success('Session exported')
  }, [])

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (phase === 'empty' || !currentArticle) {
    return (
      <EmptyState
        loading={extractLoading}
        error={extractError}
        onGetArticle={handleGetArticle}
      />
    )
  }

  const takeover = (
    <DifferentPageTakeover
      boundTitle={currentArticle.title}
      activeTitle={activeTab.title}
      onAnalyze={handleAnalyzeThisPage}
      onKeep={handleKeepCurrentSession}
    />
  )

  if (phase === 'article-info') {
    return (
      <div className="h-screen flex flex-col">
        {showTakeover ? (
          takeover
        ) : (
          <>
            {showTabBar && <TabBindingBar onAnalyze={handleAnalyzeThisPage} />}
            <ArticleCard
              article={currentArticle}
              hasKey={hasKey}
              onContinue={() => setPhase('key')}
              onStart={handleStartInvestigation}
            />
          </>
        )}
      </div>
    )
  }

  if (phase === 'key') {
    return (
      <div className="h-screen">
        <KeyStep
          steps={SETUP_STEPS}
          onBack={() => setPhase('article-info')}
          onStart={handleStartInvestigation}
        />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col min-h-0">
      <PanelHeader
        title={currentArticle.title}
        onBoundPage={onBoundPage}
        claimsSheetOpen={claimsSheetOpen}
        onClaimsSheetOpenChange={setClaimsSheetOpen}
        onClaimClick={onClaimClick}
        onExport={handleExport}
        onReset={handleResetSession}
      />
      {showTabBar && <TabBindingBar onAnalyze={handleAnalyzeThisPage} />}
      {showTakeover && takeover}
      <ToolsGrid
        article={currentArticle}
        hidden={showTakeover}
        onOpenClaimsList={() => setClaimsSheetOpen(true)}
      />
    </div>
  )
}
