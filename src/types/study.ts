// src/types/study.ts

// Re-export from events.ts (single source of truth for these)
export type { ToolType, Verdict } from './events'

export type StudyMode = 'llm' | 'exploration'
export type ClaimType = 'statistic' | 'causal' | 'trend' | 'comparison'
export type SeverityLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7

import type { Verdict, ToolType } from './events'

export interface Source {
  type: 'web' | 'dataset' | 'article'
  label: string
  url?: string
  detail?: string
}

export interface Chart {
  title: string
  spec: Record<string, unknown>
}

export interface AIRequest {
  query: string
  context?: string
  claimId?: string
}

export interface AIResponse {
  verdict: 'Verified' | 'Misleading' | 'Unverifiable' | null
  body: string
  sources: Source[]
  charts: Chart[]
}

export interface ToolConfig {
  id: ToolType
  name: string
  description: string
  icon: string
  shortcut?: string
  category: 'data' | 'ai'
}

export interface StudySession {
  sessionId: string
  participantId: string
  startTime: string
  endTime?: string
  articleId: string
  completionStatus: 'completed' | 'abandoned' | 'in_progress'
}

export interface FinalSubmission {
  timestamp: string
  comments: string
  overallConfidence: 1 | 2 | 3 | 4 | 5 | 6 | 7
  claimVerdictsSummary: Array<{
    claimId: string
    claimText: string
    verdict: Verdict
    confidence: number
  }>
}

// In-memory verdict store entry (replaces old ClaimVerdict)
export interface VerdictEntry {
  claimId: string
  verdict: Verdict
  confidence: 1 | 2 | 3 | 4 | 5 | 6 | 7
  mostHelpfulTool: ToolType
  helpfulTools?: ToolType[]
  reasoningText: string | null
  reasoningType?: 'correction' | 'explanation'
  correctionTarget?: string
  correctionText?: string
  explanationText?: string
  severity?: number
  formDurationMs: number
  submittedAt: string
}
