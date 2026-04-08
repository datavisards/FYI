import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { safeStorage } from './safeStorage'
import { nanoid } from 'nanoid'
import type {
  BuilderChannel,
  BuilderFilter,
  BuilderMark,
  BuilderSpec,
  FieldEncoding,
} from '@/lib/viz/specModel'

export interface VizTab {
  id: string
  title: string
  builder: BuilderSpec
}

interface VizBuilderState {
  tabs: VizTab[]
  activeTabId: string

  addTab: () => void
  addTabForDataset: (datasetName: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  renameTab: (id: string, title: string) => void

  getActive: () => VizTab
  syncActiveDataset: (datasetName: string) => void
  setDatasetName: (name: string | null) => void
  setMark: (mark: BuilderMark) => void
  setEncoding: (channel: BuilderChannel, encoding: FieldEncoding | null) => void
  addFilter: () => void
  updateFilter: (id: string, patch: Partial<BuilderFilter>) => void
  removeFilter: (id: string) => void
  clearFilters: () => void
  clearAllEncodings: () => void
  resetActive: () => void
}

function makeInitialBuilder(): BuilderSpec {
  return { datasetName: null, mark: 'auto', encodings: {}, filters: [] }
}

function makeTab(index: number, datasetName?: string): VizTab {
  return {
    id: `viz-${nanoid(8)}`,
    title: `Chart ${index}`,
    builder: { ...makeInitialBuilder(), datasetName: datasetName ?? null },
  }
}

function normalizeActive(tabs: VizTab[], activeTabId: string): { tabs: VizTab[]; activeTabId: string } {
  if (tabs.length === 0) {
    const t = makeTab(1)
    return { tabs: [t], activeTabId: t.id }
  }
  const exists = tabs.some((t) => t.id === activeTabId)
  return { tabs, activeTabId: exists ? activeTabId : tabs[0]!.id }
}

export const useVizBuilderStore = create<VizBuilderState>()(
  persist(
    (set, get) => {
      const first = makeTab(1)
      return {
        tabs: [first],
        activeTabId: first.id,

        addTab: () =>
          set((s) => {
            const nextTab = makeTab(s.tabs.length + 1)
            return { tabs: [...s.tabs, nextTab], activeTabId: nextTab.id }
          }),

        addTabForDataset: (datasetName) =>
          set((s) => {
            const nextTab = makeTab(s.tabs.length + 1, datasetName)
            return { tabs: [...s.tabs, nextTab], activeTabId: nextTab.id }
          }),

        closeTab: (id) =>
          set((s) => {
            const remaining = s.tabs.filter((t) => t.id !== id)
            const next = normalizeActive(remaining, s.activeTabId === id ? remaining[0]?.id ?? '' : s.activeTabId)
            return next
          }),

        setActiveTab: (id) =>
          set((s) => {
            if (s.activeTabId === id) return s
            return normalizeActive(s.tabs, id)
          }),

        renameTab: (id, title) =>
          set((s) => ({
            tabs: s.tabs.map((t) => (t.id === id ? { ...t, title: title.trim() || t.title } : t)),
          })),

        getActive: () => {
          const s = get()
          return s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0]!
        },

        syncActiveDataset: (datasetName) =>
          set((s) => {
            const active = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0]
            if (!active) return s
            const encCount = Object.keys(active.builder.encodings ?? {}).length
            const isBlank = encCount === 0

            // If the tab is blank (no shelves), just retarget it to the new dataset.
            if (isBlank) {
              return {
                tabs: s.tabs.map((t) =>
                  t.id === s.activeTabId ? { ...t, builder: { ...t.builder, datasetName } } : t
                ),
              }
            }

            // Otherwise, preserve existing vis: create a new tab for the new dataset.
            const nextTab = makeTab(s.tabs.length + 1, datasetName)
            return { tabs: [...s.tabs, nextTab], activeTabId: nextTab.id }
          }),

        setDatasetName: (name) =>
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === s.activeTabId ? { ...t, builder: { ...t.builder, datasetName: name } } : t
            ),
          })),

        setMark: (mark) =>
          set((s) => ({
            tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, builder: { ...t.builder, mark } } : t)),
          })),

        setEncoding: (channel, encoding) =>
          set((s) => ({
            tabs: s.tabs.map((t) => {
              if (t.id !== s.activeTabId) return t
              const next = { ...t.builder.encodings }
              if (!encoding) delete next[channel]
              else next[channel] = encoding
              return { ...t, builder: { ...t.builder, encodings: next } }
            }),
          })),

        addFilter: () =>
          set((s) => ({
            tabs: s.tabs.map((t) => {
              if (t.id !== s.activeTabId) return t
              const existing = t.builder.filters ?? []
              const next: BuilderFilter = {
                id: `f-${nanoid(6)}`,
                field: existing[0]?.field ?? '',
                kind: 'nominal',
                include: [],
              }
              return { ...t, builder: { ...t.builder, filters: [...existing, next] } }
            }),
          })),

        updateFilter: (id, patch) =>
          set((s) => ({
            tabs: s.tabs.map((t) => {
              if (t.id !== s.activeTabId) return t
              const existing = t.builder.filters ?? []
              const nextFilters = existing.map((f) => (f.id === id ? { ...f, ...patch } : f)) as BuilderFilter[]
              return {
                ...t,
                builder: {
                  ...t.builder,
                  filters: nextFilters,
                },
              }
            }),
          })),

        removeFilter: (id) =>
          set((s) => ({
            tabs: s.tabs.map((t) => {
              if (t.id !== s.activeTabId) return t
              const existing = t.builder.filters ?? []
              return {
                ...t,
                builder: {
                  ...t.builder,
                  filters: existing.filter((f) => f.id !== id),
                },
              }
            }),
          })),

        clearFilters: () =>
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === s.activeTabId ? { ...t, builder: { ...t.builder, filters: [] } } : t
            ),
          })),

        clearAllEncodings: () =>
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === s.activeTabId ? { ...t, builder: { ...t.builder, encodings: {} } } : t
            ),
          })),

        resetActive: () =>
          set((s) => ({
            tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, builder: makeInitialBuilder() } : t)),
          })),
      }
    },
    {
      name: 'fyi-viz-builder',
      storage: safeStorage,
      partialize: (state) => ({ tabs: state.tabs, activeTabId: state.activeTabId }),
      version: 2,
      migrate: (persisted, version) => {
        if (version === 0 || version === 1) {
          const anyState = persisted as any
          // Old shape: { builder }
          if (anyState?.builder) {
            const tab: VizTab = {
              id: `viz-${nanoid(8)}`,
              title: 'Chart 1',
              builder: anyState.builder,
            }
            return { tabs: [tab], activeTabId: tab.id }
          }
        }
        return persisted as any
      },
    }
  )
)

