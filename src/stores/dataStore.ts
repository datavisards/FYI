import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { safeStorage } from './safeStorage'
import type { CSVData } from '@/lib/data/csvFetcher'
import { fetchOWIDData, fetchCSVFromURL, parseCSV } from '@/lib/data/csvFetcher'

// Generated plot for vis history
export interface GeneratedPlot {
  id: string
  prompt: string
  vegaLiteSpec: object
  timestamp: string
  claimId?: string
}

export interface DataState {
  // Loaded datasets (CSV / OWID)
  pageTableData: CSVData[] | null
  detectedOWIDSlugs: string[]
  isLoadingData: boolean
  dataLoadError: string | null

  // AI extraction status
  isAiExtracting: boolean
  aiExtractError: string | null

  // Vis builder
  selectedVisDataset: string | null
  generatedPlots: GeneratedPlot[]

  // Highlighted rows (cross-component linking from AI chat)
  highlightedRows: { dataset: string; rows: number[] } | null

  // Actions
  setPageTableData: (data: CSVData[]) => void
  setDetectedOWIDSlugs: (slugs: string[]) => void
  setIsAiExtracting: (loading: boolean) => void
  setAiExtractError: (error: string | null) => void
  setSelectedVisDataset: (name: string | null) => void

  loadOWIDDataset: (slug: string) => Promise<void>
  loadCSVFromURL: (url: string) => Promise<void>
  uploadCSVFile: (file: File) => Promise<void>
  removeCSVDataset: (name: string) => void

  addGeneratedPlot: (plot: GeneratedPlot) => void

  setHighlightedRows: (ref: { dataset: string; rows: number[] } | null) => void

  clearAll: () => void
}

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      pageTableData: null,
      detectedOWIDSlugs: [],
      isLoadingData: false,
      dataLoadError: null,
      isAiExtracting: false,
      aiExtractError: null,
      selectedVisDataset: null,
      generatedPlots: [],
      highlightedRows: null,

      setPageTableData: (data) => set({ pageTableData: data }),
      setDetectedOWIDSlugs: (slugs) => set({ detectedOWIDSlugs: slugs }),
      setIsAiExtracting: (loading) => set({ isAiExtracting: loading }),
      setAiExtractError: (error) => set({ aiExtractError: error }),
      setSelectedVisDataset: (name) => set({ selectedVisDataset: name }),
      setHighlightedRows: (ref) => set({ highlightedRows: ref }),

      loadOWIDDataset: async (slug) => {
        set({ isLoadingData: true, dataLoadError: null })
        try {
          const data = await fetchOWIDData(slug)
          const existing = get().pageTableData || []
          set({
            pageTableData: [...existing, data],
            isLoadingData: false,
            selectedVisDataset: get().selectedVisDataset ?? data.name,
          })
        } catch (e) {
          set({ dataLoadError: (e as Error).message, isLoadingData: false })
        }
      },

      loadCSVFromURL: async (url) => {
        set({ isLoadingData: true, dataLoadError: null })
        try {
          const data = await fetchCSVFromURL(url)
          const existing = get().pageTableData || []
          set({
            pageTableData: [...existing, data],
            isLoadingData: false,
            selectedVisDataset: get().selectedVisDataset ?? data.name,
          })
        } catch (e) {
          set({ dataLoadError: (e as Error).message, isLoadingData: false })
        }
      },

      uploadCSVFile: async (file) => {
        set({ isLoadingData: true, dataLoadError: null })
        try {
          const text = await file.text()
          const { headers, rows } = parseCSV(text)
          if (headers.length === 0) throw new Error('CSV file appears to be empty')
          const name = file.name.replace(/\.(csv|tsv)$/i, '')
          const data: CSVData = { name, headers, rows }
          const existing = get().pageTableData || []
          set({
            pageTableData: [...existing, data],
            isLoadingData: false,
            selectedVisDataset: get().selectedVisDataset ?? name,
          })
          const { eventLogger } = await import('@/lib/tracking/eventLogger')
          eventLogger.log({
            type: 'table_csv_uploaded',
            claimId: '',
            fileName: file.name,
            rowCount: rows.length,
            columnCount: headers.length,
            columnNames: headers,
          })
        } catch (e) {
          set({ dataLoadError: (e as Error).message, isLoadingData: false })
        }
      },

      removeCSVDataset: (name) => {
        const state = get()
        const existing = state.pageTableData || []
        const updated = existing.filter((d) => d.name !== name)
        const wasSelected = state.selectedVisDataset === name
        set({
          pageTableData: updated,
          selectedVisDataset: wasSelected ? (updated[0]?.name ?? null) : state.selectedVisDataset,
        })
      },

      addGeneratedPlot: (plot) =>
        set((state) => ({ generatedPlots: [...state.generatedPlots, plot] })),

      clearAll: () =>
        set({
          pageTableData: null,
          detectedOWIDSlugs: [],
          isLoadingData: false,
          dataLoadError: null,
          isAiExtracting: false,
          aiExtractError: null,
          selectedVisDataset: null,
          generatedPlots: [],
          highlightedRows: null,
        }),
    }),
    {
      name: 'fyi-dataset-data',
      storage: safeStorage,
      partialize: (state) => {
        // Exclude transient loading/error flags so they never get stuck across sessions
        const { isLoadingData, dataLoadError, isAiExtracting, aiExtractError, ...rest } = state
        return rest
      },
    }
  )
)

