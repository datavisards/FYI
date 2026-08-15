'use client'

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import type { CSVData } from '@/lib/data/csvFetcher'
import { inferFields } from '@/lib/viz/fieldInference'
import type { DataRow, BuilderFilter } from '@/lib/viz/specModel'
import { toVegaLiteSpec } from '@/lib/viz/specModel'
import { useVizBuilderStore } from '@/stores/vizBuilderStore'
import { FieldList } from '@/components/tool-vis-builder/FieldList'
import { EncodingShelf } from '@/components/tool-vis-builder/EncodingShelf'
import { MarkAndOptions } from '@/components/tool-vis-builder/MarkAndOptions'
import { FilterBuilder } from '@/components/tool-vis-builder/FilterBuilder'
import { VegaChart } from '@/components/tool-ai-chat/VegaChart'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import type { FieldStats } from '@/components/tool-vis-builder/FilterBuilder'
import { eventLogger } from '@/lib/tracking/eventLogger'
import { useExplorationStore } from '@/stores/explorationStore'
import type { BuilderSpec } from '@/lib/viz/specModel'
import type { StudyEventPayload } from '@/types/events'

export interface VizBuilderProps {
  dataset: CSVData
  mode?: 'sandbox' | 'panel'
  onRequestDataset?: (datasetName: string) => void
}

function parseDataset(dataset: CSVData): DataRow[] {
  return dataset.rows.map((row) => {
    const obj: DataRow = {}
    dataset.headers.forEach((h, i) => {
      const raw = row[i] ?? ''
      const num = Number(raw)
      obj[h] = raw !== '' && !Number.isNaN(num) ? num : raw
    })
    return obj
  })
}

export function VizBuilder({ dataset, onRequestDataset }: VizBuilderProps) {
  const {
    tabs,
    activeTabId,
    addTabForDataset,
    closeTab,
    setActiveTab,
    getActive,
    syncActiveDataset,
    setDatasetName,
    setMark,
    setEncoding,
    addFilter,
    updateFilter,
    removeFilter,
    clearFilters,
    resetActive,
  } = useVizBuilderStore()
  const claimIdForLogs = useExplorationStore((s) => s.activeClaim?.id ?? 'no-claim')

  const active = getActive()
  const builder = active.builder

  const [filterDialogOpen, setFilterDialogOpen] = useState(false)
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null)
  const [expandedChartOpen, setExpandedChartOpen] = useState(false)

  // Resizable field list
  const [fieldListWidth, setFieldListWidth] = useState(160)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleFieldListDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true

    const onMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return
      const left = containerRef.current.getBoundingClientRect().left
      const newWidth = Math.min(260, Math.max(100, ev.clientX - left))
      setFieldListWidth(newWidth)
    }
    const onUp = () => {
      isDraggingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Keep active tab bound to its dataset.
  // If the active tab already has a vis and the dataset changes externally,
  // spawn a new tab for the new dataset rather than mutating the existing one.
  useEffect(() => {
    if (!builder.datasetName) {
      setDatasetName(dataset.name)
      return
    }
    if (builder.datasetName !== dataset.name) {
      syncActiveDataset(dataset.name)
    }
  }, [builder.datasetName, dataset.name, setDatasetName, syncActiveDataset])

  const data = useMemo(() => parseDataset(dataset), [dataset])
  const inferredFields = useMemo(
    () => inferFields(dataset.headers, dataset.rows),
    [dataset.headers, dataset.rows]
  )
  const fieldStats = useMemo(() => {
    const stats: Record<
      string,
      {
        kind: 'quantitative' | 'nominal' | 'temporal'
        values: Set<string>
        min?: number
        max?: number
      }
    > = {}

    for (const f of inferredFields) {
      stats[f.name] = { kind: f.kind, values: new Set<string>() }
    }

    const MAX_UNIQUE = 200
    for (const row of data) {
      for (const [field, value] of Object.entries(row)) {
        const s = stats[field]
        if (!s) continue
        if (value === '' || value == null) continue
        const asString = String(value)
        if (s.values.size < MAX_UNIQUE) {
          s.values.add(asString)
        }
        if (typeof value === 'number') {
          if (s.min === undefined || value < s.min) s.min = value
          if (s.max === undefined || value > s.max) s.max = value
        }
      }
    }

    const out: Record<string, { kind: typeof inferredFields[number]['kind']; values: string[]; min?: number; max?: number }> =
      {}
    for (const [field, s] of Object.entries(stats)) {
      out[field] = {
        kind: s.kind,
        values: Array.from(s.values).sort(),
        min: s.min,
        max: s.max,
      }
    }
    return out
  }, [data, inferredFields])
  const spec = useMemo(() => {
    return toVegaLiteSpec({ builder, data, inferredFields })
  }, [builder, data, inferredFields])

  const createdOnceRef = useState(() => ({ didInit: false }))[0]
  const prevTabsRef = useState(() => ({ tabsById: new Map<string, { datasetName: string | null }>(), activeTabId: '' }))[0]
  const prevActiveBuilderRef = useState(() => ({ tabId: '', builder: null as BuilderSpec | null }))[0]

  const logVisEvent = (payload: StudyEventPayload) => {
    eventLogger.log(payload)
  }

  /** Return a copy of the Vega-Lite spec without inline data/datasets. */
  const stripData = (s: object | null | undefined): object => {
    if (!s) return {}
    const { data, datasets, ...rest } = s as Record<string, unknown>
    return rest
  }

  // Log chart lifecycle + selection (created/deleted/selected).
  useEffect(() => {
    const prevMap = prevTabsRef.tabsById
    const nextMap = new Map<string, { datasetName: string | null }>()
    for (const t of tabs) {
      nextMap.set(t.id, { datasetName: t.builder.datasetName ?? null })
    }

    const prevIds = new Set(prevMap.keys())
    const nextIds = new Set(nextMap.keys())

    // Skip logging on first run to avoid noisy "created" from persisted state hydration.
    if (!createdOnceRef.didInit) {
      createdOnceRef.didInit = true
      prevTabsRef.tabsById = nextMap
      prevTabsRef.activeTabId = activeTabId
      return
    }

    // Created
    for (const id of nextIds) {
      if (prevIds.has(id)) continue
      const dsName = nextMap.get(id)?.datasetName ?? dataset.name
      logVisEvent({
        type: 'vis_chart_created',
        claimId: claimIdForLogs,
        chartId: id,
        datasetName: dsName,
        source: 'uploaded',
        spec: stripData(spec),
      })
    }

    // Deleted
    for (const id of prevIds) {
      if (nextIds.has(id)) continue
      logVisEvent({
        type: 'vis_chart_deleted',
        claimId: claimIdForLogs,
        chartId: id,
      })
    }

    // Selected
    if (prevTabsRef.activeTabId && prevTabsRef.activeTabId !== activeTabId) {
      logVisEvent({
        type: 'vis_chart_selected',
        claimId: claimIdForLogs,
        chartId: activeTabId,
      })
    }

    prevTabsRef.tabsById = nextMap
    prevTabsRef.activeTabId = activeTabId
  }, [tabs, activeTabId, claimIdForLogs, dataset.name, createdOnceRef, prevTabsRef])

  // Log spec changes (mark/encoding/filter/other) for the active chart.
  useEffect(() => {
    const prev = prevActiveBuilderRef.builder
    const prevTabId = prevActiveBuilderRef.tabId
    const next = builder

    // Reset baseline when switching charts.
    if (prevTabId !== activeTabId) {
      prevActiveBuilderRef.tabId = activeTabId
      prevActiveBuilderRef.builder = next
      return
    }

    if (!prev) {
      prevActiveBuilderRef.builder = next
      return
    }

    const prevMark = prev.mark
    const nextMark = next.mark
    const prevEnc = prev.encodings ?? {}
    const nextEnc = next.encodings ?? {}
    const prevFilters = prev.filters ?? []
    const nextFilters = next.filters ?? []

    const changed =
      prevMark !== nextMark ||
      JSON.stringify(prevEnc) !== JSON.stringify(nextEnc) ||
      JSON.stringify(prevFilters) !== JSON.stringify(nextFilters) ||
      (prev.datasetName ?? null) !== (next.datasetName ?? null)

    if (!changed) return

    const change: 'mark' | 'encoding' | 'filter' | 'other' =
      prevMark !== nextMark
        ? 'mark'
        : JSON.stringify(prevEnc) !== JSON.stringify(nextEnc)
          ? 'encoding'
          : JSON.stringify(prevFilters) !== JSON.stringify(nextFilters)
            ? 'filter'
            : 'other'

    logVisEvent({
      type: 'vis_spec_changed',
      claimId: claimIdForLogs,
      chartId: activeTabId,
      change,
      spec: stripData(spec),
    })

    prevActiveBuilderRef.builder = next
  }, [activeTabId, builder, claimIdForLogs, spec, prevActiveBuilderRef])

  const activeFilter: BuilderFilter | null =
    (builder.filters ?? []).find((f) => f.id === editingFilterId) ?? null

  const handleOpenFilterForId = (id: string) => {
    setEditingFilterId(id)
    setFilterDialogOpen(true)
  }

  const handleAddFilterAndEdit = (fieldName?: string) => {
    const before = builder.filters ?? []
    addFilter()
    const after = getActive().builder.filters ?? []
    const newlyAdded = after.find((f) => !before.some((b) => b.id === f.id))
    if (!newlyAdded) return
    if (fieldName) {
      updateFilter(newlyAdded.id, { field: fieldName })
    }
    setEditingFilterId(newlyAdded.id)
    setFilterDialogOpen(true)
  }

  return (
    <div ref={containerRef} className="h-full w-full flex min-h-0">
      <aside className="shrink-0 bg-background min-h-0" style={{ width: fieldListWidth }}>
        <FieldList fields={inferredFields} />
      </aside>
      <div
        className="shrink-0 w-1 cursor-col-resize bg-border/50 hover:bg-primary/40 transition-colors"
        onMouseDown={handleFieldListDragStart}
      />

      <section className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="border-b bg-background">
          <div className="flex items-center justify-between gap-1.5 px-1.5 py-0.5">
            <div className="flex items-center gap-1 overflow-x-auto">
              {tabs.map((t) => {
                const isActive = t.id === activeTabId
                return (
                  <div
                    key={t.id}
                    className={cn(
                      'group flex items-center gap-0.5 rounded border px-1.5 h-6 shrink-0',
                      isActive ? 'bg-foreground text-background border-foreground' : 'bg-background hover:bg-muted/40'
                    )}
                    role="tab"
                    aria-selected={isActive}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const tabDataset = t.builder.datasetName
                        if (tabDataset && tabDataset !== dataset.name) {
                          onRequestDataset?.(tabDataset)
                        }
                        setActiveTab(t.id)
                      }}
                      className={cn('text-[11px] truncate max-w-[140px]', isActive ? 'text-background' : 'text-foreground')}
                      title={t.title}
                    >
                      {t.title}
                    </button>
                    {tabs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => closeTab(t.id)}
                        className={cn(
                          'text-[10px] opacity-70 hover:opacity-100',
                          isActive ? 'text-background' : 'text-muted-foreground'
                        )}
                        title="Close"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )
              })}
              <button
                type="button"
                onClick={() => {
                  // New tabs default to current dataset so they render immediately.
                  addTabForDataset(dataset.name)
                }}
                className="h-6 px-1.5 rounded border text-[11px] bg-background hover:bg-muted/40 shrink-0"
                title="New visualization"
              >
                + New
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[130px_minmax(0,1fr)] gap-2 p-2 bg-muted/20">
          {/* Left column: mark, filters, and non-axis encodings stacked */}
          <div className="min-h-0 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => resetActive()}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                title="Reset mark + shelves for this visualization"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  const xVal = builder.encodings.x ?? null
                  const yVal = builder.encodings.y ?? null
                  setEncoding('x', yVal)
                  setEncoding('y', xVal)
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                title="Swap X and Y encodings"
              >
                Swap X/Y
              </button>
            </div>

            <MarkAndOptions mark={builder.mark} onMarkChange={setMark} />

            <div
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onDrop={(e) => {
                e.preventDefault()
                const fieldName = e.dataTransfer.getData('text/plain')
                if (!fieldName) return
                handleAddFilterAndEdit(fieldName)
              }}
            >
              <FilterBuilder
                className="w-full"
                filters={builder.filters ?? []}
                inferredFields={inferredFields}
                fieldStats={fieldStats as Record<string, FieldStats>}
                onRemove={removeFilter}
                onClear={clearFilters}
                onEdit={handleOpenFilterForId}
              />
            </div>

            <div className="flex-1 min-h-0 flex flex-col gap-2">
              <EncodingShelf
                channel="color"
                label="Color"
                inferredFields={inferredFields}
                value={builder.encodings.color}
                onChange={(next) => setEncoding('color', next)}
              />
              <EncodingShelf
                channel="size"
                label="Size"
                inferredFields={inferredFields}
                value={builder.encodings.size}
                onChange={(next) => setEncoding('size', next)}
              />
              <EncodingShelf
                channel="shape"
                label="Shape"
                inferredFields={inferredFields}
                value={builder.encodings.shape}
                onChange={(next) => setEncoding('shape', next)}
              />
              <EncodingShelf
                channel="text"
                label="Text"
                inferredFields={inferredFields}
                value={builder.encodings.text}
                onChange={(next) => setEncoding('text', next)}
              />
            </div>
          </div>

          {/* Right column: X/Y shelves above preview */}
          <div className="flex min-h-0 flex-col gap-2">
            <div className="shrink-0 grid grid-cols-1 gap-2">
              <EncodingShelf
                channel="x"
                label="X"
                inferredFields={inferredFields}
                value={builder.encodings.x}
                onChange={(next) => setEncoding('x', next)}
              />
              <EncodingShelf
                channel="y"
                label="Y"
                inferredFields={inferredFields}
                value={builder.encodings.y}
                onChange={(next) => setEncoding('y', next)}
              />
            </div>

            <div className="flex-1 min-h-0">
              {spec ? (
                <VegaChart
                  spec={spec as Record<string, unknown>}
                  className="h-full min-h-[180px]"
                  expandable
                  onExpand={() => setExpandedChartOpen(true)}
                />
              ) : (
                <div className="rounded border bg-muted/20 p-4 lg:p-6 text-center text-sm text-muted-foreground">
                  Drag a field onto X or Y to start.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <FilterConfigDialog
        open={filterDialogOpen}
        onOpenChange={(open) => {
          setFilterDialogOpen(open)
          if (!open) {
            setEditingFilterId(null)
          }
        }}
        filter={activeFilter}
        inferredFields={inferredFields}
        fieldStats={fieldStats as Record<string, FieldStats>}
        onSubmit={(id, patch) => updateFilter(id, patch)}
      />

      {/* Expanded chart dialog */}
      <Dialog open={expandedChartOpen} onOpenChange={setExpandedChartOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-[90vw] max-h-[90vh] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
            <DialogTitle className="text-sm font-semibold">
              {active.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-4 pb-4">
            {spec && expandedChartOpen && (
              <VegaChart
                spec={spec as Record<string, unknown>}
                className="h-full w-full"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface FilterConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filter: BuilderFilter | null
  inferredFields: ReturnType<typeof inferFields>
  fieldStats: Record<string, FieldStats>
  onSubmit: (id: string, patch: Partial<BuilderFilter>) => void
}

function FilterConfigDialog({
  open,
  onOpenChange,
  filter,
  inferredFields,
  fieldStats,
  onSubmit,
}: FilterConfigDialogProps) {
  const [fieldName, setFieldName] = useState<string>('')
  const [kind, setKind] = useState<'nominal' | 'quantitative'>('nominal')
  const [range, setRange] = useState<[number, number] | null>(null)
  const [selectedValues, setSelectedValues] = useState<string[]>([])

  useEffect(() => {
    if (!open || !filter) return
    const initialField = filter.field || inferredFields[0]?.name || ''
    setFieldName(initialField)

    const initialStats = initialField ? fieldStats[initialField] : undefined
    const inferredKind = initialStats?.kind ?? 'nominal'
    const nextKind = inferredKind
    setKind(nextKind === 'quantitative' ? 'quantitative' : 'nominal')

    if (nextKind === 'quantitative') {
      const s = initialField ? fieldStats[initialField] : undefined
      const domainMin = s?.min ?? 0
      const domainMax = s?.max ?? domainMin
      const currentMin =
        typeof (filter as any).min === 'number' ? (filter as any).min : domainMin
      const currentMax =
        typeof (filter as any).max === 'number' ? (filter as any).max : domainMax
      setRange([currentMin, currentMax])
      setSelectedValues([])
    } else {
      const s = initialField ? fieldStats[initialField] : undefined
      const values = s?.values ?? []
      const include =
        (filter as any).include && (filter as any).include.length > 0
          ? (filter as any).include
          : values
      setSelectedValues(include)
      setRange(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter])

  useEffect(() => {
    if (!open) return
    if (!fieldName) return
    const s = fieldStats[fieldName]
    if (!s) return
    const inferredKind = s.kind
    const nextKind = inferredKind === 'quantitative' ? 'quantitative' : 'nominal'
    setKind(nextKind)
    if (nextKind === 'quantitative') {
      const domainMin = s.min ?? 0
      const domainMax = s.max ?? domainMin
      setRange((prev) => prev ?? [domainMin, domainMax])
      setSelectedValues([])
    } else {
      const values = s.values ?? []
      setSelectedValues((prev) => (prev.length > 0 ? prev : values))
      setRange(null)
    }
  }, [fieldName, open, fieldStats])

  if (!filter) return null

  const s = fieldName ? fieldStats[fieldName] : undefined
  const values = s?.values ?? []
  const domainMin = s?.min ?? 0
  const domainMax = s?.max ?? domainMin

  const handleToggleValue = (v: string) => {
    setSelectedValues((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    )
  }

  const handleSelectAll = () => setSelectedValues(values)
  const handleClearAll = () => setSelectedValues([])

  const handleSubmit = () => {
    if (!fieldName) {
      onOpenChange(false)
      return
    }
    if (kind === 'quantitative') {
      const [min, max] = range ?? [domainMin, domainMax]
      onSubmit(filter.id, {
        field: fieldName,
        kind: 'quantitative' as any,
        min,
        max,
      })
    } else {
      onSubmit(filter.id, {
        field: fieldName,
        kind: 'nominal' as any,
        include: selectedValues as any,
      })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[90vw] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Configure filter
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-1 overflow-y-auto pr-1">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Field
            </label>
            <select
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              className="h-8 w-full rounded border bg-background px-2 text-xs"
            >
              <option value="">Choose field…</option>
              {inferredFields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {fieldName && kind === 'quantitative' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Range</span>
                <span>
                  domain {domainMin.toLocaleString()} – {domainMax.toLocaleString()}
                </span>
              </div>
              <Slider
                min={domainMin}
                max={domainMax}
                step={
                  domainMax - domainMin > 1000
                    ? Math.ceil((domainMax - domainMin) / 200)
                    : 1
                }
                value={
                  range ?? [
                    typeof (filter as any).min === 'number'
                      ? (filter as any).min
                      : domainMin,
                    typeof (filter as any).max === 'number'
                      ? (filter as any).max
                      : domainMax,
                  ]
                }
                onValueChange={(v) => {
                  const [minVal, maxVal] = v as number[]
                  setRange([minVal, maxVal])
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <input
                  type="number"
                  className="h-7 w-24 rounded border bg-background px-2 text-[11px]"
                  value={range ? range[0] : domainMin}
                  onChange={(e) => {
                    const nextMin = Number(e.target.value)
                    setRange((prev) => [nextMin, prev ? prev[1] : domainMax])
                  }}
                />
                <span className="text-[11px] text-muted-foreground">to</span>
                <input
                  type="number"
                  className="h-7 w-24 rounded border bg-background px-2 text-[11px]"
                  value={range ? range[1] : domainMax}
                  onChange={(e) => {
                    const nextMax = Number(e.target.value)
                    setRange((prev) => [prev ? prev[0] : domainMin, nextMax])
                  }}
                />
              </div>
            </div>
          )}

          {fieldName && kind === 'nominal' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Values</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="h-6 px-1.5 rounded border text-[10px] text-muted-foreground hover:bg-muted/40"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="h-6 px-1.5 rounded border text-[10px] text-muted-foreground hover:bg-muted/40"
                  >
                    Clear
                  </button>
                </div>
              </div>
              {values.length > 0 ? (
                <ScrollArea className="max-h-48 border rounded w-full overflow-x-hidden">
                  <div className="p-1 space-y-0.5 w-full wrap-break-word">
                    {values.map((v) => (
                      <label
                        key={v}
                        className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] hover:bg-muted/60 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedValues.includes(v)}
                          onCheckedChange={() => handleToggleValue(v)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="wrap-break-word">{v}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  No values available for this field.
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSubmit} disabled={!fieldName}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


