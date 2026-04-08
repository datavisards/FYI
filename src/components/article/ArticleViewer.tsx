'use client'

import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useArticleStore } from '@/stores/articleStore'
import { useClaimStore } from '@/stores/claimStore'
import { ClaimHighlight, ClaimPopover, TextSelectionToolbar } from '@/components/claim'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Article, Claim } from '@/types'
import { getOrderedClaims } from '@/components/claim/utils'

interface ArticleViewerProps {
  article: Article
  articles?: Article[]
  onClaimClick: (claim: Claim) => void
  onArticleChange?: (articleId: string) => void
}

const SCROLL_OFFSET_PX = 100
const SCROLL_DOM_DELAY_MS = 100

export function ArticleViewer({ article, articles, onClaimClick, onArticleChange }: ArticleViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const articleContentRef = useRef<HTMLDivElement>(null)
  const claimRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const { highlightedClaimId, setScrollPosition } = useArticleStore()
  const showArticleSelector = articles && articles.length > 1 && onArticleChange

  const isClaimDetectionComplete = useClaimStore((state) => state.isClaimDetectionComplete)
  const claimVerdicts = useClaimStore((state) => state.claimVerdicts)
  const storeDetectedClaims = useClaimStore((state) => state.detectedClaims)
  const storeManualClaims = useClaimStore((state) => state.manualClaims)
  const dismissedClaimIds = useClaimStore((state) => state.dismissedClaimIds)
  const setDetectedClaimsStore = useClaimStore((state) => state.setDetectedClaims)

  // Single source of truth: merge store detected + manual claims with overlap/dismiss filtering
  const detectedClaims = useMemo(
    () => getOrderedClaims([], storeDetectedClaims, storeManualClaims, dismissedClaimIds),
    [storeDetectedClaims, storeManualClaims, dismissedClaimIds]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      setScrollPosition(container.scrollTop)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [setScrollPosition])

  // Scroll to highlighted claim
  useEffect(() => {
    if (!highlightedClaimId) return
    
    const claimElement = claimRefs.current.get(highlightedClaimId)
    const container = containerRef.current
    
    if (claimElement && container) {
      setTimeout(() => {
        const containerRect = container.getBoundingClientRect()
        const elementRect = claimElement.getBoundingClientRect()
        const scrollTop = container.scrollTop
        const elementTop = elementRect.top - containerRect.top + scrollTop

        container.scrollTo({
          top: elementTop - SCROLL_OFFSET_PX,
          behavior: 'smooth',
        })
      }, SCROLL_DOM_DELAY_MS)
    }
  }, [highlightedClaimId])

  // Helper function to find best offset match for a claim within a search range
  const findBestOffset = useCallback((content: string, claimText: string, startOffset: number, endOffset: number) => {
    const searchRange = 100 // Search ±100 characters from original offset
    const searchStart = Math.max(0, startOffset - searchRange)
    const searchEnd = Math.min(content.length, endOffset + searchRange)
    const searchContent = content.slice(searchStart, searchEnd)

    const normalizedClaim = claimText.replace(/\s+/g, ' ').trim().toLowerCase()
    const claimWords = normalizedClaim.split(' ').filter(w => w.length > 2)

    if (claimWords.length === 0) return { startOffset, endOffset, matchRatio: 1 }

    let bestMatch = { startOffset, endOffset, matchRatio: 0 }
    const claimLength = endOffset - startOffset

    // Slide a window through the search area
    for (let i = 0; i <= searchContent.length - Math.min(claimLength, 20); i++) {
      const windowEnd = Math.min(i + claimLength + 50, searchContent.length)
      const windowText = searchContent.slice(i, windowEnd)
      const normalizedWindow = windowText.replace(/\s+/g, ' ').trim().toLowerCase()
      const windowWords = normalizedWindow.split(' ').filter(w => w.length > 2)

      const matchCount = claimWords.filter(w => windowWords.some(ww => ww.includes(w) || w.includes(ww))).length
      const matchRatio = matchCount / claimWords.length

      if (matchRatio > bestMatch.matchRatio) {
        bestMatch = {
          startOffset: searchStart + i,
          endOffset: searchStart + i + claimLength,
          matchRatio
        }
      }

      // Early exit if perfect match found
      if (matchRatio >= 0.9) break
    }

    return bestMatch
  }, [])

  // Use detected claims if available, otherwise use article claims
  // Validate and filter claims to prevent rendering issues
  const claimsToShow = useMemo(() => {
    if (!isClaimDetectionComplete && detectedClaims.length === 0) return []

    const content = article.content

    // First pass: fix offsets using fuzzy matching
    const claimsWithFixedOffsets = detectedClaims.map(claim => {
      const textAtOffset = content.slice(claim.startOffset, claim.endOffset)
      const normalizedOffset = textAtOffset.replace(/\s+/g, ' ').trim()
      const normalizedClaim = claim.text.replace(/\s+/g, ' ').trim()

      const offsetWords = normalizedOffset.toLowerCase().split(' ').filter(w => w.length > 2)
      const claimWords = normalizedClaim.toLowerCase().split(' ').filter(w => w.length > 2)

      if (claimWords.length === 0) return claim

      const matchCount = claimWords.filter(w => offsetWords.some(ow => ow.includes(w) || w.includes(ow))).length
      const matchRatio = matchCount / claimWords.length

      // If match is poor, try to find better offset
      if (matchRatio < 0.3) {
        const betterMatch = findBestOffset(content, claim.text, claim.startOffset, claim.endOffset)
        if (betterMatch.matchRatio > matchRatio) {
          const actualText = content.slice(betterMatch.startOffset, betterMatch.endOffset)
          return {
            ...claim,
            text: actualText,
            startOffset: betterMatch.startOffset,
            endOffset: betterMatch.endOffset
          }
        }
      }

      return claim
    })

    const sorted = [...claimsWithFixedOffsets].sort((a, b) => a.startOffset - b.startOffset)

    // Filter out claims with invalid offsets (no mutation - overlapping claims are dropped)
    let lastEnd = -1
    const validClaims = sorted.filter((claim) => {
      // Check bounds
      if (claim.startOffset < 0 || claim.endOffset > content.length) {
        return false
      }

      // Check start < end
      if (claim.startOffset >= claim.endOffset) {
        return false
      }

      // Drop overlapping claims (don't mutate - avoids dropped article content and state corruption)
      if (claim.startOffset < lastEnd) return false
      lastEnd = claim.endOffset

      // Verify the text at the offset matches (with relaxed threshold)
      const textAtOffset = content.slice(claim.startOffset, claim.endOffset)
      const normalizedOffset = textAtOffset.replace(/\s+/g, ' ').trim()
      const normalizedClaim = claim.text.replace(/\s+/g, ' ').trim()

      // More flexible word matching - 30% threshold and partial word matching
      const offsetWords = normalizedOffset.toLowerCase().split(' ').filter(w => w.length > 2)
      const claimWords = normalizedClaim.toLowerCase().split(' ').filter(w => w.length > 2)

      if (claimWords.length === 0) return true // Short claims pass

      // Use partial word matching (substring match)
      const matchCount = claimWords.filter(w =>
        offsetWords.some(ow => ow.includes(w) || w.includes(ow))
      ).length
      const matchRatio = matchCount / claimWords.length

      if (matchRatio < 0.3) {
        console.warn('[fyi] Claim filtered out: low word match', { claimId: claim.id, text: claim.text.slice(0, 50), matchRatio })
        return false
      }

      return true
    })

    return validClaims
  }, [isClaimDetectionComplete, detectedClaims, article.content, findBestOffset])

  const handleClaimsDetected = useCallback((claims: Claim[], offsetsRelativeToFullArticle?: boolean) => {
    let claimsToSet: Claim[]
    if (!offsetsRelativeToFullArticle) {
      claimsToSet = claims.map((c) => ({ ...c, source: 'ai' as const }))
    } else {
      const titleLen = article.title.length + 2 // title + "\n\n"
      claimsToSet = claims
        .filter((c) => c.startOffset >= titleLen)
        .map((c) => ({
          ...c,
          startOffset: c.startOffset - titleLen,
          endOffset: c.endOffset - titleLen,
          source: 'ai' as const,
        }))
    }
    setDetectedClaimsStore(claimsToSet)
  }, [article.title.length, setDetectedClaimsStore])

  // Manual claims are added via addManualClaim in the toolbar; merge in useMemo shows them
  const handleManualClaimCreated = useCallback((_claim: Claim) => {
    // No-op: toolbar already calls addManualClaim(); merged list from store shows the new claim
  }, [])

  const renderedContent = useMemo(() => {
    const content = article.content

    // If no claims to show, use simple markdown rendering
    if (claimsToShow.length === 0) {
      return <div className="leading-relaxed text-base">{renderMarkdown(content)}</div>
    }

    // When claims are present, render inline to preserve offsets
    // Use a simpler approach: render text segments between claims
    const claims = [...claimsToShow].sort((a, b) => a.startOffset - b.startOffset)
    const parts: React.ReactNode[] = []
    let lastIndex = 0

    // Helper to render text with basic paragraph handling
    const renderTextSegment = (text: string, keyPrefix: string) => {
      if (!text) return null
      // Split by double newlines for paragraphs
      const paragraphs = text.split(/\n\n+/)
      return paragraphs.map((para, idx) => {
        const trimmed = para.trim()
        if (!trimmed) return null
        // Handle headings
        if (trimmed.startsWith('## ')) {
          return <h2 key={`${keyPrefix}-${idx}`} className="text-xl font-semibold mt-6 mb-3 block">{trimmed.slice(3)}</h2>
        }
        if (trimmed.startsWith('# ')) {
          return <h1 key={`${keyPrefix}-${idx}`} className="text-2xl font-bold mt-8 mb-4 block">{trimmed.slice(2)}</h1>
        }
        // Regular text - preserve as inline with paragraph breaks
        const isLastPara = idx === paragraphs.length - 1
        return (
          <span key={`${keyPrefix}-${idx}`}>
            {trimmed.replace(/\n/g, ' ')}
            {!isLastPara && <><br /><br /></>}
          </span>
        )
      })
    }

    claims.forEach((claim, index) => {
      // Add text before claim
      if (claim.startOffset > lastIndex) {
        const beforeText = content.slice(lastIndex, claim.startOffset)
        parts.push(<span key={`text-${index}`}>{renderTextSegment(beforeText, `seg-${index}`)}</span>)
      }

      const verdictData = claimVerdicts.find((v) => v.claimId === claim.id)
      const corrTarget = verdictData?.correctionTarget
      const corrText = verdictData?.correctionText
      const explText = verdictData?.explanationText ?? (verdictData?.reasoningText && !verdictData?.correctionText ? verdictData.reasoningText : undefined)
      parts.push(
        <ClaimPopover
          key={`claim-${claim.id}`}
          claim={claim}
          onInvestigate={() => onClaimClick(claim)}
          verdict={verdictData?.verdict}
        >
          <ClaimHighlight
            ref={(el) => {
              if (el) {
                claimRefs.current.set(claim.id, el)
              } else {
                claimRefs.current.delete(claim.id)
              }
            }}
            claim={claim}
            isHighlighted={highlightedClaimId === claim.id}
            verdict={verdictData?.verdict}
            hasAnnotation={!!(corrText || explText)}
            correctionTarget={corrTarget}
            correctionText={corrText}
          />
        </ClaimPopover>
      )

      lastIndex = claim.endOffset
    })

    // Add remaining text after last claim
    if (lastIndex < content.length) {
      const remainingText = content.slice(lastIndex)
      parts.push(<span key="text-end">{renderTextSegment(remainingText, 'seg-end')}</span>)
    }

    return <div className="leading-relaxed text-base">{parts}</div>
  }, [article.content, claimsToShow, highlightedClaimId, claimVerdicts, onClaimClick, isClaimDetectionComplete])

  return (
    <div className="h-full flex flex-col min-h-0">
      <ScrollArea className="flex-1 min-h-0" ref={containerRef}>
        <article className="p-6 prose prose-neutral dark:prose-invert max-w-none">
          <header className="mb-6 not-prose">
            {showArticleSelector && (
              <div className="mb-4">
                <Select value={article.$id} onValueChange={onArticleChange}>
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue placeholder="Select article" />
                  </SelectTrigger>
                  <SelectContent>
                    {articles.map((a) => (
                      <SelectItem key={a.$id} value={a.$id}>
                        {a.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <h1 className="text-2xl font-bold mb-2">{article.title}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{article.source}</span>
              {article.metadata.publishedDate && (
                <>
                  <span>|</span>
                  <span>{formatDate(article.metadata.publishedDate)}</span>
                </>
              )}
            </div>
          </header>

          {/* Article content with text selection support */}
          <div ref={articleContentRef} className="relative">
            {renderedContent}
            {/* Text selection toolbar for marking claims — always available */}
            <TextSelectionToolbar
              containerRef={articleContentRef}
              articleContent={article.content}
              onClaimCreated={handleManualClaimCreated}
            />
          </div>
        </article>
      </ScrollArea>
    </div>
  )
}

function renderMarkdown(text: string): React.ReactNode {
  // Split by paragraphs (double newlines)
  const paragraphs = text.split(/\n\n+/)

  return paragraphs.map((paragraph, pIndex) => {
    const trimmed = paragraph.trim()
    if (!trimmed) return null

    // Handle headings
    if (trimmed.startsWith('## ')) {
      return (
        <h2 key={pIndex} className="text-xl font-semibold mt-6 mb-3">
          {trimmed.slice(3)}
        </h2>
      )
    }
    if (trimmed.startsWith('# ')) {
      return (
        <h1 key={pIndex} className="text-2xl font-bold mt-8 mb-4">
          {trimmed.slice(2)}
        </h1>
      )
    }

    // Regular paragraph - preserve inline newlines as spaces
    const content = trimmed.replace(/\n/g, ' ')
    return (
      <p key={pIndex} className="mb-4">
        {content}
      </p>
    )
  })
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
