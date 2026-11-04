import { parseTargetUrl } from '@/lib/article/targetUrl'
import { apiFetch } from '@/lib/apiClient'
import { parseCSV, type CSVData } from '@/lib/data/csvFetcher'
import type { Article } from '@/types'

export type DatasetSource = 'table' | 'link' | 'cited' | 'search'

/** A dataset that was actually downloaded and parsed, so the preview is real. */
export interface DatasetCandidate extends CSVData {
  id: string
  source: DatasetSource
  /** Where it came from, shown so the person can judge it before adding it. */
  url: string
  /** Why web search suggested it. */
  note?: string
}

const MAX_TABLES_PER_PAGE = 20
const MAX_FILES_PER_PAGE = 5
const MAX_CITED_PAGES = 5
const MAX_SEARCH_RESULTS = 6
const MAX_CANDIDATES = 30

const CLUTTER_TABLE = /infobox|navbox|sidebar|metadata|ambox|vertical-navbox|mw-collapsible-content/i
const DATA_FILE = /\.(csv|tsv)$/i
const DATA_LINK = /\b(data|datasets?|download|statistics|csv|spreadsheet|survey)\b/i

type Fetched = { url: string; html?: string; data?: string }

async function fetchSource(url: string, signal: AbortSignal): Promise<Fetched | null> {
  try {
    const res = await fetch(`/api/article?kind=data&url=${encodeURIComponent(url)}`, { signal })
    return res.ok ? await res.json() : null
  } catch (err) {
    if (signal.aborted) throw err
    return null
  }
}

function nameFromUrl(url: string): string {
  const { hostname, pathname } = new URL(url)
  const file = pathname.split('/').filter(Boolean).pop() ?? hostname
  let decoded = file
  try {
    decoded = decodeURIComponent(file)
  } catch {
    // Keep the raw segment.
  }
  return decoded.replace(/\.(csv|tsv)$/i, '').replace(/[-_]+/g, ' ').trim() || hostname
}

/** Null unless this looks like real rows and columns. Pages and errors often arrive as text. */
function parseDataFile(text: string, url: string): Pick<CSVData, 'headers' | 'rows'> | null {
  if (/^\s*<(!doctype|html)/i.test(text)) return null

  const firstLine = text.slice(0, text.indexOf('\n') + 1 || undefined)
  const tabbed = /\.tsv$/i.test(new URL(url).pathname) || (firstLine.includes('\t') && !firstLine.includes(','))
  const { headers, rows } = tabbed
    ? (() => {
        const lines = text.split(/\r?\n/).filter((l) => l.trim())
        return { headers: (lines[0] ?? '').split('\t'), rows: lines.slice(1).map((l) => l.split('\t')) }
      })()
    : parseCSV(text)

  if (headers.length < 2 || rows.length === 0) return null
  const matching = rows.filter((r) => r.length === headers.length).length
  return matching / rows.length >= 0.8 ? { headers, rows } : null
}

function cellText(cell: Element): string {
  const copy = cell.cloneNode(true) as Element
  copy.querySelectorAll('sup, style, script').forEach((el) => el.remove())
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Lays a table out as a grid, repeating cells that span rows or columns. */
function tableGrid(table: Element): string[][] {
  const grid: string[][] = []
  Array.from(table.querySelectorAll('tr'))
    .filter((tr) => tr.closest('table') === table)
    .forEach((tr, y) => {
      grid[y] ??= []
      let x = 0
      for (const cell of Array.from(tr.children)) {
        while (grid[y][x] !== undefined) x++
        const text = cellText(cell)
        const colSpan = Math.max(Number(cell.getAttribute('colspan')) || 1, 1)
        const rowSpan = Math.max(Number(cell.getAttribute('rowspan')) || 1, 1)
        for (let dy = 0; dy < rowSpan; dy++) {
          grid[y + dy] ??= []
          for (let dx = 0; dx < colSpan; dx++) grid[y + dy][x + dx] = text
        }
        x += colSpan
      }
    })
  return grid
}

function tableName(table: Element, fallback: string): string {
  const captionEl = table.querySelector('caption')
  const caption = captionEl && cellText(captionEl)
  if (caption) return caption.slice(0, 80)

  // The nearest heading before the table, walking out from it.
  for (let el: Element | null = table; el && el.tagName !== 'BODY'; el = el.parentElement) {
    for (let prev = el.previousElementSibling; prev; prev = prev.previousElementSibling) {
      const heading = prev.matches('h1,h2,h3,h4') ? prev : prev.querySelector('h1,h2,h3,h4')
      const text = heading && cellText(heading).replace(/\[edit\]/g, '').trim()
      if (text) return text.slice(0, 80)
    }
  }
  return fallback
}

function tablesFrom(doc: Document, url: string): Omit<DatasetCandidate, 'id' | 'source'>[] {
  const scope = doc.querySelector('article') ?? doc.querySelector('main') ?? doc.body
  const found: Omit<DatasetCandidate, 'id' | 'source'>[] = []

  for (const table of Array.from(scope.querySelectorAll('table'))) {
    if (found.length >= MAX_TABLES_PER_PAGE) break
    if (CLUTTER_TABLE.test(table.className) || table.getAttribute('role') === 'presentation') continue
    if (table.querySelector('table')) continue // Layout, not data.

    const [headers, ...rows] = tableGrid(table)
    if (!headers || headers.length < 2 || rows.length < 2) continue

    found.push({
      name: tableName(table, `Table ${found.length + 1}`),
      headers: headers.map((h, i) => h || `Column ${i + 1}`),
      rows: rows.map((r) => headers.map((_, i) => r[i] ?? '')),
      url,
    })
  }
  return found
}

/** Addresses on a page that lead to a data file: links, and charts with downloadable data. */
function dataFilesFrom(doc: Document, pageUrl: string): string[] {
  const hrefs = [
    ...Array.from(doc.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')),
    ...Array.from(doc.querySelectorAll('iframe[src]')).map((f) => f.getAttribute('src')),
  ]

  const files = new Set<string>()
  for (const href of hrefs) {
    if (!href || !URL.canParse(href, pageUrl)) continue
    const url = new URL(href, pageUrl)
    if (DATA_FILE.test(url.pathname) || url.searchParams.get('format') === 'csv') {
      files.add(url.href)
    } else if (url.hostname === 'ourworldindata.org' && url.pathname.startsWith('/grapher/')) {
      files.add(`https://ourworldindata.org${url.pathname}.csv`)
    } else if (url.hostname === 'datawrapper.dwcdn.net') {
      files.add(`https://datawrapper.dwcdn.net${url.pathname.replace(/\/$/, '')}/dataset.csv`)
    }
  }
  return [...files].filter((f) => parseTargetUrl(f)).slice(0, MAX_FILES_PER_PAGE)
}

/** Links the article cites that sound like data, for following one step. */
function citedPagesFrom(doc: Document, pageUrl: string, skip: Set<string>): string[] {
  const scope = doc.querySelector('article') ?? doc.querySelector('main') ?? doc.body
  const pages = new Set<string>()
  for (const a of Array.from(scope.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href')
    if (!href || !URL.canParse(href, pageUrl)) continue
    const url = new URL(href, pageUrl)
    url.hash = ''
    const target = parseTargetUrl(url.href)
    if (!target || target === pageUrl || skip.has(target)) continue
    if (DATA_LINK.test(a.textContent ?? '') || DATA_LINK.test(url.pathname.replace(/[-_/]/g, ' '))) {
      pages.add(target)
    }
  }
  return [...pages].slice(0, MAX_CITED_PAGES)
}

export interface DiscoverOptions {
  article: Article
  /** False skips web search, which needs an AI key. */
  canSearch: boolean
  signal: AbortSignal
  onCandidate: (candidate: DatasetCandidate) => void
}

/** Looks everywhere it can, reporting candidates as it finds them. Returns what it could not check. */
export async function discoverDatasets({
  article,
  canSearch,
  signal,
  onCandidate,
}: DiscoverOptions): Promise<string[]> {
  const notes: string[] = []
  const seenSources = new Set<string>()
  const seenContent = new Set<string>()
  const nameUses = new Map<string, number>()
  let count = 0

  const report = (c: Omit<DatasetCandidate, 'id'>) => {
    const signature = `${c.headers.join('|')}#${c.rows.length}#${c.rows[0]?.join('|')}`
    if (seenContent.has(signature) || count >= MAX_CANDIDATES) return
    seenContent.add(signature)
    // Tables in one section share a heading; number them so they can be told apart.
    const uses = (nameUses.get(c.name) ?? 0) + 1
    nameUses.set(c.name, uses)
    const name = uses === 1 ? c.name : `${c.name} (${uses})`
    onCandidate({ ...c, name, id: `${c.source}-${count++}` })
  }

  const scan = async (
    url: string,
    source: DatasetSource,
    note?: string
  ): Promise<{ doc: Document; url: string } | null> => {
    if (seenSources.has(url)) return null
    seenSources.add(url)

    const fetched = await fetchSource(url, signal)
    if (!fetched) return null

    if (fetched.data !== undefined) {
      const parsed = parseDataFile(fetched.data, fetched.url)
      if (parsed) report({ name: nameFromUrl(fetched.url), ...parsed, source, url: fetched.url, note })
      return null
    }
    if (fetched.html === undefined) return null

    const doc = new DOMParser().parseFromString(fetched.html, 'text/html')
    for (const table of tablesFrom(doc, fetched.url)) {
      report({ ...table, source: source === 'link' ? 'table' : source, note })
    }
    await Promise.all(dataFilesFrom(doc, fetched.url).map((file) => scan(file, source, note)))
    return { doc, url: fetched.url }
  }

  const articleUrl = article.metadata?.url
  const fromSite = async () => {
    if (!articleUrl) {
      notes.push('This article has no web address, so only web search could be used.')
      return
    }
    const page = await scan(articleUrl, 'link')
    if (!page) {
      notes.push('The article’s site could not be read.')
      return
    }
    const cited = citedPagesFrom(page.doc, page.url, seenSources)
    await Promise.all(cited.map((url) => scan(url, 'cited')))
  }

  const fromSearch = async () => {
    if (!canSearch) {
      notes.push('Web search was skipped because it needs an API key.')
      return
    }
    const res = await apiFetch('/api/data/search', {
      method: 'POST',
      body: JSON.stringify({ title: article.title, excerpt: article.content.slice(0, 3000) }),
      signal,
    }).catch((err) => {
      if (signal.aborted) throw err
      return null
    })
    const body = await res?.json().catch(() => null)
    if (!res?.ok || !Array.isArray(body?.results)) {
      notes.push(body?.error ? `Web search failed: ${body.error}` : 'Web search failed.')
      return
    }

    const results: { url: string; why?: string }[] = body.results
    const urls = results.flatMap((r) => {
      const url = typeof r.url === 'string' ? parseTargetUrl(r.url) : null
      return url ? [{ url, why: typeof r.why === 'string' ? r.why : undefined }] : []
    })
    await Promise.all(urls.slice(0, MAX_SEARCH_RESULTS).map((r) => scan(r.url, 'search', r.why)))
  }

  // Finish the site first: anything found there too should count as from the article.
  await fromSite()
  await fromSearch()
  return notes
}
