'use client'

import type { BuilderFilter } from '@/lib/viz/specModel'
import type { FieldKind, InferredField } from '@/lib/viz/fieldInference'
import { cn } from '@/lib/utils'

export interface FieldStats {
  kind: FieldKind
  values: string[]
  min?: number
  max?: number
}

export interface FilterBuilderProps {
  filters: BuilderFilter[]
  inferredFields: InferredField[]
  fieldStats: Record<string, FieldStats>
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<BuilderFilter>) => void
  onRemove: (id: string) => void
  onClear: () => void
  onEdit: (id: string) => void
  className?: string
}

export function FilterBuilder({
  filters,
  inferredFields,
  fieldStats,
  onAdd,
  onUpdate,
  onRemove,
  onClear,
  onEdit,
  className,
}: FilterBuilderProps) {
  const hasFilters = filters.length > 0

  return (
    <div className={cn('rounded border bg-background col-span-4', className)}>
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b bg-muted/30">
        <span className="text-[11px] font-medium text-muted-foreground">Filters</span>
        <div className="flex items-center gap-1.5">
          {hasFilters && (
            <button
              type="button"
              onClick={onClear}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="px-2 py-1.5 min-h-10 flex flex-col gap-1.5">
        {!hasFilters ? (
          <p className="text-[11px] text-muted-foreground">
            Drop a field
          </p>
        ) : (
          filters.map((f) => {
            const stats = f.field ? fieldStats[f.field] : undefined
            const inferredKind =
              inferredFields.find((fld) => fld.name === f.field)?.kind ?? stats?.kind ?? 'nominal'

            const kind = inferredKind

            if (kind === 'quantitative') {
              const domainMin = stats?.min ?? 0
              const domainMax = stats?.max ?? domainMin
              const currentMin =
                typeof (f as any).min === 'number' ? (f as any).min : domainMin
              const currentMax =
                typeof (f as any).max === 'number' ? (f as any).max : domainMax

              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onEdit(f.id)}
                  className="w-full text-left rounded border bg-muted/10 p-2 space-y-1.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium truncate">
                      {f.field || 'Choose field'}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">Edit</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemove(f.id)
                      }}
                      className="h-5 w-5 inline-flex items-center justify-center rounded border text-[10px] text-muted-foreground hover:bg-muted/40"
                      title="Remove filter"
                    >
                      ×
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {f.field
                      ? `${currentMin.toLocaleString()} – ${currentMax.toLocaleString()}`
                      : 'Click to configure range.'}
                  </p>
                </button>
              )
            }

            const statsValues = stats?.values ?? []
            const includeValues: string[] =
              (f as any).include && (f as any).include.length > 0
                ? (f as any).include
                : statsValues

            const previewCount = includeValues.length
            const previewValues = includeValues.slice(0, 5)
            const previewLabel =
              previewCount === 0
                ? 'No values selected'
                : `${previewValues.join(', ')}${previewCount > previewValues.length ? ', …' : ''}`

            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onEdit(f.id)}
                className="w-full text-left rounded border bg-muted/10 p-2 space-y-1.5 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium truncate">
                    {f.field || 'Choose field'}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">Edit</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(f.id)
                    }}
                    className="h-5 w-5 inline-flex items-center justify-center rounded border text-[10px] text-muted-foreground hover:bg-muted/40"
                    title="Remove filter"
                  >
                    ×
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {previewCount > 0
                    ? `${previewCount} value${previewCount === 1 ? '' : 's'} selected: ${previewLabel}`
                    : 'Click to choose values.'}
                </p>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

