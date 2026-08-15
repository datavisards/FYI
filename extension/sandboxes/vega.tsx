/**
 * Sandboxed Vega-Lite chart renderer.
 *
 * This page runs inside a Manifest V3 sandbox iframe where `unsafe-eval`
 * is allowed, so vega-embed (which uses `new Function()`) works.
 *
 * Communication protocol (postMessage):
 *   Parent → Sandbox:  { type: 'VEGA_RENDER', spec: VegaLiteSpec }
 *   Sandbox → Parent:  { type: 'VEGA_RENDERED', height: number }
 *   Sandbox → Parent:  { type: 'VEGA_ERROR', message: string }
 */

const root = document.getElementById('chart-root')!

let resizeObserver: ResizeObserver | null = null

function reportHeight() {
  const h = root.scrollHeight || root.offsetHeight
  window.parent.postMessage({ type: 'VEGA_RENDERED', height: h }, '*')
}

window.addEventListener('message', async (event) => {
  const data = event.data
  if (!data || data.type !== 'VEGA_RENDER') return

  try {
    const vegaEmbed = (await import('vega-embed')).default

    // Clear previous chart
    while (root.firstChild) root.removeChild(root.firstChild)

    // Patch spec for responsive width
    const spec = { ...data.spec }
    if (!spec.$schema) {
      spec.$schema = 'https://vega.github.io/schema/vega-lite/v5.json'
    }
    if (!spec.hconcat && !spec.vconcat && !spec.facet && !spec.concat) {
      if (spec.width === undefined || typeof spec.width === 'number') {
        spec.width = 'container'
      }
    }

    await vegaEmbed(root, spec, {
      actions: false,
      renderer: 'canvas',
      theme: 'quartz',
    })

    // Observe size changes and report height to parent
    resizeObserver?.disconnect()
    resizeObserver = new ResizeObserver(() => reportHeight())
    resizeObserver.observe(root)

    reportHeight()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    window.parent.postMessage({ type: 'VEGA_ERROR', message }, '*')
  }
})

// Signal ready
window.parent.postMessage({ type: 'VEGA_SANDBOX_READY' }, '*')
