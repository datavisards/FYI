/**
 * System prompt builder — composable, modeless architecture.
 * One base prompt + auto-injected context based on session state.
 */

export interface PromptContext {
  hasDataset: boolean
  hasWebSearch: boolean
  hasArticle: boolean
  articleContent?: string
  datasetSummary?: string
}

const BASE_PROMPT = `You are a fact-checking assistant that can also answer general questions about data and articles.

IMPORTANT: Always respond with a JSON object in this exact format:
{
  "verdict": "Verified" | "Misleading" | "Unverifiable" | null,
  "body": "markdown string with your analysis",
  "sources": [{"type": "web"|"dataset"|"article", "label": "...", "url": "...", "detail": "..."}],
  "charts": [{"title": "...", "spec": {}}]
}

Rules:
- verdict: set when fact-checking a claim, null for general questions
- body: concise markdown — use bullet points, bold key findings, expand only when asked. Do NOT restate the question. Do NOT include source citations inline — they go in the sources array.
- sources: list every source used. For web results include url. For datasets include name and columns/rows queried in detail. For articles reference the specific section or passage in detail. Empty array if no sources were used.
- charts: Vega-Lite specs for visualizations. Do NOT include data.values in the spec — the frontend injects the full dataset automatically. Only define encoding, mark, transform, title, etc. Empty array if no charts.

Use your judgment on response depth — short for simple questions, structured for complex claims. Acknowledge uncertainty clearly when evidence is insufficient.`

const DATASET_CONTEXT = `You have access to a dataset and the run_python tool to query it. Datasets are pre-loaded as snake_case DataFrames (pandas).
When the user's question involves data, use run_python to get actual values — do not guess or answer from memory. For non-data questions, respond directly without calling tools.`

const ARTICLE_CONTEXT = `An article is provided below. Reference specific passages. Distinguish article claims from established facts.

ARTICLE CONTENT:
`

const SEARCH_CONTEXT = `You can search the web to verify claims. Only search when the question requires external information you don't already have. Cite sources as [Source Name](URL) with specific numbers and dates.`

export function buildSystemPrompt(ctx: PromptContext): string {
  const parts = [BASE_PROMPT]

  if (ctx.hasDataset) {
    let datasetPart = DATASET_CONTEXT
    if (ctx.datasetSummary) {
      datasetPart += `\n\nAvailable CSV datasets:\n${ctx.datasetSummary}`
    }
    parts.push(datasetPart)
  }
  if (ctx.hasArticle && ctx.articleContent) {
    parts.push(ARTICLE_CONTEXT + ctx.articleContent)
  }
  if (ctx.hasWebSearch) {
    parts.push(SEARCH_CONTEXT)
  }

  return parts.join('\n\n')
}

export function buildUserPrompt(query: string, context?: string): string {
  if (context) {
    return `Claim to fact-check: "${context}"\n\nQuestion: ${query}`
  }
  return query
}
