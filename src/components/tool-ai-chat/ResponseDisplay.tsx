'use client'

import React, { useRef, useEffect, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useExplorationStore } from '@/stores/explorationStore'
import { VegaChart } from './VegaChart'

interface ResponseDisplayProps {
  content: string
  isLoading: boolean
}

export function ResponseDisplay({ content, isLoading }: ResponseDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [content])

  if (!content && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <SparklesIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Ask a question to get started</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 min-h-0">
      <ScrollArea className="h-full rounded-lg border bg-muted/30 p-4">
        {isLoading && !content && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <MarkdownContent content={content} />
          {isLoading && <span className="inline-block w-1 h-4 bg-primary animate-pulse ml-1" />}
        </div>
      </ScrollArea>
    </div>
  )
}

// Data citation click handler component
function DataCitationChip({ country, year }: { country: string; year: string }) {
  const openDataTable = useExplorationStore((state) => state.openDataTable)
  const setActiveToolTab = useExplorationStore((state) => state.setActiveToolTab)

  const handleClick = useCallback(() => {
    sessionStorage.setItem('dataTableFilter', JSON.stringify({ country, year }))
    setActiveToolTab('inspect-table')
    openDataTable()
  }, [country, year, openDataTable, setActiveToolTab])

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer border border-emerald-200 dark:border-emerald-800"
      title={`View data for ${country}, ${year}`}
    >
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3h18v18H3zM3 9h18M9 21V9" />
      </svg>
      {country}, {year}
    </button>
  )
}

// Parse inline formatting into React nodes (safe — no dangerouslySetInnerHTML)
function parseInline(text: string): React.ReactNode[] {
  const regex = /(\*\*(.+?)\*\*|\*([^*]+?)\*|`([^`]+)`|\[Data:\s*country=([^,\]]+),\s*year=(\d{4})\]|\[([^\]]+)\]\(([^)]+)\))/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[2] !== undefined) {
      // Bold: **text**
      parts.push(<strong key={key++}>{match[2]}</strong>)
    } else if (match[3] !== undefined) {
      // Italic: *text*
      parts.push(<em key={key++}>{match[3]}</em>)
    } else if (match[4] !== undefined) {
      // Inline code: `code`
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-muted text-xs font-mono">
          {match[4]}
        </code>
      )
    } else if (match[5] !== undefined && match[6] !== undefined) {
      // Data citation: [Data: country=X, year=Y]
      parts.push(
        <DataCitationChip key={key++} country={match[5].trim()} year={match[6].trim()} />
      )
    } else if (match[7] !== undefined && match[8] !== undefined) {
      // Link: [text](url)
      parts.push(
        <a
          key={key++}
          href={match[8]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {match[7]}
        </a>
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}

// Block types for grouped line rendering
type Block =
  | { type: 'heading'; level: 1 | 2 | 3; content: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'paragraph'; content: string }
  | { type: 'br' }

// Group consecutive lines into semantic blocks (lists, headings, quotes, etc.)
function groupLines(lines: string[]): Block[] {
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('### ')) {
      blocks.push({ type: 'heading', level: 3, content: line.slice(4) })
      i++
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'heading', level: 2, content: line.slice(3) })
      i++
    } else if (line.startsWith('# ')) {
      blocks.push({ type: 'heading', level: 1, content: line.slice(2) })
      i++
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'ul', items })
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      blocks.push({ type: 'ol', items })
    } else if (line.startsWith('> ')) {
      const qLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        qLines.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'blockquote', lines: qLines })
    } else if (!line.trim()) {
      blocks.push({ type: 'br' })
      i++
    } else {
      blocks.push({ type: 'paragraph', content: line })
      i++
    }
  }

  return blocks
}

// Parse content into text and code block segments
interface ContentSegment {
  type: 'text' | 'code'
  language?: string
  content: string
}

function parseContentSegments(content: string): ContentSegment[] {
  const segments: ContentSegment[] = []
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'code', language: match[1] || 'plaintext', content: match[2] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) })
  }

  return segments.length > 0 ? segments : [{ type: 'text', content }]
}

export function MarkdownContent({ content }: { content: string }) {
  const segments = parseContentSegments(content)

  return (
    <>
      {segments.map((segment, si) => {
        if (segment.type === 'code') {
          if (segment.language === 'vega-lite') {
            try {
              const spec = JSON.parse(segment.content)
              return (
                <div key={si} className="my-4">
                  <VegaChart spec={spec} />
                </div>
              )
            } catch {
              return (
                <pre key={si} className="bg-muted p-3 rounded-lg overflow-x-auto my-2">
                  <code className="text-xs text-muted-foreground">{segment.content}</code>
                </pre>
              )
            }
          }

          return (
            <pre key={si} className="bg-muted p-3 rounded-lg overflow-x-auto my-2">
              <code className="text-xs text-muted-foreground">{segment.content}</code>
            </pre>
          )
        }

        const blocks = groupLines(segment.content.split('\n'))
        return (
          <React.Fragment key={si}>
            {blocks.map((block, bi) => {
              const key = `${si}-${bi}`
              switch (block.type) {
                case 'heading':
                  if (block.level === 1) {
                    return <h1 key={key} className="text-lg font-bold mt-4 mb-2">{parseInline(block.content)}</h1>
                  }
                  if (block.level === 2) {
                    return <h2 key={key} className="text-base font-semibold mt-4 mb-2">{parseInline(block.content)}</h2>
                  }
                  return <h3 key={key} className="text-sm font-semibold mt-3 mb-1">{parseInline(block.content)}</h3>
                case 'ul':
                  return (
                    <ul key={key} className="list-disc pl-5 my-2 space-y-1">
                      {block.items.map((item, ii) => (
                        <li key={ii}>{parseInline(item)}</li>
                      ))}
                    </ul>
                  )
                case 'ol':
                  return (
                    <ol key={key} className="list-decimal pl-5 my-2 space-y-1">
                      {block.items.map((item, ii) => (
                        <li key={ii}>{parseInline(item)}</li>
                      ))}
                    </ol>
                  )
                case 'blockquote':
                  return (
                    <blockquote key={key} className="border-l-2 border-muted-foreground/30 pl-3 my-2 text-muted-foreground italic">
                      {block.lines.map((line, li) => (
                        <p key={li}>{parseInline(line)}</p>
                      ))}
                    </blockquote>
                  )
                case 'br':
                  return <br key={key} />
                case 'paragraph':
                  return <p key={key} className="mb-2">{parseInline(block.content)}</p>
              }
            })}
          </React.Fragment>
        )
      })}
    </>
  )
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  )
}
