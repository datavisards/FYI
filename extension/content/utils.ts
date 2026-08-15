/**
 * Pure utility functions for content script logic.
 * Extracted for testability — no side effects, no chrome.* calls.
 */

export function getText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  const scripts = clone.querySelectorAll('script, style, noscript')
  scripts.forEach((s) => s.remove())
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function extractAuthor(doc: Document = document): string {
  const metaSelectors = [
    'meta[name="author"]',
    'meta[property="article:author"]',
    'meta[property="og:article:author"]',
    'meta[name="dc.creator"]',
    'meta[name="citation_author"]',
  ]
  for (const sel of metaSelectors) {
    const el = doc.querySelector(sel)
    const val = el?.getAttribute('content')?.trim()
    if (val) return val
  }
  const domSelectors = [
    '[class*="byline"]',
    '[class*="author"]',
    '[rel="author"]',
    '[itemprop="author"]',
  ]
  for (const sel of domSelectors) {
    const el = doc.querySelector(sel)
    const val = el?.textContent?.replace(/\s+/g, ' ').trim()
    if (val && val.length < 200) return val
  }
  return ''
}

export interface TextNodeEntry {
  node: Text
  rawStart: number
  rawEnd: number
}

/**
 * Build a normalizedToRaw mapping array that mirrors getText()'s normalization.
 * Walks all text nodes (excluding script/style/noscript), concatenates raw text,
 * then simulates .replace(/\s+/g, ' ').trim() while recording raw index per normalized index.
 */
function buildOffsetMap(container: Element): {
  normalizedToRaw: number[]
  textNodes: TextNodeEntry[]
} {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      const tag = parent.tagName.toLowerCase()
      if (tag === 'script' || tag === 'style' || tag === 'noscript') return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const textNodes: TextNodeEntry[] = []
  let rawLen = 0
  let n: Text | null = walker.nextNode() as Text | null
  while (n) {
    const len = (n.textContent ?? '').length
    textNodes.push({ node: n, rawStart: rawLen, rawEnd: rawLen + len })
    rawLen += len
    n = walker.nextNode() as Text | null
  }

  let raw = ''
  for (const entry of textNodes) {
    raw += entry.node.textContent ?? ''
  }

  const normalizedToRaw: number[] = []

  let i = 0
  while (i < raw.length && /\s/.test(raw[i])) i++

  let end = raw.length
  while (end > i && /\s/.test(raw[end - 1])) end--

  let inSpace = false
  while (i < end) {
    const ch = raw[i]
    const isWs = /\s/.test(ch)
    if (isWs) {
      if (!inSpace) {
        normalizedToRaw.push(i)
        inSpace = true
      }
    } else {
      normalizedToRaw.push(i)
      inSpace = false
    }
    i++
  }
  normalizedToRaw.push(end)

  return { normalizedToRaw, textNodes }
}

function rawOffsetToNode(
  rawOffset: number,
  textNodes: TextNodeEntry[]
): { node: Text; offset: number } | null {
  for (const entry of textNodes) {
    if (rawOffset >= entry.rawStart && rawOffset <= entry.rawEnd) {
      return { node: entry.node, offset: rawOffset - entry.rawStart }
    }
  }
  return null
}

function getRawChar(rawOffset: number, textNodes: TextNodeEntry[]): string {
  for (const entry of textNodes) {
    if (rawOffset >= entry.rawStart && rawOffset < entry.rawEnd) {
      return (entry.node.textContent ?? '')[rawOffset - entry.rawStart] ?? ' '
    }
  }
  return ' '
}

export function findTextRange(container: Element, searchText: string, startOffset: number): Range | null {
  const normalizedSearch = searchText.replace(/\s+/g, ' ').trim()
  if (!normalizedSearch) return null

  const { normalizedToRaw, textNodes } = buildOffsetMap(container)
  const normalizedLen = normalizedToRaw.length - 1
  if (normalizedLen <= 0) return null

  let normalizedText = ''
  for (let j = 0; j < normalizedLen; j++) {
    const rawIdx = normalizedToRaw[j]
    const ch = textNodes.length > 0 ? getRawChar(rawIdx, textNodes) : ' '
    normalizedText += /\s/.test(ch) ? ' ' : ch
  }

  let actualOffset = startOffset
  if (actualOffset < 0 || actualOffset >= normalizedLen) actualOffset = 0

  const textAtOffset = normalizedText.slice(actualOffset, actualOffset + normalizedSearch.length)
  if (textAtOffset.toLowerCase() !== normalizedSearch.toLowerCase()) {
    console.warn('[fyi] findTextRange: offset hint mismatch, searching nearby...', { searchText: normalizedSearch.slice(0, 50), startOffset })
    const searchRange = 200
    const searchStart = Math.max(0, actualOffset - searchRange)
    const searchEnd = Math.min(normalizedLen, actualOffset + normalizedSearch.length + searchRange)
    const searchArea = normalizedText.slice(searchStart, searchEnd)
    const foundIdx = searchArea.toLowerCase().indexOf(normalizedSearch.toLowerCase())
    if (foundIdx >= 0) {
      actualOffset = searchStart + foundIdx
    } else {
      const fullIdx = normalizedText.toLowerCase().indexOf(normalizedSearch.toLowerCase())
      if (fullIdx >= 0) {
        actualOffset = fullIdx
      } else {
        console.warn('[fyi] findTextRange: text not found in DOM', { searchText: normalizedSearch.slice(0, 50) })
        return null
      }
    }
  }

  const endNorm = actualOffset + normalizedSearch.length
  if (endNorm > normalizedLen) return null

  const rawStart = normalizedToRaw[actualOffset]
  const rawEnd = normalizedToRaw[endNorm]

  const startInfo = rawOffsetToNode(rawStart, textNodes)
  const endInfo = rawOffsetToNode(rawEnd, textNodes)
  if (!startInfo || !endInfo) return null

  try {
    const range = document.createRange()
    range.setStart(startInfo.node, startInfo.offset)
    range.setEnd(endInfo.node, endInfo.offset)
    return range
  } catch {
    return null
  }
}
