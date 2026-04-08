import { createCompletion } from './client'
import { DEFAULT_MODELS } from './models'

const CHART_SYSTEM_PROMPT = `You are a data visualization expert. Given a natural language request, a dataset description, and sample rows, generate a valid Vega-Lite specification.

Rules:
1. Output ONLY valid JSON - no explanation, no markdown code blocks
2. Use the schema: https://vega.github.io/schema/vega-lite/v5.json
3. Keep visualizations simple and clear
4. Use appropriate chart types (bar, line, area, point, etc.)
5. Include proper axis labels and titles
6. Use a clean color scheme
7. Do NOT include data values in the spec — use "data": {"values": []} as a placeholder. Data will be injected after generation.

Example output format:
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "title": "Chart Title",
  "data": { "values": [] },
  "mark": "bar",
  "encoding": {
    "x": { "field": "category", "type": "nominal" },
    "y": { "field": "value", "type": "quantitative" }
  }
}`

export interface ChartGenerationRequest {
  prompt: string
  data: Record<string, unknown>[]
  dataDescription: string
  model?: string // Optional model override
}

export interface ChartGenerationResult {
  vegaLiteSpec: object
  success: boolean
  error?: string
}

/**
 * Validates a Vega-Lite specification to ensure it has required structure
 */
function validateVegaLiteSpec(spec: unknown): { valid: boolean; error?: string } {
  if (!spec || typeof spec !== 'object') {
    return { valid: false, error: 'Spec must be an object' }
  }

  const s = spec as Record<string, unknown>

  // Must have mark, layer, concat, hconcat, vconcat, facet, repeat, or spec
  const hasValidRoot =
    s.mark || s.layer || s.concat || s.hconcat || s.vconcat || s.facet || s.repeat || s.spec
  if (!hasValidRoot) {
    return { valid: false, error: 'Missing mark, layer, concat, facet, repeat, or spec' }
  }

  // If has encoding, it should be an object with at least one channel
  if (s.encoding) {
    if (typeof s.encoding !== 'object' || s.encoding === null) {
      return { valid: false, error: 'Encoding must be an object' }
    }
    if (Object.keys(s.encoding as object).length === 0) {
      return { valid: false, error: 'Encoding has no channels' }
    }
  }

  // Check layer specs recursively
  if (s.layer && Array.isArray(s.layer)) {
    for (let i = 0; i < s.layer.length; i++) {
      const layerSpec = s.layer[i]
      if (layerSpec && typeof layerSpec === 'object') {
        const ls = layerSpec as Record<string, unknown>
        // Each layer with a mark should have encoding
        if (ls.mark && !ls.encoding) {
          return { valid: false, error: `Layer ${i} has mark but no encoding` }
        }
      }
    }
  }

  return { valid: true }
}

export async function generateChart(
  request: ChartGenerationRequest
): Promise<ChartGenerationResult> {
  try {
    const columns = request.data.length > 0 ? Object.keys(request.data[0]).join(', ') : 'none'
    const sampleRows = request.data.slice(0, 5)

    const userPrompt = `Dataset description: ${request.dataDescription}
Columns: ${columns}

Sample data (${sampleRows.length} of ${request.data.length} rows):
${JSON.stringify(sampleRows, null, 2)}

User request: ${request.prompt}

Generate a Vega-Lite specification. Do NOT embed data values — use "data": {"values": []}. Output only valid JSON.`

    const response = await createCompletion({
      model: request.model || DEFAULT_MODELS.chart,
      messages: [
        { role: 'system', content: CHART_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from model')
    }

    // Try to extract JSON from the response
    let jsonStr = content.trim()

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\n?/g, '')
    }

    const parsed = JSON.parse(jsonStr)

    // Standard response format
    const vegaLiteSpec = parsed

    // Validate spec structure
    const validation = validateVegaLiteSpec(vegaLiteSpec)
    if (!validation.valid) {
      throw new Error(`Invalid Vega-Lite spec: ${validation.error}`)
    }

    // Strip any data the LLM may have embedded — caller injects the real data
    if (vegaLiteSpec.data?.values && Array.isArray(vegaLiteSpec.data.values)) {
      vegaLiteSpec.data.values = []
    }

    return { vegaLiteSpec, success: true }
  } catch (error) {
    return {
      vegaLiteSpec: {},
      success: false,
      error: (error as Error).message,
    }
  }
}
