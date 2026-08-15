import { useEffect } from 'react'
import { nanoid } from 'nanoid'

import { useClaimStore } from '@/stores/claimStore'
import { getOrderedClaims } from '@/components/claim/utils'
import type { Article, Claim } from '@/types'

/**
 * Two-way sync between the panel and the article page.
 *
 * The content script cannot talk to the panel directly, so it writes to
 * `chrome.storage.session` and the panel listens for the change. Highlights
 * travel the other way, through the background worker.
 */

interface Options {
  article: Article | null
  claims: Claim[]
  /** Whether the active tab is the article this panel holds. */
  onBoundPage: boolean
  tabId: number | null
  onClaimSelect: (claim: Claim) => void
}

function highlightPayload(article: Article, claims: Claim[], verdicts: ReturnType<typeof mapVerdicts>) {
  return {
    content: article.title + '\n\n' + article.content,
    claims,
    claimVerdicts: verdicts,
  }
}

function mapVerdicts(claimVerdicts: ReturnType<typeof useClaimStore.getState>['claimVerdicts']) {
  return claimVerdicts.map((v) => ({
    claimId: v.claimId,
    verdict: v.verdict,
    correctionTarget: v.correctionTarget,
    correctionText: v.correctionText,
    explanationText: v.explanationText,
  }))
}

export function usePageSync({ article, claims, onBoundPage, tabId, onClaimSelect }: Options) {
  const addManualClaim = useClaimStore((s) => s.addManualClaim)
  const dismissClaim = useClaimStore((s) => s.dismissClaim)
  const detectedClaims = useClaimStore((s) => s.detectedClaims)
  const manualClaims = useClaimStore((s) => s.manualClaims)
  const claimVerdicts = useClaimStore((s) => s.claimVerdicts)
  const dismissedClaimIds = useClaimStore((s) => s.dismissedClaimIds)

  // A highlight was clicked on the page.
  useEffect(() => {
    const onChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'session') return
      if (!changes.lastClickedClaimId?.newValue && !changes.lastClickedClaimTs?.newValue) return
      chrome.storage.session.get(['lastClickedClaimId']).then((data) => {
        const claimId = data.lastClickedClaimId as string | undefined
        if (!claimId) return
        const claim = claims.find((c) => c.id === claimId)
        if (claim) onClaimSelect(claim)
      })
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [claims, onClaimSelect])

  // A selection was marked as a claim on the page.
  useEffect(() => {
    const onChange = (
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
      if (!article) return

      const manual: Claim & { addedByUser: true; addedAt: string } = {
        id: `manual-${nanoid(8)}`,
        text: payload.text,
        startOffset: payload.startOffset,
        endOffset: payload.endOffset,
        addedByUser: true,
        addedAt: new Date().toISOString(),
      }
      addManualClaim(manual)

      const merged = getOrderedClaims([], detectedClaims, [...manualClaims, manual], dismissedClaimIds)
      // Marked on the page itself, so that page is the target.
      chrome.runtime
        .sendMessage({
          type: 'HIGHLIGHT_CLAIMS',
          payload: { tabId, ...highlightPayload(article, merged, mapVerdicts(claimVerdicts)) },
        })
        .catch(() => {})
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [article, detectedClaims, manualClaims, claimVerdicts, dismissedClaimIds, addManualClaim, tabId])

  // A claim was dismissed from the page popover.
  useEffect(() => {
    const onChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'session' || !changes.pendingDismissClaim?.newValue) return
      const { claimId } = changes.pendingDismissClaim.newValue as { claimId: string }
      chrome.storage.session.remove('pendingDismissClaim')
      dismissClaim(claimId)
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [dismissClaim])

  /*
   * Push highlights whenever the claims or verdicts change.
   *
   * Only while the article is the page in front of the user, and always to a
   * named tab: the offsets are meaningless anywhere else. Returning to the
   * article re-runs this and restores the highlights.
   */
  useEffect(() => {
    if (!article || claims.length === 0 || !onBoundPage) return
    chrome.runtime
      .sendMessage({
        type: 'HIGHLIGHT_CLAIMS',
        payload: { tabId, ...highlightPayload(article, claims, mapVerdicts(claimVerdicts)) },
      })
      .catch(() => {})
  }, [article, claims, claimVerdicts, onBoundPage, tabId])
}
