'use client'

import { useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, ChevronRight, Search, Brain, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentStepCardProps {
  id: string
  description: string
  tool?: string
  status: 'pending' | 'running' | 'done' | 'error'
  result?: string
}

const TOOL_ICONS: Record<string, React.ElementType> = {
  web_search: Search,
}

export function AgentStepCard({ description, tool, status, result }: AgentStepCardProps) {
  const [expanded, setExpanded] = useState(false)
  const ToolIcon = tool ? (TOOL_ICONS[tool] || Brain) : Brain

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="w-full">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors',
            status === 'running' && 'border-primary/50 bg-primary/5',
            status === 'done' && 'border-green-500/30 bg-green-500/5',
            status === 'error' && 'border-red-500/30 bg-red-500/5',
            status === 'pending' && 'border-muted opacity-60'
          )}
        >
          {/* Status icon */}
          <div className="shrink-0">
            {status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />}
            {status === 'running' && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
            {status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            {status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
          </div>

          {/* Tool icon */}
          <ToolIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

          {/* Description */}
          <span className="flex-1 text-xs truncate">{description}</span>

          {/* Expand arrow */}
          {result && (
            <div className="shrink-0">
              {expanded ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              )}
            </div>
          )}
        </div>
      </CollapsibleTrigger>
      {result && (
        <CollapsibleContent>
          <div className="px-3 py-2 ml-6 mt-1 rounded border bg-muted/30 text-xs">
            <pre className="whitespace-pre-wrap max-h-40 overflow-y-auto">{result}</pre>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}
