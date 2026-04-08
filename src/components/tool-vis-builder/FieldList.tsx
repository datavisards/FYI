'use client'

import { useMemo, useState } from 'react'
import type { InferredField } from '@/lib/viz/fieldInference'
import { cn } from '@/lib/utils'

export interface FieldListProps {
  fields: InferredField[]
  className?: string
}

function kindBadge(kind: InferredField['kind']) {
  switch (kind) {
    case 'quantitative':
      return { label: 'Q', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' }
    case 'temporal':
      return { label: 'T', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' }
    default:
      return { label: 'N', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' }
  }
}

export function FieldList({ fields, className }: FieldListProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return fields
    return fields.filter((f) => f.name.toLowerCase().includes(q))
  }, [fields, query])

  return (
    <div className={cn('h-full flex flex-col min-h-0', className)}>
      <div className="px-3 py-2 border-b bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground">Fields</p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fields..."
          className="mt-2 w-full h-8 rounded border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-2 space-y-1">
        {filtered.map((f) => {
          const badge = kindBadge(f.kind)
          return (
            <div
              key={f.name}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', f.name)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              className="group flex items-center gap-2 rounded border bg-background px-2 py-1.5 text-xs cursor-grab active:cursor-grabbing hover:bg-muted/40"
              title="Drag onto an encoding shelf"
            >
              <span className={cn('shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-semibold', badge.className)}>
                {badge.label}
              </span>
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                drag
              </span>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-xs text-muted-foreground px-2 py-3">No matching fields.</div>
        )}
      </div>
    </div>
  )
}

