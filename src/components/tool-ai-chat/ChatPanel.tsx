'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useChatStore, type CsvRowRef, type ChatMessageSource, type ChatMessageChart } from '@/stores/chatStore'
import { useExplorationStore } from '@/stores/explorationStore'
import { useDataStore } from '@/stores/dataStore'
import { useArticleStore } from '@/stores/articleStore'
import { executePython, initPyodide, isPyodideReady } from '@/lib/python/pyodideRunner'
import { apiFetch } from '@/lib/apiClient'
import { eventLogger } from '@/lib/tracking/eventLogger'
import { ChatInput, type CSVDatasetInfo } from './ChatInput'
import { CodeBlock } from './CodeBlock'
import { MarkdownContent } from './ResponseDisplay'
import { SourcesList } from './SourcesList'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { VegaChart } from './VegaChart'
import { Bot, User, Table2, FileText, Globe, BarChart3, Paperclip, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react'

interface ChatPanelProps {
  /** Conversation ID to use. If null, auto-creates on first message. */
  conversationId?: string | null
  showSearchToggle?: boolean
  showToolToggles?: boolean
}

const MAX_PYTHON_CONTINUATION_DEPTH = 3
const MAX_PYTHON_OUTPUT = 5000

function VerdictBadge({ verdict }: { verdict: 'Verified' | 'Misleading' | 'Unverifiable' }) {
  const config = {
    Verified: { icon: CheckCircle2, color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' },
    Misleading: { icon: AlertTriangle, color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' },
    Unverifiable: { icon: HelpCircle, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  }
  const { icon: Icon, color } = config[verdict]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      {verdict}
    </span>
  )
}

/** RFC 4180 CSV field escaping — wraps in quotes if the value contains comma, quote, or newline */
function csvEscapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Convert header to snake_case (matches Pyodide DataFrame naming) */
function toSnakeCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s\-]+/g, '_')
    .replace(/[^\w]/g, '')
    .toLowerCase()
}

/** Inject full dataset into a Vega-Lite spec, coercing numeric strings to numbers.
 *  Provides BOTH original and snake_case keys so the spec works regardless of
 *  which naming convention the model used. */
function injectChartData(
  spec: Record<string, unknown>,
  allCsvData: { name: string; headers: string[]; rows: string[][] }[]
): Record<string, unknown> {
  if (allCsvData.length === 0) return spec

  const patched = { ...spec }
  const ds = allCsvData[0]

  // Build values with both original and snake_case keys
  const values = ds.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    ds.headers.forEach((h, j) => {
      const raw = row[j]
      const num = Number(raw)
      const val = raw !== '' && !isNaN(num) ? num : raw
      obj[h] = val
      const snake = toSnakeCase(h)
      if (snake !== h) obj[snake] = val
    })
    return obj
  })

  patched.data = { values }
  return patched
}

function SuggestionPills({ actions, onSelect, disabled }: { actions: { label: string; prompt: string }[]; onSelect: (prompt: string) => void; disabled: boolean }) {
  return (
    <div className="flex gap-1.5 flex-wrap justify-center py-3">
      {actions.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => onSelect(s.prompt)}
          disabled={disabled}
          className="rounded-full border border-muted-foreground/20 bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/40 transition-colors disabled:opacity-50"
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

/** Renders streaming content — tries to parse JSON and show body, falls back to raw display */
function StreamingResponseDisplay({ content, allCsvData }: { content: string; allCsvData: { name: string; headers: string[]; rows: string[][] }[] }) {
  // Try to parse as structured JSON response
  try {
    const parsed = JSON.parse(content)
    if (parsed.body) {
      return (
        <div className="space-y-2">
          {parsed.verdict && <VerdictBadge verdict={parsed.verdict} />}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownContent content={parsed.body} />
            <span className="inline-block w-1 h-4 bg-primary animate-pulse ml-1" />
          </div>
          {parsed.charts && parsed.charts.length > 0 && (
            <div className="space-y-2">
              {parsed.charts.map((chart: { title?: string; spec: Record<string, unknown> }, i: number) => (
                  <div key={`stream-chart-${i}`}>
                    {chart.title && <p className="text-xs font-medium text-muted-foreground mb-1">{chart.title}</p>}
                    <VegaChart spec={injectChartData(chart.spec, allCsvData)} />
                  </div>
                ))}
            </div>
          )}
          {parsed.sources && parsed.sources.length > 0 && (
            <SourcesList sources={parsed.sources} />
          )}
        </div>
      )
    }
  } catch {
    // JSON not complete yet or not JSON — try to extract body from partial JSON
    const bodyMatch = content.match(/"body"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|$)/)
    if (bodyMatch) {
      // Extract partial body content — unescape JSON string
      let partialBody = bodyMatch[1]
      try { partialBody = JSON.parse(`"${partialBody}"`) } catch { /* use raw */ }

      const verdictMatch = content.match(/"verdict"\s*:\s*"(Verified|Misleading|Unverifiable)"/)
      return (
        <div className="space-y-2">
          {verdictMatch && <VerdictBadge verdict={verdictMatch[1] as 'Verified' | 'Misleading' | 'Unverifiable'} />}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownContent content={partialBody} />
            <span className="inline-block w-1 h-4 bg-primary animate-pulse ml-1" />
          </div>
        </div>
      )
    }
  }

  // Fallback: if it doesn't look like JSON at all, render as markdown directly
  if (!content.trimStart().startsWith('{')) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <MarkdownContent content={content} />
        <span className="inline-block w-1 h-4 bg-primary animate-pulse ml-1" />
      </div>
    )
  }

  // Still accumulating JSON — show loading indicator
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      Generating response...
    </div>
  )
}

export function ChatPanel({
  conversationId,
  showSearchToggle = true,
  showToolToggles = false,
}: ChatPanelProps) {
  const conv = useChatStore((s) =>
    conversationId ? s.conversations.find((c) => c.id === conversationId) : null
  )
  const createConversation = useChatStore((s) => s.createConversation)
  const addMessage = useChatStore((s) => s.addMessage)
  const setSearchEnabled = useChatStore((s) => s.setSearchEnabled)
  const setConversationTitle = useChatStore((s) => s.setConversationTitle)
  const setConversationClaim = useChatStore((s) => s.setConversationClaim)
  const setActive = useChatStore((s) => s.setActiveConversation)
  const activeClaim = useExplorationStore((s) => s.activeClaim)
  // Use the claim snapshot stored with the conversation (if any), otherwise fall back to live activeClaim
  const displayClaim = conv?.claimText
    ? { id: conv.claimId!, text: conv.claimText }
    : activeClaim
  const pageTableData = useDataStore((s) => s.pageTableData)

  // Use datasets already loaded in the exploration store (includes candy dataset from study/page.tsx)
  const allCsvData = useMemo(() => {
    if (!pageTableData || pageTableData.length === 0) return []
      return pageTableData.map((d) => ({
      name: d.name,
      headers: d.headers,
      rows: d.rows,
    }))
  }, [pageTableData])

  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [toolActivity, setToolActivity] = useState<{ name: string; status: 'calling' | 'done' }[]>([])
  const [pythonBlocks, setPythonBlocks] = useState<{ code: string; description: string; tool_call_id?: string; output?: string }[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Single data analysis toggle (replaces separate csv + python toggles)
  const [localDataAnalysisEnabled, setLocalDataAnalysisEnabled] = useState(false)

  // Dataset info for the attachment chips (read-only)
  const availableDatasets: CSVDatasetInfo[] = useMemo(
    () =>
      allCsvData.map((d) => ({
        name: d.name,
        headers: d.headers,
        rowCount: d.rows.length,
      })),
    [allCsvData]
  )

  const messages = conv?.messages ?? []
  const searchEnabled = conv?.searchEnabled ?? false
  // Use conversation state when available, fall back to local state
  const dataAnalysisEnabled = conv
    ? (conv.toolsEnabled?.includes('python') ?? false)
    : localDataAnalysisEnabled
  const hasContent = messages.length > 0 || streamingContent || isLoading

  // Context-aware suggested actions
  const hasData = allCsvData.length > 0
  const suggestedActions = useMemo(() => {
    const actions: { label: string; prompt: string }[] = []

    if (messages.length > 0) {
      // Follow-up suggestions after a response
      actions.push({ label: 'Go deeper', prompt: 'Explain this in more detail with supporting evidence.' })
      if (hasData) {
        actions.push({ label: 'Show a chart', prompt: 'Create a visualization that illustrates this.' })
      }
      actions.push({ label: 'Counter-argument', prompt: 'What are the strongest counter-arguments?' })
    } else if (displayClaim) {
      // Claim is selected — suggest claim-specific actions
      actions.push({ label: 'Fact-check this', prompt: 'Fact-check this claim.' })
      if (hasData) {
        actions.push({ label: 'Check against data', prompt: 'Verify this claim using the dataset.' })
      }
      if (searchEnabled) {
        actions.push({ label: 'Search for evidence', prompt: 'Search the web for evidence about this claim.' })
      }
      if (!hasData && !searchEnabled) {
        actions.push({ label: 'Key context', prompt: 'What context is needed to evaluate this claim?' })
      }
    } else {
      // No claim, no messages — general exploration
      if (hasData) {
        actions.push({ label: 'Summarize the data', prompt: 'What are the key patterns in this dataset?' })
        actions.push({ label: 'Find outliers', prompt: 'Are there any notable outliers or anomalies in the data?' })
      } else {
        actions.push({ label: 'Get started', prompt: 'What can you help me with?' })
      }
    }

    return actions
  }, [displayClaim, hasData, searchEnabled, messages.length])

  // Reset transient UI state when conversation changes
  useEffect(() => {
    setStreamingContent('')
    setToolActivity([])
    setPythonBlocks([])
    // Sync local toggle state from new conversation
    if (conv) {
      setLocalDataAnalysisEnabled(
        (conv.toolsEnabled?.includes('python') ?? false)
      )
    } else {
      setLocalDataAnalysisEnabled(false)
    }
  }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-slot="scroll-area-viewport"]')
      if (viewport) viewport.scrollTop = viewport.scrollHeight
    }
  }, [messages, streamingContent, isLoading])

  // Auto-title
  const autoTitle = useCallback(
    async (convId: string) => {
      const c = useChatStore.getState().getConversation(convId)
      if (!c || c.title !== 'New Chat') return
      try {
        const res = await apiFetch('/api/ai/title', {
          method: 'POST',
          body: JSON.stringify({
            messages: c.messages.slice(0, 4).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        })
        if (res.ok) {
          const { title } = await res.json()
          if (title) setConversationTitle(convId, title)
        }
      } catch {
        // silent
      }
    },
    [setConversationTitle]
  )

  // Build CSV data in the format Pyodide expects
  const csvDataForPyodide = useMemo(
    () =>
      allCsvData.map((d) => ({
        name: d.name,
        csv: [
          d.headers.map(csvEscapeField).join(','),
          ...d.rows.map((r) => r.map(csvEscapeField).join(',')),
        ].join('\n'),
      })),
    [allCsvData]
  )

  // SSE stream reader — returns parsed state
  type StreamResult = {
    content: string
    citations: string[]
    awaitingPython: {
      pendingMessages: unknown[]
      deferredPython: { tool_call_id: string; code: string; description: string }[]
    } | null
  }

  const readSSEStream = useCallback(
    async (res: Response): Promise<StreamResult> => {
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      let citations: string[] = []
      let awaitingPython: StreamResult['awaitingPython'] = null
      let serverError: string | null = null
      let buffer = ''

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return
        const payload = line.slice(6)
        if (payload === '[DONE]') return
        try {
          const data = JSON.parse(payload)
          if (data.error) {
            serverError = data.error
            return
          }
          if (data.content) {
            acc += data.content
            setStreamingContent(acc)
          }
          if (data.citations) citations = data.citations
          if (data.type === 'tool_call') {
            setToolActivity((prev) => [...prev, { name: data.name, status: 'calling' }])
          }
          if (data.type === 'tool_result') {
            setToolActivity((prev) =>
              prev.map((t) =>
                t.name === data.name && t.status === 'calling'
                  ? { ...t, status: 'done' }
                  : t
              )
            )
          }
          if (data.type === 'python_needed') {
            setPythonBlocks((prev) => [
              ...prev,
              { code: data.code, description: data.description, tool_call_id: data.tool_call_id },
            ])
          }
          if (data.type === 'awaiting_python') {
            awaitingPython = {
              pendingMessages: data.pendingMessages,
              deferredPython: data.deferredPython,
            }
          }
        } catch {
          // skip malformed JSON chunks
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // keep incomplete line for next chunk
        for (const line of lines) {
          processLine(line)
        }
      }

      // Flush any remaining buffered content
      if (buffer.trim()) {
        processLine(buffer)
      }

      if (serverError && !acc) {
        throw new Error(serverError)
      }

      return { content: acc, citations, awaitingPython }
    },
    [] // stable — only uses setters which are stable
  )

  /** Parse structured JSON response from the AI model */
  function parseAIResponse(raw: string): {
    verdict: 'Verified' | 'Misleading' | 'Unverifiable' | null
    body: string
    sources: ChatMessageSource[]
    charts: ChatMessageChart[]
  } {
    // First try strict JSON.parse
    try {
      const parsed = JSON.parse(raw)
      if (parsed.body) {
        return {
          verdict: parsed.verdict ?? null,
          body: parsed.body,
          sources: Array.isArray(parsed.sources) ? parsed.sources : [],
          charts: Array.isArray(parsed.charts) ? parsed.charts : [],
        }
      }
    } catch {
      // JSON.parse failed — likely unescaped newlines in string values
    }

    // Second attempt: fix unescaped newlines/tabs inside JSON string values and retry
    if (raw.trimStart().startsWith('{')) {
      try {
        const fixed = raw.replace(/"body"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:verdict|sources|charts)"/,
          (match) => {
            // Escape literal newlines and tabs inside the body string value
            return match.replace(/(?<=:\s*")([\s\S]*?)(?="\s*,\s*")/,
              (inner) => inner.replace(/\n/g, '\\n').replace(/\t/g, '\\t')
            )
          })
        const parsed = JSON.parse(fixed)
        if (parsed.body) {
          return {
            verdict: parsed.verdict ?? null,
            body: parsed.body,
            sources: Array.isArray(parsed.sources) ? parsed.sources : [],
            charts: Array.isArray(parsed.charts) ? parsed.charts : [],
          }
        }
      } catch {
        // still broken — fall through to regex
      }

      // Fallback: regex extraction (handles malformed JSON from models)
      const verdictMatch = raw.match(/"verdict"\s*:\s*"(Verified|Misleading|Unverifiable)"/)

      // Flexible body regex — matches until closing quote followed by , or } or end
      const bodyMatch = raw.match(/"body"\s*:\s*"([\s\S]*?)(?:"\s*[,}])/)
      const sourcesMatch = raw.match(/"sources"\s*:\s*(\[[\s\S]*?\])\s*[,}]/)
      const chartsMatch = raw.match(/"charts"\s*:\s*(\[[\s\S]*?\])\s*[,}]/)

      if (bodyMatch) {
        let body = bodyMatch[1]
        // Unescape JSON string escapes
        try { body = JSON.parse(`"${body}"`) } catch { /* use raw */ }

        let sources: ChatMessageSource[] = []
        if (sourcesMatch) {
          try { sources = JSON.parse(sourcesMatch[1]) } catch { /* skip */ }
        }

        let charts: ChatMessageChart[] = []
        if (chartsMatch) {
          try { charts = JSON.parse(chartsMatch[1]) } catch { /* skip */ }
        }

        return {
          verdict: verdictMatch ? verdictMatch[1] as 'Verified' | 'Misleading' | 'Unverifiable' : null,
          body,
          sources,
          charts,
        }
      }
    }

    // Final fallback: treat as plain text
    return { verdict: null, body: raw, sources: [], charts: [] }
  }

  const handleSubmit = async (text: string) => {
    if (isLoading) return

    // Ensure conversation exists
    let convId = conversationId ?? null
    if (!convId) {
      convId = createConversation()
      setActive(convId)
      if (localDataAnalysisEnabled) {
        useChatStore.getState().setToolsEnabled(convId, ['python'])
      }
      // Snapshot the active claim at conversation creation time
      const claim = useExplorationStore.getState().activeClaim
      if (claim) setConversationClaim(convId, claim.id, claim.text)

      eventLogger.log({
        type: 'chat_thread_created',
        claimId: activeClaim?.id ?? '',
        chatId: convId,
      })
    } else if (!conv?.claimId && activeClaim) {
      // First message in an existing conversation — snapshot now
      setConversationClaim(convId, activeClaim.id, activeClaim.text)
    }

    const activeTools: string[] = []
    if (searchEnabled) activeTools.push('web_search')
    if (localDataAnalysisEnabled) activeTools.push('data_analysis')

    addMessage(convId, {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      toolsActive: activeTools.length > 0 ? activeTools : undefined,
    })

    const currentMessages = useChatStore.getState().getConversation(convId)?.messages ?? []
    const turnIndex = Math.floor(currentMessages.length / 2)
    eventLogger.log({
      type: 'chat_message_sent',
      claimId: activeClaim?.id ?? '',
      chatId: convId,
      messageLength: text.length,
      turnIndex,
      webSearchEnabled: searchEnabled,
      dataToolsEnabled: localDataAnalysisEnabled,
    })

    setIsLoading(true)
    setStreamingContent('')
    setToolActivity([])
    setPythonBlocks([])

    try {
      const c = useChatStore.getState().getConversation(convId)
      // Exclude the last message (the user message we just added) — it's sent via `query`
      const history = (c?.messages ?? []).slice(0, -1).map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const csvDataToSend = allCsvData
      const pythonEnabled = dataAnalysisEnabled

      const enabledTools: string[] = []
      if (searchEnabled) enabledTools.push('web_search')
      if (pythonEnabled && csvDataToSend.length > 0) enabledTools.push('run_python')

      const article = useArticleStore.getState().getCurrentArticle()
      const articleContent = article?.content ?? undefined

      const body: Record<string, unknown> = {
        query: text,
        context: activeClaim?.text ?? undefined,
        history,
        articleContent,
      }
      if (enabledTools.length > 0) body.tools = enabledTools
      if (csvDataToSend.length > 0) body.csvData = csvDataToSend

      const msgStartTime = Date.now()
      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (!res.ok || !res.body) throw new Error(res.statusText)

      let result = await readSSEStream(res)

      // Plain array accumulated in closure — reliable alternative to reading React state
      const collectedPythonBlocks: { code: string; description: string; output: string }[] = []

      // Continuation loop: execute Python client-side, then resume the server's tool loop
      let depth = 0
      while (result.awaitingPython && depth < MAX_PYTHON_CONTINUATION_DEPTH) {
        depth++
        const { pendingMessages, deferredPython } = result.awaitingPython

        // Execute all deferred Python blocks in parallel
        setToolActivity((prev) => [
          ...prev,
          ...deferredPython.map(() => ({ name: 'run_python', status: 'calling' as const })),
        ])

        if (!isPyodideReady()) await initPyodide()

        const execResults = await Promise.all(
          deferredPython.map((dp) => executePython(dp.code, csvDataForPyodide))
        )

        // Update pythonBlocks with outputs and build tool result messages
        const toolResultMessages: unknown[] = []
        for (let i = 0; i < deferredPython.length; i++) {
          const dp = deferredPython[i]
          const pyResult = execResults[i]
          const outputText = pyResult.error
            ? `Error: ${pyResult.error}`
            : (pyResult.output || '(no output)')
          const truncated = outputText.slice(0, MAX_PYTHON_OUTPUT)

          // Accumulate for saving to the message store (reliable — no React state read)
          collectedPythonBlocks.push({ code: dp.code, description: dp.description ?? '', output: truncated })

          // Update display state so the in-progress bubble shows the output
          setPythonBlocks((prev) =>
            prev.map((b) =>
              b.tool_call_id === dp.tool_call_id ? { ...b, output: truncated } : b
            )
          )

          // Mark tool activity as done
          setToolActivity((prev) => {
            const idx = prev.findIndex(
              (t) => t.name === 'run_python' && t.status === 'calling'
            )
            if (idx === -1) return prev
            const next = [...prev]
            next[idx] = { ...next[idx], status: 'done' }
            return next
          })

          toolResultMessages.push({
            role: 'tool',
            content: truncated,
            tool_call_id: dp.tool_call_id,
          })
        }

        // Send continuation request with real Python results appended
        const continueBody: Record<string, unknown> = {
          continueMessages: [...(pendingMessages as unknown[]), ...toolResultMessages],
          tools: enabledTools,
        }
        if (csvDataToSend.length > 0) continueBody.csvData = csvDataToSend

        // Reset streaming content for the continuation response
        setStreamingContent('')

        const contRes = await apiFetch('/api/ai/chat', {
          method: 'POST',
          body: JSON.stringify(continueBody),
        })
        if (!contRes.ok || !contRes.body) throw new Error(contRes.statusText)

        result = await readSSEStream(contRes)
      }

      // Parse structured JSON response
      const rawContent = result.content || '(No response received — try again.)'
      const parsed = parseAIResponse(rawContent)

      // Merge web search citations into sources
      const allSources = [...parsed.sources]
      if (result.citations.length > 0) {
        for (const url of result.citations) {
          if (!allSources.some((s) => s.url === url)) {
            let hostname: string
            try { hostname = new URL(url).hostname.replace(/^www\./, '') } catch { hostname = url }
            allSources.push({ type: 'web', label: hostname, url })
          }
        }
      }

      addMessage(convId, {
        role: 'assistant',
        content: parsed.body,
        timestamp: new Date().toISOString(),
        verdict: parsed.verdict,
        sources: allSources.length > 0 ? allSources : undefined,
        charts: parsed.charts.length > 0
          ? parsed.charts.map((c) => ({ ...c, spec: injectChartData(c.spec, allCsvData) }))
          : undefined,
        citations: result.citations.length > 0 ? result.citations : undefined,
        pythonBlocks: collectedPythonBlocks.length > 0 ? collectedPythonBlocks : undefined,
      })

      // Read latest toolActivity via setter pattern (avoids stale closure)
      let finalToolsUsed: string[] = []
      setToolActivity((prev) => {
        finalToolsUsed = prev.filter(t => t.status === 'done').map(t => t.name)
        return prev
      })

      eventLogger.log({
        type: 'chat_response_received',
        claimId: activeClaim?.id ?? '',
        chatId: convId!,
        responseLength: parsed.body.length,
        durationMs: Date.now() - msgStartTime,
        aiToolsUsed: finalToolsUsed,
        citationCount: allSources.length,
      })

      autoTitle(convId)
    } catch (err) {
      addMessage(convId!, {
        role: 'assistant',
        content: `Error: ${(err as Error).message}`,
        timestamp: new Date().toISOString(),
      })
    } finally {
      setStreamingContent('')
      setIsLoading(false)
    }
  }

  const article = useArticleStore((s) => {
    const { articles, currentArticleId } = s
    return articles.find((a) => a.$id === currentArticleId) || null
  })

  const contextChips: { icon: typeof FileText; label: string; color: string }[] = []
  const chipColor = 'border-border bg-muted text-muted-foreground'
  if (article) contextChips.push({ icon: FileText, label: article.title, color: chipColor })
  availableDatasets.forEach((ds) => {
    contextChips.push({ icon: Table2, label: `${ds.name} (${ds.rowCount}↓)`, color: chipColor })
  })

  const hasContext = !!(displayClaim || contextChips.length > 0)

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Messages - fully scrollable */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full p-3">
          <div className="space-y-3 pr-3">
            {/* Context system message — pinned at top of chat history */}
            {hasContext && (
              <div className="flex items-start gap-2">
                <div className="shrink-0 w-6 h-6 rounded-full bg-muted border flex items-center justify-center mt-0.5">
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className={cn(
                  'flex-1 min-w-0 rounded-lg border border-dashed bg-muted/20 text-left',
                  hasContent ? 'p-2' : 'p-3'
                )}>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    Chat context
                  </p>
                  {displayClaim && (
                    <p className={cn(
                      'border-l-2 border-primary/40 pl-2 text-foreground leading-relaxed',
                      hasContent ? 'text-xs line-clamp-2' : 'text-sm'
                    )}>
                      {displayClaim.text}
                    </p>
                  )}
                  {contextChips.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {contextChips.map((chip, i) => (
                        <span
                          key={i}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
                            chip.color
                          )}
                        >
                          <chip.icon className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate max-w-[150px]">{chip.label}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Suggestion pills — empty state */}
            {!hasContent && suggestedActions.length > 0 && (
              <SuggestionPills actions={suggestedActions} onSelect={handleSubmit} disabled={isLoading} />
            )}
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex items-start gap-2 justify-end">
                  <div className="flex flex-col items-end gap-1 max-w-[85%]">
                    <div className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm">
                      {m.content}
                    </div>
                    {m.toolsActive && m.toolsActive.length > 0 && (
                      <div className="flex gap-1 flex-wrap justify-end">
                        {m.toolsActive.map((tool) => (
                          <span
                            key={tool}
                            className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {tool === 'web_search' && <Globe className="w-2.5 h-2.5" />}
                            {tool === 'data_analysis' && <BarChart3 className="w-2.5 h-2.5" />}
                            {tool === 'web_search' ? 'Web Search' : 'Data Analysis'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex items-start gap-2">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
                    {/* Verdict badge */}
                    {m.verdict && <VerdictBadge verdict={m.verdict} />}
                    {/* Saved python blocks from this message */}
                    {m.pythonBlocks && m.pythonBlocks.length > 0 && (
                      <div>
                        {m.pythonBlocks.map((block, i) => (
                          <CodeBlock
                            key={`saved-py-${m.id}-${i}`}
                            code={block.code}
                            description={block.description}
                            language="python"
                            output={block.output}
                            csvData={csvDataForPyodide}
                          />
                        ))}
                      </div>
                    )}
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <MarkdownContent content={m.content} />
                    </div>
                    {/* Charts */}
                    {m.charts && m.charts.length > 0 && (
                      <div className="space-y-2">
                        {m.charts.map((chart, i) => (
                          <div key={`chart-${m.id}-${i}`}>
                            {chart.title && (
                              <p className="text-xs font-medium text-muted-foreground mb-1">{chart.title}</p>
                            )}
                            <VegaChart spec={chart.spec} />
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Unified sources */}
                    {((m.sources && m.sources.length > 0) || (m.citations && m.citations.length > 0)) && (
                      <SourcesList sources={m.sources ?? []} citations={m.citations} />
                    )}
                  </div>
                </div>
              )
            )}
            {/* In-progress assistant message — single bubble containing tool indicators, python blocks, then streaming text */}
            {isLoading && (
              <div className="flex items-start gap-2">
                <div className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
                  {/* Tool activity chips */}
                  {toolActivity.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {toolActivity.map((t, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {t.status === 'calling' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          )}
                          {t.status === 'done' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          )}
                          {t.name === 'web_search' ? 'Searching...' : t.name === 'run_python' ? 'Calculating...' : t.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Python blocks — appear before the explanation, matching execution order */}
                  {pythonBlocks.map((block, i) => (
                    <CodeBlock
                      key={`py-${i}`}
                      code={block.code}
                      description={block.description}
                      language="python"
                      output={block.output}
                      csvData={csvDataForPyodide.length > 0 ? csvDataForPyodide : undefined}
                      skipAutoRun
                    />
                  ))}
                  {/* Streaming explanation */}
                  {streamingContent ? (
                    <StreamingResponseDisplay content={streamingContent} allCsvData={allCsvData} />
                  ) : toolActivity.length === 0 && pythonBlocks.length === 0 && (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Follow-up suggestion pills — after messages, when not loading */}
            {!isLoading && messages.length > 0 && suggestedActions.length > 0 && (
              <SuggestionPills actions={suggestedActions} onSelect={handleSubmit} disabled={isLoading} />
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input */}
      <ChatInput
        onSubmit={handleSubmit}
        disabled={isLoading}
        showSearchToggle={true}
        searchEnabled={searchEnabled}
        onSearchToggle={(enabled) => {
          let convId = conversationId
          if (!convId) {
            convId = createConversation()
            setActive(convId)
            const claim = useExplorationStore.getState().activeClaim
            if (claim) setConversationClaim(convId, claim.id, claim.text)
          }
          setSearchEnabled(convId, enabled)
          eventLogger.log({
            type: 'chat_web_search_toggled',
            claimId: activeClaim?.id ?? '',
            chatId: convId,
            enabled,
          })
        }}
        showDataAnalysisToggle={true}
        dataAnalysisEnabled={dataAnalysisEnabled}
        onDataAnalysisToggle={(enabled) => {
          setLocalDataAnalysisEnabled(enabled)
          let convId = conversationId
          if (!convId) {
            convId = createConversation()
            setActive(convId)
            const claim = useExplorationStore.getState().activeClaim
            if (claim) setConversationClaim(convId, claim.id, claim.text)
          }
          const next = enabled ? ['python'] : []
          useChatStore.getState().setToolsEnabled(convId, next)
          eventLogger.log({
            type: 'chat_data_tools_toggled',
            claimId: activeClaim?.id ?? '',
            chatId: convId,
            enabled,
          })
        }}
      />
    </div>
  )
}


