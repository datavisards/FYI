/**
 * CSV fetching utilities for OWID Grapher datasets and arbitrary CSV URLs.
 */

import { isExtension } from '@/lib/apiClient'

export interface CSVData {
  name: string
  headers: string[]
  rows: string[][]
}

/** Fetch text from a URL, routing through the background script in extension context to avoid CORS. */
async function fetchText(url: string): Promise<{ text: string; contentType: string }> {
  if (isExtension()) {
    const res = await chrome.runtime.sendMessage({ type: 'FETCH_URL', payload: { url } }) as
      | { text: string; contentType: string }
      | { error: string }
    if ('error' in res) {
      throw new Error(`Failed to fetch "${url}": ${res.error}`)
    }
    return res
  }
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch "${url}": ${res.status} ${res.statusText}`)
  }
  const text = await res.text()
  const contentType = res.headers.get('content-type') || ''
  return { text, contentType }
}

/** Parse a single CSV line, handling quoted fields with commas and escaped quotes. */
export function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}

/** Parse raw CSV text into headers + rows. */
export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const headers = parseCSVLine(lines[0])
  const rows = lines.slice(1).map(parseCSVLine)
  return { headers, rows }
}

/**
 * Fetch CSV data for an OWID Grapher chart by slug.
 * e.g. slug = "co2-emissions-per-capita" → fetches from ourworldindata.org/grapher/co2-emissions-per-capita
 */
export async function fetchOWIDData(slug: string): Promise<CSVData> {
  const url = `https://ourworldindata.org/grapher/${slug}.csv`
  const { text, contentType } = await fetchText(url)
  if (contentType.includes('text/html')) {
    throw new Error(`OWID returned HTML instead of CSV for "${slug}"`)
  }
  const { headers, rows } = parseCSV(text)
  const name = slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  return { name, headers, rows }
}

/**
 * Fetch and parse CSV from an arbitrary URL.
 */
export async function fetchCSVFromURL(url: string): Promise<CSVData> {
  const { text } = await fetchText(url)
  const { headers, rows } = parseCSV(text)
  const urlObj = new URL(url)
  const filename = urlObj.pathname.split('/').pop() || 'data'
  const name = filename.replace(/\.csv$/i, '').replace(/[-_]/g, ' ')
  return { name, headers, rows }
}
