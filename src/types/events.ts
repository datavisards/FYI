// src/types/events.ts
export type ToolType = 'auto-check' | 'ask-ai' | 'inspect-table' | 'create-vis'
export type Verdict = 'verified' | 'misleading' | 'unverifiable'

// Session-level base — no claimId
export interface EventBase {
  eventId: string
  sessionId: string
  timestamp: string
}

// Claim-scoped base — claimId REQUIRED
export interface ClaimScopedEvent extends EventBase {
  claimId: string
}

export type StudyEvent =
  | EventBase & { type: 'session_started'; articleId: string; participantId: string }
  | EventBase & { type: 'session_exported'; totalClaims: number; verdictCount: number; totalDurationMs: number }
  | EventBase & { type: 'session_reset' }
  | EventBase & { type: 'timer_started'; durationMs: number }
  | EventBase & { type: 'timer_expired' }
  | EventBase & { type: 'claim_ai_detection_started'; articleLength: number }
  | EventBase & { type: 'claim_ai_detection_completed'; claimsFound: number; claimIds: string[]; durationMs: number }
  | EventBase & { type: 'claim_ai_detection_failed'; error: string }
  | ClaimScopedEvent & { type: 'claim_manual_added'; claimText: string; startOffset: number; endOffset: number }
  | ClaimScopedEvent & { type: 'claim_dismissed'; claimText: string; hadVerdict: boolean }
  | ClaimScopedEvent & { type: 'claim_focused'; claimText: string; claimIndex: number; totalClaims: number }
  | ClaimScopedEvent & { type: 'autocheck_triggered'; claimText: string }
  | ClaimScopedEvent & { type: 'autocheck_completed'; durationMs: number; responseLength: number; aiSuggestedVerdict: Verdict | null }
  | ClaimScopedEvent & { type: 'chat_thread_created'; chatId: string; initialMessageLength?: number }
  | ClaimScopedEvent & { type: 'chat_message_sent'; chatId: string; messageLength: number; turnIndex: number; webSearchEnabled: boolean; dataToolsEnabled: boolean }
  | ClaimScopedEvent & { type: 'chat_response_received'; chatId: string; responseLength: number; durationMs: number; aiToolsUsed: string[]; citationCount: number }
  | ClaimScopedEvent & { type: 'chat_web_search_toggled'; chatId: string; enabled: boolean }
  | ClaimScopedEvent & { type: 'chat_data_tools_toggled'; chatId: string; enabled: boolean }
  | ClaimScopedEvent & { type: 'table_dataset_switched'; datasetName: string; source: 'built-in' | 'uploaded' }
  | ClaimScopedEvent & { type: 'table_sorted'; column: string; direction: 'asc' | 'desc' }
  | ClaimScopedEvent & { type: 'table_filtered'; column: string; value: string }
  | ClaimScopedEvent & { type: 'table_row_expanded'; rowIndex: number }
  | ClaimScopedEvent & { type: 'table_csv_uploaded'; fileName: string; rowCount: number; columnCount: number; columnNames: string[] }
  | ClaimScopedEvent & { type: 'vis_chart_created'; chartId: string; datasetName: string; source: 'built-in' | 'uploaded'; spec: object }
  | ClaimScopedEvent & { type: 'vis_chart_deleted'; chartId: string }
  | ClaimScopedEvent & { type: 'vis_chart_selected'; chartId: string }
  | ClaimScopedEvent & { type: 'vis_spec_changed'; chartId: string; change: 'mark' | 'encoding' | 'filter' | 'other'; spec: object }
  | ClaimScopedEvent & { type: 'vis_dataset_switched'; chartId: string; datasetName: string; source: 'built-in' | 'uploaded' }
  | ClaimScopedEvent & { type: 'verdict_form_opened' }
  | ClaimScopedEvent & { type: 'verdict_submitted'; verdict: Verdict; confidence: number; mostHelpfulTool: ToolType; helpfulTools: ToolType[]; severity: number | null; reasoningType: 'correction' | 'explanation' | null; reasoningText: string | null; correctionTarget: string | null; correctionText: string | null; explanationText: string | null; formDurationMs: number }
  | ClaimScopedEvent & { type: 'verdict_updated'; oldVerdict: Verdict; newVerdict: Verdict; oldConfidence: number; newConfidence: number; newMostHelpfulTool: ToolType; helpfulTools: ToolType[]; severity: number | null; reasoningType: 'correction' | 'explanation' | null; newReasoningText: string | null; correctionTarget: string | null; correctionText: string | null; explanationText: string | null; formDurationMs: number }

/**
 * The payload passed to `eventLogger.log()` — same as StudyEvent but without
 * the auto-generated fields (eventId, sessionId, timestamp).
 * Uses DistributiveOmit to preserve the discriminated union correctly.
 */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
export type StudyEventPayload = DistributiveOmit<StudyEvent, 'eventId' | 'sessionId' | 'timestamp'>
