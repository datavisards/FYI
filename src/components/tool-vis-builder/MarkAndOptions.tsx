'use client'

import type { BuilderMark } from '@/lib/viz/specModel'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface MarkAndOptionsProps {
  mark: BuilderMark
  onMarkChange: (mark: BuilderMark) => void
  className?: string
}

const MARKS: Array<{ id: BuilderMark; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'bar', label: 'Bar' },
  { id: 'line', label: 'Line' },
  { id: 'point', label: 'Point' },
  { id: 'area', label: 'Area' },
  { id: 'text', label: 'Text' },
]
export function MarkAndOptions({ mark, onMarkChange, className }: MarkAndOptionsProps) {
  return (
    <div className={cn('rounded border bg-background', className)}>
      <div className="px-2 py-1.5 min-h-10 flex items-center gap-4">
        <span className="text-[11px] font-medium text-muted-foreground shrink-0">Mark</span>
        <Select
          value={mark}
          onValueChange={(value) => onMarkChange(value as BuilderMark)}
        >
          <SelectTrigger className="h-7 text-[11px] flex-1 min-w-0 rounded">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MARKS.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

