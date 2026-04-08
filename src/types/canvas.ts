import type { Source, ClaimType, Verdict, ToolType, SeverityLevel } from './study'

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  type?: string
}

export interface ClaimNodeData {
  claimId: string
  claimText: string
  status: 'investigating' | 'verified' | 'false' | 'misleading' | 'unverifiable'
}

export interface ResponseNodeData {
  query: string
  response: string
  sources?: Source[]
  trustRating?: number
}

// Claim relationship for plot linking
export type ClaimRelationship = 'support' | 'refute' | 'explore'

// Chart annotation structure for explaining claim relationship
export interface ChartAnnotation {
  type: 'text' | 'rule' | 'rect'
  data: { x?: number | string; y?: number | string; text?: string; x2?: number | string; y2?: number | string }
  description: string
}

export interface ChartNodeData {
  vegaLiteSpec: object
  prompt: string
  dataUsed: string
  linkedClaimId?: string
  claimRelationship?: ClaimRelationship
  annotations?: ChartAnnotation[]
}

export interface NoteNodeData {
  content: string
}

export interface CanvasNode {
  id: string
  type: 'claim' | 'response' | 'chart' | 'note'
  position: { x: number; y: number }
  data: ClaimNodeData | ResponseNodeData | ChartNodeData | NoteNodeData
}

export interface CanvasState {
  $id: string
  sessionId: string
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: Viewport
  canvasMode: 'mindmap' | 'linear'
  savedAt: string
}

// Enhanced canvas node data types with study-specific fields
export interface EnhancedClaimNodeData extends ClaimNodeData {
  category: ClaimType
  verdict?: Verdict
  confidence?: 1 | 2 | 3 | 4 | 5 | 6 | 7
  mostHelpfulTool?: ToolType
  severity?: SeverityLevel
  factualScore?: number
}

export interface EnhancedResponseNodeData extends ResponseNodeData {
  toolType: ToolType
  parentNodeId?: string
  branchType?: 'continue' | 'branch'
  trustRatingRequired: boolean
  canBranch: boolean
  canContinue: boolean
}

export interface EnhancedChartNodeData extends ChartNodeData {
  trustRating?: number
  parentNodeId?: string
  branchType?: 'continue' | 'branch'
}
