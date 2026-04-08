import type { Verdict, ToolType, ClaimType } from './study'

export interface ArticleMetadata {
  author?: string
  publishedDate?: string
  url?: string
  tags?: string[]
}

export interface Claim {
  id: string
  text: string
  startOffset: number
  endOffset: number
  category?: 'statistic' | 'causal' | 'trend' | 'comparison'
  /** Whether the claim was detected by AI or manually added by the user */
  source?: 'ai' | 'user'
  /** Data fact type hint from the detect-claims pipeline (one of Aletheia's 10 types) */
  data_fact_hint?: string
}

export interface Article {
  $id: string
  title: string
  source: string
  content: string
  claims: Claim[]
  metadata: ArticleMetadata
}

// Manual claim added by user during exploration
export interface ManualClaim extends Claim {
  addedByUser: true
  addedAt: string
}

// Record of user disagreement with claim category
export interface ClaimDisagreement {
  claimId: string
  originalCategory: ClaimType
  userCategory: ClaimType
  timestamp: string
}

// Claim action log types for audit trail
export type ClaimActionType = 'claim_added' | 'claim_detected' | 'claim_promoted' | 'claim_dismissed'

export interface ClaimActionLogEntry {
  action: ClaimActionType
  source: 'ai' | 'user'
  claimId: string
  timestamp: string
  meta?: Record<string, unknown>
}

// Unified claim export: claim data + status + verdict + action history
export interface ClaimExportEntry {
  id: string
  text: string
  startOffset: number
  endOffset: number
  source: 'ai' | 'user'
  status: 'active' | 'dismissed'
  verdict?: Verdict
  verdictConfidence?: 1 | 2 | 3 | 4 | 5 | 6 | 7
  verdictMostHelpfulTool?: ToolType
  verdictReasoning?: string
  verdictReasoningType?: 'correction' | 'explanation'
  verdictCorrectionTarget?: string
  verdictCorrectionText?: string
  verdictExplanationText?: string
  history: ClaimActionLogEntry[]
}
