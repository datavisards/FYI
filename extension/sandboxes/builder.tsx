import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { ToolVisBuilder, type CsvDataSource } from '@/components/tool-vis-builder/ToolVisBuilder'
import { useDataStore } from '@/stores/dataStore'
import { useExplorationStore, type ActiveClaim } from '@/stores/explorationStore'
import '@/app/globals.css'

interface LoadContextMessage {
  type: 'BUILDER_LOAD_CONTEXT' | 'BUILDER_SET_ACTIVE_CLAIM'
  payload: {
    csvDatasets?: CsvDataSource[]
    selectedVisDataset?: string | null
    activeClaim?: ActiveClaim | null
  }
}

function BuilderSandboxHost() {
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data as LoadContextMessage
      if (!data) return

      if (data.type === 'BUILDER_LOAD_CONTEXT') {
        const { csvDatasets, selectedVisDataset } = data.payload
        const store = useDataStore.getState()
        store.setPageTableData(csvDatasets ?? [])
        if (selectedVisDataset !== undefined) {
          store.setSelectedVisDataset(selectedVisDataset)
        }
      }

      if (data.type === 'BUILDER_SET_ACTIVE_CLAIM') {
        // Set activeClaim directly in the store (bypass setActiveClaim to avoid side-effect logging)
        useExplorationStore.setState({ activeClaim: data.payload.activeClaim ?? null })
      }
    }

    window.addEventListener('message', handleMessage)
    window.parent.postMessage({ type: 'BUILDER_SANDBOX_READY' }, '*')
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Relay events logged inside the iframe back to the parent
  useEffect(() => {
    let prevLen = useExplorationStore.getState().events.length
    return useExplorationStore.subscribe((state) => {
      const events = state.events
      if (events.length > prevLen) {
        const newEvents = events.slice(prevLen)
        for (const evt of newEvents) {
          window.parent.postMessage({ type: 'BUILDER_VIS_EVENT', payload: evt }, '*')
        }
      }
      prevLen = events.length
    })
  }, [])

  return <ToolVisBuilder mode="sandbox" />
}

// Patch document.cookie in sandboxed iframe to avoid SecurityError
try {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    enumerable: true,
    get() { return '' },
    set() { /* ignore */ },
  })
} catch { /* ignore */ }

const rootElement = document.getElementById('builder-root')
if (!rootElement) throw new Error('builder-root element not found')

createRoot(rootElement).render(
  <React.StrictMode>
    <BuilderSandboxHost />
  </React.StrictMode>
)
