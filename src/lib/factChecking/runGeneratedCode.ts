/**
 * Runs AI-written verification code in the visitor's browser. Cloudflare Workers
 * refuse to compile code from strings, so it cannot run on the server.
 *
 * The code is untrusted, and article text can influence what the AI writes, so:
 * - the sandboxed iframe has an opaque origin: no cookies, storage or saved API key
 * - its CSP allows no network requests, and workers it creates inherit that
 * - a worker holds the code, so an endless loop cannot freeze the page, and
 *   removing the iframe at the timeout ends it
 */

const TIMEOUT_MS = 5000

const WORKER_SOURCE = `
onmessage = async (e) => {
  try {
    const fn = new Function('dataset', e.data.code)
    const result = await fn(e.data.dataset)
    postMessage({ result: JSON.parse(JSON.stringify(result ?? null)) })
  } catch (err) {
    postMessage({ error: String((err && err.message) || err) })
  }
}`

const SANDBOX_PAGE = `<!doctype html>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:">
<script>
onmessage = (e) => {
  try {
    const url = URL.createObjectURL(new Blob([${JSON.stringify(WORKER_SOURCE)}], { type: 'text/javascript' }))
    const worker = new Worker(url)
    worker.onmessage = (m) => parent.postMessage(m.data, '*')
    worker.onerror = (m) => parent.postMessage({ error: m.message || 'The code could not run.' }, '*')
    worker.postMessage(e.data)
  } catch (err) {
    parent.postMessage({ error: String((err && err.message) || err) }, '*')
  }
}
</script>`

function stripFences(code: string): string {
  const clean = code.trim()
  return clean.startsWith('```')
    ? clean.replace(/```(?:javascript|js)?\n?/g, '').replace(/```\n?/g, '')
    : clean
}

/** Resolves with what the code returned. Rejects if it throws, times out, or cannot start. */
export function runGeneratedCode(
  code: string,
  dataset: { headers: string[]; rows: string[][] }
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.style.display = 'none'
    iframe.srcdoc = SANDBOX_PAGE

    const finish = (settle: () => void) => {
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      iframe.remove()
      settle()
    }

    const timer = setTimeout(
      () => finish(() => reject(new Error(`Execution timed out (${TIMEOUT_MS / 1000}s)`))),
      TIMEOUT_MS
    )

    // An opaque origin cannot be checked, so the sender's window identifies it.
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return
      const { result, error } = (e.data ?? {}) as { result?: unknown; error?: string }
      finish(() => (error ? reject(new Error(error)) : resolve(result)))
    }

    window.addEventListener('message', onMessage)
    iframe.onload = () => {
      iframe.contentWindow?.postMessage(
        { code: stripFences(code), dataset: { headers: dataset.headers, rows: dataset.rows } },
        '*'
      )
    }
    document.body.appendChild(iframe)
  })
}
