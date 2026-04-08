'use client'

import { useMemo } from 'react'
import { useExplorationStore } from '@/stores/explorationStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Play,
  MousePointer,
  Gavel,
  Send,
  Filter,
  ArrowUpDown,
  Eye,
  Table2,
  Download,
  History,
  Bot,
  Globe,
  ToggleLeft,
  Plus,
  Upload,
  XCircle,
  PlusCircle,
  RefreshCw,
  Sparkles,
  Trash2,
  ChartArea,
  Database,
  Zap,
  Timer,
  TimerOff,
} from 'lucide-react'
import type { StudyEvent } from '@/types/events'

const EVENT_CONFIG: Partial<Record<
  StudyEvent['type'],
  { icon: React.ElementType; label: string; color: string }
>> = {
  session_started: { icon: Play, label: 'Session Started', color: 'text-green-600' },
  session_exported: { icon: Download, label: 'Session Exported', color: 'text-blue-600' },
  session_reset: { icon: RefreshCw, label: 'Session Reset', color: 'text-red-600' },
  timer_started: { icon: Timer, label: 'Timer Started', color: 'text-green-500' },
  timer_expired: { icon: TimerOff, label: 'Timer Expired', color: 'text-red-600' },
  claim_ai_detection_started: { icon: Sparkles, label: 'Detection Started', color: 'text-sky-500' },
  claim_ai_detection_completed: { icon: Sparkles, label: 'Claims Detected', color: 'text-sky-500' },
  claim_ai_detection_failed: { icon: XCircle, label: 'Detection Failed', color: 'text-red-600' },
  claim_manual_added: { icon: PlusCircle, label: 'Claim Added', color: 'text-green-600' },
  claim_dismissed: { icon: XCircle, label: 'Claim Dismissed', color: 'text-red-500' },
  claim_focused: { icon: MousePointer, label: 'Claim Selected', color: 'text-blue-600' },
  autocheck_triggered: { icon: Zap, label: 'Auto-Check Run', color: 'text-amber-500' },
  autocheck_completed: { icon: Bot, label: 'Auto-Check Done', color: 'text-amber-600' },
  chat_thread_created: { icon: Plus, label: 'Chat Created', color: 'text-green-500' },
  chat_message_sent: { icon: Send, label: 'Chat Message', color: 'text-blue-500' },
  chat_response_received: { icon: Bot, label: 'AI Response', color: 'text-violet-500' },
  chat_web_search_toggled: { icon: Globe, label: 'Search Toggled', color: 'text-orange-500' },
  chat_data_tools_toggled: { icon: ToggleLeft, label: 'Data Tools Toggled', color: 'text-orange-400' },
  table_dataset_switched: { icon: Table2, label: 'Dataset Switched', color: 'text-cyan-500' },
  table_sorted: { icon: ArrowUpDown, label: 'Table Sorted', color: 'text-amber-500' },
  table_filtered: { icon: Filter, label: 'Table Filtered', color: 'text-amber-600' },
  table_row_expanded: { icon: Eye, label: 'Row Expanded', color: 'text-teal-600' },
  table_csv_uploaded: { icon: Upload, label: 'CSV Uploaded', color: 'text-emerald-600' },
  vis_chart_created: { icon: ChartArea, label: 'Chart Created', color: 'text-violet-600' },
  vis_chart_deleted: { icon: Trash2, label: 'Chart Deleted', color: 'text-red-500' },
  vis_chart_selected: { icon: ChartArea, label: 'Chart Selected', color: 'text-violet-500' },
  vis_spec_changed: { icon: RefreshCw, label: 'Vis Modified', color: 'text-violet-500' },
  vis_dataset_switched: { icon: Database, label: 'Vis Dataset Switched', color: 'text-cyan-500' },
  verdict_form_opened: { icon: Gavel, label: 'Verdict Form Opened', color: 'text-purple-500' },
  verdict_submitted: { icon: Gavel, label: 'Verdict Submitted', color: 'text-purple-600' },
  verdict_updated: { icon: RefreshCw, label: 'Verdict Updated', color: 'text-orange-600' },
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function getPayloadDetail(event: StudyEvent): string | null {
  switch (event.type) {
    case 'claim_focused':
      return event.claimText
        ? String(event.claimText).length > 60
          ? String(event.claimText).slice(0, 60) + '...'
          : String(event.claimText)
        : null
    case 'claim_manual_added':
      return event.claimText
        ? String(event.claimText).length > 60
          ? String(event.claimText).slice(0, 60) + '...'
          : String(event.claimText)
        : null
    case 'claim_dismissed':
      return event.claimText
        ? String(event.claimText).length > 60
          ? String(event.claimText).slice(0, 60) + '...'
          : String(event.claimText)
        : null
    case 'claim_ai_detection_completed':
      return `${event.claimsFound} claim${event.claimsFound !== 1 ? 's' : ''} in ${Math.round(event.durationMs / 1000)}s`
    case 'claim_ai_detection_failed':
      return event.error ? String(event.error).slice(0, 60) : null
    case 'table_filtered':
      return event.column ? `${event.column} = ${event.value}` : null
    case 'table_sorted':
      return event.column ? `${event.column} ${event.direction}` : null
    case 'table_row_expanded':
      return `Row ${event.rowIndex}`
    case 'table_dataset_switched':
    case 'vis_dataset_switched':
      return event.datasetName ? String(event.datasetName) : null
    case 'table_csv_uploaded':
      return event.fileName
        ? `${event.fileName} (${event.rowCount} rows, ${event.columnCount} cols)`
        : null
    case 'verdict_submitted':
      return event.verdict ? `${event.verdict} (${event.confidence}/7)` : null
    case 'verdict_updated':
      return event.oldVerdict
        ? `${event.oldVerdict} → ${event.newVerdict} (${event.newConfidence}/7)`
        : null
    case 'chat_message_sent':
      return `Turn ${event.turnIndex + 1}, ${event.messageLength} chars`
    case 'chat_response_received':
      return `${event.responseLength} chars, ${event.citationCount} citations`
    case 'chat_web_search_toggled':
      return event.enabled ? 'Enabled' : 'Disabled'
    case 'chat_data_tools_toggled':
      return event.enabled ? 'Enabled' : 'Disabled'
    case 'autocheck_completed':
      return event.aiSuggestedVerdict
        ? `Suggested: ${event.aiSuggestedVerdict}`
        : `Completed in ${Math.round(event.durationMs / 1000)}s`
    case 'timer_started':
      return `${Math.round(event.durationMs / 60000)} min`
    case 'session_exported':
      return `${event.verdictCount} verdicts, ${event.totalClaims} claims`
    default:
      return null
  }
}

export function ActionHistoryPanel() {
  const events = useExplorationStore((s) => s.events)

  const reversed = useMemo(
    () => [...events].reverse(),
    [events]
  )

  const displayCount = useMemo(
    () => events.filter(e => EVENT_CONFIG[e.type]).length,
    [events]
  )

  return (
    <div className="h-full flex flex-col min-h-0 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Action History</span>
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {displayCount}
          </Badge>
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1">
          {reversed.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <Download className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No events recorded yet</p>
            </div>
          )}
          {reversed.map((event) => {
            const config = EVENT_CONFIG[event.type]
            if (!config) return null
            const Icon = config.icon
            const detail = getPayloadDetail(event)

            return (
              <div
                key={event.eventId}
                className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
              >
                <div className="shrink-0 mt-0.5">
                  <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">
                      {config.label}
                    </span>
                    {'claimId' in event && event.claimId && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0 h-4 shrink-0"
                      >
                        claim
                      </Badge>
                    )}
                  </div>
                  {detail && (
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {detail}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
