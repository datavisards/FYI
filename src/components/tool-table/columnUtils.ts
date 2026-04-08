// Runtime column analysis utilities for generic string[][] data

export interface ColumnMeta {
  name: string
  index: number
  type: 'string' | 'number'
}

const SAMPLE_SIZE = 100
const NUMERIC_THRESHOLD = 0.7

/**
 * Infer column types by sampling rows.
 * A column is 'number' if >70% of non-empty sampled values parse as numbers.
 */
export function inferColumnTypes(
  headers: string[],
  rows: string[][]
): ColumnMeta[] {
  const sample = rows.length <= SAMPLE_SIZE ? rows : rows.slice(0, SAMPLE_SIZE)

  return headers.map((name, index) => {
    let total = 0
    let numeric = 0

    for (const row of sample) {
      const val = row[index]
      if (val == null || val === '') continue
      total++
      const cleaned = val.replace(/,/g, '')
      if (!isNaN(parseFloat(cleaned)) && isFinite(Number(cleaned))) {
        numeric++
      }
    }

    const type: 'string' | 'number' =
      total > 0 && numeric / total >= NUMERIC_THRESHOLD ? 'number' : 'string'

    return { name, index, type }
  })
}

/**
 * Get unique string values for a column (for categorical filter dropdowns).
 * Returns sorted unique values, capped for performance.
 */
export function getUniqueValuesGeneric(
  rows: string[][],
  colIndex: number,
  maxValues = 300
): string[] {
  const values = new Set<string>()
  for (const row of rows) {
    const val = row[colIndex]
    if (val != null && val !== '') {
      values.add(val)
    }
    if (values.size >= maxValues) break
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b))
}

/**
 * Get min/max stats for a numeric column (for quantitative range sliders).
 */
export function getColumnStatsGeneric(
  rows: string[][],
  colIndex: number
): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity

  for (const row of rows) {
    const val = row[colIndex]
    if (val == null || val === '') continue
    const num = parseFloat(val.replace(/,/g, ''))
    if (isNaN(num)) continue
    if (num < min) min = num
    if (num > max) max = num
  }

  if (min === Infinity) return { min: 0, max: 0 }
  return { min, max }
}
