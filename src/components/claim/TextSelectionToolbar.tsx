'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useClaimStore } from '@/stores/claimStore'
import { nanoid } from 'nanoid'
import type { Claim } from '@/types'

interface TextSelectionToolbarProps {
  containerRef: React.RefObject<HTMLElement | null>
  articleContent: string
  onClaimCreated: (claim: Claim) => void
}

const MIN_SELECTION_LENGTH = 10

/**
 * Find the selected text within the raw article content.
 * Returns start/end offsets or null if not found.
 */
function findTextInContent(
  selectedText: string,
  content: string
): { start: number; end: number } | null {
  // Direct match first
  const idx = content.indexOf(selectedText)
  if (idx !== -1) {
    return { start: idx, end: idx + selectedText.length }
  }

  // Normalized match (collapse all whitespace to single space)
  const normSelected = selectedText.replace(/\s+/g, ' ').trim()
  const normContent = content.replace(/\s+/g, ' ').trim()
  const normIdx = normContent.indexOf(normSelected)
  if (normIdx === -1) return null

  // Map normalised index back to original content index
  let origPos = 0
  let normPos = 0
  while (normPos < normIdx && origPos < content.length) {
    if (/\s/.test(content[origPos])) {
      // Skip all consecutive whitespace in original → counts as 1 in normalised
      while (origPos < content.length && /\s/.test(content[origPos])) origPos++
      normPos++
    } else {
      origPos++
      normPos++
    }
  }
  const startOffset = origPos

  // Walk forward to find end
  let matched = 0
  let endPos = startOffset
  while (matched < normSelected.length && endPos < content.length) {
    if (/\s/.test(content[endPos])) {
      while (endPos < content.length && /\s/.test(content[endPos])) endPos++
      matched++ // one normalised space
    } else {
      endPos++
      matched++
    }
  }

  return { start: startOffset, end: endPos }
}

export function TextSelectionToolbar({
  containerRef,
  articleContent,
  onClaimCreated,
}: TextSelectionToolbarProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [selectedText, setSelectedText] = useState('')
  const [selectionOffsets, setSelectionOffsets] = useState<{
    start: number
    end: number
  } | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const addManualClaim = useClaimStore((state) => state.addManualClaim)
  const logClaimAction = useClaimStore((state) => state.logClaimAction)
  const detectedClaims = useClaimStore((state) => state.detectedClaims)

  const handleMarkAsClaim = useCallback(() => {
    if (!selectedText || !selectionOffsets) return

    const newClaim: Claim = {
      id: `manual-${nanoid(8)}`,
      text: selectedText,
      startOffset: selectionOffsets.start,
      endOffset: selectionOffsets.end,
      source: 'user',
    }

    addManualClaim({
      ...newClaim,
      addedByUser: true,
      addedAt: new Date().toISOString(),
    })

    // Check if this overlaps an existing AI-detected claim → log promotion
    const overlappingAi = detectedClaims.find(
      (ai) => ai.source !== 'user' && selectionOffsets.start < ai.endOffset && selectionOffsets.end > ai.startOffset
    )
    if (overlappingAi) {
      logClaimAction({
        action: 'claim_promoted',
        source: 'user',
        claimId: overlappingAi.id,
        timestamp: new Date().toISOString(),
        meta: { promotedToClaimId: newClaim.id },
      })
    }

    onClaimCreated(newClaim)

    window.getSelection()?.removeAllRanges()
    setIsVisible(false)
    setSelectedText('')
    setSelectionOffsets(null)
  }, [selectedText, selectionOffsets, addManualClaim, onClaimCreated, detectedClaims, logClaimAction])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Handle text selection — use document-level mouseup so ScrollArea can't swallow it
    const handleMouseUp = () => {
      // Small delay so the browser finalises the selection
      requestAnimationFrame(() => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) return

        const range = selection.getRangeAt(0)
        // Only act on selections inside our article container
        if (!container.contains(range.commonAncestorContainer)) return

        const text = selection.toString().trim()
        if (text.length < MIN_SELECTION_LENGTH) return

        // Don't show "Mark as claim" if the selection is entirely within an existing claim span
        const ancestor = range.commonAncestorContainer
        const ancestorEl = ancestor instanceof Element ? ancestor : ancestor.parentElement
        if (ancestorEl?.closest('[data-claim-id]')) return

        const offsets = findTextInContent(text, articleContent)
        if (!offsets) return

        setSelectedText(text)
        setSelectionOffsets(offsets)

        const rect = range.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        setPosition({
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top,
        })
        setIsVisible(true)
      })
    }

    // Dismiss toolbar when clicking outside it (but don't clear browser selection
    // on mousedown — that can prevent new selections from starting)
    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return
      setIsVisible(false)
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [containerRef, articleContent])

  if (!isVisible) return null

  return (
    <div
      ref={toolbarRef}
      className="absolute z-50 transform -translate-x-1/2 -translate-y-full"
      style={{ left: position.x, top: position.y - 6 }}
    >
      <div className="bg-popover border rounded-lg shadow-lg p-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={handleMarkAsClaim}
          className="h-7 text-xs"
        >
          Mark as claim
        </Button>
      </div>
      <div className="absolute left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-popover" />
    </div>
  )
}
