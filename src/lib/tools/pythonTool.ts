/**
 * Python tool definition — registered server-side for LLM tool-calling.
 * Execution is DEFERRED to the client (Pyodide in browser).
 * The server returns a special marker that the client intercepts.
 */
import { registerTool, type ToolDefinition } from './registry'

const PYTHON_DEFERRED_PREFIX = '__PYTHON_DEFERRED__'

const definition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'run_python',
    description:
      'Execute Python code for data analysis. Has access to pandas, numpy, and any loaded CSV datasets as DataFrames. Use print() to show output. Good for: statistical analysis, data transformations, calculations, and generating summaries. IMPORTANT: All datasets are PRE-LOADED as snake_case DataFrame variables (e.g. "CO2 Emissions Data" → co2_emissions_data). Do NOT call pd.read_csv() — the data is already in memory.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            'Python code to execute. Use print() for output. Available libraries: pandas (pd), numpy (np). Datasets are pre-loaded as snake_case DataFrames — do NOT use pd.read_csv().',
        },
        description: {
          type: 'string',
          description: 'Brief description of what this code does',
        },
      },
      required: ['code'],
    },
  },
}

/**
 * Server-side executor: doesn't actually run Python.
 * Returns a deferred marker that the client-side handler will intercept.
 */
async function execute(args: Record<string, unknown>): Promise<string> {
  const code = String(args.code || '')
  const description = String(args.description || 'Python execution')
  // Return a marker that tells the system this needs client-side execution
  return `${PYTHON_DEFERRED_PREFIX}${JSON.stringify({ code, description })}`
}

export function registerPythonTool() {
  registerTool(definition, execute)
}

export function isPythonDeferredResult(result: string): boolean {
  return result.startsWith(PYTHON_DEFERRED_PREFIX)
}

export function parsePythonDeferredResult(result: string): { code: string; description: string } | null {
  if (!isPythonDeferredResult(result)) return null
  try {
    return JSON.parse(result.slice(PYTHON_DEFERRED_PREFIX.length))
  } catch {
    return null
  }
}
