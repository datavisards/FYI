'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Slider } from '@/components/ui/slider'
import { X } from 'lucide-react'

export function ColumnFilterCategorical({
  label,
  options,
  selected,
  onSelectedChange,
  onClose,
}: {
  label: string
  options: string[]
  selected: string[]
  onSelectedChange: (selected: string[]) => void
  onClose: () => void
}) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onSelectedChange(selected.filter(s => s !== value))
    } else {
      onSelectedChange([...selected, value])
    }
  }
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">{label}</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="h-[240px]">
        <div className="p-2 space-y-0.5">
          {options.map(opt => (
            <label
              key={opt}
              className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/50 cursor-pointer text-sm"
            >
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={() => toggle(opt)}
              />
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
      </ScrollArea>
      {selected.length > 0 && (
        <div className="px-3 py-2 border-t text-xs text-muted-foreground">
          {selected.length} selected
        </div>
      )}
    </div>
  )
}

export function ColumnFilterQuantitative({
  label,
  min,
  max,
  value,
  onValueChange,
  onClose,
}: {
  label: string
  min: number
  max: number
  value: [number, number]
  onValueChange: (value: [number, number] | null) => void
  onClose: () => void
}) {
  const [local, setLocal] = useState<[number, number]>(value)
  useEffect(() => {
    setLocal(value)
  }, [value[0], value[1]])
  const isDefault = local[0] === min && local[1] === max
  return (
    <div className="flex flex-col p-3 gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="px-1">
        <Slider
          min={min}
          max={max}
          step={max - min > 1000 ? Math.ceil((max - min) / 200) : 1}
          value={local}
          onValueChange={v => setLocal(v as [number, number])}
          onValueCommit={v => onValueChange(v as [number, number])}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{local[0].toLocaleString()}</span>
        <span>{local[1].toLocaleString()}</span>
      </div>
      {!isDefault && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            setLocal([min, max])
            onValueChange(null)
          }}
        >
          Reset range
        </Button>
      )}
    </div>
  )
}
