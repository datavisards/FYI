export type FieldKind = 'quantitative' | 'nominal' | 'temporal'

export interface InferredField {
  name: string
  kind: FieldKind
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function parseValue(raw: string): { asNumber?: number; asDateMs?: number } {
  const s = raw.trim()
  if (!s) return {}

  const num = Number(s)
  if (Number.isFinite(num)) return { asNumber: num }

  const ms = Date.parse(s)
  if (!Number.isNaN(ms)) return { asDateMs: ms }

  return {}
}

/**
 * Heuristic field inference for CSV data.
 * - quantitative: any observed numeric value
 * - temporal: no numbers, but most non-empty values parse as a date
 * - nominal: otherwise
 */
export function inferFields(headers: string[], rows: string[][]): InferredField[] {
  const SAMPLE = Math.min(rows.length, 300)
  const sampled = rows.slice(0, SAMPLE)

  return headers.map((h, i) => {
    let numCount = 0
    let dateCount = 0
    let nonEmpty = 0

    for (const row of sampled) {
      const raw = row[i] ?? ''
      const s = raw.trim()
      if (!s) continue
      nonEmpty++
      const parsed = parseValue(s)
      if (parsed.asNumber !== undefined && isFiniteNumber(parsed.asNumber)) {
        numCount++
      } else if (parsed.asDateMs !== undefined && isFiniteNumber(parsed.asDateMs)) {
        dateCount++
      }
    }

    if (numCount > 0) return { name: h, kind: 'quantitative' as const }
    if (nonEmpty > 0 && dateCount / nonEmpty >= 0.75) return { name: h, kind: 'temporal' as const }
    return { name: h, kind: 'nominal' as const }
  })
}

