'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import { useExplorationStore } from '@/stores/explorationStore'
import { useDataStore } from '@/stores/dataStore'
import type { CSVData } from '@/lib/data/csvFetcher'
import { eventLogger } from '@/lib/tracking/eventLogger'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ColumnFilterCategorical, ColumnFilterQuantitative } from './ColumnFilterPopovers'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CSVUploadButton } from './CSVUploadButton'
import { Filter, ChevronUp, ChevronDown, ChevronsUpDown, X, Table2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 100
const MAX_CATEGORICAL_OPTIONS = 300

type ColumnFilter =
  | { type: 'categorical'; selected: string[] }
  | { type: 'quantitative'; range: [number, number] | null }

/* ─── Source rows highlight banner ─── */
function SourceRowsBanner({ count, onShowAll }: { count: number; onShowAll: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 shrink-0">
      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
        Showing {count} source row{count !== 1 ? 's' : ''}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
        onClick={onShowAll}
      >
        Show all
      </Button>
    </div>
  )
}

/* ─── Generic CSV table ─── */
function CSVDataTable({ data, highlightedRowIndices, onClearHighlight }: { data: CSVData; highlightedRowIndices?: number[] | null; onClearHighlight?: () => void }) {
  const activeClaim = useExplorationStore((s) => s.activeClaim)
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({})
  const [sort, setSort] = useState<{ column: string | null; dir: 'asc' | 'desc' }>({
    column: null, dir: 'asc',
  })
  const [page, setPage] = useState(0)
  const [filterPopoverOpen, setFilterPopoverOpen] = useState<string | null>(null)

  const parsedRows = useMemo(() => {
    return data.rows.map((row, originalIndex) => {
      const obj: Record<string, string | number> & { __originalIndex: number } = { __originalIndex: originalIndex }
      data.headers.forEach((h, i) => {
        const raw = row[i] ?? ''
        const num = Number(raw)
        obj[h] = raw !== '' && !isNaN(num) ? num : raw
      })
      return obj
    })
  }, [data])

  const columns = useMemo(() => {
    return data.headers.map((h) => {
      const isNumeric = parsedRows.some((r) => typeof r[h] === 'number')
      return { name: h, type: isNumeric ? 'number' : 'string' }
    })
  }, [data.headers, parsedRows])

  const filteredAndSorted = useMemo(() => {
    let rows = parsedRows

    if (highlightedRowIndices && highlightedRowIndices.length > 0) {
      const highlightSet = new Set(highlightedRowIndices)
      rows = rows.filter((row) => highlightSet.has(row.__originalIndex))
    }

    Object.entries(columnFilters).forEach(([col, filter]) => {
      if (!filter) return
      if (filter.type === 'categorical' && filter.selected.length > 0) {
        const set = new Set(filter.selected)
        rows = rows.filter((row) => row[col] != null && set.has(String(row[col])))
      }
      if (filter.type === 'quantitative' && filter.range != null) {
        const [min, max] = filter.range
        rows = rows.filter((row) => {
          const v = row[col]
          return typeof v === 'number' && v >= min && v <= max
        })
      }
    })

    if (sort.column) {
      const col = sort.column
      const dir = sort.dir
      rows = [...rows].sort((a, b) => {
        const aVal = a[col]
        const bVal = b[col]
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return dir === 'asc' ? 1 : -1
        if (bVal == null) return dir === 'asc' ? -1 : 1
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return dir === 'asc' ? aVal - bVal : bVal - aVal
        }
        const cmp = String(aVal).localeCompare(String(bVal))
        return dir === 'asc' ? cmp : -cmp
      })
    }
    return rows
  }, [parsedRows, columnFilters, sort, highlightedRowIndices])

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE))
  const pageRows = useMemo(
    () => filteredAndSorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredAndSorted, page]
  )

  const setCategoricalFilter = useCallback((col: string, selected: string[]) => {
    setColumnFilters((prev) => ({ ...prev, [col]: { type: 'categorical', selected } }))
    setPage(0)
    eventLogger.log({
      type: 'table_filtered',
      claimId: activeClaim?.id ?? '',
      column: col,
      value: `categorical: ${selected.join(', ')}`,
    })
  }, [activeClaim])

  const setQuantitativeFilter = useCallback((col: string, range: [number, number] | null) => {
    setColumnFilters((prev) => ({ ...prev, [col]: { type: 'quantitative', range } }))
    setPage(0)
    eventLogger.log({
      type: 'table_filtered',
      claimId: activeClaim?.id ?? '',
      column: col,
      value: range ? `${range[0]}–${range[1]}` : 'cleared',
    })
  }, [activeClaim])

  const clearFilter = useCallback((col: string) => {
    const filter = columnFilters[col]
    if (!filter) return
    if (filter.type === 'categorical') setCategoricalFilter(col, [])
    else setQuantitativeFilter(col, null)
  }, [columnFilters, setCategoricalFilter, setQuantitativeFilter])

  const activeFilters = useMemo(
    () =>
      Object.entries(columnFilters).filter(
        ([, f]) =>
          f &&
          ((f.type === 'categorical' && f.selected.length > 0) ||
            (f.type === 'quantitative' && f.range != null))
      ),
    [columnFilters]
  )

  const toggleSort = useCallback((col: string) => {
    setSort((prev) => {
      const newDir = prev.column === col ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'asc'
      // Defer tracking to avoid setState-during-render
      queueMicrotask(() => eventLogger.log({
        type: 'table_sorted',
        claimId: activeClaim?.id ?? '',
        column: col,
        direction: newDir,
      }))
      return { column: col, dir: newDir }
    })
    setPage(0)
  }, [activeClaim])

  const getUniqueCSVValues = useCallback(
    (col: string) => {
      const vals = new Set<string>()
      for (const row of parsedRows) {
        if (row[col] != null) vals.add(String(row[col]))
      }
      return Array.from(vals).sort()
    },
    [parsedRows]
  )

  const getCSVColumnStats = useCallback(
    (col: string) => {
      let min = Infinity
      let max = -Infinity
      for (const row of parsedRows) {
        const v = row[col]
        if (typeof v === 'number') {
          if (v < min) min = v
          if (v > max) max = v
        }
      }
      return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 100 : max }
    },
    [parsedRows]
  )

  const isHighlighting = highlightedRowIndices && highlightedRowIndices.length > 0

  return (
    <>
      {isHighlighting && onClearHighlight && (
        <SourceRowsBanner count={highlightedRowIndices.length} onShowAll={onClearHighlight} />
      )}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full caption-bottom text-xs">
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-background [&_tr]:border-b">
            <TableRow>
              {columns.map((col) => {
                const isString = col.type === 'string'
                const filter = columnFilters[col.name]
                const hasFilter =
                  (filter?.type === 'categorical' && (filter.selected?.length ?? 0) > 0) ||
                  (filter?.type === 'quantitative' && filter.range != null)
                const isSorted = sort.column === col.name

                return (
                  <TableHead key={col.name} className="border last:border-r-0 py-1 px-2">
                    <div className="flex items-center gap-0.5">
                      <span className="font-medium">{col.name}</span>
                      <button
                        type="button"
                        className="rounded p-0.5 min-w-[18px] min-h-[18px] flex items-center justify-center hover:bg-muted hover:text-foreground text-muted-foreground cursor-pointer"
                        onClick={() => toggleSort(col.name)}
                        aria-label={`Sort by ${col.name}`}
                      >
                        {isSorted ? (
                          sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3" />
                        )}
                      </button>
                      <Popover
                        open={filterPopoverOpen === col.name}
                        onOpenChange={(open) => setFilterPopoverOpen(open ? col.name : null)}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn('h-5 w-5 p-0 min-w-0', hasFilter && 'text-primary')}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Filter className="h-3 w-3" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-0" align="start" onClick={(e) => e.stopPropagation()}>
                          {isString ? (
                            <ColumnFilterCategorical
                              label={col.name}
                              options={getUniqueCSVValues(col.name).slice(0, MAX_CATEGORICAL_OPTIONS)}
                              selected={(filter?.type === 'categorical' ? filter.selected : []) ?? []}
                              onSelectedChange={(sel) => setCategoricalFilter(col.name, sel)}
                              onClose={() => setFilterPopoverOpen(null)}
                            />
                          ) : (
                            (() => {
                              const stats = getCSVColumnStats(col.name)
                              const currentRange =
                                filter?.type === 'quantitative' && filter.range != null
                                  ? filter.range
                                  : ([stats.min, stats.max] as [number, number])
                              return (
                                <ColumnFilterQuantitative
                                  label={col.name}
                                  min={stats.min}
                                  max={stats.max}
                                  value={currentRange}
                                  onValueChange={(r) => setQuantitativeFilter(col.name, r)}
                                  onClose={() => setFilterPopoverOpen(null)}
                                />
                              )
                            })()
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row, idx) => (
              <TableRow
                key={idx}
                onClick={() => {
                  eventLogger.log({
                    type: 'table_row_expanded',
                    claimId: activeClaim?.id ?? '',
                    rowIndex: row.__originalIndex,
                  })
                }}
                className="cursor-pointer"
              >
                {columns.map((col) => {
                  const v = row[col.name]
                  const display =
                    v == null
                      ? '\u2014'
                      : typeof v === 'number'
                        ? v > 1000
                          ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
                          : v % 1 === 0
                            ? String(v)
                            : v.toFixed(2)
                        : String(v)
                  return (
                    <TableCell key={col.name} className="whitespace-nowrap border last:border-r-0 py-1.5 px-2">
                      {display}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 px-2 py-1 border-t bg-muted/30 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {activeFilters.length > 0 && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
              <Filter className="h-3 w-3" />
              Filters:
            </span>
          )}
          {activeFilters.map(([col, filter]) => {
            const label =
              filter.type === 'categorical'
                ? filter.selected.length <= 2
                  ? `${col}: ${filter.selected.join(', ')}`
                  : `${col}: ${filter.selected.length} selected`
                : filter.range != null
                  ? `${col}: ${filter.range[0]}\u2013${filter.range[1]}`
                  : ''
            return (
              <Badge key={col} variant="secondary" className="text-xs gap-1 pr-1 py-0">
                {label}
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-muted-foreground/20"
                  onClick={() => clearFilter(col)}
                  aria-label={`Clear ${col} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              {filteredAndSorted.length.toLocaleString()} rows
              {filteredAndSorted.length !== parsedRows.length &&
                ` (filtered from ${parsedRows.length.toLocaleString()})`}
            </span>
            <span>&bull;</span>
            <span>Page {page + 1} of {totalPages}</span>
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Prev
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ─── Main ToolTable ─── */
export function ToolTable() {
  const pageTableData = useDataStore((s) => s.pageTableData)
  const highlightedRows = useDataStore((s) => s.highlightedRows)
  const setHighlightedRows = useDataStore((s) => s.setHighlightedRows)
  const removeCSVDataset = useDataStore((s) => s.removeCSVDataset)
  const activeClaim = useExplorationStore((s) => s.activeClaim)

  const [activeTab, setActiveTab] = useState<string | undefined>(undefined)
  const [csvToDelete, setCsvToDelete] = useState<string | null>(null)

  const uploadedDatasets = pageTableData ?? []

  // Auto-switch to correct tab when highlighted rows change
  useEffect(() => {
    if (!highlightedRows) return
    const csvIdx = uploadedDatasets.findIndex((d) => d.name === highlightedRows.dataset)
    if (csvIdx >= 0) setActiveTab(`csv-${csvIdx}`)
  }, [highlightedRows, uploadedDatasets])

  if (uploadedDatasets.length === 0) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
          <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Table Explorer</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <Table2 className="h-8 w-8 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">No data uploaded</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Upload a CSV file to explore data in this table.</p>
          </div>
          <CSVUploadButton compact />
        </div>
      </div>
    )
  }

  const activeIdx = activeTab ? parseInt(activeTab.replace('csv-', ''), 10) : 0
  const activeDatasetName = uploadedDatasets[activeIdx]?.name ?? uploadedDatasets[0]?.name ?? ''

  const handleDatasetChange = (name: string) => {
    const idx = uploadedDatasets.findIndex((d) => d.name === name)
    if (idx < 0) return
    setActiveTab(`csv-${idx}`)
    eventLogger.log({
      type: 'table_dataset_switched',
      claimId: activeClaim?.id ?? '',
      datasetName: name,
      source: 'uploaded',
    })
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
        <Table2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground shrink-0">Table Explorer</span>
        {uploadedDatasets.length === 1 ? (
          <span className="text-xs text-muted-foreground truncate max-w-[160px]">{activeDatasetName}</span>
        ) : (
          <Select value={activeDatasetName} onValueChange={handleDatasetChange}>
            <SelectTrigger className="h-6 text-xs min-w-0 max-w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {uploadedDatasets.map((ds) => (
                <SelectItem key={ds.name} value={ds.name} className="text-xs">
                  {ds.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex-1" />
        <CSVUploadButton compact />
      </div>

      {uploadedDatasets.map((ds, i) => {
        if (`csv-${i}` !== (activeTab ?? 'csv-0')) return null
        const csvHighlight = highlightedRows?.dataset === ds.name ? highlightedRows.rows : null
        return (
          <div key={`csv-${i}`} className="flex-1 min-h-0 flex flex-col">
            <CSVDataTable
              data={ds}
              highlightedRowIndices={csvHighlight}
              onClearHighlight={() => setHighlightedRows(null)}
            />
          </div>
        )
      })}

      <AlertDialog open={csvToDelete !== null} onOpenChange={(open) => !open && setCsvToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete dataset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{csvToDelete}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (csvToDelete) removeCSVDataset(csvToDelete)
                setCsvToDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
