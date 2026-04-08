'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Globe, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CSVDatasetInfo {
  name: string
  headers: string[]
  rowCount: number
}

interface ChatInputProps {
  onSubmit: (text: string) => void
  disabled?: boolean
  placeholder?: string
  showSearchToggle?: boolean
  searchEnabled?: boolean
  onSearchToggle?: (enabled: boolean) => void
  showDataAnalysisToggle?: boolean
  dataAnalysisEnabled?: boolean
  onDataAnalysisToggle?: (enabled: boolean) => void
}

export function ChatInput({
  onSubmit,
  disabled,
  placeholder = 'Ask AI anything...',
  showSearchToggle,
  searchEnabled,
  onSearchToggle,
  showDataAnalysisToggle,
  dataAnalysisEnabled,
  onDataAnalysisToggle,
}: ChatInputProps) {
  const [input, setInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || disabled) return
    setInput('')
    onSubmit(text)
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t bg-background shrink-0 space-y-2">
      {/* Tool toggles - always visible */}
      <div className="flex items-center gap-4 px-1">
        {showSearchToggle && (
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
            <Globe
              className={cn(
                'h-3.5 w-3.5 transition-colors',
                searchEnabled ? 'text-blue-500' : 'text-muted-foreground'
              )}
            />
            <span className="text-[11px] font-medium">Web Search</span>
            <Switch
              checked={searchEnabled}
              onCheckedChange={onSearchToggle}
              className="scale-75"
            />
          </label>
        )}
        {showDataAnalysisToggle && (
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
            <BarChart3
              className={cn(
                'h-3.5 w-3.5 transition-colors',
                dataAnalysisEnabled ? 'text-emerald-500' : 'text-muted-foreground'
              )}
            />
            <span className="text-[11px] font-medium">Data Analysis</span>
            <Switch
              checked={dataAnalysisEnabled}
              onCheckedChange={onDataAnalysisToggle}
              className="scale-75"
            />
          </label>
        )}
      </div>


      <div className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="min-h-[60px] resize-none text-sm"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e as unknown as React.FormEvent)
            }
          }}
        />
        <div className="flex flex-col gap-1.5 shrink-0 self-end">
          <Button
            type="submit"
            disabled={!input.trim() || disabled}
            className="h-auto px-3 py-1.5"
            size="sm"
          >
            Send
          </Button>
        </div>
      </div>
    </form>
  )
}
