'use client'

import { Globe, Table2, FileText } from 'lucide-react'
import type { ChatMessageSource } from '@/stores/chatStore'

interface SourcesListProps {
  sources: ChatMessageSource[]
  /** Legacy: plain URL citations from web search */
  citations?: string[]
}

export function SourcesList({ sources, citations }: SourcesListProps) {
  // Merge legacy citations into unified sources
  const allSources: ChatMessageSource[] = [...sources]
  if (citations) {
    for (const url of citations) {
      // Avoid duplicates
      if (!allSources.some((s) => s.url === url)) {
        let hostname: string
        try {
          hostname = new URL(url).hostname.replace(/^www\./, '')
        } catch {
          hostname = url
        }
        allSources.push({ type: 'web', label: hostname, url })
      }
    }
  }

  if (allSources.length === 0) return null

  const iconMap = {
    web: Globe,
    dataset: Table2,
    article: FileText,
  }

  const colorMap = {
    web: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
    dataset: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300',
    article: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
  }

  return (
    <div className="mt-3 pt-3 border-t">
      <p className="text-xs font-medium text-muted-foreground mb-2">
        Sources ({allSources.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {allSources.map((source, i) => {
          const Icon = iconMap[source.type]
          const colors = colorMap[source.type]
          const isLink = source.type === 'web' && source.url

          const content = (
            <>
              <Icon className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[150px]">{source.label}</span>
              {source.detail && (
                <span className="text-[10px] opacity-70 truncate max-w-[100px]">
                  {source.detail}
                </span>
              )}
            </>
          )

          if (isLink) {
            return (
              <a
                key={i}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:opacity-80 transition-opacity ${colors}`}
                title={source.url}
              >
                {content}
              </a>
            )
          }

          return (
            <span
              key={i}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${colors}`}
              title={source.detail}
            >
              {content}
            </span>
          )
        })}
      </div>
    </div>
  )
}
