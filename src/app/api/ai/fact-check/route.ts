import { type NextRequest } from 'next/server'
import { createCompletion } from '@/lib/openrouter/client'
import { readAiConfig, withAiConfig } from '@/lib/ai/config'
import { generateChart } from '@/lib/openrouter/chartGenerator'
import { DEFAULT_MODELS } from '@/lib/openrouter/models'
import { createSSEStream } from '@/lib/sse'
import { type Dataset } from '@/lib/factChecking'

const PIPELINE_MODEL = DEFAULT_MODELS.chart

interface ExecutionResult {
  claimed_value: string
  actual_value: string
  fact_type: string
  matched_rows: number
  total_rows: number
  comparison_detail: string
}

/** Execute LLM-generated code against a dataset with a timeout */
async function safeExecute(
  code: string,
  dataset: { headers: string[]; rows: string[][] }
): Promise<{ result: ExecutionResult; error?: string }> {
  // Strip markdown fences if present
  let clean = code.trim()
  if (clean.startsWith('```')) {
    clean = clean.replace(/```(?:javascript|js)?\n?/g, '').replace(/```\n?/g, '')
  }

  const baseFields = {
    claimed_value: 'unknown',
    fact_type: 'unknown',
    matched_rows: 0,
    total_rows: dataset.rows.length,
    comparison_detail: '',
  }

  try {
    const fn = new Function('dataset', clean)
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Execution timed out (5s)')), 5000)
    )
    const result = await Promise.race([fn(dataset), timeout])
    return { result: { actual_value: 'unknown', ...baseFields, ...result } }
  } catch (err) {
    const message = (err as Error).message ?? 'Unknown execution error'
    return {
      result: { actual_value: 'error', ...baseFields, comparison_detail: message },
      error: message,
    }
  }
}

/** Format first 5 rows of a dataset as a readable table for LLM context */
function formatDatasetSample(ds: Dataset): string {
  const rows = ds.rows.slice(0, 5)
  // Calculate column widths
  const widths = ds.headers.map((h, ci) => {
    const vals = [h, ...rows.map((r) => (r[ci] ?? '').slice(0, 30))]
    return Math.max(...vals.map((v) => v.length))
  })
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length))
  const headerLine = ds.headers.map((h, i) => pad(h, widths[i])).join(' | ')
  const sepLine = widths.map((w) => '-'.repeat(w)).join('-+-')
  const dataLines = rows.map((r) =>
    ds.headers.map((_, ci) => pad((r[ci] ?? '').slice(0, 30), widths[ci])).join(' | ')
  )
  return [headerLine, sepLine, ...dataLines].join('\n')
}

export async function POST(req: NextRequest) {
  return withAiConfig(readAiConfig(req), () => handlePost(req))
}

async function handlePost(req: NextRequest) {
  const body = await req.json()
  const { claim, article, datasets } = body as {
    claim: { id: string; text: string; data_fact_hint?: string }
    article: { title: string; content: string }
    datasets: Dataset[]
  }

  const emitStep = (
    emit: (data: Record<string, unknown>) => void,
    step: number,
    name: string,
    status: 'running' | 'done' | 'error',
    data?: object
  ) => emit({ step, name, status, data: data ?? {} })

  return createSSEStream(
    async (emit) => {
      // ── STEP 1: RESOLVE ──────────────────────────────────────────────────
      emitStep(emit, 1, 'resolve', 'running')

      let enrichedClaim: string
      try {
        const resolveRes = await createCompletion({
          model: PIPELINE_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are a claim resolution assistant. Rewrite the claim to be fully self-contained: resolve all pronouns, ellipses, and implicit references. Make it standalone and specific. Output ONLY the resolved claim text, no explanation.`,
            },
            {
              role: 'user',
              content: `Article title: "${article?.title ?? ''}"
Article excerpt: "${article?.content?.slice(0, 600) ?? ''}"
Claim: "${claim.text}"

Rewrite the claim to be self-contained:`,
            },
          ],
          temperature: 0.1,
          max_tokens: 200,
        })
        enrichedClaim = resolveRes.choices[0]?.message?.content?.trim() ?? claim.text
        emitStep(emit, 1, 'resolve', 'done', { enriched_claim: enrichedClaim })
      } catch (resolveErr) {
        enrichedClaim = claim.text
        emitStep(emit, 1, 'resolve', 'error', {
          enriched_claim: enrichedClaim,
          error: (resolveErr as Error)?.message ?? 'Resolution failed',
        })
      }

      // ── STEP 2: GENERATE & EXECUTE (Binder core) ────────────────────────
      emitStep(emit, 2, 'generate', 'running')

      const dsName = datasets[0]?.name ?? null
      const ds = datasets.find((d) => d.name === dsName) ?? datasets[0] ?? null

      let executionResult: ExecutionResult = {
        claimed_value: 'unknown',
        actual_value: 'unknown',
        fact_type: 'unknown',
        matched_rows: 0,
        total_rows: ds?.rows.length ?? 0,
        comparison_detail: '',
      }
      let generatedCode = ''
      let generateError: string | undefined

      if (ds) {
        const sampleTable = formatDatasetSample(ds)
        // Build unique values for string columns to help the LLM
        const uniqueVals = ds.headers
          .map((h, ci) => {
            const vals = [
              ...new Set(
                ds.rows
                  .slice(0, 200)
                  .map((r) => r[ci] ?? '')
                  .filter(Boolean)
              ),
            ]
            const allNumeric = vals.every((v) => !isNaN(parseFloat(v)))
            if (allNumeric || vals.length === 0) return null
            return `  ${h}: [${vals.slice(0, 10).join(', ')}${vals.length > 10 ? ', ...' : ''}]`
          })
          .filter(Boolean)
          .join('\n')

        try {
          const generateRes = await createCompletion({
            model: PIPELINE_MODEL,
            messages: [
              {
                role: 'system',
                content: `You are a data verification code generator. Given a claim and a dataset schema, write a JavaScript function body that verifies the claim against the data.

The function receives one argument: \`dataset\` with shape \`{ headers: string[], rows: string[][] }\`.

Your code MUST return an object with these fields:
{
  claimed_value: string,   // the value stated in the claim
  actual_value: string,    // the value computed from the data
  fact_type: string,       // one of: value, proportion, trend, extreme, rank, association, difference, categorization, distribution, outlier
  matched_rows: number,    // how many rows matched the relevant filter
  total_rows: number,      // total rows in dataset
  comparison_detail: string // a brief human-readable comparison, e.g. "Claimed 9.1, actual average is 8.7 across 5 rows"
}

Rules:
- Access columns by index: find the column index using \`dataset.headers.indexOf('colName')\` or case-insensitive search.
- All cell values in \`dataset.rows\` are strings — parse numbers with \`parseFloat()\`.
- Use case-insensitive matching for string comparisons (e.g. \`.toLowerCase().includes()\`).
- Handle edge cases: column not found, no matching rows, non-numeric values.
- Do NOT use require/import/fetch/process or any Node.js APIs.
- Do NOT define a function — write the function BODY directly (it will be wrapped in \`new Function('dataset', yourCode)\`).
- The last statement must be a \`return { ... }\` with the object above.
- Keep the code concise and correct. Prefer simple loops over complex functional chains.`,
              },
              {
                role: 'user',
                content: `Claim: "${enrichedClaim}"

Dataset: "${ds.name}" (${ds.rows.length} rows)
Columns: [${ds.headers.join(', ')}]

Sample rows:
${sampleTable}
${uniqueVals ? `\nUnique values for categorical columns:\n${uniqueVals}` : ''}

Write the function body to verify this claim:`,
              },
            ],
            temperature: 0.1,
            max_tokens: 1500,
          })

          generatedCode =
            generateRes.choices[0]?.message?.content?.trim() ?? ''

          const { result, error } = await safeExecute(generatedCode, {
            headers: ds.headers,
            rows: ds.rows,
          })
          executionResult = result
          generateError = error
        } catch (llmErr) {
          generateError = (llmErr as Error)?.message ?? 'Code generation failed'
        }
      } else {
        generateError = 'No dataset available'
      }

      emitStep(emit, 2, 'generate', generateError ? 'error' : 'done', {
        code: generatedCode,
        execution_result: executionResult,
        ...(generateError ? { error: generateError } : {}),
      })

      // ── STEP 3: VISUALIZE ────────────────────────────────────────────────
      emitStep(emit, 3, 'visualize', 'running')

      let vegaLiteSpec: object = {}

      if (ds && executionResult.actual_value !== 'error' && executionResult.actual_value !== 'unknown') {
        const dataRecords = ds.rows.map((row) => {
          const record: Record<string, unknown> = {}
          ds.headers.forEach((h, i) => {
            const val = row[i] ?? ''
            const num = parseFloat(val)
            record[h] = isNaN(num) ? val : num
          })
          return record
        })

        // Build a specific chart prompt using the execution result context
        const detail = executionResult.comparison_detail || enrichedClaim
        const chartPromptByType: Record<string, string> = {
          trend: `Line chart showing the trend described in: "${detail}"`,
          rank: `Horizontal bar chart showing ranking. ${detail}`,
          extreme: `Bar chart highlighting the min/max. ${detail}`,
          proportion: `Bar chart showing percentages. ${detail}`,
          association: `Scatter plot showing association. ${detail}`,
          distribution: `Histogram showing distribution. ${detail}`,
          value: `Bar chart comparing the claimed vs actual value. ${detail}`,
          difference: `Grouped bar chart showing the difference. ${detail}`,
        }
        const chartPrompt =
          chartPromptByType[executionResult.fact_type] ??
          `Bar chart visualizing: ${detail}`

        try {
          const chartResult = await generateChart({
            prompt: chartPrompt,
            data: dataRecords,
            dataDescription: `Dataset: "${ds.name}". Columns: ${ds.headers.join(', ')}. Fact type: ${executionResult.fact_type}. Claim: "${enrichedClaim}". Claimed value: ${executionResult.claimed_value}. Actual value: ${executionResult.actual_value}. ${executionResult.comparison_detail}`,
            model: PIPELINE_MODEL,
          })
          if (chartResult.success) {
            const spec = chartResult.vegaLiteSpec as Record<string, unknown>
            spec.data = { values: dataRecords }
            vegaLiteSpec = spec
          } else {
            console.warn('[fact-check] Chart generation failed:', chartResult.error)
          }
        } catch (chartErr) {
          console.warn('[fact-check] Chart generation threw:', (chartErr as Error).message)
        }
      }

      emitStep(emit, 3, 'visualize', 'done', {
        has_chart: Object.keys(vegaLiteSpec).length > 0,
      })

      // ── STEP 4: VERDICT ──────────────────────────────────────────────────
      emitStep(emit, 4, 'verdict', 'running')

      let verdict: 'verified' | 'misleading' | 'unverifiable' = 'unverifiable'
      let confidence: 'strong' | 'moderate' | 'weak' = 'moderate'
      let reasoning =
        'The claim could not be definitively verified against the available data.'

      try {
        const verdictRes = await createCompletion({
          model: PIPELINE_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are a fact-checking verdict assistant. Given the full context of a fact-check run — the original claim, the resolved claim, the generated verification code, and its execution result — produce a final verdict.

Output ONLY valid JSON with these fields:
{
  "verdict": "verified" | "misleading" | "unverifiable",
  "confidence": "strong" | "moderate" | "weak",
  "reasoning": "2-3 sentence explanation"
}

Verdict guidelines:
- "verified": The data supports the claim (values match within ~5% tolerance, or the qualitative assertion holds).
- "misleading": The data contradicts the claim (significant numeric discrepancy, wrong ranking, opposite trend, etc.).
- "unverifiable": Not enough data, the code errored, or the comparison is too ambiguous to judge.

Confidence guidelines:
- "strong": Clear numeric match/mismatch, sufficient rows, straightforward comparison.
- "moderate": Minor ambiguity — hedging language in the claim, small sample, or close to the tolerance boundary.
- "weak": Code errored, very few rows matched, unclear column mapping, or the claim requires context beyond the data.`,
            },
            {
              role: 'user',
              content: `Original claim: "${claim.text}"
Resolved claim: "${enrichedClaim}"
Dataset: "${ds?.name ?? 'N/A'}" (${ds?.rows.length ?? 0} total rows)

Generated verification code:
\`\`\`javascript
${generatedCode || '(no code generated)'}
\`\`\`

Execution result:
${JSON.stringify(executionResult, null, 2)}
${generateError ? `\nExecution error: ${generateError}` : ''}

Provide your verdict:`,
            },
          ],
          temperature: 0.2,
          max_tokens: 400,
        })

        let raw = verdictRes.choices[0]?.message?.content?.trim() ?? '{}'
        if (raw.startsWith('```')) {
          raw = raw.replace(/```json?\n?/g, '').replace(/```\n?/g, '')
        }
        const parsed = JSON.parse(raw)

        if (['verified', 'misleading', 'unverifiable'].includes(parsed.verdict)) {
          verdict = parsed.verdict
        }
        if (['strong', 'moderate', 'weak'].includes(parsed.confidence)) {
          confidence = parsed.confidence
        }
        if (parsed.reasoning) {
          reasoning = parsed.reasoning
        }
      } catch {
        // use defaults
      }

      emitStep(emit, 4, 'verdict', 'done', {
        fact_type: executionResult.fact_type,
        enriched_claim: enrichedClaim,
        actual_value: executionResult.actual_value,
        claimed_value: executionResult.claimed_value,
        vega_lite_spec: vegaLiteSpec,
        verdict,
        confidence,
        reasoning,
      })
    },
    { 'Access-Control-Allow-Origin': '*' }
  )
}

// Was an inline copy of the CORS headers. See src/lib/cors.ts.
export { OPTIONS } from '@/lib/cors'
