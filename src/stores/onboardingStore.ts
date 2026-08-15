import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { safeStorage } from './safeStorage'

/**
 * Where the visitor is in setup. Persisted so a refresh does not move them.
 *
 * The stores remain the authority on what is possible, so /app clamps this on
 * load: no article forces the first step, and a live session forces the
 * workspace.
 */
export type Step = 'article' | 'data' | 'key' | 'workspace'

interface OnboardingState {
  step: Step
  setStep: (step: Step) => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      step: 'article',
      setStep: (step) => set({ step }),
    }),
    {
      name: 'fyi-onboarding',
      storage: safeStorage,
    }
  )
)
