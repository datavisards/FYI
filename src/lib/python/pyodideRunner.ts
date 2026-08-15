/**
 * Singleton Pyodide runner — lazily initializes either a Web Worker (web app)
 * or a sandboxed iframe (Chrome extension) and provides an async interface
 * for executing Python code.
 *
 * Chrome MV3 extensions block importScripts/eval in workers, so Pyodide must
 * run inside a sandboxed iframe where unsafe-eval is allowed.
 */

interface PyodideResult {
  output: string
  error?: string
}

interface CSVDataForPython {
  name: string
  csv: string // Raw CSV text
}

const IS_EXTENSION =
  typeof chrome !== 'undefined' && !!chrome?.runtime?.id && !!chrome?.runtime?.getURL

let isReady = false
let initPromise: Promise<void> | null = null
let execIdCounter = 0
const EXEC_TIMEOUT_MS = 30_000

// ── Web-app path: blob Worker ──────────────────────────────────────────────

let worker: Worker | null = null

function getWorker(): Worker {
  if (worker) return worker

  const workerCode = `
    let pyodide = null;
    let loadedDatasets = {};

    async function initPyodide() {
      if (pyodide) return pyodide;
      importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
      pyodide = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
      });
      await pyodide.loadPackage(['pandas', 'numpy', 'matplotlib']);
      return pyodide;
    }

    self.onmessage = async (event) => {
      const { type, code, csvData, execId } = event.data;

      if (type === 'init') {
        try {
          await initPyodide();
          self.postMessage({ type: 'ready' });
        } catch (error) {
          self.postMessage({ type: 'error', error: 'Failed to initialize Pyodide: ' + error.message });
        }
        return;
      }

      if (type === 'exec') {
        try {
          const py = await initPyodide();

          function toSnakeCase(s) {
            return s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'df';
          }

          let output = '';
          py.setStdout({ batched: (text) => { output += text + '\\n'; } });
          py.setStderr({ batched: (text) => { output += '[stderr] ' + text + '\\n'; } });

          if (csvData && Array.isArray(csvData)) {
            const newDatasets = csvData.filter(({ name }) => !loadedDatasets[toSnakeCase(name)]);
            if (newDatasets.length > 0) {
              for (const { name, csv } of newDatasets) {
                const safeName = toSnakeCase(name);
                py.FS.writeFile('/tmp/' + safeName + '.csv', csv);
              }

              await py.runPythonAsync('import pandas as pd\\nimport numpy as np');
              for (const { name } of newDatasets) {
                const safeName = toSnakeCase(name);
                try {
                  await py.runPythonAsync(
                    safeName + " = pd.read_csv('/tmp/" + safeName + ".csv', on_bad_lines='skip')"
                  );
                  loadedDatasets[safeName] = true;
                } catch (e) {
                  try {
                    await py.runPythonAsync(
                      safeName + " = pd.read_csv('/tmp/" + safeName + ".csv', on_bad_lines='skip', engine='python')"
                    );
                    loadedDatasets[safeName] = true;
                  } catch (e2) {
                    output += '[warn] Failed to load dataset ' + safeName + ': ' + e2.message + '\\n';
                  }
                }
              }
            }
          }

          await py.runPythonAsync('import pandas as pd\\nimport numpy as np');

          const result = await py.runPythonAsync(code);
          if (result !== undefined && result !== null) {
            output += String(result);
          }

          self.postMessage({ type: 'result', output: output.trim() || '(no output)', execId });
        } catch (error) {
          self.postMessage({ type: 'error', error: error.message, execId });
        }
        return;
      }
    };
  `

  const blob = new Blob([workerCode], { type: 'application/javascript' })
  worker = new Worker(URL.createObjectURL(blob))
  return worker
}

// ── Extension path: sandboxed iframe ───────────────────────────────────────

let sandboxIframe: HTMLIFrameElement | null = null

function getSandboxIframe(): HTMLIFrameElement {
  if (sandboxIframe) return sandboxIframe

  sandboxIframe = document.createElement('iframe')
  sandboxIframe.id = 'fyi-python-sandbox'
  sandboxIframe.src = chrome.runtime.getURL('extension/sandboxes/python.html')
  sandboxIframe.style.display = 'none'
  document.body.appendChild(sandboxIframe)
  return sandboxIframe
}

// ── Shared public API ──────────────────────────────────────────────────────

export async function initPyodide(): Promise<void> {
  if (isReady) return
  if (initPromise) return initPromise

  if (IS_EXTENSION) {
    initPromise = new Promise<void>((resolve, reject) => {
      const iframe = getSandboxIframe()
      let initSent = false
      const sendInit = () => {
        if (initSent) return
        initSent = true
        iframe.contentWindow?.postMessage({ type: 'pyodide-init' }, '*')
      }
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'pyodide-ready') {
          isReady = true
          window.removeEventListener('message', handler)
          resolve()
        } else if (e.data?.type === 'pyodide-error' && !e.data.execId) {
          window.removeEventListener('message', handler)
          initPromise = null
          reject(new Error(e.data.error))
        } else if (e.data?.type === 'pyodide-sandbox-ready') {
          sendInit()
        }
      }
      window.addEventListener('message', handler)

      // Fallback: if sandbox-ready message was missed, try after iframe load
      iframe.addEventListener('load', () => {
        setTimeout(sendInit, 300)
      }, { once: true })
    })
  } else {
    initPromise = new Promise<void>((resolve, reject) => {
      const w = getWorker()
      const handler = (e: MessageEvent) => {
        if (e.data.type === 'ready') {
          isReady = true
          w.removeEventListener('message', handler)
          resolve()
        } else if (e.data.type === 'error') {
          w.removeEventListener('message', handler)
          initPromise = null
          reject(new Error(e.data.error))
        }
      }
      w.addEventListener('message', handler)
      w.postMessage({ type: 'init' })
    })
  }

  return initPromise
}

export function isPyodideReady(): boolean {
  return isReady
}

export async function executePython(
  code: string,
  csvData?: CSVDataForPython[]
): Promise<PyodideResult> {
  await initPyodide()

  const execId = ++execIdCounter

  if (IS_EXTENSION) {
    return new Promise((resolve) => {
      const iframe = getSandboxIframe()
      const timer = setTimeout(() => {
        window.removeEventListener('message', handler)
        resolve({ output: '', error: 'Python execution timed out (30s)' })
      }, EXEC_TIMEOUT_MS)
      const handler = (e: MessageEvent) => {
        if (e.data?.execId !== execId) return
        clearTimeout(timer)
        window.removeEventListener('message', handler)
        if (e.data.type === 'pyodide-result') {
          resolve({ output: e.data.output })
        } else if (e.data.type === 'pyodide-error') {
          resolve({ output: '', error: e.data.error })
        }
      }
      window.addEventListener('message', handler)
      iframe.contentWindow?.postMessage({ type: 'pyodide-exec', code, csvData, execId }, '*')
    })
  }

  return new Promise((resolve) => {
    const w = getWorker()
    const timer = setTimeout(() => {
      w.removeEventListener('message', handler)
      resolve({ output: '', error: 'Python execution timed out (30s)' })
    }, EXEC_TIMEOUT_MS)
    const handler = (e: MessageEvent) => {
      if (e.data.execId !== execId) return
      clearTimeout(timer)
      w.removeEventListener('message', handler)
      if (e.data.type === 'result') {
        resolve({ output: e.data.output })
      } else if (e.data.type === 'error') {
        resolve({ output: '', error: e.data.error })
      }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'exec', code, csvData, execId })
  })
}

