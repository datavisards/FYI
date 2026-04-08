'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VegaChartProps {
  spec: Record<string, unknown>
  /** Show an expand button to open the chart in a larger view */
  expandable?: boolean
  onExpand?: () => void
  className?: string
}

/**
 * Fix common LLM mistakes in Vega-Lite specs before rendering.
 */
function sanitizeSpec(spec: Record<string, unknown>): Record<string, unknown> {
  const patched = JSON.parse(JSON.stringify(spec)) // deep clone

  // Ensure $schema is set
  if (!patched.$schema) {
    patched.$schema = 'https://vega.github.io/schema/vega-lite/v5.json'
  }

  // Fix transforms: aggregate must be an array of {op, field, as} objects
  if (Array.isArray(patched.transform)) {
    patched.transform = patched.transform.map((t: Record<string, unknown>) => {
      if (t.aggregate && !Array.isArray(t.aggregate)) {
        // Model wrote "aggregate": "mean" instead of proper format — remove bad transform
        return null
      }
      return t
    }).filter(Boolean)
  }

  // Fix encoding: if aggregate is a string inside encoding channels, normalize it
  if (patched.encoding && typeof patched.encoding === 'object') {
    for (const [, channel] of Object.entries(patched.encoding as Record<string, Record<string, unknown>>)) {
      if (channel && typeof channel.aggregate === 'string') {
        // "aggregate": "mean" in encoding is valid Vega-Lite — leave it
      }
    }
  }

  return patched
}

/**
 * Patch a Vega-Lite spec to use container width so the chart fills
 * its parent element. Only applies to simple mark/layer specs.
 */
function makeResponsive(spec: Record<string, unknown>): Record<string, unknown> {
  if (spec.hconcat || spec.vconcat || spec.facet || spec.concat) return spec
  const patched = { ...spec }
  if (patched.width === undefined || typeof patched.width === 'number') {
    patched.width = 'container'
  }
  if (patched.height === undefined || typeof patched.height === 'number') {
    patched.height = 'container'
  }
  return patched
}

/** True when running inside a Chrome extension context */
function isExtensionContext(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.getURL
  } catch {
    return false
  }
}

// ─── Sandboxed iframe renderer (extension context) ───────────────────────

function VegaChartSandboxed({ spec, expandable, onExpand, className }: VegaChartProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(200)
  const [error, setError] = useState<string | null>(null)
  const specRef = useRef(spec)
  specRef.current = spec

  const sendSpec = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    iframe.contentWindow.postMessage(
      { type: 'VEGA_RENDER', spec: sanitizeSpec(specRef.current) },
      '*'
    )
  }, [])

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'VEGA_RENDERED') {
        setHeight(Math.max(data.height ?? 200, 60))
        setError(null)
      } else if (data.type === 'VEGA_ERROR') {
        setError(`Failed to render chart: ${data.message}`)
      } else if (data.type === 'VEGA_SANDBOX_READY') {
        sendSpec()
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [sendSpec])

  // Re-send spec when it changes
  useEffect(() => {
    specRef.current = spec
    sendSpec()
  }, [spec, sendSpec])

  // Also send on iframe load
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const handleLoad = () => setTimeout(sendSpec, 50)
    iframe.addEventListener('load', handleLoad)
    return () => iframe.removeEventListener('load', handleLoad)
  }, [sendSpec])

  if (error) {
    return (
      <div className="rounded-lg border bg-white dark:bg-gray-900 p-3 text-sm text-destructive">
        <p className="font-medium">Chart Error</p>
        <p className="text-xs text-muted-foreground mt-1">{error}</p>
      </div>
    )
  }

  const iframeSrc = chrome.runtime.getURL('extension/vega-sandbox.html')

  return (
    <div className={cn('relative rounded-lg border bg-white dark:bg-gray-900 p-2 overflow-hidden', className)}>
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="Vega-Lite chart"
        className="w-full border-0"
        style={{ height: `${height}px`, minHeight: '180px' }}
      />
      {expandable && onExpand && (
        <button
          type="button"
          onClick={onExpand}
          className="absolute top-2 right-2 rounded border bg-white dark:bg-gray-800 p-1 opacity-50 hover:opacity-100 transition-opacity shadow-sm"
          title="Expand chart"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ─── Direct renderer (Next.js / non-extension context) ───────────────────

function VegaChartDirect({ spec, expandable, onExpand, className }: VegaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    let debounceTimer: ReturnType<typeof setTimeout>

    const render = async () => {
      if (!mounted || !containerRef.current) return
      const el = containerRef.current
      try {
        const vegaEmbed = (await import('vega-embed')).default
        const patchedSpec = makeResponsive(sanitizeSpec(spec))

        // Clear previous content before embedding so vega-embed renders
        // into the live DOM node; this ensures clientWidth is non-zero
        // when the spec uses width: 'container'.
        while (el.firstChild) el.removeChild(el.firstChild)

        await vegaEmbed(el, patchedSpec, {
          actions: false,
          renderer: 'canvas',
          theme: 'quartz',
        })

        if (mounted) {
          setError(null)
        }
      } catch (err) {
        if (mounted) {
          setError(
            `Failed to render chart: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
    }

    render()

    // Re-render whenever the container is resized (e.g. panel drag)
    const observer = new ResizeObserver(() => {
      if (!mounted) return
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(render, 150)
    })
    if (containerRef.current) observer.observe(containerRef.current)

    return () => {
      mounted = false
      clearTimeout(debounceTimer)
      observer.disconnect()
    }
  }, [spec])

  if (error) {
    return (
      <div className="rounded-lg border bg-white dark:bg-gray-900 p-3 text-sm text-destructive">
        <p className="font-medium">Chart Error</p>
        <p className="text-xs text-muted-foreground mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className={cn('relative rounded-lg border bg-white dark:bg-gray-900 p-2 overflow-hidden', className)}>
      {/* Chart fills container; both width and height use 'container' mode */}
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: '180px' }} />

      {expandable && onExpand && (
        <button
          type="button"
          onClick={onExpand}
          className="absolute top-2 right-2 rounded border bg-white dark:bg-gray-800 p-1 opacity-50 hover:opacity-100 transition-opacity shadow-sm"
          title="Expand chart"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ─── Public component: picks the right renderer ──────────────────────────

export function VegaChart(props: VegaChartProps) {
  if (isExtensionContext()) {
    return <VegaChartSandboxed {...props} />
  }
  return <VegaChartDirect {...props} />
}
