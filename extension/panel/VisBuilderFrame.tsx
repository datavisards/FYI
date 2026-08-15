import { useCallback, useEffect, useRef } from 'react'

import { useDataStore } from '@/stores/dataStore'
import { useExplorationStore } from '@/stores/explorationStore'

/**
 * The Chart Builder, in a sandboxed iframe.
 *
 * Vega-Lite compiles specs with `new Function`, which MV3's page CSP forbids,
 * so the builder runs in a sandbox page and talks over postMessage.
 */
export function VisBuilderFrame() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const pageTableData = useDataStore((s) => s.pageTableData)
  const selectedVisDataset = useDataStore((s) => s.selectedVisDataset)
  const activeClaim = useExplorationStore((s) => s.activeClaim)
  const addEvent = useExplorationStore((s) => s.addEvent)

  const sendData = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'BUILDER_LOAD_CONTEXT',
        payload: { csvDatasets: pageTableData ?? [], selectedVisDataset },
      },
      '*'
    )
  }, [pageTableData, selectedVisDataset])

  const sendActiveClaim = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'BUILDER_SET_ACTIVE_CLAIM', payload: { activeClaim } },
      '*'
    )
  }, [activeClaim])

  useEffect(() => sendData(), [sendData])
  useEffect(() => sendActiveClaim(), [sendActiveClaim])

  // The iframe cannot receive anything until it has loaded.
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const handleLoad = () =>
      setTimeout(() => {
        sendData()
        sendActiveClaim()
      }, 100)
    iframe.addEventListener('load', handleLoad)
    return () => iframe.removeEventListener('load', handleLoad)
  }, [sendData, sendActiveClaim])

  // Interactions inside the sandbox are logged against the parent's session.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || data.type !== 'BUILDER_VIS_EVENT' || !data.payload) return
      addEvent(data.payload)
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [addEvent])

  return (
    <div className="h-full w-full bg-muted/30">
      <iframe
        ref={iframeRef}
        src={chrome.runtime.getURL('extension/sandboxes/builder.html')}
        title="FYI Chart Builder"
        className="h-full w-full border-0"
      />
    </div>
  )
}
