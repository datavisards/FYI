'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Play, ChevronDown, ChevronRight, Loader2, Copy, Check, RefreshCw } from 'lucide-react'
import { executePython, initPyodide, isPyodideReady } from '@/lib/python/pyodideRunner'
import { cn } from '@/lib/utils'

const MAX_FIX_RETRIES = 2

interface CodeBlockProps {
  code: string
  language?: string
  description?: string
  output?: string
  csvData?: { name: string; csv: string }[]
  /** Skip auto-execution on mount (e.g. when parent manages execution) */
  skipAutoRun?: boolean
}

function buildDatasetInfo(csvData?: { name: string; csv: string }[]): { name: string; columns: string[] }[] {
  if (!csvData?.length) return []
  return csvData.map((d) => {
    const firstLine = d.csv.split('\n')[0] || ''
    const columns = firstLine.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    // Convert name to snake_case variable name (same as Pyodide runner)
    const varName = d.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
    return { name: varName, columns }
  })
}

export function CodeBlock({
  code: initialCode,
  language = 'python',
  description,
  output: initialOutput,
  csvData,
  skipAutoRun = false,
}: CodeBlockProps) {
  const [code, setCode] = useState(initialCode)
  const [output, setOutput] = useState(initialOutput ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isFixing, setIsFixing] = useState(false)
  // Start collapsed if output is already available (e.g. loaded from history)
  const [isExpanded, setIsExpanded] = useState(!initialOutput)
  const [copied, setCopied] = useState(false)

  const hasAutoRun = useRef(false)
  const retryCount = useRef(0)

  // Sync output from parent (e.g. when continuation flow provides results after mount)
  useEffect(() => {
    if (initialOutput && !output) {
      setOutput(initialOutput)
      setIsExpanded(false)
    }
  }, [initialOutput]) // eslint-disable-line react-hooks/exhaustive-deps

  const runCode = useCallback(async (codeToRun: string): Promise<{ output: string; error: string | null }> => {
    if (!isPyodideReady()) {
      setOutput('Loading Python runtime...')
      await initPyodide()
    }
    const result = await executePython(codeToRun, csvData)
    if (result.error) {
      return { output: '', error: result.error }
    }
    return { output: result.output, error: null }
  }, [csvData])

  const attemptFix = useCallback(async (failedCode: string, errorMsg: string): Promise<string | null> => {
    try {
      const datasetInfo = buildDatasetInfo(csvData)
      const res = await fetch('/api/ai/fix-python', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: failedCode, error: errorMsg, datasetInfo }),
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.code || null
    } catch {
      return null
    }
  }, [csvData])

  const handleRun = useCallback(async () => {
    if (language !== 'python') return
    setIsRunning(true)
    setError(null)
    setIsFixing(false)
    // Reset retry count for manual runs
    retryCount.current = 0

    try {
      const result = await runCode(code)
      if (result.error) {
        setError(result.error)
        setOutput('')
      } else {
        setOutput(result.output)
        setIsExpanded(false)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsRunning(false)
    }
  }, [code, language, runCode])

  const handleAutoRun = useCallback(async () => {
    if (language !== 'python') return
    setIsRunning(true)
    setError(null)

    let currentCode = code

    try {
      while (true) {
        const result = await runCode(currentCode)

        if (!result.error) {
          // Success — show output, collapse code
          setOutput(result.output)
          setError(null)
          setIsExpanded(false)
          if (currentCode !== code) setCode(currentCode)
          break
        }

        // Error — attempt auto-fix if retries remain
        if (retryCount.current >= MAX_FIX_RETRIES) {
          setError(result.error)
          setOutput('')
          if (currentCode !== code) setCode(currentCode)
          break
        }

        retryCount.current++
        setIsFixing(true)
        setError(null)
        setOutput(`Auto-fixing (attempt ${retryCount.current}/${MAX_FIX_RETRIES})...`)

        const fixedCode = await attemptFix(currentCode, result.error)
        if (!fixedCode) {
          // Fix request failed — show original error
          setIsFixing(false)
          setError(result.error)
          setOutput('')
          if (currentCode !== code) setCode(currentCode)
          break
        }

        currentCode = fixedCode
        setIsFixing(false)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsRunning(false)
      setIsFixing(false)
    }
  }, [code, language, runCode, attemptFix])

  // Auto-execute Python code on mount (skip when parent manages execution via continuation flow)
  useEffect(() => {
    if (language === 'python' && !hasAutoRun.current && !initialOutput && !skipAutoRun) {
      hasAutoRun.current = true
      handleAutoRun()
    }
  }, [language, initialOutput, skipAutoRun, handleAutoRun])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div className="rounded-lg border bg-muted/50 overflow-hidden my-2 min-w-0">
      {/* Header */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/80 border-b">
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span className="font-medium">{language}</span>
            {description && <span className="text-muted-foreground">- {description}</span>}
          </CollapsibleTrigger>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCopy}
              title="Copy code"
            >
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
            {language === 'python' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-xs px-2"
                onClick={handleRun}
                disabled={isRunning}
              >
                {isRunning ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                {isRunning ? 'Running...' : 'Run'}
              </Button>
            )}
          </div>
        </div>

        <CollapsibleContent>
          {/* Code */}
          <pre className="p-3 text-xs overflow-x-auto max-w-full whitespace-pre-wrap break-words">
            <code>{code}</code>
          </pre>
        </CollapsibleContent>
      </Collapsible>

      {/* Auto-fixing indicator */}
      {isFixing && (
        <div className="border-t px-3 py-2 text-xs bg-yellow-500/5 flex items-center gap-2">
          <RefreshCw className="h-3 w-3 animate-spin text-yellow-600" />
          <span className="text-yellow-700 dark:text-yellow-400">
            Auto-fixing code (attempt {retryCount.current}/{MAX_FIX_RETRIES})...
          </span>
        </div>
      )}

      {/* Output */}
      {!isFixing && (output || error) && (
        <div className={cn('border-t px-3 py-2 text-xs', error ? 'bg-red-500/5' : 'bg-green-500/5')}>
          <div className="text-[10px] font-medium text-muted-foreground mb-1">
            {error ? 'Error' : 'Output'}
          </div>
          <pre className="text-xs max-w-full whitespace-pre-wrap break-words">
            <code>
              {error || output}
            </code>
          </pre>
        </div>
      )}
    </div>
  )
}
