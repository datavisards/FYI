/**
 * Content script: extracts article, applies claim highlights, and shows a unified
 * popover for both "mark selection as claim" and "investigate/dismiss claim" actions.
 */

import {
  getText,
  extractAuthor,
  findTextRange,
} from './content-utils'

function extractArticle(): { title: string; content: string; url: string; author: string } {
  const url = window.location.href
  let title = ''
  const ogTitle = document.querySelector('meta[property="og:title"]')
  if (ogTitle?.getAttribute('content')) {
    title = ogTitle.getAttribute('content')!.trim()
  }
  if (!title) {
    const h1 = document.querySelector('h1')
    title = h1 ? getText(h1) : document.title || ''
  }

  let content = ''
  const article = document.querySelector('article')
  const main = document.querySelector('main')
  const target = article ?? main ?? document.body
  if (target) {
    content = getText(target)
  }
  if (!content || content.length < 100) {
    const p = document.querySelectorAll('p')
    const parts: string[] = []
    p.forEach((el) => {
      const t = getText(el)
      if (t.length > 20) parts.push(t)
    })
    content = parts.join('\n\n')
  }
  if (!content) {
    content = getText(document.body)
  }

  const author = extractAuthor()

  return { title: title || document.title || 'Untitled', content, url, author }
}

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload?: unknown },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    if (message.type === 'EXTRACT_ARTICLE') {
      try {
        const article = extractArticle()
        sendResponse(article)
      } catch (e) {
        sendResponse({ error: String(e) })
      }
      return true
    }
    if (message.type === 'HIGHLIGHT_CLAIMS' && message.payload) {
      try {
        const payload = message.payload as {
          content: string
          claims: Array<{ id: string; text: string; startOffset: number; endOffset: number }>
          claimVerdicts?: Array<{
            claimId: string
            verdict: string
            correctionTarget?: string
            correctionText?: string
            explanationText?: string
          }>
        }
        highlightClaims(payload.content, payload.claims, payload.claimVerdicts)
        sendResponse({ ok: true })
      } catch (e) {
        sendResponse({ error: String(e) })
      }
      return true
    }
    if (message.type === 'CLEAR_HIGHLIGHTS') {
      try {
        clearHighlights()
        sendResponse({ ok: true })
      } catch (e) {
        sendResponse({ error: String(e) })
      }
      return true
    }
  }
)

const HIGHLIGHT_CLASS = 'fyi-claim-highlight'
const CLAIM_SPAN_SELECTOR = '[data-fyi-claim-id]'

function getBodyContainer(): Element | null {
  const article = document.querySelector('article')
  const main = document.querySelector('main')
  return article ?? main ?? document.body
}

// --- Span-based highlights + CSS Highlight API fallback ---

let trackedRanges: Array<{ range: Range; claimId: string; claimText: string; claimSource: string }> = []
let clickHandlerInstalled = false

const HIGHLIGHT_NAMES = {
  default: 'fyi-default',
  verified: 'fyi-verified',
  misleading: 'fyi-misleading',
  unverifiable: 'fyi-unverifiable',
} as const

const SPAN_CLASS_BY_VERDICT: Record<string, string> = {
  default: 'fyi-span-default',
  verified: 'fyi-span-verified',
  misleading: 'fyi-span-misleading',
  unverifiable: 'fyi-span-unverifiable',
}

function injectHighlightStyles(): void {
  if (document.getElementById('fyi-highlight-styles')) return
  const style = document.createElement('style')
  style.id = 'fyi-highlight-styles'
  style.textContent = `
    ::highlight(${HIGHLIGHT_NAMES.default}) { background-color: rgba(214, 211, 209, 0.7); }
    ::highlight(${HIGHLIGHT_NAMES.verified}) { background-color: rgba(220, 252, 231, 0.85); }
    ::highlight(${HIGHLIGHT_NAMES.misleading}) { background-color: rgba(254, 243, 199, 0.85); }
    ::highlight(${HIGHLIGHT_NAMES.unverifiable}) { background-color: rgba(199, 210, 254, 0.85); }

    [data-fyi-claim-id] {
      border-radius: 3px;
      cursor: pointer;
      transition: filter 0.1s ease;
    }
    .fyi-span-default      { background-color: rgba(214, 211, 209, 0.7); }
    .fyi-span-verified     { background-color: rgba(220, 252, 231, 0.85); }
    .fyi-span-misleading   { background-color: rgba(254, 243, 199, 0.85); }
    .fyi-span-unverifiable { background-color: rgba(199, 210, 254, 0.85); }

    [data-fyi-claim-id]:hover { filter: brightness(0.93); outline: 2px solid rgba(99,102,241,0.5); outline-offset: 1px; }
    [data-fyi-claim-id].fyi-active { outline: 2px solid rgba(99,102,241,0.8); outline-offset: 1px; filter: brightness(0.9); }
  `
  ;(document.head || document.documentElement).appendChild(style)
}

function clearHighlights(): void {
  hidePopover()
  if (typeof CSS !== 'undefined' && CSS.highlights) {
    CSS.highlights.delete(HIGHLIGHT_NAMES.default)
    CSS.highlights.delete(HIGHLIGHT_NAMES.verified)
    CSS.highlights.delete(HIGHLIGHT_NAMES.misleading)
    CSS.highlights.delete(HIGHLIGHT_NAMES.unverifiable)
  }
  trackedRanges = []

  document.querySelectorAll(CLAIM_SPAN_SELECTOR).forEach((el) => {
    const parent = el.parentNode
    if (!parent) return
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  })

  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
    const parent = el.parentNode
    if (!parent) return
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  })
}

// --- Unified popover ---

const POPOVER_ID = 'fyi-popover'

// Base button style factory
function makeBtn(opts: {
  label: string
  primary?: boolean
  danger?: boolean
  onClick: (e: MouseEvent) => void
}): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = opts.label
  btn.setAttribute('data-fyi', '1')

  const baseStyle = [
    'border-radius:6px',
    'padding:6px 12px',
    'cursor:pointer',
    'font-size:12px',
    'font-weight:500',
    'font-family:system-ui,sans-serif',
    'line-height:1',
    'white-space:nowrap',
    'transition:background 0.1s',
  ]

  if (opts.primary) {
    btn.style.cssText = [...baseStyle, 'flex:1', 'background:#111827', 'color:#fff', 'border:none'].join(';')
    btn.addEventListener('mouseenter', () => { btn.style.background = '#374151' })
    btn.addEventListener('mouseleave', () => { btn.style.background = '#111827' })
  } else if (opts.danger) {
    btn.style.cssText = [...baseStyle, 'background:#f9fafb', 'color:#dc2626', 'border:1px solid #fecaca'].join(';')
    btn.addEventListener('mouseenter', () => { btn.style.background = '#fef2f2' })
    btn.addEventListener('mouseleave', () => { btn.style.background = '#f9fafb' })
  } else {
    btn.style.cssText = [...baseStyle, 'background:#f9fafb', 'color:#374151', 'border:1px solid #e5e7eb'].join(';')
    btn.addEventListener('mouseenter', () => { btn.style.background = '#f3f4f6' })
    btn.addEventListener('mouseleave', () => { btn.style.background = '#f9fafb' })
  }

  btn.addEventListener('click', opts.onClick)
  return btn
}

interface PopoverState {
  outsideHandler: ((e: MouseEvent) => void) | null
  selectionPayload: { text: string; startOffset: number; endOffset: number } | null
}

const _pop: PopoverState = { outsideHandler: null, selectionPayload: null }

function showDismissConfirmation(claimId: string, claimText: string, anchorX: number, anchorY: number): void {
  hidePopover()

  const popover = document.createElement('div')
  popover.id = POPOVER_ID
  popover.setAttribute('data-fyi', '1')
  popover.style.cssText = [
    'position:fixed',
    `left:${anchorX}px`,
    `top:${anchorY - 10}px`,
    'transform:translate(-50%,-100%)',
    'z-index:2147483647',
    'font-family:system-ui,sans-serif',
    'font-size:13px',
  ].join(';')

  const card = document.createElement('div')
  card.style.cssText = [
    'background:#fff',
    'border:1px solid #e5e7eb',
    'border-radius:10px',
    'box-shadow:0 8px 24px rgba(0,0,0,0.15)',
    'overflow:hidden',
    'min-width:240px',
    'max-width:320px',
  ].join(';')

  // Title
  const title = document.createElement('div')
  title.textContent = 'Remove this claim?'
  title.style.cssText = 'padding:12px 14px 4px;font-size:14px;font-weight:600;color:#111827;'
  card.appendChild(title)

  // Description
  const desc = document.createElement('div')
  desc.style.cssText = 'padding:4px 14px 8px;font-size:12px;color:#6b7280;line-height:1.4;'
  desc.textContent = 'This claim will be removed from your active investigation list.'
  card.appendChild(desc)

  // Claim text preview
  const preview = document.createElement('div')
  const displayText = claimText.length > 150 ? claimText.slice(0, 150) + '...' : claimText
  preview.textContent = `\u201C${displayText}\u201D`
  preview.style.cssText = [
    'margin:0 14px 10px',
    'padding:6px 8px',
    'border:1px solid #e5e7eb',
    'border-radius:6px',
    'background:#f9fafb',
    'font-size:12px',
    'color:#374151',
    'line-height:1.4',
  ].join(';')
  card.appendChild(preview)

  // Footer buttons
  const footer = document.createElement('div')
  footer.style.cssText = 'display:flex;gap:6px;padding:8px 14px 12px;justify-content:flex-end;'

  footer.appendChild(makeBtn({
    label: 'Cancel',
    onClick: (e) => {
      e.stopPropagation()
      hidePopover()
    },
  }))

  footer.appendChild(makeBtn({
    label: 'Remove',
    danger: true,
    onClick: (e) => {
      e.stopPropagation()
      hidePopover()
      chrome.runtime.sendMessage({ type: 'DISMISS_CLAIM', payload: { claimId } })
    },
  }))

  card.appendChild(footer)
  popover.appendChild(card)
  document.body.appendChild(popover)

  // Clamp to viewport
  requestAnimationFrame(() => {
    const rect = popover.getBoundingClientRect()
    if (rect.left < 8) popover.style.left = `${anchorX + (8 - rect.left)}px`
    if (rect.right > window.innerWidth - 8) popover.style.left = `${anchorX - (rect.right - (window.innerWidth - 8))}px`
    if (rect.top < 8) {
      popover.style.top = `${anchorY + 18}px`
      popover.style.transform = 'translate(-50%, 0)'
    }
  })

  _pop.outsideHandler = (ev: MouseEvent) => {
    const pop = document.getElementById(POPOVER_ID)
    if (!pop) return
    if (!pop.contains(ev.target as Node)) hidePopover()
  }
  document.addEventListener('mousedown', _pop.outsideHandler, true)
}

function showPopover(
  mode: 'claim' | 'selection',
  opts: {
    claimId?: string
    claimText?: string
    claimSource?: string
    selectionPayload?: { text: string; startOffset: number; endOffset: number }
  },
  anchorX: number,
  anchorY: number
): void {
  hidePopover()

  const popover = document.createElement('div')
  popover.id = POPOVER_ID
  popover.setAttribute('data-fyi', '1')
  popover.style.cssText = [
    'position:fixed',
    `left:${anchorX}px`,
    `top:${anchorY - 10}px`,
    'transform:translate(-50%,-100%)',
    'z-index:2147483647',
    'font-family:system-ui,sans-serif',
    'font-size:13px',
  ].join(';')

  const card = document.createElement('div')
  card.style.cssText = [
    'background:#fff',
    'border:1px solid #e5e7eb',
    'border-radius:10px',
    'box-shadow:0 8px 24px rgba(0,0,0,0.15)',
    'overflow:hidden',
    'min-width:200px',
    'max-width:300px',
  ].join(';')

  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;gap:6px;padding:8px 10px;align-items:center;'
  actions.setAttribute('data-fyi', '1')

  if (mode === 'claim') {
    // Source badge on its own row
    const badgeRow = document.createElement('div')
    badgeRow.style.cssText = 'padding:8px 10px 0;'
    badgeRow.setAttribute('data-fyi', '1')

    const badge = document.createElement('span')
    badge.setAttribute('data-fyi', '1')
    const isUser = opts.claimSource === 'user'
    badge.textContent = isUser ? 'Manually added' : 'AI-detected'
    badge.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:3px',
      'padding:1px 6px',
      'border:1px solid #e5e7eb',
      'border-radius:9999px',
      'font-size:10px',
      'color:#6b7280',
      'white-space:nowrap',
      'line-height:1.4',
    ].join(';')

    // Inline SVG icon (Bot or User)
    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.setAttribute('width', '10')
    svg.setAttribute('height', '10')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '2')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    if (isUser) {
      const path1 = document.createElementNS(svgNS, 'path')
      path1.setAttribute('d', 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2')
      const circle = document.createElementNS(svgNS, 'circle')
      circle.setAttribute('cx', '12')
      circle.setAttribute('cy', '7')
      circle.setAttribute('r', '4')
      svg.appendChild(path1)
      svg.appendChild(circle)
    } else {
      const rect = document.createElementNS(svgNS, 'rect')
      rect.setAttribute('width', '18')
      rect.setAttribute('height', '10')
      rect.setAttribute('x', '3')
      rect.setAttribute('y', '11')
      rect.setAttribute('rx', '2')
      const circle1 = document.createElementNS(svgNS, 'circle')
      circle1.setAttribute('cx', '12')
      circle1.setAttribute('cy', '5')
      circle1.setAttribute('r', '2')
      const path1 = document.createElementNS(svgNS, 'path')
      path1.setAttribute('d', 'M12 7v4')
      const line1 = document.createElementNS(svgNS, 'line')
      line1.setAttribute('x1', '8')
      line1.setAttribute('y1', '16')
      line1.setAttribute('x2', '8')
      line1.setAttribute('y2', '16')
      const line2 = document.createElementNS(svgNS, 'line')
      line2.setAttribute('x1', '16')
      line2.setAttribute('y1', '16')
      line2.setAttribute('x2', '16')
      line2.setAttribute('y2', '16')
      svg.appendChild(rect)
      svg.appendChild(circle1)
      svg.appendChild(path1)
      svg.appendChild(line1)
      svg.appendChild(line2)
    }
    badge.prepend(svg)
    badgeRow.appendChild(badge)
    card.appendChild(badgeRow)

    // Buttons row
    actions.appendChild(makeBtn({
      label: 'Investigate',
      primary: true,
      onClick: (e) => {
        e.stopPropagation()
        hidePopover()
        chrome.runtime.sendMessage({ type: 'CLAIM_CLICKED', payload: { claimId: opts.claimId } })
      },
    }))
    actions.appendChild(makeBtn({
      label: 'Remove claim',
      danger: false,
      onClick: (e) => {
        e.stopPropagation()
        showDismissConfirmation(opts.claimId ?? '', opts.claimText ?? '', anchorX, anchorY)
      },
    }))
  } else {
    // selection mode — "Mark as claim"
    _pop.selectionPayload = opts.selectionPayload ?? null
    actions.appendChild(makeBtn({
      label: 'Mark as claim',
      primary: true,
      onClick: (e) => {
        e.stopPropagation()
        if (_pop.selectionPayload) {
          chrome.runtime.sendMessage({ type: 'ADD_MANUAL_CLAIM', payload: _pop.selectionPayload })
        }
        hidePopover()
        window.getSelection()?.removeAllRanges()
      },
    }))
  }

  card.appendChild(actions)
  popover.appendChild(card)
  document.body.appendChild(popover)

  // Clamp to viewport so it doesn't appear off-screen
  requestAnimationFrame(() => {
    const rect = popover.getBoundingClientRect()
    if (rect.left < 8) popover.style.left = `${anchorX + (8 - rect.left)}px`
    if (rect.right > window.innerWidth - 8) popover.style.left = `${anchorX - (rect.right - (window.innerWidth - 8))}px`
    if (rect.top < 8) {
      // Flip below cursor instead
      popover.style.top = `${anchorY + 18}px`
      popover.style.transform = 'translate(-50%, 0)'
    }
  })

  // Close on outside mousedown
  _pop.outsideHandler = (ev: MouseEvent) => {
    const pop = document.getElementById(POPOVER_ID)
    if (!pop) return
    if (!pop.contains(ev.target as Node)) hidePopover()
  }
  document.addEventListener('mousedown', _pop.outsideHandler, true)
}

function hidePopover(): void {
  document.getElementById(POPOVER_ID)?.remove()
  if (_pop.outsideHandler) {
    document.removeEventListener('mousedown', _pop.outsideHandler, true)
    _pop.outsideHandler = null
  }
  _pop.selectionPayload = null
}

// --- Click handler: claim span detection ---

/** Find claim span at a click point. Returns null if click is not on a highlighted claim. */
function findClaimAtPoint(clientX: number, clientY: number): { claimId: string; claimText: string; claimSource: string } | null {
  // 1) Span-based (primary path — reliable on all sites)
  const el = document.elementFromPoint(clientX, clientY)
  const claimSpan = el?.closest?.(CLAIM_SPAN_SELECTOR)
  if (claimSpan instanceof HTMLElement) {
    const id = claimSpan.getAttribute('data-fyi-claim-id')
    if (id) {
      return {
        claimId: id,
        claimText: claimSpan.getAttribute('data-fyi-claim-text') ?? claimSpan.textContent ?? '',
        claimSource: claimSpan.getAttribute('data-fyi-claim-source') ?? 'ai',
      }
    }
  }

  // 2) Range-based fallback (CSS Highlight API path — no span wrapping)
  if (trackedRanges.length === 0) return null

  const caretRange =
    typeof document.caretRangeFromPoint === 'function'
      ? document.caretRangeFromPoint(clientX, clientY)
      : null

  if (caretRange) {
    for (const { range, claimId, claimText, claimSource } of trackedRanges) {
      if (!document.contains(range.startContainer)) continue
      try {
        // caret must be strictly inside the claim range
        const startCmp = range.compareBoundaryPoints(Range.START_TO_START, caretRange)
        const endCmp = range.compareBoundaryPoints(Range.END_TO_END, caretRange)
        if (startCmp <= 0 && endCmp >= 0) {
          return { claimId, claimText, claimSource }
        }
      } catch {
        /* detached nodes */
      }
    }
  }

  return null
}

function installClickHandler(): void {
  if (clickHandlerInstalled) return
  clickHandlerInstalled = true

  document.addEventListener('click', (e) => {
    // Skip if click is inside our own popover
    const pop = document.getElementById(POPOVER_ID)
    if (pop?.contains(e.target as Node)) return

    // Skip if user has an active text selection (mouseup already handled that)
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) return

    const claim = findClaimAtPoint(e.clientX, e.clientY)
    if (claim) {
      e.preventDefault()
      e.stopPropagation()
      showPopover('claim', claim, e.clientX, e.clientY)
    } else {
      hidePopover()
    }
  }, true)
}

/**
 * Wrap a range by splitting individual text nodes — handles ranges that cross element
 * boundaries (e.g. beginning of a paragraph), where `surroundContents` would throw.
 * Each text-node segment within the range gets its own <span> with the claim attributes.
 * Returns true if at least one span was created.
 */
function wrapRangeInSpans(
  range: Range,
  claimId: string,
  claimText: string,
  claimSource: string,
  spanClass: string,
): boolean {
  const { startContainer, endContainer, startOffset, endOffset } = range

  // Collect text nodes that are fully or partially inside the range
  const textNodes: Text[] = []

  if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
    textNodes.push(startContainer as Text)
  } else {
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
    )
    let inside = false
    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      if (node === startContainer) inside = true
      if (inside) textNodes.push(node)
      if (node === endContainer) break
    }
  }

  if (textNodes.length === 0) return false

  const makeSpan = (): HTMLSpanElement => {
    const span = document.createElement('span')
    span.setAttribute('data-fyi-claim-id', claimId)
    span.setAttribute('data-fyi-claim-text', claimText)
    span.setAttribute('data-fyi-claim-source', claimSource)
    span.className = spanClass
    return span
  }

  let created = 0

  for (const textNode of textNodes) {
    if (!textNode.parentNode) continue
    const isStart = textNode === startContainer
    const isEnd = textNode === endContainer
    const len = textNode.length

    const from = isStart ? startOffset : 0
    const to = isEnd ? endOffset : len

    if (from >= to) continue

    if (from === 0 && to === len) {
      // Wrap entire text node
      const span = makeSpan()
      textNode.parentNode.insertBefore(span, textNode)
      span.appendChild(textNode)
    } else {
      // Slice out the segment [from, to] using splitText
      const segmentNode = from > 0 ? textNode.splitText(from) : textNode
      if (to - from < segmentNode.length) segmentNode.splitText(to - from)
      const span = makeSpan()
      segmentNode.parentNode!.insertBefore(span, segmentNode)
      span.appendChild(segmentNode)
    }

    created++
  }

  return created > 0
}

function highlightClaims(
  _content: string,
  claims: Array<{ id: string; text: string; startOffset: number; endOffset: number }>,
  claimVerdicts?: Array<{
    claimId: string
    verdict: string
    correctionTarget?: string
    correctionText?: string
    explanationText?: string
  }>
): void {
  clearHighlights()
  injectHighlightStyles()
  installClickHandler()

  const verdictByClaimId = new Map<string, string>()
  if (claimVerdicts) {
    for (const v of claimVerdicts) {
      if (v.verdict) verdictByClaimId.set(v.claimId, v.verdict)
    }
  }

  const container = getBodyContainer()
  if (!container) return

  // CSS Highlight API fallback (only used when span-wrapping utterly fails)
  const rangeGroups: Record<string, Range[]> = {
    default: [], verified: [], misleading: [], unverifiable: [],
  }
  let spanWrappedCount = 0

  for (const claim of claims) {
    const searchText = claim.text
    if (!searchText || searchText.length < 3) continue

    const range = findTextRange(container, searchText, claim.startOffset)
    if (!range) {
      console.warn('[fyi] Failed to create range for claim', { claimId: claim.id, text: claim.text.slice(0, 50) })
      continue
    }

    const verdict = verdictByClaimId.get(claim.id)
    const verdictKey: keyof typeof rangeGroups =
      verdict && verdict in rangeGroups ? (verdict as keyof typeof rangeGroups) : 'default'
    const spanClass = SPAN_CLASS_BY_VERDICT[verdictKey] ?? SPAN_CLASS_BY_VERDICT.default
    const claimSource = (claim as { source?: string }).source ?? 'ai'

    // Span-wrapping handles cross-element ranges that surroundContents can't
    const wrapped = wrapRangeInSpans(range, claim.id, claim.text, claimSource, spanClass)
    if (wrapped) {
      spanWrappedCount++
    } else {
      // Ultimate fallback: CSS Highlight API (no hover, but at least visible)
      trackedRanges.push({ range, claimId: claim.id, claimText: claim.text, claimSource })
      rangeGroups[verdictKey].push(range)
    }
  }

  if (typeof CSS !== 'undefined' && CSS.highlights) {
    for (const [category, ranges] of Object.entries(rangeGroups)) {
      if (ranges.length === 0) continue
      const name = HIGHLIGHT_NAMES[category as keyof typeof HIGHLIGHT_NAMES]
      if (name) CSS.highlights.set(name, new Highlight(...ranges))
    }
  }

  if (Object.values(rangeGroups).flat().length === 0 && spanWrappedCount === 0 && claims.length > 0) {
    console.warn('[fyi] No highlights created despite having', claims.length, 'claims')
  }
}

// --- Selection popover: "Mark as claim" ---
const MIN_SELECTION_LENGTH = 10

function initSelectionPopover(): void {
  const container = getBodyContainer()
  if (!container) return

  container.addEventListener('mouseup', () => {
    // Small delay so selection is stable
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        // Only hide if we're currently showing a selection popover (not a claim popover)
        return
      }

      const range = sel.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) return

      const text = sel.toString().trim()
      if (text.length < MIN_SELECTION_LENGTH) return

      // Don't show "mark as claim" if the selected text is entirely within an existing claim span
      const commonAncestor = range.commonAncestorContainer
      const existingSpan = (commonAncestor instanceof Element ? commonAncestor : commonAncestor.parentElement)?.closest(CLAIM_SPAN_SELECTOR)
      if (existingSpan) return

      const bodyText = getText(container)
      const normalized = text.replace(/\s+/g, ' ').trim()
      const idx = bodyText.indexOf(normalized)
      if (idx === -1) return

      const rect = range.getBoundingClientRect()
      const anchorX = rect.left + rect.width / 2
      const anchorY = rect.top

      showPopover(
        'selection',
        { selectionPayload: { text, startOffset: idx, endOffset: idx + normalized.length } },
        anchorX,
        anchorY,
      )
    }, 10)
  })
}

initSelectionPopover()
