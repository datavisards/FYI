'use client'

import type { BuilderChannel, FieldEncoding } from '@/lib/viz/specModel'
import type { InferredField } from '@/lib/viz/fieldInference'
import { cn } from '@/lib/utils'

export interface EncodingShelfProps {
  channel: BuilderChannel
  label: string
  inferredFields: InferredField[]
  value: FieldEncoding | undefined
  onChange: (next: FieldEncoding | null) => void
  className?: string
}

function channelHint(channel: BuilderChannel) {
  switch (channel) {
    case 'x':
    case 'y':
      return 'Drop a field'
    case 'color':
      return 'Color by'
    case 'size':
      return 'Size by'
    case 'shape':
      return 'Shape by'
    case 'detail':
      return 'Group by'
    case 'text':
      return 'Label by'
  }
}

const AGG_OPTS: Array<{ id: NonNullable<FieldEncoding['aggregate']>; label: string }> = [
  { id: 'count', label: 'count' },
  { id: 'sum', label: 'sum' },
  { id: 'mean', label: 'mean' },
  { id: 'median', label: 'median' },
  { id: 'min', label: 'min' },
  { id: 'max', label: 'max' },
]

const TIMEUNIT_OPTS: Array<{ id: NonNullable<FieldEncoding['timeUnit']>; label: string }> = [
  { id: 'year', label: 'year' },
  { id: 'yearmonth', label: 'year-month' },
  { id: 'month', label: 'month' },
  { id: 'date', label: 'date' },
  { id: 'day', label: 'day' },
]

export function EncodingShelf({
  channel,
  label,
  inferredFields,
  value,
  onChange,
  className,
}: EncodingShelfProps) {
  const inferredMap = new Map(inferredFields.map((f) => [f.name, f.kind]))

  const applyField = (fieldName: string) => {
    const kind = inferredMap.get(fieldName) ?? 'nominal'
    onChange({ field: fieldName, kind })
  }

  const isAxis = channel === 'x' || channel === 'y'
  const showAggregate = value?.kind === 'quantitative'
  const showBin = isAxis && value?.kind === 'quantitative'
  const showTimeUnit = isAxis && value?.kind === 'temporal'

  if (isAxis) {
    return (
      <div className={cn('rounded border bg-background', className)}>
        <div
          className={cn(
            'px-2 py-1.5 min-h-10 flex items-center gap-2',
            !value && 'text-muted-foreground'
          )}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => {
            e.preventDefault()
            const fieldName = e.dataTransfer.getData('text/plain')
            if (!fieldName) return
            applyField(fieldName)
          }}
        >
          <span className="text-[11px] font-medium text-muted-foreground shrink-0">{label}</span>

          {!value ? (
            <span className="text-[11px] text-muted-foreground/80 truncate flex-1">
              {channelHint(channel)}
            </span>
          ) : (
            <>
              <span className="text-[11px] font-medium truncate flex-1">{value.field}</span>

              {(showAggregate || showBin || showTimeUnit) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {showAggregate && (
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      agg
                      <select
                        value={value.aggregate ?? ''}
                        onChange={(e) => {
                          const nextAgg = e.target.value as FieldEncoding['aggregate']
                          onChange({ ...value, aggregate: nextAgg || undefined })
                        }}
                        className="h-6 rounded border bg-background px-1.5 text-[10px]"
                      >
                        <option value="">none</option>
                        {AGG_OPTS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {showBin && (
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={!!value.bin}
                        onChange={(e) => onChange({ ...value, bin: e.target.checked || undefined })}
                      />
                      bin
                    </label>
                  )}

                  {showTimeUnit && (
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      time
                      <select
                        value={value.timeUnit ?? ''}
                        onChange={(e) => {
                          const next = e.target.value as FieldEncoding['timeUnit']
                          onChange({ ...value, timeUnit: next || undefined })
                        }}
                        className="h-6 rounded border bg-background px-1.5 text-[10px]"
                      >
                        <option value="">none</option>
                        {TIMEUNIT_OPTS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </>
          )}

          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="ml-1 text-[10px] text-muted-foreground hover:text-foreground shrink-0"
              title="Clear"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('rounded border bg-background', className)}>
      <div className="px-2 py-1.5 border-b bg-muted/30 flex items-center justify-between gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
            title="Clear"
          >
            Clear
          </button>
        )}
      </div>

      <div
        className={cn(
          'px-2 py-1.5 min-h-10 flex flex-col gap-1.5',
          !value && 'text-muted-foreground'
        )}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(e) => {
          e.preventDefault()
          const fieldName = e.dataTransfer.getData('text/plain')
          if (!fieldName) return
          applyField(fieldName)
        }}
      >
        {!value ? (
          <div className="text-[11px]">{channelHint(channel)}</div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <div className="text-[11px] font-medium truncate">{value.field}</div>
            </div>

            {(showAggregate || showBin || showTimeUnit) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {showAggregate && (
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    agg
                    <select
                      value={value.aggregate ?? ''}
                      onChange={(e) => {
                        const nextAgg = e.target.value as FieldEncoding['aggregate']
                        onChange({ ...value, aggregate: nextAgg || undefined })
                      }}
                      className="h-6 rounded border bg-background px-1.5 text-[10px]"
                    >
                      <option value="">none</option>
                      {AGG_OPTS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {showBin && (
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-3 w-3"
                      checked={!!value.bin}
                      onChange={(e) => onChange({ ...value, bin: e.target.checked || undefined })}
                    />
                    bin
                  </label>
                )}

                {showTimeUnit && (
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    time
                    <select
                      value={value.timeUnit ?? ''}
                      onChange={(e) => {
                        const next = e.target.value as FieldEncoding['timeUnit']
                        onChange({ ...value, timeUnit: next || undefined })
                      }}
                      className="h-6 rounded border bg-background px-1.5 text-[10px]"
                    >
                      <option value="">none</option>
                      {TIMEUNIT_OPTS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

