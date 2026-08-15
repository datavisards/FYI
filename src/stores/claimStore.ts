import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { safeStorage } from './safeStorage'
 
import { eventLogger } from '@/lib/tracking/eventLogger'
import { useArticleStore } from './articleStore'
 
import { useExplorationStore } from './explorationStore'
import type {
  ClaimType,
  Claim,
  Verdict,
  VerdictEntry,
  ManualClaim,
  ClaimDisagreement,
  ClaimActionLogEntry,
  SeverityLevel,
  ToolType,
} from '@/types'

export interface ClaimState {
  // Detection
  isClaimDetectionComplete: boolean
  isClaimDetectionLoading: boolean
  detectedClaims: Claim[]

  // Lifecycle
  manualClaims: ManualClaim[]
  claimDisagreements: ClaimDisagreement[]
  dismissedClaimIds: string[]
  claimActionLog: ClaimActionLogEntry[]

  // Verdicts
  claimVerdicts: VerdictEntry[]

  // Actions
  setClaimDetectionComplete: (complete: boolean) => void
  setClaimDetectionLoading: (loading: boolean) => void
  setDetectedClaims: (claims: Claim[]) => void

  addManualClaim: (claim: ManualClaim) => void
  dismissClaim: (claimId: string) => void
  logClaimAction: (entry: ClaimActionLogEntry) => void
  disagreeWithClaimType: (claimId: string, originalCategory: ClaimType, newCategory: ClaimType) => void

  addClaimVerdict: (verdict: VerdictEntry) => void
  submitVerdict: (
    claimId: string,
    verdict: Verdict,
    confidence: 1 | 2 | 3 | 4 | 5 | 6 | 7,
    mostHelpfulTool: ToolType,
    reasoningText?: string | null,
    severity?: number,
    formDurationMs?: number,
    annotations?: {
      helpfulTools?: ToolType[]
      reasoningType?: 'correction' | 'explanation'
      correctionTarget?: string
      correctionText?: string
      explanationText?: string
    }
  ) => void
  updateVerdictAnnotations: (claimId: string, annotations: {
    helpfulTools?: ToolType[]
    reasoningType?: 'correction' | 'explanation'
    correctionTarget?: string
    correctionText?: string
    explanationText?: string
  }) => void

  clearAll: () => void
}

export const useClaimStore = create<ClaimState>()(
  persist(
    (set, get) => ({
      isClaimDetectionComplete: false,
      isClaimDetectionLoading: false,
      detectedClaims: [],
      manualClaims: [],
      claimDisagreements: [],
      dismissedClaimIds: [],
      claimActionLog: [],
      claimVerdicts: [],

      setClaimDetectionComplete: (complete) => set({ isClaimDetectionComplete: complete }),
      setClaimDetectionLoading: (loading) => set({ isClaimDetectionLoading: loading }),

      setDetectedClaims: (claims) => {
        const state = get()
        const existingIds = new Set(state.detectedClaims.map((c) => c.id))
        const newClaims = claims.filter((c) => !existingIds.has(c.id))
        const newEntries: ClaimActionLogEntry[] = newClaims.map((c) => ({
          action: 'claim_detected' as const,
          source: 'ai' as const,
          claimId: c.id,
          timestamp: new Date().toISOString(),
        }))
        set({
          detectedClaims: claims,
          claimActionLog: [...state.claimActionLog, ...newEntries],
        })
      },

      addManualClaim: (claim) => {
        eventLogger.log({
          type: 'claim_manual_added',
          claimId: claim.id,
          claimText: claim.text,
          startOffset: claim.startOffset,
          endOffset: claim.endOffset,
        })
        const entry: ClaimActionLogEntry = {
          action: 'claim_added',
          source: 'user',
          claimId: claim.id,
          timestamp: new Date().toISOString(),
        }
        set((state) => ({
          manualClaims: [...state.manualClaims, claim],
          claimActionLog: [...state.claimActionLog, entry],
        }))
      },

      dismissClaim: (claimId) => {
        const state = get()
        const claim =
          state.detectedClaims.find((c) => c.id === claimId) ||
          state.manualClaims.find((c) => c.id === claimId)
        const hadVerdict = state.claimVerdicts.some((v) => v.claimId === claimId)
        eventLogger.log({
          type: 'claim_dismissed',
          claimId,
          claimText: claim?.text ?? '',
          hadVerdict,
        })
        const entry: ClaimActionLogEntry = {
          action: 'claim_dismissed',
          source: 'user',
          claimId,
          timestamp: new Date().toISOString(),
        }
        set((state) => ({
          dismissedClaimIds: [...state.dismissedClaimIds, claimId],
          claimActionLog: [...state.claimActionLog, entry],
        }))

        // Clear focused claim if it's the one being dismissed
        const articleStore = useArticleStore.getState()
        if (articleStore.selectedClaim?.id === claimId) {
          articleStore.setSelectedClaim(null)
          articleStore.setHighlightedClaimId(null)
        }
        const explorationStore = useExplorationStore.getState()
        if (explorationStore.activeClaim?.id === claimId) {
          explorationStore.setActiveClaim(null)
        }
      },

      logClaimAction: (entry) =>
        set((state) => ({ claimActionLog: [...state.claimActionLog, entry] })),

      disagreeWithClaimType: (claimId, originalCategory, newCategory) => {
        const disagreement: ClaimDisagreement = {
          claimId,
          originalCategory,
          userCategory: newCategory,
          timestamp: new Date().toISOString(),
        }
        set((state) => ({
          claimDisagreements: [...state.claimDisagreements, disagreement],
        }))
      },

      addClaimVerdict: (verdict) =>
        set((state) => ({ claimVerdicts: [...state.claimVerdicts, verdict] })),

      updateVerdictAnnotations: (claimId, annotations) =>
        set((s) => ({
          claimVerdicts: s.claimVerdicts.map((v) =>
            v.claimId === claimId ? { ...v, ...annotations } : v
          ),
        })),

      submitVerdict: (claimId, verdict, confidence, mostHelpfulTool, reasoningText, severity, formDurationMs = 0, annotations) => {
        const state = get()
        const existingVerdictIndex = state.claimVerdicts.findIndex((v) => v.claimId === claimId)
        const isUpdate = existingVerdictIndex !== -1
        const now = new Date().toISOString()

        const newVerdictEntry: VerdictEntry = {
          claimId,
          verdict,
          confidence,
          mostHelpfulTool,
          reasoningText: reasoningText ?? null,
          formDurationMs,
          submittedAt: now,
          severity: severity as SeverityLevel | undefined,
        }

        const annotationFields = {
          helpfulTools: annotations?.helpfulTools ?? [],
          severity: severity ?? null,
          reasoningType: annotations?.reasoningType ?? null,
          correctionTarget: annotations?.correctionTarget ?? null,
          correctionText: annotations?.correctionText ?? null,
          explanationText: annotations?.explanationText ?? null,
        }

        if (isUpdate) {
          const old = state.claimVerdicts[existingVerdictIndex]
          eventLogger.log({
            type: 'verdict_updated',
            claimId,
            oldVerdict: old.verdict,
            newVerdict: verdict,
            oldConfidence: old.confidence,
            newConfidence: confidence,
            newMostHelpfulTool: mostHelpfulTool,
            newReasoningText: reasoningText ?? null,
            formDurationMs,
            ...annotationFields,
          })
          set((s) => ({
            claimVerdicts: s.claimVerdicts.map((v, idx) =>
              idx === existingVerdictIndex ? { ...v, ...newVerdictEntry } : v
            ),
          }))
        } else {
          eventLogger.log({
            type: 'verdict_submitted',
            claimId,
            verdict,
            confidence,
            mostHelpfulTool,
            reasoningText: reasoningText ?? null,
            formDurationMs,
            ...annotationFields,
          })
          set((s) => ({
            claimVerdicts: [...s.claimVerdicts, newVerdictEntry],
          }))
        }
      },

      clearAll: () =>
        set({
          isClaimDetectionComplete: false,
          isClaimDetectionLoading: false,
          detectedClaims: [],
          manualClaims: [],
          claimDisagreements: [],
          dismissedClaimIds: [],
          claimActionLog: [],
          claimVerdicts: [],
        }),
    }),
    { name: 'fyi-claim-data', storage: safeStorage }
  )
)
