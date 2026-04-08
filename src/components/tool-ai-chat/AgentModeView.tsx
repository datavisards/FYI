'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useDataStore } from '@/stores/dataStore'
import { apiFetch } from '@/lib/apiClient'
import { AgentStepCard } from './AgentStepCard'
import { MarkdownContent } from './ResponseDisplay'
import { SourcesList } from './SourcesList'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Sparkles, Loader2 } from 'lucide-react'

interface AgentStep {
  id: string
  description: string
  tool?: string
  query?: string
  status: 'pending' | 'running' | 'done' | 'error'
  result?: string
}

export function AgentModeView() {
  const pageTableData = useDataStore((s) => s.pageTableData)
  const [input, setInput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [steps, setSteps] = useState<AgentStep[]>([])
  const [synthesis, setSynthesis] = useState('')
  const [sources, setSources] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-slot="scroll-area-viewport"]')
      if (viewport) viewport.scrollTop = viewport.scrollHeight
    }
  }, [steps, synthesis, statusMessage])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const text = input.trim()
      if (!text || isRunning) return

      setInput('')
      setIsRunning(true)
      setSteps([])
      setSynthesis('')
      setSources([])
      setError(null)
      setStatusMessage('Starting research...')

      try {
        const body: Record<string, unknown> = { question: text }
        if (pageTableData) {
          body.csvData = pageTableData.map((d) => ({
            name: d.name,
            headers: d.headers,
            rows: d.rows,
          }))
        }

        const res = await apiFetch('/api/ai/agent', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        if (!res.ok || !res.body) throw new Error(res.statusText)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6)
            if (payload === '[DONE]') continue

            try {
              const data = JSON.parse(payload)

              switch (data.type) {
                case 'status':
                  setStatusMessage(data.message)
                  break
                case 'plan':
                  setSteps(data.steps)
                  setStatusMessage('')
                  break
                case 'step_start':
                  setSteps((prev) =>
                    prev.map((s) =>
                      s.id === data.stepId ? { ...s, status: 'running' } : s
                    )
                  )
                  break
                case 'step_result':
                  setSteps((prev) =>
                    prev.map((s) =>
                      s.id === data.stepId
                        ? { ...s, status: data.status, result: data.result }
                        : s
                    )
                  )
                  break
                case 'synthesis_chunk':
                  setSynthesis((prev) => prev + data.content)
                  break
                case 'complete':
                  if (data.sources) setSources(data.sources)
                  break
                case 'error':
                  setError(data.error)
                  break
              }
            } catch {
              // skip
            }
          }
        }
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setIsRunning(false)
        setStatusMessage('')
      }
    },
    [input, isRunning, pageTableData]
  )

  const hasResults = steps.length > 0 || synthesis || error

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Results */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full p-3">
          <div className="space-y-3 pr-3">
            {!hasResults && !isRunning && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium">Deep Research Mode</p>
                <p className="text-xs mt-1 max-w-[280px]">
                  Enter a research question. The agent will plan steps, execute
                  searches, analyze data, and synthesize a comprehensive report.
                </p>
              </div>
            )}

            {/* Status message */}
            {statusMessage && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                {statusMessage}
              </div>
            )}

            {/* Steps */}
            {steps.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Research Steps</p>
                {steps.map((step) => (
                  <AgentStepCard key={step.id} {...step} />
                ))}
              </div>
            )}

            {/* Synthesis */}
            {synthesis && (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Research Report</p>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <MarkdownContent content={synthesis} />
                  {isRunning && (
                    <span className="inline-block w-1 h-4 bg-primary animate-pulse ml-1" />
                  )}
                </div>
              </div>
            )}

            {/* Sources */}
            {sources.length > 0 && <SourcesList sources={sources.map((url) => {
              let hostname: string
              try { hostname = new URL(url).hostname.replace(/^www\./, '') } catch { hostname = url }
              return { type: 'web' as const, label: hostname, url }
            })} />}

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Loading skeleton */}
            {isRunning && !steps.length && !statusMessage && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t bg-background shrink-0">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter a research question for deep investigation..."
            className="min-h-[60px] resize-none text-sm"
            disabled={isRunning}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as unknown as React.FormEvent)
              }
            }}
          />
          <Button type="submit" disabled={!input.trim() || isRunning} className="shrink-0 self-end gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            Research
          </Button>
        </div>
      </form>
    </div>
  )
}
