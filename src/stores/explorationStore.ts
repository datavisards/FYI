// NOTE: claimStore and dataStore are imported for orchestration (clearAll, getExportData,
// endSession). These circular references are safe at runtime because the imported values
// are only accessed inside action function bodies, never at module init.
 
import { useClaimStore } from './claimStore'
 
import { useDataStore } from './dataStore'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { safeStorage } from './safeStorage'
import { nanoid } from 'nanoid'
 
import { eventLogger } from '@/lib/tracking/eventLogger'
import { useChatStore } from './chatStore'
import { useVizBuilderStore } from './vizBuilderStore'
import type {
  ToolType,
  ClaimType,
  StudySession,
  ToolConfig,
  StudyMode,
  FinalSubmission,
  VerdictEntry,
} from '@/types'
import type { StudyEvent, Verdict } from '@/types/events'

// Four helpful tools (consistent kebab-case ids)
export const TOOL_CONFIGS: ToolConfig[] = [
  {
    id: 'auto-check',
    name: 'Auto-Check',
    description: 'Automated fact-check of the claim',
    icon: 'check',
    shortcut: 'C',
    category: 'ai',
  },
  {
    id: 'ask-ai',
    name: 'AI Chat',
    description: 'Multi-turn chat with search, CSV and calculate tools',
    icon: 'message',
    shortcut: 'A',
    category: 'ai',
  },
  {
    id: 'inspect-table',
    name: 'Table Explorer',
    description: 'Browse and filter the dataset',
    icon: 'table',
    shortcut: 'T',
    category: 'data',
  },
  {
    id: 'create-vis',
    name: 'Chart Builder',
    description: 'Create visualizations using natural language',
    icon: 'chart',
    shortcut: 'V',
    category: 'data',
  },
]

// Active claim being investigated
export interface ActiveClaim {
  id: string
  text: string
  category?: ClaimType
}

// Popover state
interface PopoverState {
  tool: ToolType | null
  isOpen: boolean
  position: { x: number; y: number }
  anchorNodeId?: string
  branchType?: 'continue' | 'branch'
}

export interface ExplorationState {
  // Session
  session: StudySession | null
  studyMode: StudyMode | null
  finalSubmission: FinalSubmission | null

  // Active exploration context
  activeClaim: ActiveClaim | null
  activeToolPopover: PopoverState

  // UI panel state
  activeToolTab: 'auto-check' | 'ask-ai' | 'inspect-table' | 'create-vis' | null
  isDataTableOpen: boolean

  // Events
  events: StudyEvent[]

  // Actions — Session
  startSession: (articleId: string, participantId?: string) => string
  endSession: (reason?: string) => void
  setStudyMode: (mode: StudyMode) => void
  submitFinalSession: (comments: string, confidence: number) => void

  // Actions — Claim context
  setActiveClaim: (claim: { id: string; text: string; category?: ClaimType } | null, claimIndex?: number, totalClaims?: number) => void

  // Actions — UI panels
  setActiveToolTab: (tab: 'auto-check' | 'ask-ai' | 'inspect-table' | 'create-vis' | null) => void
  openToolPopover: (tool: ToolType, anchorNodeId?: string, branchType?: 'continue' | 'branch') => void
  closeToolPopover: () => void
  openDataTable: () => void
  closeDataTable: () => void

  // Actions — Events
  addEvent: (event: StudyEvent) => void

  // Export / Reset
  getExportData: () => ExplorationExportData
  clearAll: () => void
}

export interface ExplorationExportData {
  exportedAt: string
  version: string
  session: {
    sessionId: string
    participantId: string
    articleId: string
    startTime: string
    endTime?: string
    totalDurationMs?: number
  } | null
  claims: Array<{
    claimId: string
    claimText: string
    source: 'ai' | 'manual'
    status: 'active' | 'dismissed'
    verdict?: {
      verdict: Verdict
      confidence: number
      mostHelpfulTool: ToolType
      reasoningText: string | null
      formDurationMs: number
      submittedAt: string
    }
  }>
  events: StudyEvent[]
}

const initialPopoverState: PopoverState = {
  tool: null,
  isOpen: false,
  position: { x: 0, y: 0 },
}

export const useExplorationStore = create<ExplorationState>()(
  persist(
    (set, get) => ({
      session: null,
      studyMode: null,
      finalSubmission: null,
      activeClaim: null,
      activeToolPopover: initialPopoverState,
      activeToolTab: null,
      isDataTableOpen: false,
      events: [],

      // Session management
      startSession: (articleId, participantId) => {
        const sessionId = `study-session-${Date.now()}-${nanoid(6)}`
        const pid = participantId || `participant-${nanoid(8)}`
        const newSession: StudySession = {
          sessionId,
          participantId: pid,
          startTime: new Date().toISOString(),
          articleId,
          completionStatus: 'in_progress',
        }

        eventLogger.setSession(sessionId)

        set({
          session: newSession,
          studyMode: 'llm',
          events: [],
          activeClaim: null,
          activeToolPopover: initialPopoverState,
          isDataTableOpen: false,
        })

        // Log after set so eventLogger has the sessionId
        eventLogger.log({ type: 'session_started', articleId, participantId: pid })

        // Reset claim sub-store for the new session
        useClaimStore.getState().clearAll()

        return sessionId
      },

      endSession: (reason) => {
        const state = get()
        if (!state.session) return
        set((s) => ({
          session: s.session
            ? {
                ...s.session,
                endTime: new Date().toISOString(),
                completionStatus: reason === 'abandoned' ? 'abandoned' : 'completed',
              }
            : null,
        }))
      },

      setStudyMode: (mode) => set({ studyMode: mode }),

      // Claim context — sets the active claim and ensures chat is tied to it
      setActiveClaim: (claim, claimIndex, totalClaims) => {
        if (!claim) {
          set({ activeClaim: null })
          return
        }
        set({ activeClaim: { ...claim } })
        eventLogger.log({
          type: 'claim_focused',
          claimId: claim.id,
          claimText: claim.text,
          claimIndex: claimIndex ?? 0,
          totalClaims: totalClaims ?? 0,
        })

        // If the current chat conversation is tied to a different claim, deselect it
        // so that ChatPanel starts fresh. A new conversation is created lazily on first message.
        const chatState = useChatStore.getState()
        const activeConv = chatState.activeConversationId
          ? chatState.conversations.find((c) => c.id === chatState.activeConversationId)
          : null
        if (activeConv && activeConv.claimId !== claim.id) {
          chatState.setActiveConversation(null)
        }
      },

      // UI panels
      setActiveToolTab: (tab) => set({ activeToolTab: tab }),

      openToolPopover: (tool, anchorNodeId, branchType) => {
        const newState: Partial<ExplorationState> = {
          activeToolPopover: {
            tool,
            isOpen: true,
            position: { x: 0, y: 0 },
            anchorNodeId,
            branchType,
          },
        }
        if (tool === 'create-vis') newState.activeToolTab = 'create-vis'
        set(newState)
      },

      closeToolPopover: () => {
        set({ activeToolPopover: initialPopoverState })
      },

      openDataTable: () => set({ isDataTableOpen: true }),
      closeDataTable: () => set({ isDataTableOpen: false }),

      // Events
      addEvent: (event) =>
        set((s) => ({ events: [...s.events, event] })),

      // Final submission
      submitFinalSession: (comments, confidence) => {
        const claimVerdicts = useClaimStore.getState().claimVerdicts
        const finalSubmission: FinalSubmission = {
          timestamp: new Date().toISOString(),
          comments,
          overallConfidence: confidence as 1 | 2 | 3 | 4 | 5 | 6 | 7,
          claimVerdictsSummary: claimVerdicts.map((verdict: VerdictEntry) => ({
            claimId: verdict.claimId,
            claimText: '',
            verdict: verdict.verdict,
            confidence: verdict.confidence,
          })),
        }
        set({ finalSubmission })
      },

      // Export — reads from all three stores
      getExportData: () => {
        const state = get()
        const claimState = useClaimStore.getState()
        const { dismissedClaimIds, detectedClaims, manualClaims, claimVerdicts } = claimState
        const dismissedSet = new Set(dismissedClaimIds)
        const verdictMap = new Map(claimVerdicts.map((v: VerdictEntry) => [v.claimId, v]))

        type ClaimEntry = ExplorationExportData['claims'][number]
        const claimMap = new Map<string, ClaimEntry>()

        detectedClaims.forEach((c) => {
          const v = verdictMap.get(c.id) as VerdictEntry | undefined
          claimMap.set(c.id, {
            claimId: c.id,
            claimText: c.text,
            source: 'ai',
            status: dismissedSet.has(c.id) ? 'dismissed' : 'active',
            verdict: v
              ? {
                  verdict: v.verdict,
                  confidence: v.confidence,
                  mostHelpfulTool: v.mostHelpfulTool,
                  reasoningText: v.reasoningText,
                  formDurationMs: v.formDurationMs,
                  submittedAt: v.submittedAt,
                }
              : undefined,
          })
        })

        manualClaims.forEach((c) => {
          const v = verdictMap.get(c.id) as VerdictEntry | undefined
          claimMap.set(c.id, {
            claimId: c.id,
            claimText: c.text,
            source: 'manual',
            status: 'active',
            verdict: v
              ? {
                  verdict: v.verdict,
                  confidence: v.confidence,
                  mostHelpfulTool: v.mostHelpfulTool,
                  reasoningText: v.reasoningText,
                  formDurationMs: v.formDurationMs,
                  submittedAt: v.submittedAt,
                }
              : undefined,
          })
        })

        const claims = Array.from(claimMap.values())

        const session = state.session
          ? {
              sessionId: state.session.sessionId,
              participantId: state.session.participantId,
              articleId: state.session.articleId,
              startTime: state.session.startTime,
              endTime: state.session.endTime,
              totalDurationMs: state.session.startTime
                ? Date.now() - new Date(state.session.startTime).getTime()
                : undefined,
            }
          : null

        return {
          exportedAt: new Date().toISOString(),
          version: '3.0',
          session,
          claims,
          events: state.events,
        }
      },

      // Reset all stores
      clearAll: () => {
        eventLogger.reset()
        useChatStore.setState({ conversations: [], activeConversationId: null })
        useClaimStore.getState().clearAll()
        useDataStore.getState().clearAll()
        // Reset viz builder to a single blank tab
        const freshTab = { id: `viz-fresh-${Date.now()}`, title: 'Chart 1', builder: { datasetName: null, mark: 'auto' as const, encodings: {}, filters: [] } }
        useVizBuilderStore.setState({ tabs: [freshTab], activeTabId: freshTab.id })
        set({
          session: null,
          studyMode: null,
          finalSubmission: null,
          activeClaim: null,
          activeToolPopover: initialPopoverState,
          activeToolTab: null,
          isDataTableOpen: false,
          events: [],
        })
      },
    }),
    {
      name: 'fyi-exploration-data',
      storage: safeStorage,
    }
  )
)
