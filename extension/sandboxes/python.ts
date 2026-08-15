/**
 * Python sandbox — runs Pyodide inside a sandboxed iframe.
 *
 * Pyodide and its wheels ship inside the extension package (see
 * extension/fetch-pyodide.mjs). Nothing is fetched from a CDN at runtime:
 * Chrome Web Store's Manifest V3 policy forbids executing remotely hosted code.
 * The sandbox CSP still needs unsafe-eval, which Pyodide requires and which is
 * permitted for sandboxed pages. The side panel communicates via postMessage.
 */

/** Relative to this sandbox page, which is served from the extension package. */
const PYODIDE_BASE = './pyodide/'

declare const loadPyodide: (opts: { indexURL: string }) => Promise<any>

let pyodide: any = null
const loadedDatasets: Record<string, boolean> = {}

function toSnakeCase(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'df'
}

async function initPyodide(): Promise<void> {
  if (pyodide) return
  pyodide = await loadPyodide({ indexURL: PYODIDE_BASE })
  await pyodide.loadPackage(['pandas', 'numpy', 'matplotlib'])
}

async function execPython(
  code: string,
  csvData?: Array<{ name: string; csv: string }>,
): Promise<{ output: string; error?: string }> {
  await initPyodide()

  let output = ''
  pyodide.setStdout({ batched: (text: string) => { output += text + '\n' } })
  pyodide.setStderr({ batched: (text: string) => { output += '[stderr] ' + text + '\n' } })

  if (csvData && Array.isArray(csvData)) {
    const newDatasets = csvData.filter(({ name }) => !loadedDatasets[toSnakeCase(name)])
    if (newDatasets.length > 0) {
      for (const { name, csv } of newDatasets) {
        const safeName = toSnakeCase(name)
        pyodide.FS.writeFile('/tmp/' + safeName + '.csv', csv)
      }
      await pyodide.runPythonAsync('import pandas as pd\nimport numpy as np')
      for (const { name } of newDatasets) {
        const safeName = toSnakeCase(name)
        try {
          await pyodide.runPythonAsync(
            safeName + " = pd.read_csv('/tmp/" + safeName + ".csv', on_bad_lines='skip')"
          )
          loadedDatasets[safeName] = true
        } catch {
          try {
            await pyodide.runPythonAsync(
              safeName + " = pd.read_csv('/tmp/" + safeName + ".csv', on_bad_lines='skip', engine='python')"
            )
            loadedDatasets[safeName] = true
          } catch (e2) {
            output += '[warn] Failed to load dataset ' + safeName + ': ' + (e2 as Error).message + '\n'
          }
        }
      }
    }
  }

  await pyodide.runPythonAsync('import pandas as pd\nimport numpy as np')
  const result = await pyodide.runPythonAsync(code)
  if (result !== undefined && result !== null) {
    output += String(result)
  }
  return { output: output.trim() || '(no output)' }
}

// ── Message handler ────────────────────────────────────────────────────────

window.addEventListener('message', async (event) => {
  const { type, code, csvData, execId } = event.data ?? {}

  if (type === 'pyodide-init') {
    try {
      await initPyodide()
      window.parent.postMessage({ type: 'pyodide-ready' }, '*')
    } catch (error) {
      window.parent.postMessage({
        type: 'pyodide-error',
        error: 'Failed to initialize Pyodide: ' + (error as Error).message,
      }, '*')
    }
    return
  }

  if (type === 'pyodide-exec') {
    try {
      const { output } = await execPython(code, csvData)
      window.parent.postMessage({ type: 'pyodide-result', output, execId }, '*')
    } catch (error) {
      window.parent.postMessage({
        type: 'pyodide-error',
        error: (error as Error).message,
        execId,
      }, '*')
    }
    return
  }
})

window.parent.postMessage({ type: 'pyodide-sandbox-ready' }, '*')
