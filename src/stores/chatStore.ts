import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { safeStorage } from './safeStorage'
import { nanoid } from 'nanoid'
import type { ConfidenceLevel } from '@/lib/factChecking'

export interface CsvRowRef {
  dataset: string
  rows: number[]
}

export interface AutoCheckStepEvent {
  step: number
  name: string
  status: 'running' | 'done' | 'error'
  data?: Record<string, unknown>
}

export interface AutoCheckResult {
  claimId: string
  claimText: string
  steps: AutoCheckStepEvent[]
  verdict?: 'verified' | 'misleading' | 'unverifiable'
  confidence?: ConfidenceLevel
  reasoning?: string
  vegaLiteSpec?: object
  actualValue?: string
  claimedValue?: string
  factType?: string
}

export interface ChatMessageSource {
  type: 'web' | 'dataset' | 'article'
  label: string
  url?: string
  detail?: string
}

export interface ChatMessageChart {
  title: string
  spec: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  verdict?: 'Verified' | 'Misleading' | 'Unverifiable' | null
  sources?: ChatMessageSource[]
  charts?: ChatMessageChart[]
  citations?: string[]
  csvDatasets?: string[]
  csvRowRefs?: CsvRowRef[]
  pythonBlocks?: { code: string; description: string; output: string }[]
  /** Tools that were active when this message was sent (user messages only) */
  toolsActive?: string[]
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  searchEnabled: boolean
  toolsEnabled: string[]
  /** Claim that was active when this conversation was first used */
  claimId?: string
  claimText?: string
}

interface ChatStore {
  conversations: Conversation[]
  activeConversationId: string | null

  // Actions
  createConversation: (opts?: { title?: string }) => string
  deleteConversation: (id: string) => void
  setActiveConversation: (id: string | null) => void
  renameConversation: (id: string, title: string) => void
  addMessage: (convId: string, msg: Omit<ChatMessage, 'id'>) => string
  updateMessage: (convId: string, msgId: string, content: string) => void
  setSearchEnabled: (convId: string, enabled: boolean) => void
  setToolsEnabled: (convId: string, tools: string[]) => void
  setConversationTitle: (convId: string, title: string) => void
  setConversationClaim: (convId: string, claimId: string, claimText: string) => void
  clearAll: () => void

  // Getters
  getActiveConversation: () => Conversation | null
  getConversation: (id: string) => Conversation | undefined
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,

      createConversation: (opts) => {
        const id = nanoid(10)
        const conv: Conversation = {
          id,
          title: opts?.title ?? 'New Chat',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          searchEnabled: false,
          toolsEnabled: [],
        }
        set((s) => ({
          conversations: [conv, ...s.conversations],
          activeConversationId: id,
        }))
        return id
      },

      deleteConversation: (id) => {
        set((s) => {
          const filtered = s.conversations.filter((c) => c.id !== id)
          return {
            conversations: filtered,
            activeConversationId:
              s.activeConversationId === id
                ? filtered[0]?.id ?? null
                : s.activeConversationId,
          }
        })
      },

      setActiveConversation: (id) => {
        set({ activeConversationId: id })
      },

      renameConversation: (id, title) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title, updatedAt: new Date().toISOString() } : c
          ),
        }))
      },

      addMessage: (convId, msg) => {
        const msgId = nanoid(8)
        const fullMsg: ChatMessage = { ...msg, id: msgId }
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: [...c.messages, fullMsg],
                  updatedAt: new Date().toISOString(),
                }
              : c
          ),
        }))
        return msgId
      },

      updateMessage: (convId, msgId, content) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === msgId ? { ...m, content } : m
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : c
          ),
        }))
      },

      setSearchEnabled: (convId, enabled) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId ? { ...c, searchEnabled: enabled } : c
          ),
        }))
      },

      setToolsEnabled: (convId, tools) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId ? { ...c, toolsEnabled: tools } : c
          ),
        }))
      },

      setConversationTitle: (convId, title) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? { ...c, title, updatedAt: new Date().toISOString() }
              : c
          ),
        }))
      },

      setConversationClaim: (convId, claimId, claimText) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId ? { ...c, claimId, claimText } : c
          ),
        }))
      },

      clearAll: () => {
        set({
          conversations: [],
          activeConversationId: null,
        })
      },

      getActiveConversation: () => {
        const s = get()
        return s.conversations.find((c) => c.id === s.activeConversationId) ?? null
      },

      getConversation: (id) => {
        return get().conversations.find((c) => c.id === id)
      },
    }),
    {
      name: 'fyi-chat-history',
      storage: safeStorage,
    }
  )
)
