/**
 * CSV query tool — filter, sort, aggregate, and describe CSV datasets.
 * Operates on CSVData passed in at call time (not stored globally).
 */
import { registerTool, type ToolDefinition, type ToolContext } from './registry'

export interface CSVDataForTool {
  name: string
  headers: string[]
  rows: string[][]
}

// Global mutable ref — set before each tool-calling loop
let _csvData: CSVDataForTool[] = []

export function setCSVDataForTooling(data: CSVDataForTool[]) {
  _csvData = data
}

const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'query_csv',
    description:
      'Query loaded CSV datasets. Supports: describe (column info), head (first N rows), filter (by column value), sort (by column), aggregate (sum/avg/min/max/count by column), select_columns (pick specific columns). Returns results as formatted text.',
    parameters: {
      type: 'object',
      properties: {
        dataset: {
          type: 'string',
          description: 'Name of the dataset to query. Use "list" to see available datasets.',
        },
        operation: {
          type: 'string',
          description: 'Operation to perform',
          enum: ['list', 'describe', 'head', 'filter', 'sort', 'aggregate', 'select_columns'],
        },
        column: {
          type: 'string',
          description: 'Column name for filter/sort/aggregate operations',
        },
        value: {
          type: 'string',
          description: 'Value to filter by (for filter operation)',
        },
        direction: {
          type: 'string',
          description: 'Sort direction',
          enum: ['asc', 'desc'],
        },
        aggregation: {
          type: 'string',
          description: 'Aggregation function',
          enum: ['sum', 'avg', 'min', 'max', 'count', 'unique'],
        },
        columns: {
          type: 'array',
          description: 'Column names to select',
          items: { type: 'string' },
        },
        limit: {
          type: 'number',
          description: 'Number of rows to return (default: 10)',
        },
      },
      required: ['operation'],
    },
  },
}

function findDataset(name: string, datasets: CSVDataForTool[]): CSVDataForTool | undefined {
  if (datasets.length === 0) return undefined
  if (!name || name === 'list') return undefined
  // Fuzzy match: case-insensitive, partial match
  const lower = name.toLowerCase()
  return (
    datasets.find((d) => d.name.toLowerCase() === lower) ||
    datasets.find((d) => d.name.toLowerCase().includes(lower)) ||
    datasets[0] // fallback to first dataset
  )
}

function formatTable(headers: string[], rows: string[][], limit: number): string {
  const display = rows.slice(0, limit)
  const lines = [headers.join(' | '), headers.map(() => '---').join(' | ')]
  for (const row of display) {
    lines.push(row.map((v) => (v.length > 30 ? v.slice(0, 27) + '...' : v)).join(' | '))
  }
  if (rows.length > limit) {
    lines.push(`\n... and ${rows.length - limit} more rows (total: ${rows.length})`)
  }
  return lines.join('\n')
}

const MAX_ROW_INDICES = 200

function appendRowMetadata(result: string, datasetName: string, indices: number[]): string {
  if (indices.length === 0) return result
  const capped = indices.slice(0, MAX_ROW_INDICES)
  return result + `\n[CSV_ROWS:${datasetName}:${capped.join(',')}]`
}

async function execute(args: Record<string, unknown>, context?: ToolContext): Promise<string> {
  const csvData = (context?.csvData as CSVDataForTool[] | undefined) ?? _csvData
  const op = String(args.operation || 'list')
  const limit = Number(args.limit) || 10

  // List datasets
  if (op === 'list') {
    if (csvData.length === 0) return 'No CSV datasets are currently loaded.'
    return (
      'Available datasets:\n' +
      csvData
        .map((d) => `- "${d.name}" (${d.headers.length} columns, ${d.rows.length} rows)`)
        .join('\n')
    )
  }

  const ds = findDataset(String(args.dataset || ''), csvData)
  if (!ds) {
    return `Dataset not found. Available: ${csvData.map((d) => `"${d.name}"`).join(', ')}`
  }

  const colIndex = (col: string) => ds.headers.indexOf(col)

  switch (op) {
    case 'describe': {
      const info = ds.headers.map((h, i) => {
        const values = ds.rows.map((r) => r[i]).filter(Boolean)
        const numericCount = values.filter((v) => !isNaN(Number(v))).length
        const isNumeric = numericCount > values.length * 0.5
        return `- ${h}: ${isNumeric ? 'numeric' : 'text'} (${values.length} non-empty values)`
      })
      return `Dataset: "${ds.name}"\nRows: ${ds.rows.length}\nColumns:\n${info.join('\n')}`
    }

    case 'head': {
      const indices = Array.from({ length: Math.min(limit, ds.rows.length) }, (_, i) => i)
      const result = formatTable(ds.headers, ds.rows, limit)
      return appendRowMetadata(result, ds.name, indices)
    }

    case 'filter': {
      const col = String(args.column || '')
      const val = String(args.value || '')
      const ci = colIndex(col)
      if (ci < 0) return `Column "${col}" not found. Available: ${ds.headers.join(', ')}`

      const filteredIndices: number[] = []
      const filtered: string[][] = []
      ds.rows.forEach((r, idx) => {
        const cellVal = r[ci]?.toLowerCase() || ''
        const search = val.toLowerCase()
        if (cellVal === search || cellVal.includes(search)) {
          filteredIndices.push(idx)
          filtered.push(r)
        }
      })

      const result = `Filtered "${col}" by "${val}": ${filtered.length} rows\n\n${formatTable(ds.headers, filtered, limit)}`
      return appendRowMetadata(result, ds.name, filteredIndices.slice(0, limit))
    }

    case 'sort': {
      const col = String(args.column || '')
      const dir = String(args.direction || 'asc')
      const ci = colIndex(col)
      if (ci < 0) return `Column "${col}" not found. Available: ${ds.headers.join(', ')}`

      // Pair rows with original indices, sort, then extract
      const indexed = ds.rows.map((row, idx) => ({ row, idx }))
      indexed.sort((a, b) => {
        const av = a.row[ci] || ''
        const bv = b.row[ci] || ''
        const an = Number(av)
        const bn = Number(bv)
        if (!isNaN(an) && !isNaN(bn)) {
          return dir === 'asc' ? an - bn : bn - an
        }
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      })

      const sortedRows = indexed.map((i) => i.row)
      const sortedIndices = indexed.slice(0, limit).map((i) => i.idx)

      const result = `Sorted by "${col}" (${dir}):\n\n${formatTable(ds.headers, sortedRows, limit)}`
      return appendRowMetadata(result, ds.name, sortedIndices)
    }

    case 'aggregate': {
      const col = String(args.column || '')
      const agg = String(args.aggregation || 'count')
      const ci = colIndex(col)
      if (ci < 0) return `Column "${col}" not found. Available: ${ds.headers.join(', ')}`

      const values = ds.rows.map((r) => r[ci]).filter(Boolean)
      const nums = values.map(Number).filter((n) => !isNaN(n))

      switch (agg) {
        case 'count':
          return `Count of "${col}": ${values.length}`
        case 'unique':
          return `Unique values in "${col}": ${new Set(values).size}`
        case 'sum':
          return nums.length > 0
            ? `Sum of "${col}": ${nums.reduce((a, b) => a + b, 0).toLocaleString()}`
            : `"${col}" is not numeric`
        case 'avg':
          return nums.length > 0
            ? `Average of "${col}": ${(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)}`
            : `"${col}" is not numeric`
        case 'min':
          return nums.length > 0
            ? `Min of "${col}": ${Math.min(...nums)}`
            : `"${col}" is not numeric`
        case 'max':
          return nums.length > 0
            ? `Max of "${col}": ${Math.max(...nums)}`
            : `"${col}" is not numeric`
        default:
          return `Unknown aggregation: ${agg}`
      }
    }

    case 'select_columns': {
      const cols = (args.columns as string[]) || []
      if (cols.length === 0) return `No columns specified. Available: ${ds.headers.join(', ')}`

      const colIndices = cols.map((c) => colIndex(c)).filter((i) => i >= 0)
      if (colIndices.length === 0) return `None of the specified columns were found.`

      const selectedHeaders = colIndices.map((i) => ds.headers[i])
      const selectedRows = ds.rows.map((r) => colIndices.map((i) => r[i]))
      const rowIndices = Array.from({ length: Math.min(limit, ds.rows.length) }, (_, i) => i)
      const result = formatTable(selectedHeaders, selectedRows, limit)
      return appendRowMetadata(result, ds.name, rowIndices)
    }

    default:
      return `Unknown operation: ${op}. Supported: list, describe, head, filter, sort, aggregate, select_columns`
  }
}

export function registerCSVTool() {
  registerTool(definition, execute)
}
