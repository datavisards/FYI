'use client'

import { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react'
import { useExplorationStore } from '@/stores/explorationStore'
import { useDataStore } from '@/stores/dataStore'
import { useArticleStore } from '@/stores/articleStore'
import { useChatStore, type AutoCheckResult, type AutoCheckStepEvent } from '@/stores/chatStore'
import { apiFetch } from '@/lib/apiClient'
import { runGeneratedCode } from '@/lib/factChecking/runGeneratedCode'
import { NO_KEY_REASON, useHasApiKey } from '@/stores/settingsStore'
import { eventLogger } from '@/lib/tracking/eventLogger'
import { AutoCheckResultCard, AutoCheckProgressCard } from './AutoCheckResultCard'
import { Zap, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { VERDICT_BADGE } from '@/components/claim/constants'

/** The fields of a final step 4 event that become the visible result. */
type AutoCheckEventData = Pick<
  AutoCheckResult,
  'verdict' | 'confidence' | 'reasoning'
> & {
  vega_lite_spec?: AutoCheckResult['vegaLiteSpec']
  actual_value?: AutoCheckResult['actualValue']
  claimed_value?: AutoCheckResult['claimedValue']
  fact_type?: AutoCheckResult['factType']
}

export function AutoCheckPanel() {
  const activeClaim = useExplorationStore((s) => s.activeClaim)
  const pageTableData = useDataStore((s) => s.pageTableData)
  const createConversation = useChatStore((s) => s.createConversation)
  const setActive = useChatStore((s) => s.setActiveConversation)
  const addMessage = useChatStore((s) => s.addMessage)
  const updateMessage = useChatStore((s) => s.updateMessage)

  const [result, setResult] = useState<AutoCheckResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<AutoCheckStepEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  const prevClaimIdRef = useRef<string | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const resultCacheRef = useRef<Record<string, AutoCheckResult>>({})

  const allCsvData = useMemo(() => {
    if (!pageTableData || pageTableData.length === 0) return []
    return pageTableData.map((d) => ({
      name: d.name,
      headers: d.headers,
      rows: d.rows,
    }))
  }, [pageTableData])

  const hasDatasets = allCsvData.length > 0
  const hasKey = useHasApiKey()

  // Restore cached result or reset when active claim changes
  useEffect(() => {
    if (activeClaim?.id !== prevClaimIdRef.current) {
      prevClaimIdRef.current = activeClaim?.id ?? null
      const cached = activeClaim?.id ? resultCacheRef.current[activeClaim.id] : null
      setResult(cached ?? null)
      setProgress([])
      setIsRunning(false)
      setError(null)
    }
  }, [activeClaim?.id])

  // Auto-scroll to bottom when progress or result updates
  useLayoutEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [progress, result, isRunning])

  const handleRun = async () => {
    if (!activeClaim || isRunning || !hasDatasets) return

    setIsRunning(true)
    setProgress([])
    setResult(null)
    setError(null)

    const liveResult: AutoCheckResult = {
      claimId: activeClaim.id,
      claimText: activeClaim.text,
      steps: [],
    }

    const runStartedAt = Date.now()
    eventLogger.log({ type: 'autocheck_triggered', claimId: activeClaim.id, claimText: activeClaim.text })

    try {
      const currentArticle = useArticleStore.getState().getCurrentArticle()

      const request = {
        claim: {
          id: activeClaim.id,
          text: activeClaim.text,
          data_fact_hint: (activeClaim as unknown as Record<string, unknown>).data_fact_hint,
        },
        article: {
          title: currentArticle?.title ?? '',
          content: currentArticle?.content?.slice(0, 1000) ?? '',
        },
        datasets: allCsvData,
      }

      const applyEvent = (event: {
        step: number
        name: string
        status: AutoCheckStepEvent['status']
        data: Record<string, unknown> & AutoCheckEventData
      }) => {
        liveResult.steps = [
          ...liveResult.steps.filter((s) => s.step !== event.step),
          { step: event.step, name: event.name, status: event.status, data: event.data },
        ]
        if (event.step === 4 && event.status === 'done') {
          liveResult.verdict = event.data.verdict
          liveResult.confidence = event.data.confidence
          liveResult.reasoning = event.data.reasoning
          liveResult.vegaLiteSpec = event.data.vega_lite_spec
          liveResult.actualValue = event.data.actual_value
          liveResult.claimedValue = event.data.claimed_value
          liveResult.factType = event.data.fact_type
        }
        setProgress([...liveResult.steps])
      }

      /** Sends one phase of the check, applying its progress, and returns its last step 2 data. */
      const runPhase = async (phaseBody: Record<string, unknown>) => {
        const res = await apiFetch('/api/ai/fact-check', {
          method: 'POST',
          body: JSON.stringify({ ...request, ...phaseBody }),
        })
        if (!res.ok || !res.body) throw new Error(res.statusText)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let sseBuffer = ''

        const handleLine = (line: string) => {
          if (!line.startsWith('data: ')) return
          const payload = line.slice(6)
          if (payload === '[DONE]') return
          let event
          try {
            event = JSON.parse(payload)
          } catch {
            return // A partial or malformed event.
          }
          if (event.error) throw new Error(event.error)
          applyEvent(event)
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          sseBuffer += decoder.decode(value, { stream: true })
          const lines = sseBuffer.split('\n')
          sseBuffer = lines.pop() ?? ''
          lines.forEach(handleLine)
        }
        handleLine(sseBuffer.trim())

        return liveResult.steps.find((s) => s.step === 2)?.data as
          | { code?: string; enriched_claim?: string; error?: string }
          | undefined
      }

      const generated = await runPhase({ phase: 'generate' })
      const generatedCode = generated?.code ?? ''

      let executionResult: unknown
      let executionError = generated?.error
      if (!executionError) {
        try {
          if (!generatedCode) throw new Error('No verification code was generated.')
          executionResult = await runGeneratedCode(generatedCode, allCsvData[0])
          if (!executionResult || typeof executionResult !== 'object') {
            throw new Error('The verification code did not return a result.')
          }
        } catch (err) {
          executionError = (err as Error).message
        }
      }

      await runPhase({
        phase: 'judge',
        enrichedClaim: generated?.enriched_claim ?? activeClaim.text,
        generatedCode,
        executionResult,
        executionError,
      })

      const finalResult = { ...liveResult }
      setResult(finalResult)
      resultCacheRef.current[activeClaim.id] = finalResult
      const durationMs = Date.now() - runStartedAt
      eventLogger.log({
        type: 'autocheck_completed',
        claimId: activeClaim.id,
        durationMs,
        responseLength: JSON.stringify(liveResult).length,
        aiSuggestedVerdict: liveResult.verdict ?? null,
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsRunning(false)
      setProgress([])
    }
  }

  /**
   * Creates a new chat conversation seeded with the follow-up summary and
   * immediately fetches an AI response, updating the message in-place as it
   * streams so ChatPanel shows live content.
   */
  const handleFollowUp = async (summary: string) => {
    const newConvId = createConversation({ title: 'Auto Check Follow-up' })
    setActive(newConvId)

    addMessage(newConvId, {
      role: 'user',
      content: summary,
      timestamp: new Date().toISOString(),
    })

    eventLogger.log({
      type: 'chat_thread_created',
      claimId: activeClaim?.id ?? '',
      chatId: newConvId,
      initialMessageLength: summary.length,
    })

    // Add a placeholder assistant message to stream into
    const assistantMsgId = addMessage(newConvId, {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    })

    try {
      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          query: summary,
          history: [],
          mode: 'chat',
        }),
      })

      if (!res.ok || !res.body) {
        updateMessage(newConvId, assistantMsgId, 'Failed to get a response.')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      let followUpBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        followUpBuffer += decoder.decode(value, { stream: true })
        const lines = followUpBuffer.split('\n')
        followUpBuffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') continue
          try {
            const data = JSON.parse(payload)
            if (data.content) {
              acc += data.content
              updateMessage(newConvId, assistantMsgId, acc)
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      if (!acc) updateMessage(newConvId, assistantMsgId, '(No response)')
    } catch (err) {
      updateMessage(newConvId, assistantMsgId, `Error: ${(err as Error).message}`)
    }
  }

  const hasResult = !!result
  const hasClaim = !!activeClaim

  return (
    <div className="border-b shrink-0 bg-background flex flex-col min-h-0">
      {/* Title bar — matches Table Explorer / AI Chat / Chart Builder style */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
        <Zap className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">Auto Check</span>

        <div className="flex-1" />

        {/* Status indicator */}
        {!hasClaim && (
          <span className="text-[10px] text-muted-foreground">No claim selected</span>
        )}
        {hasClaim && isRunning && (
          <span className="text-[10px] text-amber-500 font-medium">Running…</span>
        )}
        {hasClaim && !isRunning && hasResult && result.verdict && (
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full border font-medium',
            VERDICT_BADGE[result.verdict].className
          )}>
            {result.verdict}
          </span>
        )}

        {/* Run button */}
        <Button
          type="button"
          size="sm"
          variant={hasResult ? 'outline' : 'default'}
          className={cn(
            'h-6 px-2 text-[11px] gap-1 shrink-0',
            !hasResult && hasClaim && 'bg-blue-600 hover:bg-blue-700 text-white'
          )}
          onClick={handleRun}
          disabled={isRunning || !hasClaim || !hasDatasets || !hasKey}
          title={
            !hasKey
              ? NO_KEY_REASON
              : !hasClaim
                ? 'Select a claim first'
                : !hasDatasets
                  ? 'Upload a CSV dataset first'
                  : hasResult
                    ? 'Re-run Auto Check'
                    : 'Run Auto Check on this claim'
          }
        >
          {hasResult
            ? <RotateCcw className="w-3 h-3" />
            : <Zap className="w-3 h-3" />
          }
          {hasResult ? 'Re-run' : 'Run'}
        </Button>
      </div>

      {/* Content area — always visible, scrollable when needed */}
      <div className="max-h-[30vh] overflow-y-auto scroll-smooth" ref={scrollContainerRef}>
        {!hasClaim && (
          <div className="text-center py-4 text-muted-foreground text-xs">
            Select a claim from the article to run Auto Check.
          </div>
        )}
        {hasClaim && isRunning && progress.length > 0 && (
          <div className="px-3 py-2">
            <AutoCheckProgressCard steps={progress} />
          </div>
        )}
        {hasClaim && isRunning && progress.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-muted-foreground animate-pulse">
            Initializing pipeline…
          </div>
        )}
        {hasClaim && !isRunning && error && (
          <div className="mx-3 my-2 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {hasClaim && !isRunning && hasResult && result && (
          <div className="px-3 py-2">
            <AutoCheckResultCard result={result} onFollowUp={handleFollowUp} />
          </div>
        )}
        {hasClaim && !hasDatasets && !isRunning && (
          <div className="text-center py-4 text-muted-foreground text-xs">
            Upload a CSV dataset to run Auto Check against.
          </div>
        )}
        {hasClaim && hasDatasets && !isRunning && !hasResult && !error && (
          <div className="text-center py-4 text-muted-foreground text-xs">
            Click <strong>Run</strong> to analyze this claim against the loaded dataset.
          </div>
        )}
      </div>
    </div>
  )
}
